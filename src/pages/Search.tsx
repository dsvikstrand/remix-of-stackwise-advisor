import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  listSourceSubscriptions,
  type SourceSubscription,
} from '@/lib/subscriptionsApi';
import {
  ApiRequestError,
  searchYouTube,
  type YouTubeSearchResult,
} from '@/lib/youtubeSearchApi';
import {
  ApiRequestError as ChannelSearchApiRequestError,
  searchYouTubeChannels,
  type YouTubeChannelSearchResult,
} from '@/lib/youtubeChannelSearchApi';
import {
  ApiRequestError as ChannelVideosApiRequestError,
  listYouTubeChannelVideos,
  type YouTubeChannelVideoItem,
} from '@/lib/youtubeChannelVideosApi';
import { formatRelativeShort } from '@/lib/timeFormat';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';

const DEFAULT_SEARCH_LIMIT = 10;
const YOUTUBE_ENDPOINT = getFunctionUrl('youtube-to-blueprint');
const GENERATE_BLUEPRINT_COST = 1;
const QUICK_TAG_COUNT = 4;
const VIDEO_QUICK_TAG_BANK = [
  'protein meals',
  'morning routine',
  'mobility workout',
  'skincare tips',
  'ai coding',
  'productivity habits',
  'mental performance',
  'weight loss',
  'strength training',
  'healthy recipes',
  'calisthenics',
  'sleep optimization',
  'deep work',
  'study techniques',
  'running form',
  'yoga flow',
  'meal prep',
  'finance basics',
  'career advice',
  'language learning',
  'public speaking',
  'cold exposure',
  'gut health',
  'meditation',
  'data science',
  'startup strategy',
  'design systems',
  'home workouts',
  'leadership skills',
  'digital marketing',
  'paper review',
  'neuroscience',
  'supplements',
  'boxing drills',
  'stretch routine',
];
const CHANNEL_QUICK_TAG_BANK = [
  'fitness coach',
  'nutrition expert',
  'ai research',
  'coding tutorials',
  'business strategy',
  'finance education',
  'dermatology',
  'home workout',
  'meal prep',
  'biohacking',
  'calisthenics',
  'science channel',
  'podcast clips',
  'startup founder',
  'yoga instructor',
  'mindset coach',
  'machine learning',
  'web development',
  'career growth',
  'language teacher',
  'psychology channel',
  'tech reviews',
  'nutrition science',
  'mobility coach',
  'boxing coach',
  'wellness doctor',
  'strength coach',
  'study channel',
  'product management',
  'deep learning',
  'sleep science',
  'habit building',
  'creator economy',
  'personal finance',
  'design education',
];

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

function getChannelSearchErrorMessage(error: unknown) {
  if (error instanceof ChannelSearchApiRequestError) {
    switch (error.errorCode) {
      case 'INVALID_QUERY':
        return 'Enter at least 2 characters to search channels.';
      case 'SEARCH_DISABLED':
        return 'Channel search is currently unavailable.';
      case 'RATE_LIMITED':
        return 'Channel search quota is currently limited. Please retry later.';
      case 'API_NOT_CONFIGURED':
        return 'Channel search requires VITE_AGENTIC_BACKEND_URL.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Channel search failed.';
}

function getChannelVideosErrorMessage(error: unknown) {
  if (error instanceof ChannelVideosApiRequestError) {
    switch (error.errorCode) {
      case 'RATE_LIMITED':
        return 'Video listing is temporarily rate limited. Please retry shortly.';
      case 'AUTH_REQUIRED':
        return 'Sign in required to browse channel videos.';
      case 'INVALID_INPUT':
        return 'Could not load videos for this channel.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Could not load channel videos.';
}

type GenerateTarget = {
  video_id: string;
  video_url: string;
  title: string;
  channel_id: string;
  channel_title: string;
  channel_url: string;
};

function sampleQuickTags(bank: string[], count = QUICK_TAG_COUNT) {
  const pool = [...bank];
  const chosen: string[] = [];
  while (pool.length > 0 && chosen.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    const [pick] = pool.splice(index, 1);
    chosen.push(pick);
  }
  return chosen;
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
  const [mode, setMode] = useState<'videos' | 'channels'>('videos');
  const [channelQueryInput, setChannelQueryInput] = useState('');
  const [submittedChannelQuery, setSubmittedChannelQuery] = useState('');
  const [channelResults, setChannelResults] = useState<YouTubeChannelSearchResult[]>([]);
  const [channelNextPageToken, setChannelNextPageToken] = useState<string | null>(null);
  const [channelSearchError, setChannelSearchError] = useState<string | null>(null);
  const [selectedBrowseChannel, setSelectedBrowseChannel] = useState<YouTubeChannelSearchResult | null>(null);
  const [channelVideoItems, setChannelVideoItems] = useState<YouTubeChannelVideoItem[]>([]);
  const [channelVideosNextPageToken, setChannelVideosNextPageToken] = useState<string | null>(null);
  const [channelVideosError, setChannelVideosError] = useState<string | null>(null);
  const [generatingVideoIds, setGeneratingVideoIds] = useState<Record<string, boolean>>({});
  const [subscribingChannelIds, setSubscribingChannelIds] = useState<Record<string, boolean>>({});
  const [quickVideoTags, setQuickVideoTags] = useState<string[]>(() => sampleQuickTags(VIDEO_QUICK_TAG_BANK));
  const [quickChannelTags, setQuickChannelTags] = useState<string[]>(() => sampleQuickTags(CHANNEL_QUICK_TAG_BANK));

  const searchEnabled = Boolean(config.agenticBackendUrl);
  const sourceSubscriptionsQueryKey = useMemo(() => ['search-source-subscriptions', user?.id || 'anon'] as const, [user?.id]);
  const subscriptionsQuery = useQuery({
    queryKey: sourceSubscriptionsQueryKey,
    queryFn: listSourceSubscriptions,
    enabled: Boolean(user && searchEnabled),
    staleTime: 60_000,
  });
  const hasEnoughCredits = Boolean(
    !user
    || creditsQuery.data?.bypass
    || (creditsQuery.data && creditsQuery.data.displayBalance >= GENERATE_BLUEPRINT_COST),
  );
  const subscribedChannelIds = useMemo(() => {
    return new Set(
      (subscriptionsQuery.data || [])
        .filter((row) => row.is_active)
        .map((row) => row.source_channel_id),
    );
  }, [subscriptionsQuery.data]);

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

  const channelSearchMutation = useMutation({
    mutationFn: async (input: { query: string; pageToken?: string | null; append?: boolean }) => {
      const data = await searchYouTubeChannels({
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
      setSubmittedChannelQuery(payload.query);
      setChannelSearchError(null);
      setChannelResults((previous) => (payload.append ? [...previous, ...payload.results] : payload.results));
      setChannelNextPageToken(payload.next_page_token);
    },
    onError: (error) => {
      setChannelSearchError(getChannelSearchErrorMessage(error));
    },
  });

  const channelVideosMutation = useMutation({
    mutationFn: async (input: { channelId: string; pageToken?: string | null; append?: boolean }) => {
      const data = await listYouTubeChannelVideos({
        channelId: input.channelId,
        limit: 12,
        pageToken: input.pageToken || undefined,
      });
      return {
        append: Boolean(input.append),
        ...data,
      };
    },
    onSuccess: (payload) => {
      setChannelVideosError(null);
      setChannelVideoItems((previous) => (payload.append ? [...previous, ...payload.items] : payload.items));
      setChannelVideosNextPageToken(payload.next_page_token);
    },
    onError: (error) => {
      setChannelVideosError(getChannelVideosErrorMessage(error));
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: (input: { channelInput: string; channelId: string }) => createSourceSubscription({ channelInput: input.channelInput }),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<SourceSubscription[] | undefined>(sourceSubscriptionsQueryKey, (previous) => {
        if (!previous) return previous;
        const alreadyPresent = previous.some((row) => row.source_channel_id === variables.channelId && row.is_active);
        if (alreadyPresent) return previous;
        return previous;
      });
      void queryClient.invalidateQueries({ queryKey: sourceSubscriptionsQueryKey });
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

  const runVideoQuickSearch = (tag: string) => {
    setQueryInput(tag);
    setSearchError(null);
    searchMutation.mutate({ query: tag, append: false });
  };

  const handleChannelSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = channelQueryInput.trim();
    if (!query) {
      setChannelSearchError('Enter a channel query.');
      return;
    }
    channelSearchMutation.mutate({ query, append: false });
  };

  const handleChannelSearchLoadMore = () => {
    if (!channelNextPageToken || channelSearchMutation.isPending) return;
    channelSearchMutation.mutate({
      query: submittedChannelQuery || channelQueryInput.trim(),
      pageToken: channelNextPageToken,
      append: true,
    });
  };

  const runChannelQuickSearch = (tag: string) => {
    setChannelQueryInput(tag);
    setChannelSearchError(null);
    channelSearchMutation.mutate({ query: tag, append: false });
  };

  const handleBrowseChannelVideos = (channel: YouTubeChannelSearchResult) => {
    setSelectedBrowseChannel(channel);
    setChannelVideoItems([]);
    setChannelVideosNextPageToken(null);
    setChannelVideosError(null);
    channelVideosMutation.mutate({
      channelId: channel.channel_id,
      append: false,
    });
  };

  const handleBrowseDialogChange = (open: boolean) => {
    if (open) return;
    setSelectedBrowseChannel(null);
    setChannelVideoItems([]);
    setChannelVideosNextPageToken(null);
    setChannelVideosError(null);
  };

  const handleLoadMoreChannelVideos = () => {
    if (!selectedBrowseChannel || !channelVideosNextPageToken || channelVideosMutation.isPending) return;
    channelVideosMutation.mutate({
      channelId: selectedBrowseChannel.channel_id,
      pageToken: channelVideosNextPageToken,
      append: true,
    });
  };

  const handleSubscribeChannel = async (channel: { channel_id: string; channel_url: string }) => {
    if (subscribingChannelIds[channel.channel_id] || subscribedChannelIds.has(channel.channel_id)) return;
    setSubscribing(channel.channel_id, true);
    try {
      await subscribeMutation.mutateAsync({
        channelInput: channel.channel_url || channel.channel_id,
        channelId: channel.channel_id,
      });
    } finally {
      setSubscribing(channel.channel_id, false);
    }
  };

  const handleGenerateBlueprint = async (target: GenerateTarget) => {
    if (!user || generatingVideoIds[target.video_id]) return;
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

    setGenerating(target.video_id, true);
    try {
      await logMvpEvent({
        eventName: 'source_pull_requested',
        userId: user.id,
        metadata: {
          source_type: 'youtube_search',
          source_video_id: target.video_id,
          source_channel_id: target.channel_id,
        },
      });

      const response = await fetch(YOUTUBE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          video_url: target.video_url,
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
        videoUrl: target.video_url,
        title: json.draft.title,
        sourceChannelId: target.channel_id,
        sourceChannelTitle: target.channel_title || null,
        sourceChannelUrl: target.channel_url || null,
        metadata: {
          run_id: json.run_id,
          transcript_source: json.meta.transcript_source,
          confidence: json.meta.confidence,
          source_channel_url: target.channel_url || null,
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
      setGenerating(target.video_id, false);
    }
  };

  const searchSummary = useMemo(() => {
    if (!submittedQuery) return null;
    return `Showing ${results.length} result${results.length === 1 ? '' : 's'} for "${submittedQuery}"`;
  }, [results.length, submittedQuery]);

  const channelSearchSummary = useMemo(() => {
    if (!submittedChannelQuery) return null;
    return `Showing ${channelResults.length} channel${channelResults.length === 1 ? '' : 's'} for "${submittedChannelQuery}"`;
  }, [channelResults.length, submittedChannelQuery]);

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

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === 'videos' ? 'default' : 'outline'}
            onClick={() => {
              setMode('videos');
              if (quickVideoTags.length === 0) setQuickVideoTags(sampleQuickTags(VIDEO_QUICK_TAG_BANK));
            }}
          >
            Videos
          </Button>
          <Button
            size="sm"
            variant={mode === 'channels' ? 'default' : 'outline'}
            onClick={() => {
              setMode('channels');
              if (quickChannelTags.length === 0) setQuickChannelTags(sampleQuickTags(CHANNEL_QUICK_TAG_BANK));
            }}
          >
            Channels
          </Button>
        </div>

        {mode === 'videos' ? (
          <>
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Search videos</CardTitle>
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
                <div className="flex flex-wrap items-center gap-2">
                  {quickVideoTags.map((tag) => (
                    <Button
                      key={tag}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => runVideoQuickSearch(tag)}
                      disabled={searchMutation.isPending || !searchEnabled}
                    >
                      {tag}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setQuickVideoTags(sampleQuickTags(VIDEO_QUICK_TAG_BANK))}
                  >
                    Shuffle
                  </Button>
                </div>
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
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">No results found for your query.</p>
                </CardContent>
              </Card>
            ) : null}

            {hasResults ? (
              <div className="space-y-4">
                {results.map((result) => {
                  const isGenerating = Boolean(generatingVideoIds[result.video_id]);
                  const isSubscribing = Boolean(subscribingChannelIds[result.channel_id]);
                  const isSubscribed = subscribedChannelIds.has(result.channel_id);
                  return (
                    <Card key={result.video_id} className="border-border/50">
                      <CardContent className="p-4 space-y-3">
                        <div className="grid gap-3 md:grid-cols-[160px,1fr]">
                          {result.thumbnail_url ? (
                            <img
                              src={result.thumbnail_url}
                              alt={result.title}
                              className="w-full h-28 object-cover rounded-md border border-border/40"
                            />
                          ) : (
                            <div className="w-full h-28 rounded-md border border-border/40 bg-muted/40" />
                          )}
                          <div className="space-y-2">
                            <p className="font-medium leading-tight">{result.title}</p>
                            <p className="text-sm text-muted-foreground line-clamp-3">{result.description || 'No description available.'}</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{result.channel_title}</Badge>
                              {result.published_at ? <Badge variant="secondary">{formatRelativeShort(result.published_at)}</Badge> : null}
                              <Badge variant="secondary">◉{GENERATE_BLUEPRINT_COST}</Badge>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleGenerateBlueprint({
                              video_id: result.video_id,
                              video_url: result.video_url,
                              title: result.title,
                              channel_id: result.channel_id,
                              channel_title: result.channel_title || '',
                              channel_url: result.channel_url || '',
                            })}
                            disabled={isGenerating || !user || !hasEnoughCredits}
                          >
                            {isGenerating ? 'Generating...' : 'Generate'}
                          </Button>
                          <Button
                            size="sm"
                            variant={isSubscribed ? 'default' : 'outline'}
                            className={isSubscribed ? 'bg-orange-500 hover:bg-orange-500/90 text-white border-orange-500' : undefined}
                            onClick={() => handleSubscribeChannel(result)}
                            disabled={isSubscribing || !searchEnabled || isSubscribed}
                          >
                            {isSubscribing ? 'Subscribing...' : isSubscribed ? 'Subscribed' : 'Subscribe'}
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
          </>
        ) : (
          <>
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Search channels</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form onSubmit={handleChannelSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={channelQueryInput}
                    onChange={(event) => setChannelQueryInput(event.target.value)}
                    placeholder="Try: fitness coach"
                  />
                  <Button type="submit" disabled={channelSearchMutation.isPending || !searchEnabled}>
                    {channelSearchMutation.isPending ? 'Searching...' : 'Search'}
                  </Button>
                </form>
                <div className="flex flex-wrap items-center gap-2">
                  {quickChannelTags.map((tag) => (
                    <Button
                      key={tag}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => runChannelQuickSearch(tag)}
                      disabled={channelSearchMutation.isPending || !searchEnabled}
                    >
                      {tag}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setQuickChannelTags(sampleQuickTags(CHANNEL_QUICK_TAG_BANK))}
                  >
                    Shuffle
                  </Button>
                </div>
                {channelSearchError ? <p className="text-sm text-destructive">{channelSearchError}</p> : null}
              </CardContent>
            </Card>

            {channelSearchSummary ? <p className="text-sm text-muted-foreground">{channelSearchSummary}</p> : null}

            {channelSearchMutation.isPending && channelResults.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : null}

            {submittedChannelQuery && channelResults.length === 0 && !channelSearchMutation.isPending ? (
              <Card className="border-border/40">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">No channels found for your query.</p>
                </CardContent>
              </Card>
            ) : null}

            {channelResults.length > 0 ? (
              <div className="space-y-3">
                {channelResults.map((channel) => {
                  const isSubscribing = Boolean(subscribingChannelIds[channel.channel_id]);
                  const isSelected = selectedBrowseChannel?.channel_id === channel.channel_id;
                  const isSubscribed = subscribedChannelIds.has(channel.channel_id);
                  return (
                    <Card key={channel.channel_id} className="border-border/50">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start gap-3">
                          {channel.thumbnail_url ? (
                            <img
                              src={channel.thumbnail_url}
                              alt={channel.channel_title}
                              className="h-11 w-11 rounded-md object-cover border border-border/40 shrink-0"
                            />
                          ) : (
                            <div className="h-11 w-11 rounded-md border border-border/40 bg-muted/40 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-medium line-clamp-1">{channel.channel_title}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {channel.description || 'No channel description available.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleBrowseChannelVideos(channel)}
                            disabled={channelVideosMutation.isPending && isSelected}
                          >
                            {isSelected && channelVideosMutation.isPending ? 'Loading...' : 'Browse videos'}
                          </Button>
                          <Button
                            size="sm"
                            variant={isSubscribed ? 'default' : 'outline'}
                            className={isSubscribed ? 'bg-orange-500 hover:bg-orange-500/90 text-white border-orange-500' : undefined}
                            onClick={() => handleSubscribeChannel(channel)}
                            disabled={isSubscribing || !searchEnabled || isSubscribed}
                          >
                            {isSubscribing ? 'Subscribing...' : isSubscribed ? 'Subscribed' : 'Subscribe'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {channelNextPageToken ? (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={handleChannelSearchLoadMore} disabled={channelSearchMutation.isPending}>
                      {channelSearchMutation.isPending ? 'Loading...' : 'Load more channels'}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <Dialog open={Boolean(selectedBrowseChannel)} onOpenChange={handleBrowseDialogChange}>
              <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-base">
                    {selectedBrowseChannel?.channel_title || 'Channel'} · Videos
                  </DialogTitle>
                </DialogHeader>

                {channelVideosError ? (
                  <p className="text-sm text-destructive">{channelVideosError}</p>
                ) : null}

                {channelVideosMutation.isPending && channelVideoItems.length === 0 ? (
                  <div className="space-y-2">
                    <Skeleton className="h-20 rounded-md" />
                    <Skeleton className="h-20 rounded-md" />
                  </div>
                ) : null}

                {channelVideoItems.length === 0 && !channelVideosMutation.isPending && !channelVideosError ? (
                  <p className="text-sm text-muted-foreground">No videos available from this channel.</p>
                ) : null}

                {channelVideoItems.length > 0 ? (
                  <div className="space-y-3">
                    {channelVideoItems.map((video) => {
                      const isGenerating = Boolean(generatingVideoIds[video.video_id]);
                      const hasExistingBlueprint = Boolean(video.existing_blueprint_id);
                      return (
                        <div key={video.video_id} className="rounded-md border border-border/40 p-3 space-y-2">
                          <div className="flex items-start gap-3">
                            {video.thumbnail_url ? (
                              <img
                                src={video.thumbnail_url}
                                alt={video.title}
                                className="h-16 w-28 rounded-md border border-border/40 object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-16 w-28 rounded-md border border-border/40 bg-muted/40 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-medium line-clamp-2">{video.title}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {video.description || 'No description available.'}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">{selectedBrowseChannel?.channel_title || video.channel_title}</Badge>
                                {video.published_at ? <Badge variant="secondary">{formatRelativeShort(video.published_at)}</Badge> : null}
                                <Badge variant="secondary">◉{GENERATE_BLUEPRINT_COST}</Badge>
                                {video.already_exists_for_user ? (
                                  <Badge variant="outline">In your feed</Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {hasExistingBlueprint ? (
                              <Button asChild size="sm" variant="outline">
                                <Link to={`/blueprint/${video.existing_blueprint_id}`}>Open blueprint</Link>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleGenerateBlueprint({
                                  video_id: video.video_id,
                                  video_url: video.video_url,
                                  title: video.title,
                                  channel_id: video.channel_id,
                                  channel_title: video.channel_title || selectedBrowseChannel?.channel_title || '',
                                  channel_url: selectedBrowseChannel?.channel_url || '',
                                })}
                                disabled={isGenerating || !user || !hasEnoughCredits}
                              >
                                {isGenerating ? 'Generating...' : 'Generate'}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {channelVideosNextPageToken ? (
                      <div className="flex justify-center">
                        <Button variant="outline" onClick={handleLoadMoreChannelVideos} disabled={channelVideosMutation.isPending}>
                          {channelVideosMutation.isPending ? 'Loading...' : 'Load more videos'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>
          </>
        )}

        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}
