import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useTrendingTags } from '@/hooks/useExploreSearch';
import { useTagFollows } from '@/hooks/useTagFollows';
import { ApiRequestError, listSourceSubscriptions } from '@/lib/subscriptionsApi';
import { unlockSourcePageVideos } from '@/lib/sourcePagesApi';
import { useSourceUnlockJobTracker } from '@/hooks/useSourceUnlockJobTracker';
import { getLaunchErrorCopy } from '@/lib/launchErrorCopy';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { logOncePerSession, logP3Event } from '@/lib/telemetry';
import { normalizeTag } from '@/lib/tagging';
import { extractYouTubeVideoId } from '@/lib/sourceIdentity';
import { getWallFeed, getWallForYouFeed, type WallFeedItem, type WallForYouItem } from '@/lib/wallApi';

type ForYouLockedItem = Extract<WallForYouItem, { kind: 'locked' }>;
type ForYouBlueprintItem = Extract<WallForYouItem, { kind: 'blueprint' }>;

const SORT_TABS = [
  { value: 'latest', label: 'Latest' },
  { value: 'trending', label: 'Trending' },
] as const;

type FeedSort = (typeof SORT_TABS)[number]['value'];

const SCOPE_FOR_YOU = 'for-you';
const SCOPE_JOINED = 'joined';
const SCOPE_JOINED_ALIAS = 'your-channels';
const SCOPE_ALL = 'all';

function getForYouErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    if (error.errorCode) {
      return getLaunchErrorCopy({
        errorCode: error.errorCode,
        fallback: error.message || fallback,
      });
    }
    return error.message || fallback;
  }
  if (error instanceof Error && /source video id/i.test(error.message)) {
    return 'Could not resolve source video id for this item. Try opening it from Source Page.';
  }
  return error instanceof Error ? error.message : fallback;
}

export function useWallPageController() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [optimisticLane, setOptimisticLane] = useState<string | null>(null);
  const [scopeSelectOpen, setScopeSelectOpen] = useState(false);
  const pendingScopeRaf = useRef<number | null>(null);
  const [selectedTagSlug, setSelectedTagSlug] = useState<string | null>(null);
  const [optimisticUnlockingSourceItemIds, setOptimisticUnlockingSourceItemIds] = useState<Record<string, boolean>>({});
  const { followedTags } = useTagFollows();
  const subscriptionsEnabled = Boolean(config.agenticBackendUrl);

  const scopeValues = useMemo(
    () =>
      new Set([
        SCOPE_FOR_YOU,
        SCOPE_JOINED,
        SCOPE_ALL,
        ...CHANNELS_CATALOG
          .filter((channel) => channel.status === 'active')
          .map((channel) => channel.slug),
      ]),
    [],
  );
  const scopeParam = (searchParams.get('scope') || '').trim();
  const normalizedScopeParam = scopeParam === SCOPE_JOINED_ALIAS ? SCOPE_JOINED : scopeParam;
  const sortParam = (searchParams.get('sort') || '').trim();
  const sourceSubscriptionsQuery = useQuery({
    queryKey: ['source-subscriptions', user?.id],
    enabled: Boolean(user) && subscriptionsEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: () => listSourceSubscriptions(),
  });
  const activeSourceSubscriptionCount = useMemo(
    () => (sourceSubscriptionsQuery.data || []).filter((subscription) => subscription.is_active).length,
    [sourceSubscriptionsQuery.data],
  );
  const defaultScope = !user
    ? SCOPE_ALL
    : sourceSubscriptionsQuery.status === 'success' && activeSourceSubscriptionCount < 10
      ? SCOPE_ALL
      : SCOPE_FOR_YOU;
  const feedScope = scopeValues.has(normalizedScopeParam) ? normalizedScopeParam : defaultScope;
  const requestedSort: FeedSort = sortParam === 'trending' ? 'trending' : 'latest';

  const isPersonalScope = feedScope === SCOPE_FOR_YOU || feedScope === SCOPE_JOINED;
  const effectiveScope = !user && isPersonalScope ? SCOPE_ALL : feedScope;
  const isForYouScope = effectiveScope === SCOPE_FOR_YOU && !!user;
  const isJoinedScope = effectiveScope === SCOPE_JOINED && !!user;
  const feedSort: FeedSort = isForYouScope ? 'latest' : requestedSort;
  const resolvedLane = isForYouScope
    ? SCOPE_FOR_YOU
    : isJoinedScope
      ? SCOPE_JOINED
      : SCOPE_ALL;
  const activeLane = optimisticLane ?? resolvedLane;

  const updateSearchParams = (updates: { scope?: string; sort?: FeedSort }) => {
    const next = new URLSearchParams(searchParams);
    if (updates.scope) next.set('scope', updates.scope);
    if (updates.sort) next.set('sort', updates.sort);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!isForYouScope || requestedSort !== 'trending') return;
    updateSearchParams({ sort: 'latest' });
  }, [isForYouScope, requestedSort]);

  useEffect(() => {
    if (scopeParam !== SCOPE_JOINED_ALIAS) return;
    updateSearchParams({ scope: SCOPE_JOINED, sort: requestedSort });
  }, [scopeParam, requestedSort]);

  useEffect(() => {
    if (!optimisticLane) return;
    if (optimisticLane === resolvedLane || (!user && optimisticLane !== SCOPE_ALL)) {
      setOptimisticLane(null);
    }
  }, [optimisticLane, resolvedLane, user]);

  useEffect(() => {
    return () => {
      if (pendingScopeRaf.current !== null) {
        cancelAnimationFrame(pendingScopeRaf.current);
      }
    };
  }, []);

  const handleScopeSelect = (scope: string) => {
    setScopeSelectOpen(false);
    if (scope === activeLane) return;
    setOptimisticLane(scope);
    const nextSort = scope === SCOPE_FOR_YOU ? 'latest' : feedSort;
    if (pendingScopeRaf.current !== null) {
      cancelAnimationFrame(pendingScopeRaf.current);
    }
    pendingScopeRaf.current = requestAnimationFrame(() => {
      startTransition(() => {
        updateSearchParams({
          scope,
          sort: nextSort,
        });
      });
      pendingScopeRaf.current = null;
    });

    logP3Event({
      eventName: 'wall_scope_selected',
      surface: 'wall',
      user,
      metadata: {
        scope,
      },
    });
  };

  const { data: popularTags = [] } = useTrendingTags();

  const curatedJoinableSlugs = useMemo(
    () =>
      new Set(
        CHANNELS_CATALOG
          .filter((channel) => channel.isJoinEnabled && channel.status === 'active')
          .map((channel) => channel.tagSlug),
      ),
    [],
  );

  const joinedCuratedCount = useMemo(() => {
    return followedTags.filter((tag) => curatedJoinableSlugs.has(normalizeTag(tag.slug))).length;
  }, [curatedJoinableSlugs, followedTags]);

  const handleTagFilter = (tagSlug: string) => {
    setSelectedTagSlug((current) => {
      const next = current === tagSlug ? null : tagSlug;
      if (next) {
        logP3Event({
          eventName: 'wall_tag_filter_used',
          surface: 'wall',
          user,
          metadata: {
            tab: effectiveScope,
            tag_slug: normalizeTag(next),
          },
        });
      }
      return next;
    });
  };

  const wallFeedQuery = useQuery({
    queryKey: ['wall-feed', effectiveScope, feedSort, user?.id || 'anon'],
    enabled: !isForYouScope,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => getWallFeed({ scope: effectiveScope, sort: feedSort }),
  });

  const forYouQuery = useQuery({
    queryKey: ['wall-for-you', user?.id || 'anon'],
    enabled: isForYouScope && !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => getWallForYouFeed(),
  });

  const posts = wallFeedQuery.data || [];
  const forYouStream = useMemo(
    () =>
      (forYouQuery.data || []).map((item) => (
        item.kind === 'locked'
          ? {
              ...item,
              unlockInProgress: item.unlockInProgress || Boolean(optimisticUnlockingSourceItemIds[item.sourceItemId]),
            }
          : item
      )) as WallForYouItem[],
    [forYouQuery.data, optimisticUnlockingSourceItemIds],
  );

  const updateWallLikeCaches = (blueprintId: string, nextLiked: boolean) => {
    queryClient.setQueriesData({ queryKey: ['wall-feed'] }, (current: unknown) => {
      if (!Array.isArray(current)) return current;
      return current.map((item) => {
        const post = item as WallFeedItem;
        if (post.id !== blueprintId) return post;
        return {
          ...post,
          user_liked: nextLiked,
          likes_count: Math.max(0, Number(post.likes_count || 0) + (nextLiked ? 1 : -1)),
        } satisfies WallFeedItem;
      });
    });

    queryClient.setQueriesData({ queryKey: ['wall-for-you'] }, (current: unknown) => {
      if (!Array.isArray(current)) return current;
      return current.map((item) => {
        const row = item as WallForYouItem;
        if (row.kind !== 'blueprint' || row.blueprintId !== blueprintId) return row;
        return {
          ...row,
          userLiked: nextLiked,
          likesCount: Math.max(0, Number(row.likesCount || 0) + (nextLiked ? 1 : -1)),
        } satisfies ForYouBlueprintItem;
      });
    });
  };

  const likeMutation = useMutation({
    mutationFn: async ({ blueprintId, liked }: { blueprintId: string; liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (liked) {
        await supabase.from('blueprint_likes').delete().eq('blueprint_id', blueprintId).eq('user_id', user.id);
      } else {
        await supabase.from('blueprint_likes').insert({ blueprint_id: blueprintId, user_id: user.id });
      }
    },
    onSuccess: async (_result, variables) => {
      updateWallLikeCaches(variables.blueprintId, !variables.liked);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update like. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const forYouUnlockTracker = useSourceUnlockJobTracker({
    userId: user?.id,
    enabled: Boolean(user) && isForYouScope,
    scope: 'source_item_unlock_generation',
    onTerminal: (job) => {
      setOptimisticUnlockingSourceItemIds({});
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wall-for-you', user?.id || 'anon'] }),
        queryClient.invalidateQueries({ queryKey: ['ai-credits'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
      ]);
    },
  });

  useEffect(() => {
    if (!isForYouScope || !user) return;
    void forYouUnlockTracker.resume();
  }, [forYouUnlockTracker.resume, isForYouScope, user]);

  const unlockMutation = useMutation({
    mutationFn: async (item: ForYouLockedItem) => {
      const externalId = String(item.sourceChannelId || '').trim();
      if (!externalId) {
        throw new Error('Could not resolve source channel for unlock.');
      }

      const sourceUrl = String(item.sourceUrl || '').trim();
      const videoId = extractYouTubeVideoId(sourceUrl);
      if (!videoId) {
        throw new Error('Could not resolve source video id.');
      }

      return unlockSourcePageVideos({
        platform: 'youtube',
        externalId,
        items: [{
          video_id: videoId,
          video_url: sourceUrl,
          title: item.title,
        }],
      });
    },
    onMutate: async (item) => {
      setOptimisticUnlockingSourceItemIds((current) => ({
        ...current,
        [item.sourceItemId]: true,
      }));

      logP3Event({
        eventName: 'wall_for_you_unlock_click',
        surface: 'wall',
        user,
        metadata: {
          source_item_id: item.sourceItemId,
        },
      });
    },
    onSuccess: async (result, item) => {
      if (result.job_id) {
        forYouUnlockTracker.start(result.job_id);
        logP3Event({
          eventName: 'wall_for_you_unlock_queued',
          surface: 'wall',
          user,
          metadata: {
            source_item_id: item.sourceItemId,
            job_id: result.job_id,
            queued_count: result.queued_count,
          },
        });
      } else {
        setOptimisticUnlockingSourceItemIds((current) => {
          const next = { ...current };
          delete next[item.sourceItemId];
          return next;
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ai-credits'] }),
        queryClient.invalidateQueries({ queryKey: ['wall-for-you', user?.id || 'anon'] }),
      ]);
    },
    onError: (error, item) => {
      setOptimisticUnlockingSourceItemIds((current) => {
        const next = { ...current };
        delete next[item.sourceItemId];
        return next;
      });

      logP3Event({
        eventName: 'wall_for_you_unlock_failed',
        surface: 'wall',
        user,
        metadata: {
          source_item_id: item.sourceItemId,
          error: error instanceof Error ? error.message : 'unknown',
        },
      });

      toast({
        title: 'Unlock failed',
        description: getForYouErrorMessage(error, 'Could not start unlock.'),
        variant: 'destructive',
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
    },
  });

  const handleLike = (blueprintId: string, currentlyLiked: boolean) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to like blueprints.',
      });
      return;
    }
    likeMutation.mutate({ blueprintId, liked: currentlyLiked });
  };

  const showZeroJoinCta = !!user && isJoinedScope && joinedCuratedCount === 0;
  const scopeLaneButtons = useMemo(
    () =>
      user
        ? [
            { value: SCOPE_FOR_YOU, label: 'For You' },
            { value: SCOPE_ALL, label: 'All' },
            { value: SCOPE_JOINED, label: 'Channels' },
          ]
        : [
            { value: SCOPE_ALL, label: 'All' },
          ],
    [user],
  );

  useEffect(() => {
    if (!showZeroJoinCta) return;
    logOncePerSession('p3_wall_zero_join_cta_impression', () => {
      logP3Event({
        eventName: 'wall_zero_join_cta_impression',
        surface: 'wall',
        user,
        metadata: {
          tab: effectiveScope,
          joined_channels_count: 0,
        },
      });
    });
  }, [effectiveScope, showZeroJoinCta, user]);

  const visiblePosts = useMemo(() => {
    if (!posts) return [];
    if (!selectedTagSlug) return posts;
    return posts.filter((post) => post.tags.some((tag) => tag.slug === selectedTagSlug));
  }, [posts, selectedTagSlug]);

  const isForYouLoading = isForYouScope && forYouQuery.isLoading;
  const isForYouError = isForYouScope && forYouQuery.isError;
  const isBlueprintFeedLoading = !isForYouScope && wallFeedQuery.isLoading;
  const blueprintFeedError = !isForYouScope ? wallFeedQuery.error : null;
  const refreshCurrentFeed = async () => {
    if (isForYouScope) {
      return forYouQuery.refetch();
    }
    return wallFeedQuery.refetch();
  };
  const isCurrentFeedRefreshing = isForYouScope ? forYouQuery.isFetching : wallFeedQuery.isFetching;

  return {
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
    scopeSelectOpen,
    scopeLaneButtons,
    popularTags,
    visiblePosts,
    forYouStream,
    unlockMutation,
    wallFeedQuery,
    forYouQuery,
    isCurrentFeedRefreshing,
    refreshCurrentFeed,
    handleScopeSelect,
    updateSearchParams,
    setScopeSelectOpen,
    setSelectedTagSlug,
    handleTagFilter,
    handleLike,
  };
}

export type { WallFeedItem, WallForYouItem };
