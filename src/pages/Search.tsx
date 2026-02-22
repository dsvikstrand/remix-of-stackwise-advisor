import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { config, getFunctionUrl } from '@/config/runtime';
import { logMvpEvent } from '@/lib/logEvent';
import { useCreateBlueprint } from '@/hooks/useBlueprints';
import { useAiCredits } from '@/hooks/useAiCredits';
import { autoPublishMyFeedItem, ensureSourceItemForYouTube, getExistingUserFeedItem, upsertUserFeedItem } from '@/lib/myFeedApi';
import {
  ApiRequestError as SubscriptionApiRequestError,
  createSourceSubscription,
} from '@/lib/subscriptionsApi';
import {
  ApiRequestError,
  searchYouTube,
  type YouTubeSearchResult,
} from '@/lib/youtubeSearchApi';
import { formatRelativeShort } from '@/lib/timeFormat';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';

const DEFAULT_SEARCH_LIMIT = 10;
const YOUTUBE_ENDPOINT = getFunctionUrl('youtube-to-blueprint');
const GENERATE_BLUEPRINT_COST = 1;

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

function toBlueprintStepsForSave(steps: YouTubeDraftStep[]) {
  return steps.map((step, index) => ({
    id: `yt-step-${index + 1}`,
    title: step.name,
    description: step.notes,
    items: [],
  }));
}

function toGenerateErrorMessage(errorCode?: string | null) {
  switch (errorCode) {
    case 'INVALID_URL':
      return 'Please use a valid YouTube video.';
    case 'NO_CAPTIONS':
    case 'TRANSCRIPT_EMPTY':
      return 'Transcript unavailable for this video. Please try another one.';
    case 'PROVIDER_FAIL':
    case 'TRANSCRIPT_FETCH_FAIL':
      return 'Transcript provider is currently unavailable. Please try again.';
    case 'SERVICE_DISABLED':
      return 'Generation is temporarily unavailable. Please try later.';
    case 'TIMEOUT':
      return 'This video took too long to process. Please try another one.';
    case 'RATE_LIMITED':
      return 'Too many requests right now. Please retry shortly.';
    case 'SAFETY_BLOCKED':
      return 'This video could not be converted safely. Try another video.';
    default:
      return 'Could not generate blueprint right now. Please try again.';
  }
}

function getSearchErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    switch (error.errorCode) {
      case 'INVALID_QUERY':
        return 'Enter at least 2 characters to search.';
      case 'SEARCH_DISABLED':
        return 'Search is currently unavailable. Try direct URL in YouTube to Blueprint.';
      case 'RATE_LIMITED':
        return 'Search quota is currently limited. Please retry later.';
      case 'API_NOT_CONFIGURED':
        return 'Search requires VITE_AGENTIC_BACKEND_URL.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Search failed.';
}

export default function SearchPage() {
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const { toast } = useToast();
  const createBlueprint = useCreateBlueprint();
  const creditsQuery = useAiCredits(Boolean(user));

  const [queryInput, setQueryInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [generatingVideoIds, setGeneratingVideoIds] = useState<Record<string, boolean>>({});
  const [subscribingChannelIds, setSubscribingChannelIds] = useState<Record<string, boolean>>({});

  const searchEnabled = Boolean(config.agenticBackendUrl);
  const hasEnoughCredits = Boolean(
    !user
    || creditsQuery.data?.bypass
    || (creditsQuery.data && creditsQuery.data.displayBalance >= GENERATE_BLUEPRINT_COST),
  );

  const hasResults = results.length > 0;
  const showEmpty = submittedQuery.length > 0 && !hasResults;

  const searchMutation = useMutation({
    mutationFn: async (input: { query: string; pageToken?: string | null; append?: boolean }) => {
      const data = await searchYouTube({
        q: input.query,
        limit: DEFAULT_SEARCH_LIMIT,
        pageToken: input.pageToken || undefined,
      });
      return {
        query: input.query,
        append: Boolean(input.append),
        ...data,
      };
    },
    onSuccess: (payload) => {
      setSubmittedQuery(payload.query);
      setSearchError(null);
      setResults((previous) => (payload.append ? [...previous, ...payload.results] : payload.results));
      setNextPageToken(payload.next_page_token);
    },
    onError: (error) => {
      setSearchError(getSearchErrorMessage(error));
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: (channelInput: string) => createSourceSubscription({ channelInput }),
    onSuccess: () => {
      toast({
        title: 'Subscription saved',
        description: 'New uploads from this channel will appear in your feed.',
      });
    },
    onError: (error) => {
      const description = error instanceof SubscriptionApiRequestError && error.errorCode === 'INVALID_CHANNEL'
        ? 'Could not resolve this channel.'
        : error instanceof Error
          ? error.message
          : 'Could not subscribe.';
      toast({ title: 'Subscribe failed', description, variant: 'destructive' });
    },
  });

  const setGenerating = (videoId: string, value: boolean) => {
    setGeneratingVideoIds((previous) => {
      if (value) return { ...previous, [videoId]: true };
      const next = { ...previous };
      delete next[videoId];
      return next;
    });
  };

  const setSubscribing = (channelId: string, value: boolean) => {
    setSubscribingChannelIds((previous) => {
      if (value) return { ...previous, [channelId]: true };
      const next = { ...previous };
      delete next[channelId];
      return next;
    });
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = queryInput.trim();
    if (!query) {
      setSearchError('Enter a search query.');
      return;
    }
    searchMutation.mutate({ query, append: false });
  };

  const handleLoadMore = () => {
    if (!nextPageToken || searchMutation.isPending) return;
    searchMutation.mutate({
      query: submittedQuery || queryInput.trim(),
      pageToken: nextPageToken,
      append: true,
    });
  };

  const handleSubscribeChannel = async (result: YouTubeSearchResult) => {
    if (subscribingChannelIds[result.channel_id]) return;
    setSubscribing(result.channel_id, true);
    try {
      await subscribeMutation.mutateAsync(result.channel_url || result.channel_id);
    } finally {
      setSubscribing(result.channel_id, false);
    }
  };

  const handleGenerateBlueprint = async (result: YouTubeSearchResult) => {
    if (!user || generatingVideoIds[result.video_id]) return;
    if (!hasEnoughCredits) {
      toast({
        title: 'Not enough credits',
        description: 'Wait for refill, then try again.',
        variant: 'destructive',
      });
      return;
    }
    if (!YOUTUBE_ENDPOINT) {
      toast({
        title: 'Generation unavailable',
        description: 'Backend API is not configured.',
        variant: 'destructive',
      });
      return;
    }

    setGenerating(result.video_id, true);
    try {
      await logMvpEvent({
        eventName: 'source_pull_requested',
        userId: user.id,
        metadata: {
          source_type: 'youtube_search',
          source_video_id: result.video_id,
          source_channel_id: result.channel_id,
        },
      });

      const response = await fetch(YOUTUBE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          video_url: result.video_url,
          generate_review: false,
          generate_banner: false,
          source: 'youtube_mvp',
        }),
      });

      const json = await response.json().catch(() => null) as
        | YouTubeToBlueprintSuccessResponse
        | YouTubeToBlueprintErrorResponse
        | null;

      if (!response.ok || !json || !('ok' in json) || !json.ok) {
        const errorCode = json && 'error_code' in json ? json.error_code : null;
        const message = json && 'message' in json ? json.message : null;
        if ((message || '').toLowerCase().includes('insufficient credits')) {
          throw new Error('Insufficient credits right now. Please wait for refill and try again.');
        }
        throw new Error(message || toGenerateErrorMessage(errorCode));
      }

      const sourceItem = await ensureSourceItemForYouTube({
        videoUrl: result.video_url,
        title: json.draft.title,
        sourceChannelId: result.channel_id,
        sourceChannelTitle: result.channel_title || null,
        sourceChannelUrl: result.channel_url || null,
        metadata: {
          run_id: json.run_id,
          transcript_source: json.meta.transcript_source,
          confidence: json.meta.confidence,
          source_channel_url: result.channel_url || null,
        },
      });

      const existing = await getExistingUserFeedItem(user.id, sourceItem.id);
      if (existing) {
        toast({
          title: 'Already in your feed',
          description: 'This video is already available in your feed.',
        });
        await queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
        return;
      }

      const created = await createBlueprint.mutateAsync({
        inventoryId: null,
        title: json.draft.title,
        selectedItems: {},
        steps: toBlueprintStepsForSave(json.draft.steps),
        mixNotes: json.draft.notes,
        reviewPrompt: 'youtube_search_direct',
        bannerUrl: sourceItem.thumbnail_url || null,
        llmReview: null,
        tags: json.draft.tags || [],
        isPublic: false,
      });

      const feedItem = await upsertUserFeedItem({
        userId: user.id,
        sourceItemId: sourceItem.id,
        blueprintId: created.id,
        state: 'my_feed_published',
      });

      if (config.features.autoChannelPipelineV1 && feedItem?.id) {
        try {
          await autoPublishMyFeedItem({
            userFeedItemId: feedItem.id,
            sourceTag: 'youtube_search_direct',
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
        eventName: 'source_pull_succeeded',
        userId: user.id,
        blueprintId: created.id,
        metadata: {
          source_type: 'youtube_search',
          run_id: json.run_id,
          source_item_id: sourceItem.id,
          user_feed_item_id: feedItem?.id || null,
          canonical_key: sourceItem.canonical_key,
        },
      });

      toast({
        title: 'Blueprint generated',
        description: 'Added to your feed.',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ai-credits'] }),
        queryClient.invalidateQueries({ queryKey: ['my-feed-items', user.id] }),
      ]);
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Could not generate this blueprint right now.',
        variant: 'destructive',
      });
      await queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
    } finally {
      setGenerating(result.video_id, false);
    }
  };

  const searchSummary = useMemo(() => {
    if (!submittedQuery) return null;
    return `Showing ${results.length} result${results.length === 1 ? '' : 's'} for "${submittedQuery}"`;
  }, [results.length, submittedQuery]);

  return (
    <PageRoot>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageSection className="space-y-2">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">Create</p>
          <h1 className="text-2xl font-semibold">Find YouTube content and create blueprints</h1>
          <p className="text-sm text-muted-foreground">
            Generate directly from search results. Successful generations are added to your feed.
          </p>
        </PageSection>

        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Search YouTube</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Try: skincare 2026 best"
              />
              <Button type="submit" disabled={searchMutation.isPending || !searchEnabled}>
                {searchMutation.isPending ? 'Searching...' : 'Search'}
              </Button>
            </form>
            {!searchEnabled ? (
              <p className="text-xs text-muted-foreground">
                Search requires `VITE_AGENTIC_BACKEND_URL`.
              </p>
            ) : null}
            {searchError ? <p className="text-sm text-destructive">{searchError}</p> : null}
          </CardContent>
        </Card>

        {searchSummary ? <p className="text-sm text-muted-foreground">{searchSummary}</p> : null}

        {searchMutation.isPending && !hasResults ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : null}

        {showEmpty ? (
          <Card className="border-border/40">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm text-muted-foreground">No results found for your query.</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/youtube">Use direct YouTube URL instead</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {hasResults ? (
          <div className="space-y-4">
            {results.map((result) => {
              const isGenerating = Boolean(generatingVideoIds[result.video_id]);
              const isSubscribing = Boolean(subscribingChannelIds[result.channel_id]);
              return (
                <Card key={result.video_id} className="border-border/50">
                  <CardContent className="p-4 space-y-3">
                    <div className="grid gap-3 md:grid-cols-[160px,1fr]">
                      <a href={result.video_url} target="_blank" rel="noreferrer" className="block">
                        {result.thumbnail_url ? (
                          <img
                            src={result.thumbnail_url}
                            alt={result.title}
                            className="w-full h-28 object-cover rounded-md border border-border/40"
                          />
                        ) : (
                          <div className="w-full h-28 rounded-md border border-border/40 bg-muted/40" />
                        )}
                      </a>
                      <div className="space-y-2">
                        <a href={result.video_url} target="_blank" rel="noreferrer" className="block">
                          <p className="font-medium leading-tight hover:underline">{result.title}</p>
                        </a>
                        <p className="text-sm text-muted-foreground line-clamp-3">{result.description || 'No description available.'}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{result.channel_title}</Badge>
                          {result.published_at ? <Badge variant="secondary">{formatRelativeShort(result.published_at)}</Badge> : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleGenerateBlueprint(result)}
                        disabled={isGenerating || !user || !hasEnoughCredits}
                      >
                        {isGenerating ? 'Generating...' : `Generate Blueprint · ◉${GENERATE_BLUEPRINT_COST}`}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSubscribeChannel(result)}
                        disabled={isSubscribing || !searchEnabled}
                      >
                        {isSubscribing ? 'Subscribing...' : 'Subscribe Channel'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {nextPageToken ? (
              <div className="flex justify-center">
                <Button variant="outline" onClick={handleLoadMore} disabled={searchMutation.isPending}>
                  {searchMutation.isPending ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}
