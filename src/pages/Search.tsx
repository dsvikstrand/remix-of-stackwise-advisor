import { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { config } from '@/config/runtime';
import { useAiCredits } from '@/hooks/useAiCredits';
import {
  ApiRequestError as SubscriptionApiRequestError,
  createSourceSubscription,
  deactivateSourceSubscriptionByChannelId,
  getIngestionJob,
  listSourceSubscriptions,
  type SourceSubscription,
} from '@/lib/subscriptionsApi';
import {
  ApiRequestError,
  generateSearchVideos,
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
import { getLaunchErrorCopy } from '@/lib/launchErrorCopy';

const DEFAULT_SEARCH_LIMIT = 10;
const GENERATE_BLUEPRINT_COST = 1;
const QUICK_TAG_COUNT = 4;
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

function toGenerateErrorMessage(errorCode?: string | null) {
  switch (errorCode) {
    case 'INSUFFICIENT_CREDITS':
    case 'QUEUE_BACKPRESSURE':
    case 'QUEUE_INTAKE_DISABLED':
    case 'DAILY_GENERATION_CAP_REACHED':
    case 'NO_TRANSCRIPT_PERMANENT':
    case 'TRANSCRIPT_UNAVAILABLE':
    case 'RATE_LIMITED':
      return getLaunchErrorCopy({
        errorCode,
        fallback: 'Could not generate blueprint right now. Please try again.',
      });
    case 'VIDEO_TOO_LONG':
    case 'VIDEO_DURATION_POLICY_BLOCKED':
      return 'This video exceeds the 45-minute generation limit.';
    case 'VIDEO_DURATION_UNAVAILABLE':
      return 'Video length is unavailable for this video. Please try another one.';
    case 'MAX_ITEMS_EXCEEDED':
    case 'INVALID_INPUT':
      return 'Could not generate this video right now.';
    default:
      return 'Could not generate blueprint right now. Please try again.';
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getSearchErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    switch (error.errorCode) {
      case 'INVALID_QUERY':
        return error.message || 'Add a YouTube link, video id, or a specific title.';
      case 'SEARCH_DISABLED':
        return 'Video lookup is currently unavailable. Try again a little later.';
      case 'RATE_LIMITED':
        return 'Video lookup is a little busy right now. Please try again shortly.';
      case 'API_NOT_CONFIGURED':
        return 'Video lookup requires VITE_AGENTIC_BACKEND_URL.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Could not find that video right now.';
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
  duration_seconds?: number | null;
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

function formatDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!Number.isFinite(total) || total <= 0) return null;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSubscriberCount(value: number | null | undefined) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return null;
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${Math.floor(count)}`;
}

export default function SearchPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const searchEnabled = Boolean(config.agenticBackendUrl);
  const creditsQuery = useAiCredits({
    enabled: Boolean(user),
    refetchIntervalMs: false,
  });

  const [queryInput, setQueryInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
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
  const [pendingUnsubscribeChannelIds, setPendingUnsubscribeChannelIds] = useState<Record<string, boolean>>({});
  const [quickChannelTags, setQuickChannelTags] = useState<string[]>(() => sampleQuickTags(CHANNEL_QUICK_TAG_BANK));

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
    mutationFn: async (input: { query: string }) => {
      const data = await searchYouTube({
        q: input.query,
      });
      return {
        query: input.query,
        ...data,
      };
    },
    onSuccess: (payload) => {
      setSubmittedQuery(payload.query);
      setSearchError(null);
      setResults(payload.results);
    },
    onError: (error) => {
      setResults([]);
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

  const unsubscribeMutation = useMutation({
    mutationFn: (input: { channelId: string }) => deactivateSourceSubscriptionByChannelId(input.channelId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sourceSubscriptionsQueryKey });
      toast({
        title: 'Unsubscribed',
        description: 'You will stop receiving new uploads from this channel.',
      });
    },
    onError: (error) => {
      const description = error instanceof Error ? error.message : 'Could not unsubscribe.';
      toast({ title: 'Unsubscribe failed', description, variant: 'destructive' });
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

  const setPendingUnsubscribe = (channelId: string, value: boolean) => {
    setPendingUnsubscribeChannelIds((previous) => {
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
      setSearchError('Add a YouTube link, video id, or a specific title.');
      return;
    }
    setSearchError(null);
    searchMutation.mutate({ query });
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

  const handleSubscriptionToggle = async (channel: { channel_id: string; channel_url: string }) => {
    const channelId = channel.channel_id;
    if (!channelId) return;
    if (subscribingChannelIds[channelId]) return;

    const isSubscribed = subscribedChannelIds.has(channelId);
    if (!isSubscribed) {
      setPendingUnsubscribe(channelId, false);
      await handleSubscribeChannel(channel);
      return;
    }

    const isPendingConfirm = Boolean(pendingUnsubscribeChannelIds[channelId]);
    if (!isPendingConfirm) {
      setPendingUnsubscribe(channelId, true);
      window.setTimeout(() => setPendingUnsubscribe(channelId, false), 5000);
      return;
    }

    setSubscribing(channelId, true);
    try {
      await unsubscribeMutation.mutateAsync({ channelId });
      setPendingUnsubscribe(channelId, false);
    } finally {
      setSubscribing(channelId, false);
    }
  };

  const handleGenerateBlueprint = async (target: GenerateTarget) => {
    if (!user || generatingVideoIds[target.video_id]) return;
    if (!hasEnoughCredits) {
      toast({
        title: 'Not enough credits',
        description: 'Wait for the next daily reset, then try again.',
        variant: 'destructive',
      });
      return;
    }

    setGenerating(target.video_id, true);
    try {
      const queued = await generateSearchVideos({
        items: [{
          video_id: target.video_id,
          video_url: target.video_url,
          title: target.title,
          channel_id: target.channel_id,
          channel_title: target.channel_title || null,
          channel_url: target.channel_url || null,
          duration_seconds: target.duration_seconds ?? null,
        }],
      });

      let finalJob = await getIngestionJob(queued.job_id);
      let pollCount = 0;
      while (finalJob.status === 'queued' || finalJob.status === 'running') {
        pollCount += 1;
        if (pollCount > 60) {
          throw new Error('Generation is still running. Please check your notifications in a moment.');
        }
        await sleep(2000);
        finalJob = await getIngestionJob(queued.job_id);
      }

      if (finalJob.status === 'succeeded') {
        toast({
          title: 'Blueprint generated',
          description: finalJob.inserted_count > 0
            ? 'Added to your feed.'
            : 'Already in your feed.',
        });
      } else {
        const detail = String(finalJob.error_message || '').trim();
        const parsedMessage = detail.startsWith('[')
          ? (() => {
              try {
                const arr = JSON.parse(detail) as Array<{ error?: string }>;
                return arr[0]?.error || '';
              } catch {
                return '';
              }
            })()
          : '';
        throw new Error(parsedMessage || detail || 'Could not generate this blueprint right now.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ai-credits'] }),
        queryClient.invalidateQueries({ queryKey: ['my-feed-items', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['notifications', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['wall-for-you-stream', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['wall-feed', user.id] }),
      ]);
    } catch (error) {
      const description = error instanceof ApiRequestError
        ? toGenerateErrorMessage(error.errorCode)
        : error instanceof Error
          ? error.message
          : 'Could not generate this blueprint right now.';
      toast({
        title: 'Generation failed',
        description,
        variant: 'destructive',
      });
      await queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
    } finally {
      setGenerating(target.video_id, false);
    }
  };

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
          <h1 className="text-2xl font-semibold">Find the YouTube video you already have in mind</h1>
          <p className="text-sm text-muted-foreground">
            Paste a YouTube link, add a video id, or type the title. If we find the right match, you can turn it into a blueprint right away.
          </p>
        </PageSection>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === 'videos' ? 'default' : 'outline'}
            onClick={() => setMode('videos')}
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
                <CardTitle className="text-base">Find one video</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={queryInput}
                    onChange={(event) => setQueryInput(event.target.value)}
                    placeholder="Paste a YouTube link, video id, or exact title"
                  />
                  <Button type="submit" disabled={searchMutation.isPending || !searchEnabled}>
                    {searchMutation.isPending ? 'Finding...' : 'Find video'}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  A full YouTube link or video id works best. Title lookup is available when you need it.
                </p>
                {!searchEnabled ? (
                  <p className="text-xs text-muted-foreground">
                    Video lookup requires `VITE_AGENTIC_BACKEND_URL`.
                  </p>
                ) : null}
                {searchError ? <p className="text-sm text-destructive">{searchError}</p> : null}
              </CardContent>
            </Card>
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
                  <p className="text-sm text-muted-foreground">
                    We couldn't find that video. Try the full YouTube link or video id for the most reliable result.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {hasResults ? (
              <div className="space-y-4">
                {results.map((result) => {
                  const isGenerating = Boolean(generatingVideoIds[result.video_id]);
                  const isSubscribing = Boolean(subscribingChannelIds[result.channel_id]);
                  const isSubscribed = subscribedChannelIds.has(result.channel_id);
                  const isPendingUnsubscribe = Boolean(pendingUnsubscribeChannelIds[result.channel_id]);
                  const hasExistingBlueprint = Boolean(result.existing_blueprint_id);
                  const durationLabel = formatDuration(result.duration_seconds);
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
                              {durationLabel ? <Badge variant="secondary">{durationLabel}</Badge> : null}
                              <Badge variant="secondary">◉{GENERATE_BLUEPRINT_COST}</Badge>
                              {result.already_exists_for_user ? <Badge variant="outline">In your feed</Badge> : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {hasExistingBlueprint ? (
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/blueprint/${result.existing_blueprint_id}`}>Open blueprint</Link>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleGenerateBlueprint({
                                video_id: result.video_id,
                                video_url: result.video_url,
                                title: result.title,
                                channel_id: result.channel_id,
                                channel_title: result.channel_title || '',
                                channel_url: result.channel_url || '',
                                duration_seconds: result.duration_seconds,
                              })}
                              disabled={isGenerating || !user || !hasEnoughCredits || result.already_exists_for_user}
                            >
                              {isGenerating ? 'Generating...' : result.already_exists_for_user ? 'In your feed' : 'Generate'}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSubscriptionToggle(result)}
                            disabled={isSubscribing || !searchEnabled}
                          >
                            {isSubscribing
                              ? 'Saving...'
                              : isSubscribed
                                ? (isPendingUnsubscribe ? 'Confirm unsubscribe' : 'Subscribed')
                                : 'Subscribe'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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
                  const isPendingUnsubscribe = Boolean(pendingUnsubscribeChannelIds[channel.channel_id]);
                  const subscriberCountLabel = formatSubscriberCount(channel.subscriber_count);
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
                            {subscriberCountLabel ? (
                              <p className="text-xs text-muted-foreground">{subscriberCountLabel} subscribers</p>
                            ) : null}
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
                            variant="outline"
                            onClick={() => handleSubscriptionToggle(channel)}
                            disabled={isSubscribing || !searchEnabled}
                          >
                            {isSubscribing
                              ? 'Saving...'
                              : isSubscribed
                                ? (isPendingUnsubscribe ? 'Confirm unsubscribe' : 'Subscribed')
                                : 'Subscribe'}
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
                      const durationLabel = formatDuration(video.duration_seconds);
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
                                {durationLabel ? <Badge variant="secondary">{durationLabel}</Badge> : null}
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
                                  duration_seconds: video.duration_seconds,
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
