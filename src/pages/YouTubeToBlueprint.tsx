import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateBlueprint, useUpdateBlueprint } from '@/hooks/useBlueprints';
import { getFunctionUrl } from '@/config/runtime';
import { logMvpEvent } from '@/lib/logEvent';

const YOUTUBE_ENDPOINT = getFunctionUrl('youtube-to-blueprint');
const GENERIC_FAILURE_TEXT = 'Could not complete the blueprint. Please test another video.';

type YouTubeDraftStep = {
  name: string;
  notes: string;
  timestamp: string | null;
};

type YouTubeDraftPreview = {
  title: string;
  description: string;
  steps: YouTubeDraftStep[];
  notes: string | null;
  tags: string[];
};

type YouTubeToBlueprintSuccessResponse = {
  ok: true;
  run_id: string;
  draft: YouTubeDraftPreview;
  review: { available: boolean; summary: string | null };
  banner: { available: boolean; url: string | null };
  meta: {
    transcript_source: string;
    confidence: number | null;
    duration_ms: number;
  };
};

type YouTubeToBlueprintErrorResponse = {
  ok: false;
  error_code:
    | 'INVALID_URL'
    | 'NO_CAPTIONS'
    | 'TRANSCRIPT_FETCH_FAIL'
    | 'TRANSCRIPT_EMPTY'
    | 'GENERATION_FAIL'
    | 'SAFETY_BLOCKED'
    | 'PII_BLOCKED'
    | 'TIMEOUT';
  message: string;
  run_id: string | null;
};

type YouTubeToBlueprintRequest = {
  video_url: string;
  generate_review: boolean;
  generate_banner: boolean;
  source: 'youtube_mvp';
};

function validateYouTubeInput(urlRaw: string) {
  try {
    const url = new URL(urlRaw.trim());
    const host = url.hostname.replace(/^www\./, '');
    if (url.searchParams.has('list')) {
      return { ok: false as const, code: 'playlist' as const };
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname !== '/watch') return { ok: false as const, code: 'invalid' as const };
      const id = url.searchParams.get('v') || '';
      return /^[a-zA-Z0-9_-]{8,15}$/.test(id)
        ? { ok: true as const }
        : { ok: false as const, code: 'invalid' as const };
    }
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\/+/, '').split('/')[0] || '';
      return /^[a-zA-Z0-9_-]{8,15}$/.test(id)
        ? { ok: true as const }
        : { ok: false as const, code: 'invalid' as const };
    }
    return { ok: false as const, code: 'invalid' as const };
  } catch {
    return { ok: false as const, code: 'invalid' as const };
  }
}

function toBlueprintStepsForSave(steps: YouTubeDraftStep[]) {
  return steps.map((step, index) => ({
    id: `yt-step-${index + 1}`,
    title: step.name,
    description: step.notes,
    items: [],
  }));
}

export default function YouTubeToBlueprint() {
  const { session, user } = useAuth();
  const { toast } = useToast();
  const createBlueprint = useCreateBlueprint();
  const updateBlueprint = useUpdateBlueprint();

  const [videoUrl, setVideoUrl] = useState('');
  const [generateReview, setGenerateReview] = useState(true);
  const [generateBanner, setGenerateBanner] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageText, setStageText] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<YouTubeToBlueprintSuccessResponse | null>(null);
  const [savedBlueprintId, setSavedBlueprintId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const progressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const urlValidation = useMemo(() => validateYouTubeInput(videoUrl), [videoUrl]);
  useEffect(() => {
    if (!isGenerating) return;
    setProgressValue(8);
    const timer = setInterval(() => {
      setProgressValue((current) => Math.min(90, current + Math.max(1, (90 - current) * 0.08)));
    }, 450);
    return () => clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    return () => {
      if (progressResetTimerRef.current) {
        clearTimeout(progressResetTimerRef.current);
      }
    };
  }, []);

  const canSubmit = !isGenerating && videoUrl.trim().length > 0 && urlValidation.ok;

  async function submit() {
    setErrorText(null);
    setResult(null);
    setSavedBlueprintId(null);

    if (!urlValidation.ok) {
      setErrorText(urlValidation.code === 'playlist'
        ? 'Playlist URLs are not supported in MVP. Please use a single video URL.'
        : 'Please enter a valid YouTube single-video URL.');
      return;
    }

    if (!YOUTUBE_ENDPOINT) {
      setErrorText(GENERIC_FAILURE_TEXT);
      return;
    }

    setIsGenerating(true);
    setStageText('Fetching transcript and generating your blueprint...');

    const payload: YouTubeToBlueprintRequest = {
      video_url: videoUrl.trim(),
      generate_review: generateReview,
      generate_banner: generateBanner,
      source: 'youtube_mvp',
    };

    await logMvpEvent({
      eventName: 'youtube_submit',
      userId: user?.id,
      metadata: { source: 'youtube_mvp' },
    });

    try {
      const response = await fetch(YOUTUBE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null) as
        | YouTubeToBlueprintSuccessResponse
        | YouTubeToBlueprintErrorResponse
        | null;

      if (!response.ok || !json || !('ok' in json) || !json.ok) {
        const errCode = json && 'error_code' in json ? json.error_code : 'GENERATION_FAIL';
        await logMvpEvent({
          eventName: 'youtube_fail',
          userId: user?.id,
          metadata: { source: 'youtube_mvp', reason: errCode },
        });
        if (errCode === 'NO_CAPTIONS' || errCode === 'TRANSCRIPT_EMPTY') {
          setErrorText('Transcript unavailable for this video. Please try another video.');
        } else {
          setErrorText(GENERIC_FAILURE_TEXT);
        }
        return;
      }

      setResult(json);
      setStageText('Blueprint ready. Review and save if you want.');
      await logMvpEvent({
        eventName: 'youtube_success',
        userId: user?.id,
        metadata: { source: 'youtube_mvp', run_id: json.run_id },
      });
    } catch {
      await logMvpEvent({
        eventName: 'youtube_fail',
        userId: user?.id,
        metadata: { source: 'youtube_mvp', reason: 'NETWORK' },
      });
      setErrorText(GENERIC_FAILURE_TEXT);
    } finally {
      setIsGenerating(false);
      setProgressValue(100);
      if (progressResetTimerRef.current) {
        clearTimeout(progressResetTimerRef.current);
      }
      progressResetTimerRef.current = setTimeout(() => {
        setProgressValue(0);
      }, 650);
    }
  }

  async function saveDraft() {
    if (!result || !user || isSaving) return;
    setIsSaving(true);
    try {
      const created = await createBlueprint.mutateAsync({
        inventoryId: null,
        title: result.draft.title,
        selectedItems: {},
        steps: toBlueprintStepsForSave(result.draft.steps),
        mixNotes: result.draft.notes,
        reviewPrompt: 'youtube_mvp',
        bannerUrl: result.banner.url,
        llmReview: result.review.summary,
        tags: result.draft.tags,
        isPublic: false,
      });
      setSavedBlueprintId(created.id);
      await logMvpEvent({
        eventName: 'youtube_save_draft',
        userId: user.id,
        blueprintId: created.id,
        metadata: { source: 'youtube_mvp' },
      });
      toast({ title: 'Draft saved', description: 'Your YouTube blueprint draft was saved.' });
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save draft.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function publish() {
    if (!result || !user || !savedBlueprintId || isPublishing) return;
    setIsPublishing(true);
    try {
      await updateBlueprint.mutateAsync({
        blueprintId: savedBlueprintId,
        title: result.draft.title,
        selectedItems: {},
        steps: toBlueprintStepsForSave(result.draft.steps),
        mixNotes: result.draft.notes,
        reviewPrompt: 'youtube_mvp',
        bannerUrl: result.banner.url,
        llmReview: result.review.summary,
        tags: result.draft.tags,
        isPublic: true,
      });
      await logMvpEvent({
        eventName: 'youtube_publish',
        userId: user.id,
        blueprintId: savedBlueprintId,
        metadata: { source: 'youtube_mvp' },
      });
      toast({ title: 'Published', description: 'Blueprint published successfully.' });
    } catch (error) {
      toast({
        title: 'Publish failed',
        description: error instanceof Error ? error.message : 'Could not publish blueprint.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>YouTube to Blueprint</CardTitle>
            <CardDescription>Paste one YouTube video URL and generate a step-by-step blueprint.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="video-url">YouTube URL</Label>
              <Input
                id="video-url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <Label htmlFor="yt-review" className="text-sm">Generate AI review</Label>
                <Switch id="yt-review" checked={generateReview} onCheckedChange={setGenerateReview} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <Label htmlFor="yt-banner" className="text-sm">Generate banner</Label>
                <Switch id="yt-banner" checked={generateBanner} onCheckedChange={setGenerateBanner} />
              </div>
            </div>

            <Button onClick={submit} disabled={!canSubmit}>
              {isGenerating ? 'Generating...' : 'Generate Blueprint'}
            </Button>

            {progressValue > 0 && <Progress value={progressValue} className="h-2" />}
            {stageText && <p className="text-sm text-muted-foreground">{stageText}</p>}
            {errorText && <p className="text-sm text-destructive">{errorText}</p>}
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>{result.draft.title}</CardTitle>
              <CardDescription>{result.draft.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.banner.url && (
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <img src={result.banner.url} alt="Generated banner" className="w-full object-cover" />
                </div>
              )}

              <div className="space-y-3">
                {result.draft.steps.map((step, index) => (
                  <div key={`${step.name}-${index}`} className="rounded-lg border border-border/60 p-3">
                    <p className="font-medium">{index + 1}. {step.name}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{step.notes}</p>
                    {step.timestamp && <p className="text-xs text-muted-foreground mt-1">{step.timestamp}</p>}
                  </div>
                ))}
              </div>

              {result.review.available && result.review.summary && (
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="font-medium mb-1">AI Review</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{result.review.summary}</p>
                </div>
              )}

              {result.draft.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.draft.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">#{tag}</Badge>
                  ))}
                </div>
              )}

              {!user ? (
                <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Log in to save this blueprint draft.</p>
                  <Button asChild size="sm">
                    <Link to="/auth">Log in to save</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveDraft} disabled={isSaving || !!savedBlueprintId}>
                    {savedBlueprintId ? 'Draft saved' : (isSaving ? 'Saving draft...' : 'Save Draft')}
                  </Button>
                  {savedBlueprintId && (
                    <Button variant="outline" onClick={publish} disabled={isPublishing}>
                      {isPublishing ? 'Publishing...' : 'Publish'}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
