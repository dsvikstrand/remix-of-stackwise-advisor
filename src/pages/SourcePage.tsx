import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { config } from '@/config/runtime';
import { ApiRequestError } from '@/lib/subscriptionsApi';
import type { GenerationTier } from '@/lib/subscriptionsApi';
import {
  type SourcePageVideoLibraryItem,
  getSourcePage,
  getSourcePageBlueprints,
  getSourcePageVideos,
  unlockSourcePageVideos,
  subscribeToSourcePage,
  unsubscribeFromSourcePage,
} from '@/lib/sourcePagesApi';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { formatRelativeShort } from '@/lib/timeFormat';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { getChannelIcon } from '@/lib/channelIcons';
import { useSourceUnlockJobTracker } from '@/hooks/useSourceUnlockJobTracker';
import { resolveEffectiveBanner } from '@/lib/bannerResolver';
import { resolveChannelLabelForBlueprint } from '@/lib/channelMapping';
import { useGenerationTierAccess } from '@/hooks/useGenerationTierAccess';

function getInitials(title: string, fallback: string) {
  const raw = title.trim() || fallback.trim();
  if (!raw) return 'SP';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatFollowerCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 followers';
  if (value === 1) return '1 follower';
  return `${value.toLocaleString()} followers`;
}

const unlockCostFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

function getSourcePageErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    switch (error.errorCode) {
      case 'SOURCE_PAGE_NOT_FOUND':
        return 'Source page not found.';
      case 'SOURCE_PAGE_PLATFORM_UNSUPPORTED':
        return 'This source platform is not supported yet.';
      case 'AUTH_REQUIRED':
        return 'Sign in required.';
      default:
        return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function getSourceVideoLibraryErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    switch (error.errorCode) {
      case 'AUTH_REQUIRED':
        return 'Sign in required.';
      case 'RATE_LIMITED':
        return 'Too many unlock requests, retry shortly.';
      case 'SOURCE_VIDEO_LIST_FAILED':
        return 'Could not load source videos right now.';
      case 'SOURCE_VIDEO_GENERATE_INVALID_INPUT':
        return 'Select one or more valid videos to generate.';
      case 'SOURCE_VIDEO_GENERATE_FAILED':
        return 'Could not start unlock generation for selected videos.';
      case 'INSUFFICIENT_CREDITS':
        return 'Not enough credits right now.';
      case 'SOURCE_PAGE_NOT_FOUND':
        return 'Source page not found.';
      case 'TRANSCRIPT_UNAVAILABLE':
        return 'Only videos with speech can be generated. If this video has speech, please try again in a few minutes.';
      case 'NO_TRANSCRIPT_PERMANENT':
        return 'No transcript is available for this video.';
      case 'VIDEO_TOO_LONG':
      case 'VIDEO_DURATION_POLICY_BLOCKED':
        return 'One or more selected videos exceed the 45-minute limit.';
      case 'VIDEO_DURATION_UNAVAILABLE':
        return 'Video length is unavailable for this video. Please try another one.';
      case 'TIER_NOT_ALLOWED':
        return 'This generation tier is not enabled for your account.';
      default:
        return error.message || fallback;
    }
  }
  if (error instanceof Error && /source video id/i.test(error.message)) {
    return 'Could not resolve source video id for one or more selected items.';
  }
  return error instanceof Error ? error.message : fallback;
}

function getVideoSelectionKey(item: Pick<SourcePageVideoLibraryItem, 'video_id'>) {
  return item.video_id;
}

export default function SourcePage() {
  const params = useParams<{ platform: string; externalId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const backendEnabled = Boolean(config.agenticBackendUrl);
  const generationTierAccessQuery = useGenerationTierAccess(Boolean(user && backendEnabled));
  const platform = String(params.platform || '').trim().toLowerCase();
  const externalId = String(params.externalId || '').trim();
  const isValidRoute = Boolean(platform && externalId);

  const sourcePageQuery = useQuery({
    queryKey: ['source-page', platform, externalId, user?.id],
    enabled: backendEnabled && isValidRoute,
    queryFn: () => getSourcePage({ platform, externalId }),
    retry: false,
  });

  const subscribeMutation = useMutation({
    mutationFn: () => subscribeToSourcePage({ platform, externalId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['source-page', platform, externalId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['source-subscriptions', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] });
      toast({
        title: 'Subscribed',
        description: 'New uploads from this source will appear automatically.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Subscribe failed',
        description: getSourcePageErrorMessage(error, 'Could not subscribe to this source page.'),
        variant: 'destructive',
      });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: () => unsubscribeFromSourcePage({ platform, externalId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['source-page', platform, externalId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['source-subscriptions', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] });
      toast({
        title: 'Unsubscribed',
        description: 'You will no longer receive new uploads from this source.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Unsubscribe failed',
        description: getSourcePageErrorMessage(error, 'Could not unsubscribe from this source page.'),
        variant: 'destructive',
      });
    },
  });

  const sourcePage = sourcePageQuery.data?.source_page || null;
  const viewer = sourcePageQuery.data?.viewer || null;
  const subscribed = Boolean(viewer?.subscribed);
  const canUnlockSourceVideos = Boolean(user && subscribed);
  const actionPending = subscribeMutation.isPending || unsubscribeMutation.isPending;

  const sourceBlueprintsQuery = useInfiniteQuery({
    queryKey: ['source-page-blueprints', platform, externalId],
    enabled: backendEnabled && isValidRoute && Boolean(sourcePage),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getSourcePageBlueprints({
      platform,
      externalId,
      limit: 12,
      cursor: pageParam ?? null,
    }),
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
  });

  const sourceBlueprintItems = sourceBlueprintsQuery.data?.pages.flatMap((page) => page.items) || [];

  const [selectedVideoIds, setSelectedVideoIds] = useState<Record<string, boolean>>({});
  const [optimisticUnlockingVideoIds, setOptimisticUnlockingVideoIds] = useState<Record<string, boolean>>({});
  const [requestedTier, setRequestedTier] = useState<GenerationTier>('free');

  const sourceVideosQuery = useInfiniteQuery({
    queryKey: ['source-page-videos', platform, externalId, user?.id],
    enabled: backendEnabled && isValidRoute && Boolean(sourcePage) && Boolean(user),
    staleTime: 120_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getSourcePageVideos({
      platform,
      externalId,
      limit: 12,
      pageToken: pageParam ?? null,
    }),
    getNextPageParam: (lastPage) => lastPage.next_page_token || undefined,
  });

  const sourceVideoItems = sourceVideosQuery.data?.pages.flatMap((page) => page.items) || [];
  const allowedGenerationTiers = generationTierAccessQuery.data?.allowedTiers || ['free'];

  useEffect(() => {
    if (!user) return;
    const defaultTier = generationTierAccessQuery.data?.defaultTier || 'free';
    if (!allowedGenerationTiers.includes(requestedTier)) {
      setRequestedTier(defaultTier);
    }
  }, [allowedGenerationTiers, generationTierAccessQuery.data?.defaultTier, requestedTier, user]);
  const sourceVideoRateLimited = sourceVideosQuery.error instanceof ApiRequestError
    && sourceVideosQuery.error.errorCode === 'RATE_LIMITED';
  const selectedSourceVideoItems = useMemo(
    () => sourceVideoItems.filter((item) => selectedVideoIds[getVideoSelectionKey(item)]),
    [selectedVideoIds, sourceVideoItems],
  );

  const clearOptimisticUnlocking = (keys: string[]) => {
    if (keys.length === 0) return;
    setOptimisticUnlockingVideoIds((previous) => {
      const next = { ...previous };
      for (const key of keys) delete next[key];
      return next;
    });
  };

  const videoLibraryUnlockTracker = useSourceUnlockJobTracker({
    userId: user?.id,
    enabled: backendEnabled && isValidRoute && Boolean(user),
    scope: 'source_item_unlock_generation',
    onTerminal: (job) => {
      setOptimisticUnlockingVideoIds({});
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['source-page-videos', platform, externalId, user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['source-page-blueprints', platform, externalId] }),
        queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['ai-credits'] }),
      ]);

      if (job.status === 'succeeded') {
        toast({
          title: 'Video Library unlock finished',
          description: `Inserted ${job.inserted_count}, skipped ${job.skipped_count}, failed ${Math.max(0, job.processed_count - job.inserted_count - job.skipped_count)}.`,
        });
        return;
      }

      toast({
        title: 'Video Library unlock failed',
        description: job.error_message || 'Could not complete source video unlock.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!user) return;
    void videoLibraryUnlockTracker.resume();
  }, [user?.id, videoLibraryUnlockTracker.resume]);

  const videoLibraryGenerateMutation = useMutation({
    mutationFn: async (items: SourcePageVideoLibraryItem[]) => {
      const data = await unlockSourcePageVideos({
        platform,
        externalId,
        items: items.map((item) => ({
          video_id: item.video_id,
          video_url: item.video_url,
          title: item.title,
          published_at: item.published_at,
          thumbnail_url: item.thumbnail_url,
          duration_seconds: item.duration_seconds,
        })),
        requestedTier,
      });
      return {
        data,
        failedCount: 0,
        failedMessage: null,
      };
    },
    onSuccess: (result, _items, context) => {
      const data = result.data;
      if (data.job_id) {
        videoLibraryUnlockTracker.start(data.job_id);
      } else {
        clearOptimisticUnlocking(context?.optimisticKeys || []);
      }
      setSelectedVideoIds({});
      queryClient.invalidateQueries({ queryKey: ['source-page-videos', platform, externalId, user?.id] });
      toast({
        title: data.job_id ? 'Unlock queued' : 'No unlock queued',
        description: data.job_id
          ? `Queued ${data.queued_count}, ready ${data.ready_count}, in progress ${data.in_progress_count}, skipped existing ${data.skipped_existing_count}, blocked by length ${data.duration_blocked_count || 0}.`
          : `Ready ${data.ready_count}, in progress ${data.in_progress_count}, skipped existing ${data.skipped_existing_count}, blocked by length ${data.duration_blocked_count || 0}.`,
      });
    },
    onError: (error, _items, context) => {
      toast({
        title: 'Unlock failed',
        description: getSourceVideoLibraryErrorMessage(error, 'Could not start source video unlock.'),
        variant: 'destructive',
      });
      clearOptimisticUnlocking(context?.optimisticKeys || []);
    },
    onMutate: (items) => {
      const optimisticKeys = items.map((item) => getVideoSelectionKey(item));
      setOptimisticUnlockingVideoIds((previous) => {
        const next = { ...previous };
        for (const key of optimisticKeys) {
          next[key] = true;
        }
        return next;
      });
      return { optimisticKeys };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
    },
  });
  const videoLibraryJobRunning = videoLibraryUnlockTracker.activity.isActive;

  const handleSubscribeToggle = () => {
    if (!user) return;
    if (subscribed) {
      unsubscribeMutation.mutate();
      return;
    }
    subscribeMutation.mutate();
  };

  const toggleVideoSelection = (item: SourcePageVideoLibraryItem, nextChecked: boolean) => {
    const key = getVideoSelectionKey(item);
    setSelectedVideoIds((previous) => ({
      ...previous,
      [key]: nextChecked,
    }));
  };

  const handleGenerateSelectedVideos = () => {
    if (selectedSourceVideoItems.length === 0) return;
    if (!canUnlockSourceVideos) return;
    videoLibraryGenerateMutation.mutate(selectedSourceVideoItems);
  };

  return (
    <PageRoot>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageSection className="space-y-4">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">Source Page</p>

          {!backendEnabled ? (
            <Card className="border-border/40">
              <CardContent className="p-4 text-sm text-muted-foreground">
                Source pages require `VITE_AGENTIC_BACKEND_URL`.
              </CardContent>
            </Card>
          ) : null}

          {!backendEnabled || !isValidRoute ? (
            <Card className="border-border/40">
              <CardContent className="p-4 text-sm text-muted-foreground">
                Invalid source page route.
              </CardContent>
            </Card>
          ) : null}

          {backendEnabled && isValidRoute && sourcePageQuery.isLoading ? (
            <Card className="border-border/40">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-4 w-40" />
              </CardContent>
            </Card>
          ) : null}

          {backendEnabled && isValidRoute && sourcePageQuery.error ? (
            <Card className="border-border/40">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm text-destructive">
                  {getSourcePageErrorMessage(sourcePageQuery.error, 'Could not load source page.')}
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/subscriptions">Back to Subscriptions</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {backendEnabled && isValidRoute && sourcePage ? (
            <>
              <Card className="overflow-hidden border-border/40">
                {sourcePage.banner_url ? (
                  <div
                    className="h-24 w-full bg-cover bg-center border-b border-border/40"
                    style={{ backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.35), rgba(0,0,0,0.15)), url(${sourcePage.banner_url})` }}
                  />
                ) : null}
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <a
                        href={sourcePage.external_url || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={sourcePage.external_url ? 'shrink-0' : 'shrink-0 pointer-events-none'}
                        aria-label="Open source on YouTube"
                      >
                        {sourcePage.avatar_url ? (
                          <img
                            src={sourcePage.avatar_url}
                            alt={sourcePage.title}
                            className="h-12 w-12 rounded-full border border-border/40 object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full border border-border/40 bg-muted text-xs font-semibold flex items-center justify-center shrink-0">
                            {getInitials(sourcePage.title || sourcePage.external_id, sourcePage.external_id)}
                          </div>
                        )}
                      </a>
                      <div className="min-w-0 space-y-1">
                        <h1 className="text-xl font-semibold leading-tight truncate">{sourcePage.title || sourcePage.external_id}</h1>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{sourcePage.platform}</Badge>
                          <span className="text-xs text-muted-foreground">{formatFollowerCount(sourcePage.follower_count)}</span>
                        </div>
                      </div>
                    </div>
                    {user ? (
                      <Button
                        size="sm"
                        variant={subscribed ? 'destructive' : 'default'}
                        onClick={handleSubscribeToggle}
                        disabled={actionPending}
                      >
                        {actionPending
                          ? (subscribed ? 'Unsubscribing...' : 'Subscribing...')
                          : (subscribed ? 'Unsubscribe' : 'Subscribe')}
                      </Button>
                    ) : (
                      <Button asChild size="sm">
                        <Link to="/auth">Sign in to subscribe</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Video Library</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!user ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Sign in to browse this creator&apos;s video library and queue older videos for blueprint generation.
                      </p>
                      <Button asChild size="sm">
                        <Link to="/auth">Sign in</Link>
                      </Button>
                    </div>
                  ) : null}

                  {user ? (
                    <>
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

                      {!canUnlockSourceVideos ? (
                        <p className="text-xs text-muted-foreground">
                          Subscribe to this source to view unlock cost and activate blueprint generation.
                        </p>
                      ) : null}

                      {!sourceVideosQuery.isFetching && sourceVideosQuery.error ? (
                        <p className="text-sm text-destructive">
                          {getSourceVideoLibraryErrorMessage(sourceVideosQuery.error, 'Could not load source videos.')}
                        </p>
                      ) : null}

                      {sourceVideoRateLimited ? (
                        <p className="text-xs text-muted-foreground">
                          Showing cached results while rate limit cools down.
                        </p>
                      ) : null}

                      {sourceVideosQuery.isFetching && sourceVideoItems.length === 0 ? (
                        <div className="space-y-2">
                          <Skeleton className="h-16 rounded-md" />
                          <Skeleton className="h-16 rounded-md" />
                        </div>
                      ) : null}

                      {!sourceVideosQuery.isFetching && !sourceVideosQuery.error && sourceVideoItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No videos found for this source page right now.
                        </p>
                      ) : null}

                      {sourceVideoItems.length > 0 ? (
                        <div className="space-y-2">
                          <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                            {sourceVideoItems.map((item) => {
                              const key = getVideoSelectionKey(item);
                              const checked = Boolean(selectedVideoIds[key]);
                              const isUnlocking = Boolean(item.unlock_in_progress) || Boolean(optimisticUnlockingVideoIds[key]);
                              const createdLabel = item.published_at ? formatRelativeShort(item.published_at) : 'Unknown time';

                              return (
                                <div key={key} className="rounded-md border border-border/40 p-3">
                                  <div className="flex items-start gap-3">
                                    <Checkbox
                                      checked={checked}
                                      disabled={
                                        !canUnlockSourceVideos
                                        || item.already_exists_for_user
                                        || isUnlocking
                                        || item.unlock_status === 'ready'
                                        || videoLibraryGenerateMutation.isPending
                                      }
                                      onCheckedChange={(value) => toggleVideoSelection(item, value === true)}
                                      className={item.already_exists_for_user ? 'mt-0.5 opacity-50 cursor-default' : 'mt-0.5'}
                                    />
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span>{createdLabel}</span>
                                        {canUnlockSourceVideos ? (
                                          <Badge variant="outline" className="h-5 px-2 text-[10px]">
                                            ◉ {unlockCostFormatter.format(Number(item.unlock_cost || 0))}
                                          </Badge>
                                        ) : null}
                                        {item.unlock_status === 'ready' ? (
                                          <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                                            Ready
                                          </Badge>
                                        ) : null}
                                        {isUnlocking ? (
                                          <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                                            Unlocking...
                                          </Badge>
                                        ) : null}
                                        {item.existing_blueprint_id || item.ready_blueprint_id ? (
                                          <Link className="underline" to={`/blueprint/${item.existing_blueprint_id || item.ready_blueprint_id}`}>
                                            Open blueprint
                                          </Link>
                                        ) : null}
                                      </div>
                                    </div>
                                    {item.thumbnail_url ? (
                                      <img
                                        src={item.thumbnail_url}
                                        alt={item.title}
                                        className="h-12 w-20 rounded-md object-cover border border-border/40 shrink-0"
                                        loading="lazy"
                                      />
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {sourceVideosQuery.hasNextPage ? (
                            <div className="flex justify-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => sourceVideosQuery.fetchNextPage()}
                                disabled={sourceVideosQuery.isFetchingNextPage}
                              >
                                {sourceVideosQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
                              </Button>
                            </div>
                          ) : null}

                          {canUnlockSourceVideos ? (
                            <div className="flex justify-end pt-1">
                              <Button
                                size="sm"
                                onClick={handleGenerateSelectedVideos}
                                disabled={
                                  selectedSourceVideoItems.length === 0
                                  || videoLibraryGenerateMutation.isPending
                                  || sourceVideosQuery.isFetching
                                  || videoLibraryJobRunning
                                }
                              >
                                {videoLibraryGenerateMutation.isPending ? 'Queueing...' : 'Unlock selected'}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Source blueprints</CardTitle>
                </CardHeader>
                <CardContent>
                  {sourceBlueprintsQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="space-y-2 rounded-md border border-border/40 p-3">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-5/6" />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {!sourceBlueprintsQuery.isLoading && sourceBlueprintsQuery.error ? (
                    <p className="text-sm text-destructive">
                      {getSourcePageErrorMessage(sourceBlueprintsQuery.error, 'Could not load source blueprints.')}
                    </p>
                  ) : null}

                  {!sourceBlueprintsQuery.isLoading && !sourceBlueprintsQuery.error && sourceBlueprintItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No published blueprints from this source yet.
                    </p>
                  ) : null}

                  {!sourceBlueprintsQuery.isLoading && !sourceBlueprintsQuery.error && sourceBlueprintItems.length > 0 ? (
                    <div className="space-y-3">
                      {sourceBlueprintItems.map((item) => {
                        const fallbackChannelSlug = resolveChannelLabelForBlueprint(item.tags.map((tag) => tag.slug)).replace(/^b\//, '');
                        const channelSlug = item.published_channel_slug || fallbackChannelSlug;
                        const channelLabel = `b/${channelSlug}`;
                        const channelConfig = CHANNELS_CATALOG.find((channel) => channel.slug === channelSlug);
                        const ChannelIcon = getChannelIcon(channelConfig?.icon || 'sparkles');
                        const createdLabel = formatRelativeShort(item.created_at);
                        const effectiveBannerUrl = resolveEffectiveBanner({
                          bannerUrl: item.banner_url,
                          sourceThumbnailUrl: item.source_thumbnail_url,
                        });

                        return (
                          <Link
                            key={`${item.source_item_id}:${item.blueprint_id}`}
                            to={`/blueprint/${item.blueprint_id}`}
                            className="block rounded-md border border-border/40 px-3 py-3 transition-colors hover:bg-muted/20"
                          >
                            <div className="relative overflow-hidden rounded-sm">
                              {effectiveBannerUrl ? (
                                <>
                                  <img
                                    src={effectiveBannerUrl}
                                    alt=""
                                    className="absolute inset-0 h-full w-full object-cover opacity-35"
                                    loading="lazy"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-background/60 to-background/80" />
                                </>
                              ) : null}

                              <div className="relative space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-foreground/75">
                                    <ChannelIcon className="h-3.5 w-3.5" />
                                    {channelLabel}
                                  </p>
                                  <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
                                </div>

                                <h3 className="text-base font-semibold leading-tight">{item.title}</h3>
                                <p className="text-sm text-muted-foreground line-clamp-3">{item.summary}</p>

                                {item.tags.length > 0 ? (
                                  <OneRowTagChips
                                    className="flex flex-nowrap gap-1.5 overflow-hidden"
                                    items={item.tags.map((tag) => ({
                                      key: tag.id,
                                      label: tag.slug,
                                      variant: 'outline',
                                      className:
                                        'text-xs transition-colors border bg-muted/40 text-muted-foreground border-border/60',
                                    }))}
                                  />
                                ) : null}
                              </div>
                            </div>
                          </Link>
                        );
                      })}

                      {sourceBlueprintsQuery.hasNextPage ? (
                        <div className="flex justify-center pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sourceBlueprintsQuery.fetchNextPage()}
                            disabled={sourceBlueprintsQuery.isFetchingNextPage}
                          >
                            {sourceBlueprintsQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : null}
        </PageSection>
        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}
