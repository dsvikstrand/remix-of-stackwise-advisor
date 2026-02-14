import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateBlueprint } from '@/hooks/useBlueprints';
import { getFunctionUrl } from '@/config/runtime';
import { logMvpEvent } from '@/lib/logEvent';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useTagsBySlugs } from '@/hooks/useTags';
import { getPostableChannel } from '@/lib/channelPostContext';
import { PageDivider, PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { BlueprintAnalysisView } from '@/components/blueprint/BlueprintAnalysisView';

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
    | 'PROVIDER_FAIL'
    | 'SERVICE_DISABLED'
    | 'GENERATION_FAIL'
    | 'SAFETY_BLOCKED'
    | 'PII_BLOCKED'
    | 'RATE_LIMITED'
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

function toYouTubeErrorMessage(errorCode: YouTubeToBlueprintErrorResponse['error_code']) {
  switch (errorCode) {
    case 'INVALID_URL':
      return 'Please enter a valid single YouTube video URL.';
    case 'NO_CAPTIONS':
    case 'TRANSCRIPT_EMPTY':
      return 'Transcript unavailable for this video. Please try another video.';
    case 'PROVIDER_FAIL':
    case 'TRANSCRIPT_FETCH_FAIL':
      return 'Transcript provider is currently unavailable. Please try another video.';
    case 'SERVICE_DISABLED':
      return 'YouTube to Blueprint is temporarily unavailable. Please try again later.';
    case 'TIMEOUT':
      return 'This video took too long to process. Please try another video.';
    case 'RATE_LIMITED':
      return 'Too many requests right now. Please wait a bit and try again.';
    case 'SAFETY_BLOCKED':
      return 'This video content could not be converted safely. Please try another video.';
    default:
      return GENERIC_FAILURE_TEXT;
  }
}

export default function YouTubeToBlueprint() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, user } = useAuth();
  const { toast } = useToast();
  const createBlueprint = useCreateBlueprint();
  const { getFollowState } = useTagFollows();

  const postChannelSlug = (searchParams.get('channel') || '').trim();
  const postChannel = postChannelSlug ? getPostableChannel(postChannelSlug) : null;
  const { data: postChannelTagRows = [] } = useTagsBySlugs(postChannel ? [postChannel.tagSlug] : []);
  const postChannelTagId = postChannelTagRows.find((row) => row.slug === postChannel?.tagSlug)?.id || null;
  const postChannelFollowState = postChannelTagId ? getFollowState({ id: postChannelTagId }) : 'not_joined';
  const isPostChannelJoined = postChannelFollowState === 'joined' || postChannelFollowState === 'leaving';

  const [videoUrl, setVideoUrl] = useState('');
  const [generateReview, setGenerateReview] = useState(true);
  const [generateBanner, setGenerateBanner] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageText, setStageText] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<YouTubeToBlueprintSuccessResponse | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const progressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const urlValidation = useMemo(() => validateYouTubeInput(videoUrl), [videoUrl]);
  useEffect(() => {
    return () => {
      if (progressResetTimerRef.current) {
        clearTimeout(progressResetTimerRef.current);
      }
      if (phaseIntervalRef.current) {
        clearInterval(phaseIntervalRef.current);
      }
    };
  }, []);

  function startLoadingPhases(phases: string[]) {
    if (phaseIntervalRef.current) {
      clearInterval(phaseIntervalRef.current);
      phaseIntervalRef.current = null;
    }
    const safePhases = phases.length > 0 ? phases : ['Generating blueprint'];
    let phaseIndex = 0;
    setStageText(safePhases[phaseIndex]);
    setProgressValue(15);

    if (safePhases.length === 1) return;
    phaseIntervalRef.current = setInterval(() => {
      phaseIndex = Math.min(phaseIndex + 1, safePhases.length - 1);
      const normalized = phaseIndex / (safePhases.length - 1);
      const nextProgress = Math.min(92, 15 + Math.round(normalized * 77));
      setProgressValue(nextProgress);
      setStageText(safePhases[phaseIndex]);
      if (phaseIndex >= safePhases.length - 1 && phaseIntervalRef.current) {
        clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = null;
      }
    }, 1400);
  }

  const canSubmit = !isGenerating && videoUrl.trim().length > 0 && urlValidation.ok;

  async function submit() {
    setErrorText(null);
    setResult(null);

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

    const payload: YouTubeToBlueprintRequest = {
      video_url: videoUrl.trim(),
      generate_review: generateReview,
      generate_banner: generateBanner,
      source: 'youtube_mvp',
    };
    setIsGenerating(true);
    startLoadingPhases([
      'Submitting video',
      'Fetching transcript',
      'Generating blueprint',
      ...(payload.generate_review ? ['Generating AI review'] : []),
      ...(payload.generate_banner ? ['Generating banner'] : []),
      'Finalizing result',
    ]);

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
          metadata: { source: 'youtube_mvp', reason: errCode, rate_limited: errCode === 'RATE_LIMITED' },
        });
        setErrorText(toYouTubeErrorMessage(errCode));
        setStageText('Generation failed');
        return;
      }

      setResult(json);
      setStageText('');
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
      setStageText('Generation failed');
    } finally {
      if (phaseIntervalRef.current) {
        clearInterval(phaseIntervalRef.current);
        phaseIntervalRef.current = null;
      }
      setIsGenerating(false);
      setProgressValue(100);
      if (progressResetTimerRef.current) {
        clearTimeout(progressResetTimerRef.current);
      }
      progressResetTimerRef.current = setTimeout(() => {
        setProgressValue(0);
      }, 1500);
    }
  }

  async function publishGeneratedBlueprint() {
    if (!result || !user || isPublishing) return;
    if (!postChannel) {
      toast({
        title: 'Choose a channel to post',
        description: 'Public blueprints must be posted to a channel. Start from a channel page or use + Create.',
        variant: 'destructive',
      });
      return;
    }
    if (!isPostChannelJoined) {
      toast({
        title: `Join b/${postChannel.slug} to post`,
        description: 'Join the channel first, then publish your blueprint.',
        variant: 'destructive',
      });
      return;
    }
    setIsPublishing(true);
    try {
      const tagsForSave = Array.from(new Set([...(result.draft.tags || []), postChannel.tagSlug]));
      const created = await createBlueprint.mutateAsync({
        inventoryId: null,
        title: result.draft.title,
        selectedItems: {},
        steps: toBlueprintStepsForSave(result.draft.steps),
        mixNotes: result.draft.notes,
        reviewPrompt: 'youtube_mvp',
        bannerUrl: result.banner.url,
        llmReview: result.review.summary,
        tags: tagsForSave,
        isPublic: true,
      });
      await logMvpEvent({
        eventName: 'youtube_publish',
        userId: user.id,
        blueprintId: created.id,
        metadata: { source: 'youtube_mvp' },
      });
      navigate(`/blueprint/${created.id}`);
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
    <PageRoot>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageSection>
          {postChannel ? (
            <div className="border border-border/40 px-3 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Posting to b/{postChannel.slug}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {isPostChannelJoined ? 'Publish will post into this channel.' : 'Join this channel to publish publicly.'}
                </p>
              </div>
              <div className="shrink-0">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/b/${postChannel.slug}`}>{isPostChannelJoined ? 'View' : 'Join'}</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="border border-border/40 px-3 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Choose a channel to post</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  Public blueprints must be posted to a channel. Start from a channel page or use + Create.
                </p>
              </div>
              <div className="shrink-0">
                <Button asChild size="sm" variant="outline">
                  <Link to="/channels?create=1">Pick channel</Link>
                </Button>
              </div>
            </div>
          )}
        </PageSection>

        <PageDivider />

        <PageSection className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">YouTube to Blueprint</h1>
            <p className="text-sm text-muted-foreground">
              Paste one YouTube video URL and generate a step-by-step blueprint.
            </p>
          </div>

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
            <div className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
              <Label htmlFor="yt-review" className="text-sm">Generate AI review</Label>
              <Switch id="yt-review" checked={generateReview} onCheckedChange={setGenerateReview} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
              <Label htmlFor="yt-banner" className="text-sm">Generate banner</Label>
              <Switch id="yt-banner" checked={generateBanner} onCheckedChange={setGenerateBanner} />
            </div>
          </div>

          <Button onClick={submit} disabled={!canSubmit}>
            {isGenerating ? 'Generating...' : 'Generate Blueprint'}
          </Button>

          {progressValue > 0 && (
            <div className="space-y-1">
              <Progress value={progressValue} className="h-3 border border-border/40 bg-muted/50" />
              <p className="text-xs text-muted-foreground">{Math.round(progressValue)}%</p>
            </div>
          )}
          {stageText && <p className="text-sm text-muted-foreground">{stageText}</p>}
          {errorText && <p className="text-sm text-destructive">{errorText}</p>}
        </PageSection>

        {result && (
          <>
            <PageDivider />
            <PageSection className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{result.draft.title}</h2>
                <p className="text-sm text-muted-foreground">{result.draft.description}</p>
              </div>
              {result.banner.url && (
                <div className="overflow-hidden rounded-md border border-border/40">
                  <img src={result.banner.url} alt="Generated banner" className="w-full object-cover" />
                </div>
              )}

              <div className="space-y-3">
                {result.draft.steps.map((step, index) => (
                  <div key={`${step.name}-${index}`} className="rounded-md border border-border/40 p-3">
                    <p className="font-medium">{index + 1}. {step.name}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{step.notes}</p>
                    {step.timestamp && <p className="text-xs text-muted-foreground mt-1">{step.timestamp}</p>}
                  </div>
                ))}
              </div>

              {result.review.available && result.review.summary && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">AI Review</p>
                  <BlueprintAnalysisView review={result.review.summary} density="compact" />
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
                <div className="rounded-md border border-border/40 p-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Log in to publish this blueprint.</p>
                  <Button asChild size="sm">
                    <Link to="/auth">Log in to publish</Link>
                  </Button>
                </div>
              ) : !postChannel ? (
                <div className="rounded-md border border-border/40 p-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Choose a channel before publishing.</p>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/channels?create=1">Pick channel</Link>
                  </Button>
                </div>
              ) : !isPostChannelJoined ? (
                <div className="rounded-md border border-border/40 p-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Join b/{postChannel.slug} to publish publicly.</p>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/b/${postChannel.slug}`}>Join</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={publishGeneratedBlueprint} disabled={isPublishing}>
                    {isPublishing ? 'Publishing...' : 'Publish'}
                  </Button>
                </div>
              )}
            </PageSection>
          </>
        )}
        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}
