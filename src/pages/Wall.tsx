import { useMemo, useRef, useState, type TouchEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ArrowDown, Layers, Loader2, Tag } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { buildBlueprintPreviewText, buildFeedSummary } from '@/lib/feedPreview';
import { formatRelativeShort } from '@/lib/timeFormat';
import { resolveChannelLabelForBlueprint } from '@/lib/channelMapping';
import { WallBlueprintCard } from '@/components/wall/WallBlueprintCard';
import { ForYouLockedSourceCard } from '@/components/wall/ForYouLockedSourceCard';
import { useWallPageController } from '@/hooks/useWallPageController';
import { PwaInstallCta } from '@/components/pwa/PwaInstallCta';

type WallBlueprintCardInput = {
  id: string;
  title: string;
  sectionsJson: Json | null;
  steps: unknown;
  llmReview: string | null;
  mixNotes: string | null;
  bannerUrl: string | null;
  createdAt: string;
  sourceName: string | null;
  sourceAvatarUrl: string | null;
  sourceThumbnailUrl: string | null;
  viewCount: number | null;
  publishedChannelSlug: string | null;
  tags: string[];
  likesCount: number;
  userLiked: boolean;
  commentsCount: number;
};

const SORT_TABS = [
  { value: 'latest', label: 'Latest' },
  { value: 'trending', label: 'Trending' },
] as const;

const WALL_PWA_INSTALL_DISMISS_KEY = 'bleup:pwa-install-cta:wall-dismissed';
const PULL_REFRESH_THRESHOLD_PX = 64;
const MAX_PULL_REFRESH_PX = 88;

type FeedSort = (typeof SORT_TABS)[number]['value'];

function buildWallBlueprintCardProps(input: WallBlueprintCardInput) {
  const fallbackChannelSlug = resolveChannelLabelForBlueprint(input.tags).replace(/^b\//, '');
  const channelSlug = input.publishedChannelSlug || fallbackChannelSlug;
  const blueprintPreview = buildBlueprintPreviewText({
    steps: input.steps,
  });
  const summary = buildFeedSummary({
    sectionsJson: input.sectionsJson,
    primary: input.llmReview,
    secondary: input.mixNotes || blueprintPreview,
    fallback: 'Open blueprint to view full details.',
    maxChars: 220,
  });

  return {
    to: `/blueprint/${input.id}`,
    title: input.title,
    summary,
    sourceName: input.sourceName,
    sourceAvatarUrl: input.sourceAvatarUrl,
    bannerUrl: input.bannerUrl,
    sourceThumbnailUrl: input.sourceThumbnailUrl,
    viewCount: input.viewCount,
    createdLabel: formatRelativeShort(input.createdAt),
    channelSlug,
    likesCount: input.likesCount,
    userLiked: input.userLiked,
    commentsCount: input.commentsCount,
    tags: input.tags.map((tag) => ({ key: tag, label: tag })),
  };
}

export default function Wall() {
  const {
    user,
    authLoading,
    activeLane,
    effectiveScope,
    feedSort,
    isForYouScope,
    isJoinedScope,
    isForYouLoading,
    isForYouError,
    isBlueprintFeedLoading,
    blueprintFeedError,
    activeSourceSubscriptionCount,
    selectedTagSlug,
    joinedCuratedCount,
    showZeroJoinCta,
    scopeLaneButtons,
    popularTags,
    visiblePosts,
    forYouStream,
    unlockMutation,
    isCurrentFeedRefreshing,
    refreshCurrentFeed,
    handleScopeSelect,
    updateSearchParams,
    setSelectedTagSlug,
    handleTagFilter,
    handleLike,
  } = useWallPageController();
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const pullStartYRef = useRef<number | null>(null);

  const canUsePullToRefresh = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);
  const pullProgress = Math.min(pullDistance / PULL_REFRESH_THRESHOLD_PX, 1);
  const pullIndicatorHeight = isPullRefreshing ? 44 : Math.max(0, Math.min(MAX_PULL_REFRESH_PX, pullDistance));
  const pullIndicatorLabel = isPullRefreshing
    ? 'Refreshing feed...'
    : pullDistance >= PULL_REFRESH_THRESHOLD_PX
      ? 'Release to refresh'
      : 'Pull to refresh';

  const resetPullToRefresh = () => {
    pullStartYRef.current = null;
    setPullDistance(0);
  };

  const runPullRefresh = async () => {
    if (isPullRefreshing) return;
    setIsPullRefreshing(true);
    try {
      await refreshCurrentFeed();
    } finally {
      setIsPullRefreshing(false);
    }
  };

  const handleFeedTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (!canUsePullToRefresh || isPullRefreshing || event.touches.length !== 1) return;
    if (window.scrollY > 0) return;
    pullStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleFeedTouchMove = (event: TouchEvent<HTMLElement>) => {
    if (!canUsePullToRefresh || isPullRefreshing) return;
    if (pullStartYRef.current == null || event.touches.length !== 1) return;
    if (window.scrollY > 0) {
      resetPullToRefresh();
      return;
    }

    const currentY = event.touches[0]?.clientY ?? 0;
    const delta = currentY - pullStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    event.preventDefault();
    setPullDistance(Math.min(MAX_PULL_REFRESH_PX, delta * 0.5));
  };

  const handleFeedTouchEnd = () => {
    if (!canUsePullToRefresh || isPullRefreshing) {
      resetPullToRefresh();
      return;
    }

    const shouldRefresh = pullDistance >= PULL_REFRESH_THRESHOLD_PX;
    resetPullToRefresh();
    if (shouldRefresh) {
      void runPullRefresh();
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main
        className="max-w-3xl mx-auto px-0 pb-24"
        onTouchStart={handleFeedTouchStart}
        onTouchMove={handleFeedTouchMove}
        onTouchEnd={handleFeedTouchEnd}
        onTouchCancel={handleFeedTouchEnd}
      >
        <section className="mb-6 px-3 sm:px-4 hidden sm:block">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Home</p>
            <h1 className="text-2xl font-semibold">Live blueprint stream</h1>
            <p className="text-sm text-muted-foreground">
              For You follows your sources. Joined filters the channels you care about.
            </p>
          </div>
        </section>

        {!user && (
          <div className="mb-6 mx-3 sm:mx-4 border border-border/40 px-3 py-4">
            <div className="flex flex-col gap-2 text-center">
              <p className="text-sm font-semibold">Sign in to personalize</p>
              <p className="text-sm text-muted-foreground">
                Join channels to shape your feed, then follow creators you trust.
              </p>
              <div className="flex justify-center">
                <Link to="/auth">
                  <Button size="sm">Sign in</Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="mx-3 mb-3 sm:mx-4">
          <PwaInstallCta
            compact
            dismissMode="permanent"
            dismissStorageKey={WALL_PWA_INSTALL_DISMISS_KEY}
          />
        </div>

        <div
          className="mx-3 overflow-hidden transition-[height] duration-200 ease-out sm:hidden"
          style={{ height: pullIndicatorHeight }}
          aria-hidden={pullIndicatorHeight === 0}
        >
          <div className="flex h-11 items-end justify-center gap-2 pb-2 text-xs text-muted-foreground">
            {isPullRefreshing || isCurrentFeedRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowDown
                className="h-4 w-4 transition-transform duration-150 ease-out"
                style={{ transform: `rotate(${pullProgress * 180}deg)` }}
              />
            )}
            <span>{pullIndicatorLabel}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="px-3 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <ToggleGroup
                type="single"
                value={activeLane}
                onValueChange={(value) => {
                  if (value) handleScopeSelect(value);
                }}
                variant="outline"
                size="sm"
                className="w-full min-w-0 justify-start rounded-full border border-input bg-background p-1 sm:w-auto"
                aria-label="Feed lane"
              >
                {scopeLaneButtons.map((lane) => (
                  <ToggleGroupItem
                    key={lane.value}
                    value={lane.value}
                    className="rounded-full px-3 text-xs sm:px-4"
                    aria-label={lane.label}
                  >
                    {lane.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Select
                value={feedSort}
                onValueChange={(value) => updateSearchParams({ sort: value as FeedSort })}
                disabled={isForYouScope}
              >
                <SelectTrigger className="h-9 w-auto min-w-0 shrink-0 border-input px-2.5 outline-none ring-0 transition-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:ring-0 data-[state=open]:ring-offset-0 [&>svg]:hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_TABS.map((tab) => (
                    <SelectItem key={tab.value} value={tab.value}>
                      {tab.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {user && activeSourceSubscriptionCount > 0 && activeSourceSubscriptionCount < 10 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing <span className="font-medium text-foreground">All</span> by default while your creator list is still small.
              </p>
            ) : null}
          </div>

          <div className="mt-0">
            {!isForYouScope && selectedTagSlug && (
              <div className="mb-3 mx-3 sm:mx-4 border border-border/40 px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Filtered by <span className="font-semibold text-foreground">{selectedTagSlug}</span>
                </p>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedTagSlug(null)}>
                  Clear
                </Button>
              </div>
            )}

            {showZeroJoinCta && (
              <div className="mb-3 mx-3 sm:mx-4 border border-border/40 px-3 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Join channels to shape this lane</p>
                  <p className="text-xs text-muted-foreground">
                    Joined only shows published blueprints from channels you have joined.
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link
                    to="/channels"
                    onClick={() => {
                      logP3Event({
                        eventName: 'wall_zero_join_cta_click',
                        surface: 'wall',
                        user,
                        metadata: {
                          tab: effectiveScope,
                        },
                      });
                    }}
                  >
                    Explore Channels
                  </Link>
                </Button>
              </div>
            )}

            {isForYouScope ? (
              isForYouLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-3 sm:px-4 py-4 border-t border-border/40 first:border-t-0">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-14 w-full" />
                    </div>
                  </div>
                ))
              ) : isForYouError ? (
                <Card className="mx-3 sm:mx-4">
                  <CardContent className="py-6 text-sm text-muted-foreground">
                    Could not load For You right now. Please refresh and try again.
                  </CardContent>
                </Card>
              ) : forYouStream.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {forYouStream.map((item) => {
                    if (item.kind === 'locked') {
                      return (
                        <ForYouLockedSourceCard
                          key={item.sourceItemId}
                          title={item.title}
                          sourceChannelTitle={item.sourceChannelTitle}
                          sourceChannelAvatarUrl={item.sourceChannelAvatarUrl}
                          createdAt={item.createdAt}
                          unlockCost={item.unlockCost}
                          isUnlocking={item.unlockInProgress}
                          onUnlock={() => unlockMutation.mutate(item)}
                        />
                      );
                    }
                    const cardProps = buildWallBlueprintCardProps({
                      id: item.blueprintId,
                      title: item.title,
                      sectionsJson: item.sectionsJson,
                      steps: item.steps,
                      llmReview: item.llmReview,
                      mixNotes: item.mixNotes,
                      bannerUrl: item.bannerUrl,
                      createdAt: item.createdAt,
                      sourceName: item.sourceChannelTitle,
                      sourceAvatarUrl: item.sourceChannelAvatarUrl,
                      sourceThumbnailUrl: item.sourceThumbnailUrl,
                      viewCount: item.sourceViewCount,
                      publishedChannelSlug: item.publishedChannelSlug,
                      tags: item.tags,
                      likesCount: item.likesCount,
                      userLiked: item.userLiked,
                      commentsCount: item.commentsCount,
                    });

                    return (
                      <WallBlueprintCard
                        key={item.sourceItemId}
                        {...cardProps}
                        onLike={(event) => {
                          event.preventDefault();
                          handleLike(item.blueprintId, item.userLiked);
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <Card className="mx-3 sm:mx-4 text-center py-12">
                  <CardContent>
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                        <Tag className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold">No source items yet</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Subscribe to a source to unlock videos here.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild size="sm">
                          <Link to="/subscriptions">Manage subscriptions</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/channels">Explore Channels</Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            ) : isBlueprintFeedLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-3 sm:px-4 py-4 border-t border-border/40 first:border-t-0">
                  <div className="flex flex-row items-center gap-3 mb-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-20 w-full" />
                </div>
              ))
            ) : blueprintFeedError ? (
              <Card className="mx-3 sm:mx-4">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  Could not load Home right now. Please refresh and try again.
                </CardContent>
              </Card>
            ) : visiblePosts.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {visiblePosts.map((post) => {
                    const cardProps = buildWallBlueprintCardProps({
                      id: post.id,
                      title: post.title,
                      sectionsJson: post.sections_json,
                      steps: post.steps,
                      llmReview: post.llm_review,
                      mixNotes: post.mix_notes,
                      bannerUrl: post.banner_url,
                      createdAt: post.created_at,
                      sourceName: post.source_channel_title || null,
                      sourceAvatarUrl: post.source_channel_avatar_url || null,
                      sourceThumbnailUrl: post.source_thumbnail_url || null,
                      viewCount: post.source_view_count ?? null,
                      publishedChannelSlug: post.published_channel_slug || null,
                      tags: post.tags.map((tag) => tag.slug),
                      likesCount: post.likes_count,
                      userLiked: post.user_liked,
                      commentsCount: post.comments_count,
                    });

                    return (
                      <WallBlueprintCard
                        key={post.id}
                        {...cardProps}
                        onLike={(event) => {
                          event.preventDefault();
                          handleLike(post.id, post.user_liked);
                        }}
                      />
                    );
                  })}
                </div>
            ) : (
              <Card className="text-center py-12 mx-3 sm:mx-4">
                <CardContent>
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                      {isJoinedScope ? (
                        <Tag className="h-8 w-8 text-muted-foreground" />
                      ) : (
                        <Layers className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {isJoinedScope
                          ? joinedCuratedCount > 0
                            ? 'No joined-channel blueprints yet'
                            : 'Personalize your joined feed'
                          : 'No blueprints yet'}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {isJoinedScope
                          ? joinedCuratedCount > 0
                            ? 'Your joined channels do not have published blueprints here yet.'
                            : 'Join channels to see published blueprints from topics you care about.'
                          : 'Be the first to share a blueprint.'}
                      </p>
                    </div>

                    {isJoinedScope && popularTags.length > 0 && (
                      <div className="space-y-3 w-full max-w-md">
                        {!user && (
                          <div className="flex flex-col items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              Sign in to join channels and personalize this feed.
                            </p>
                            <Link to="/auth">
                              <Button size="sm">Sign in</Button>
                            </Link>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">Popular topics:</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {popularTags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="secondary"
                              className="gap-1.5 bg-muted/40 text-muted-foreground border border-border/60 cursor-pointer hover:bg-muted/60"
                              onClick={() => handleTagFilter(tag.slug)}
                            >
                              {tag.slug}
                            </Badge>
                          ))}
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link to="/channels">Join Channels</Link>
                        </Button>
                      </div>
                    )}

                    {!isJoinedScope && (
                      <div className="flex gap-2">
                        <Link to="/youtube">
                          <Button>Pull from YouTube</Button>
                        </Link>
                        <Link to="/channels">
                          <Button variant="outline">Explore Channels</Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <AppFooter />
      </main>
    </div>
  );
}
