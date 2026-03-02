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
import { config, getFunctionUrl } from '@/config/runtime';
import { logMvpEvent } from '@/lib/logEvent';
import { autoPublishMyFeedItem, ensureSourceItemForYouTube, getExistingUserFeedItem, upsertUserFeedItem } from '@/lib/myFeedApi';
import { apiFetch } from '@/lib/api';
import { PageDivider, PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { BlueprintAnalysisView } from '@/components/blueprint/BlueprintAnalysisView';
import { supabase } from '@/integrations/supabase/client';
import { useGenerationTierAccess } from '@/hooks/useGenerationTierAccess';
import type { GenerationTier } from '@/lib/subscriptionsApi';

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
    | 'VIDEO_TOO_LONG'
    | 'VIDEO_DURATION_UNAVAILABLE'
    | 'NO_CAPTIONS'
    | 'TRANSCRIPT_FETCH_FAIL'
    | 'TRANSCRIPT_EMPTY'
    | 'PROVIDER_FAIL'
    | 'SERVICE_DISABLED'
    | 'GENERATION_FAIL'
    | 'SAFETY_BLOCKED'
    | 'PII_BLOCKED'
    | 'TIER_NOT_ALLOWED'
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
  requested_tier?: GenerationTier;
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
  return steps.map((step, index) => {
    const lines = String(step.notes || '').split(/\r?\n/);
    const itemLines = lines
      .map((line) => line.trim())
      .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line))
      .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, '').trim())
      .filter(Boolean);
    const description = lines
      .map((line) => line.replace(/\s+$/g, ''))
      .filter((line) => !/^([-*•]|\d+[.)])\s+/.test(line.trim()))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      id: `yt-step-${index + 1}`,
      title: step.name,
      description: description || null,
      items: itemLines.map((name) => ({ name })),
    };
  });
}

function toYouTubeErrorMessage(errorCode: YouTubeToBlueprintErrorResponse['error_code']) {
  switch (errorCode) {
    case 'INVALID_URL':
      return 'Please enter a valid single YouTube video URL.';
    case 'NO_CAPTIONS':
    case 'TRANSCRIPT_EMPTY':
      return 'Transcript unavailable for this video. Please try another video.';
    case 'VIDEO_TOO_LONG':
      return 'This video exceeds the 45-minute generation limit.';
    case 'VIDEO_DURATION_UNAVAILABLE':
      return 'Video length is unavailable for this video. Please try another video.';
    case 'PROVIDER_FAIL':
    case 'TRANSCRIPT_FETCH_FAIL':
      return 'Transcript provider is currently unavailable. Please try another video.';
    case 'SERVICE_DISABLED':
      return 'YouTube to Blueprint is temporarily unavailable. Please try again later.';
    case 'TIMEOUT':
      return 'This video took too long to process. Please try another video.';
    case 'RATE_LIMITED':
      return 'Too many requests right now. Please wait a bit and try again.';
    case 'TIER_NOT_ALLOWED':
      return 'This generation tier is not enabled for your account.';
    case 'SAFETY_BLOCKED':
      return 'This video content could not be converted safely. Please try another video.';
    case 'GENERATION_FAIL':
      return 'We couldn’t generate a stable blueprint for this video right now. Please try another video or retry in a bit.';
    default:
      return GENERIC_FAILURE_TEXT;
  }
}

async function readAnalyzeBlueprintStream(response: Response) {
  if (!response.body) {
    throw new Error('No response body from analysis endpoint.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let textBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    textBuffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') break;

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) {
          fullContent += content;
        }
      } catch {
        // Incomplete JSON chunk; keep buffering.
        textBuffer = line + '\n' + textBuffer;
        break;
      }
    }
  }

  return fullContent.trim();
}

export default function YouTubeToBlueprint() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, user } = useAuth();
  const { toast } = useToast();
  const createBlueprint = useCreateBlueprint();

  const [videoUrl, setVideoUrl] = useState('');
  const generationTierAccessQuery = useGenerationTierAccess(Boolean(user));
  const allowedGenerationTiers = generationTierAccessQuery.data?.allowedTiers || ['free'];
  const [requestedTier, setRequestedTier] = useState<GenerationTier>('free');
  const [generateReview, setGenerateReview] = useState(false);
  const [generateBanner] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const [isGeneratingBanner, setIsGeneratingBanner] = useState(false);
  const [stageText, setStageText] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [reviewErrorText, setReviewErrorText] = useState<string | null>(null);
  const [bannerErrorText, setBannerErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<YouTubeToBlueprintSuccessResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedBlueprintId, setSavedBlueprintId] = useState<string | null>(null);
  const progressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasHydratedFromParamsRef = useRef(false);
  const hasAutoStartedRef = useRef(false);
  const savedBlueprintIdRef = useRef<string | null>(null);

  const urlValidation = useMemo(() => validateYouTubeInput(videoUrl), [videoUrl]);
  const isPostProcessing = isGeneratingReview || isGeneratingBanner;
  const canSubmit = !isGenerating && !isPostProcessing && videoUrl.trim().length > 0 && urlValidation.ok;

  useEffect(() => {
    if (!user) return;
    const defaultTier = generationTierAccessQuery.data?.defaultTier || 'free';
    if (!allowedGenerationTiers.includes(requestedTier)) {
      setRequestedTier(defaultTier);
    }
  }, [allowedGenerationTiers, generationTierAccessQuery.data?.defaultTier, requestedTier, user]);

  useEffect(() => {
    savedBlueprintIdRef.current = savedBlueprintId;
  }, [savedBlueprintId]);

  useEffect(() => {
    if (hasHydratedFromParamsRef.current) return;
    const urlFromQuery = String(searchParams.get('video_url') || '').trim();
    if (!urlFromQuery) {
      hasHydratedFromParamsRef.current = true;
      return;
    }
    setVideoUrl(urlFromQuery);

    const reviewQuery = searchParams.get('generate_review');
    if (reviewQuery === '0') setGenerateReview(false);

    hasHydratedFromParamsRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    const shouldAutostart = searchParams.get('autostart') === '1';
    if (!shouldAutostart || hasAutoStartedRef.current) return;
    if (!videoUrl.trim() || isGenerating || isPostProcessing) return;

    if (!urlValidation.ok) {
      hasAutoStartedRef.current = true;
      setErrorText(urlValidation.code === 'playlist'
        ? 'Playlist URLs are not supported in MVP. Please use a single video URL.'
        : 'Please enter a valid YouTube single-video URL.');
      const next = new URLSearchParams(searchParams);
      next.delete('autostart');
      setSearchParams(next, { replace: true });
      return;
    }

    hasAutoStartedRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('autostart');
    setSearchParams(next, { replace: true });
    void submit();
  }, [
    isGenerating,
    isPostProcessing,
    searchParams,
    setSearchParams,
    urlValidation.code,
    urlValidation.ok,
    videoUrl,
  ]);

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

  async function runOptionalReviewAndBanner(
    draft: YouTubeDraftPreview,
    runId: string,
    options: { generateReview: boolean; generateBanner: boolean },
  ) {
    const tasks: Promise<void>[] = [];

    if (options.generateReview) {
      setIsGeneratingReview(true);
      setReviewErrorText(null);
      void logMvpEvent({
        eventName: 'youtube_review_started',
        userId: user?.id,
        metadata: { source: 'youtube_mvp', run_id: runId },
      });

      tasks.push(
        (async () => {
          try {
            const streamResponse = await apiFetch<Response>('analyze-blueprint', {
              stream: true,
              body: {
                title: draft.title,
                inventoryTitle: 'YouTube transcript',
                selectedItems: {
                  transcript: draft.steps.map((step) => ({
                    name: step.name,
                    context: step.timestamp || undefined,
                  })),
                },
                mixNotes: draft.notes || undefined,
                reviewPrompt: 'Summarize quality and clarity in a concise way.',
                reviewSections: ['Overview', 'Strengths', 'Suggestions'],
                includeScore: true,
              },
            });

            const summary = await readAnalyzeBlueprintStream(streamResponse);
            setResult((current) =>
              current
                ? {
                    ...current,
                    review: {
                      ...current.review,
                      available: true,
                      summary: summary || null,
                    },
                  }
                : current
            );
            const persistedBlueprintId = savedBlueprintIdRef.current;
            if (persistedBlueprintId && summary) {
              await supabase
                .from('blueprints')
                .update({ llm_review: summary })
                .eq('id', persistedBlueprintId)
                .eq('creator_user_id', user?.id || '');
            }

            await logMvpEvent({
              eventName: 'youtube_review_succeeded',
              userId: user?.id,
              metadata: { source: 'youtube_mvp', run_id: runId },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not generate AI review.';
            await logMvpEvent({
              eventName: 'youtube_review_failed',
              userId: user?.id,
              metadata: {
                source: 'youtube_mvp',
                run_id: runId,
                reason_code: 'REVIEW_REQUEST_FAILED',
                error_message: message,
              },
            });
            setReviewErrorText(message);
            toast({
              title: 'AI review failed',
              description: message,
              variant: 'destructive',
            });
          } finally {
            setIsGeneratingReview(false);
          }
        })()
      );
    }

    if (options.generateBanner) {
      setIsGeneratingBanner(true);
      setBannerErrorText(null);
      void logMvpEvent({
        eventName: 'youtube_banner_started',
        userId: user?.id,
        metadata: { source: 'youtube_mvp', run_id: runId },
      });

      tasks.push(
        (async () => {
          try {
            const bannerResponse = await apiFetch<{ bannerUrl?: string }>('generate-banner', {
              body: {
                title: draft.title,
                inventoryTitle: 'YouTube transcript',
                tags: draft.tags || [],
              },
            });

            const bannerUrl = bannerResponse?.bannerUrl || null;
            await logMvpEvent({
              eventName: 'youtube_banner_succeeded',
              userId: user?.id,
              metadata: { source: 'youtube_mvp', run_id: runId },
            });
            setResult((current) =>
              current
                ? {
                    ...current,
                    banner: {
                      ...current.banner,
                      available: true,
                      url: bannerUrl,
                    },
                  }
                : current
            );
            const persistedBlueprintId = savedBlueprintIdRef.current;
            if (persistedBlueprintId && bannerUrl) {
              await supabase
                .from('blueprints')
                .update({ banner_url: bannerUrl })
                .eq('id', persistedBlueprintId)
                .eq('creator_user_id', user?.id || '');
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not generate banner.';
            await logMvpEvent({
              eventName: 'youtube_banner_failed',
              userId: user?.id,
              metadata: {
                source: 'youtube_mvp',
                run_id: runId,
                reason_code: 'BANNER_REQUEST_FAILED',
                error_message: message,
              },
            });
            setBannerErrorText(message);
            toast({
              title: 'Banner failed',
              description: message,
              variant: 'destructive',
            });
          } finally {
            setIsGeneratingBanner(false);
          }
        })()
      );
    }

    await Promise.allSettled(tasks);
    setStageText('');
  }

  async function submit() {
    setErrorText(null);
    setResult(null);
    setReviewErrorText(null);
    setBannerErrorText(null);
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

    const optionalToggles = {
      generateReview,
      generateBanner: false,
    };

    const payload: YouTubeToBlueprintRequest = {
      video_url: videoUrl.trim(),
      // Keep core pipeline fast and predictable; optional enhancements run as post-steps.
      generate_review: false,
      generate_banner: false,
      source: 'youtube_mvp',
      requested_tier: requestedTier,
    };
    setIsGenerating(true);
    startLoadingPhases([
      'Submitting video',
      'Fetching transcript',
      'Generating blueprint',
      'Applying quality and safety checks',
      'Core blueprint ready',
    ]);

    await logMvpEvent({
      eventName: 'youtube_submit',
      userId: user?.id,
      metadata: { source: 'youtube_mvp' },
    });
    await logMvpEvent({
      eventName: 'source_pull_requested',
      userId: user?.id,
      metadata: { source_type: 'youtube', source: 'youtube_mvp', run_id: null },
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

      const coreResult: YouTubeToBlueprintSuccessResponse = {
        ...json,
        review: {
          available: optionalToggles.generateReview,
          summary: null,
        },
        banner: {
          available: optionalToggles.generateBanner,
          url: null,
        },
      };
      setResult(coreResult);
      setStageText(
        optionalToggles.generateReview || optionalToggles.generateBanner
          ? 'Core blueprint ready. Running optional enhancements...'
          : ''
      );
      await logMvpEvent({
        eventName: 'youtube_success',
        userId: user?.id,
        metadata: { source: 'youtube_mvp', run_id: json.run_id },
      });
      await logMvpEvent({
        eventName: 'source_pull_succeeded',
        userId: user?.id,
        metadata: { source_type: 'youtube', run_id: json.run_id },
      });

      if (optionalToggles.generateReview || optionalToggles.generateBanner) {
        void runOptionalReviewAndBanner(coreResult.draft, coreResult.run_id, optionalToggles);
      }
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

  async function saveToMyFeed() {
    if (!result || !user || isSaving) return;
    setIsSaving(true);
    try {
      const sourceChannelId = String(searchParams.get('channel_id') || '').trim() || null;
      const sourceChannelTitle = String(searchParams.get('channel_title') || searchParams.get('channel_name') || '').trim() || null;
      const sourceChannelUrl = String(searchParams.get('channel_url') || '').trim() || null;
      const sourceItem = await ensureSourceItemForYouTube({
        videoUrl: videoUrl.trim(),
        title: result.draft.title,
        sourceChannelId,
        sourceChannelTitle,
        sourceChannelUrl,
        metadata: {
          run_id: result.run_id,
          transcript_source: result.meta.transcript_source,
          confidence: result.meta.confidence,
          source_channel_url: sourceChannelUrl,
        },
      });

      const existing = await getExistingUserFeedItem(user.id, sourceItem.id);
      if (existing) {
        toast({
          title: 'Already in My Feed',
          description: 'This source is already available in your personal feed.',
        });
        navigate('/my-feed');
        return;
      }

      const created = await createBlueprint.mutateAsync({
        inventoryId: null,
        title: result.draft.title,
        selectedItems: {
          source: 'youtube_mvp',
          run_id: result.run_id,
          video_url: videoUrl.trim(),
          bp_style: 'golden_v1',
          bp_origin: 'youtube_pipeline',
        },
        steps: toBlueprintStepsForSave(result.draft.steps),
        mixNotes: result.draft.notes,
        reviewPrompt: 'youtube_mvp',
        bannerUrl: result.banner.url || sourceItem.thumbnail_url || null,
        llmReview: result.review.summary,
        tags: result.draft.tags || [],
        isPublic: false,
      });
      setSavedBlueprintId(created.id);

      const feedItem = await upsertUserFeedItem({
        userId: user.id,
        sourceItemId: sourceItem.id,
        blueprintId: created.id,
        state: 'my_feed_published',
      });

      let autoPublishResult: Awaited<ReturnType<typeof autoPublishMyFeedItem>> | null = null;
      if (config.features.autoChannelPipelineV1 && feedItem?.id) {
        try {
          autoPublishResult = await autoPublishMyFeedItem({
            userFeedItemId: feedItem.id,
            sourceTag: String(searchParams.get('source') || 'youtube_manual_save'),
          });
        } catch (autoPublishError) {
          console.log('[auto_channel_frontend_trigger_failed]', {
            user_feed_item_id: feedItem.id,
            blueprint_id: created.id,
            error: autoPublishError instanceof Error ? autoPublishError.message : String(autoPublishError),
          });
        }
      }

      await logMvpEvent({
        eventName: 'my_feed_publish_succeeded',
        userId: user.id,
        blueprintId: created.id,
        metadata: {
          run_id: result.run_id,
          source_type: 'youtube',
          source_item_id: sourceItem.id,
          user_feed_item_id: feedItem?.id || null,
          canonical_key: sourceItem.canonical_key,
        },
      });

      toast({
        title: 'Saved to My Feed',
        description: autoPublishResult
          ? autoPublishResult.decision === 'published'
            ? `Posted to ${autoPublishResult.channelSlug}.`
            : `Saved in My Feed. Auto channel checks held this item (${autoPublishResult.reasonCode}).`
          : 'Saved successfully.',
      });
      navigate('/my-feed');
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save to My Feed.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageRoot>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageSection>
          <div className="border border-border/40 px-3 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Personal-first flow</p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                Generated content saves to My Feed first. Channel routing runs automatically after save.
              </p>
            </div>
            <div className="shrink-0">
              <Button asChild size="sm" variant="outline">
                <Link to="/my-feed">Open My Feed</Link>
              </Button>
            </div>
          </div>
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

          <div className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
            <Label htmlFor="yt-review" className="text-sm">Generate AI review</Label>
            <Switch id="yt-review" checked={generateReview} onCheckedChange={setGenerateReview} />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Generation tier:</span>
            <Button
              type="button"
              size="sm"
              variant={requestedTier === 'free' ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => setRequestedTier('free')}
            >
              Free
            </Button>
            {allowedGenerationTiers.includes('tier') ? (
              <Button
                type="button"
                size="sm"
                variant={requestedTier === 'tier' ? 'default' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => setRequestedTier('tier')}
              >
                Tier
              </Button>
            ) : (
              <span className="text-muted-foreground">Tier locked</span>
            )}
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
              {result.banner.available && !result.banner.url && (
                <div className="rounded-md border border-border/40 p-3 text-sm text-muted-foreground">
                  {isGeneratingBanner
                    ? 'Generating banner...'
                    : bannerErrorText
                      ? `Banner generation failed: ${bannerErrorText}`
                      : 'Banner not generated.'}
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
              {result.review.available && !result.review.summary && (
                <div className="rounded-md border border-border/40 p-3 text-sm text-muted-foreground">
                  {isGeneratingReview
                    ? 'Generating AI review...'
                    : reviewErrorText
                      ? `AI review failed: ${reviewErrorText}`
                      : 'AI review not generated.'}
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
                  <p className="text-sm text-muted-foreground">Log in to save this blueprint in My Feed.</p>
                  <Button asChild size="sm">
                    <Link to="/auth">Log in to save</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={saveToMyFeed} disabled={isSaving}>
                      {isSaving ? 'Saving...' : 'Save to My Feed'}
                    </Button>
                    {config.features.autoChannelPipelineV1 ? (
                      <Button asChild variant="outline">
                        <Link to="/my-feed">Open My Feed</Link>
                      </Button>
                    ) : config.features.channelSubmitV1 && (
                      <Button asChild variant="outline">
                        <Link to="/my-feed">Review channel status in My Feed</Link>
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isPostProcessing
                      ? 'Optional enhancements are still running. You can save now and they will attach when finished.'
                      : config.features.autoChannelPipelineV1
                        ? 'Channel publishing runs automatically after save.'
                        : 'Channel publishing is handled after submit and gate checks in My Feed.'}
                  </p>
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
