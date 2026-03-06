import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useTrendingTags } from '@/hooks/useExploreSearch';
import { useTagFollows } from '@/hooks/useTagFollows';
import { ApiRequestError } from '@/lib/subscriptionsApi';
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
const SCOPE_YOUR_CHANNELS = 'your-channels';
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

  const scopeValues = useMemo(
    () =>
      new Set([
        SCOPE_FOR_YOU,
        SCOPE_YOUR_CHANNELS,
        SCOPE_ALL,
        ...CHANNELS_CATALOG
          .filter((channel) => channel.status === 'active')
          .map((channel) => channel.slug),
      ]),
    [],
  );
  const scopeParam = (searchParams.get('scope') || '').trim();
  const sortParam = (searchParams.get('sort') || '').trim();
  const defaultScope = user ? SCOPE_FOR_YOU : SCOPE_ALL;
  const feedScope = scopeValues.has(scopeParam) ? scopeParam : defaultScope;
  const requestedSort: FeedSort = sortParam === 'trending' ? 'trending' : 'latest';

  const isPersonalScope = feedScope === SCOPE_FOR_YOU || feedScope === SCOPE_YOUR_CHANNELS;
  const effectiveScope = !user && isPersonalScope ? SCOPE_ALL : feedScope;
  const isForYouScope = effectiveScope === SCOPE_FOR_YOU && !!user;
  const isYourChannelsScope = effectiveScope === SCOPE_YOUR_CHANNELS && !!user;
  const feedSort: FeedSort = isForYouScope ? 'latest' : requestedSort;
  const resolvedLane = isForYouScope
    ? SCOPE_FOR_YOU
    : isYourChannelsScope
      ? SCOPE_YOUR_CHANNELS
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
    queryFn: async () => getWallFeed({ scope: effectiveScope, sort: feedSort }),
  });

  const forYouQuery = useQuery({
    queryKey: ['wall-for-you', user?.id || 'anon'],
    enabled: isForYouScope && !!user,
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
      ]);

      if (job.status === 'succeeded') {
        toast({
          title: 'Unlock complete',
          description: `Inserted ${job.inserted_count}, skipped ${job.skipped_count}, failed ${Math.max(0, job.processed_count - job.inserted_count - job.skipped_count)}.`,
        });
        return;
      }

      toast({
        title: 'Unlock failed',
        description: job.error_message || 'Could not complete unlock generation.',
        variant: 'destructive',
      });
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

      toast({
        title: result.job_id ? 'Unlock queued' : 'No unlock queued',
        description: result.job_id
          ? `Queued ${result.queued_count} item${result.queued_count === 1 ? '' : 's'} for generation.`
          : `No new unlock started. Ready ${result.ready_count}, in progress ${result.in_progress_count}.`,
      });

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

  const showZeroJoinYourChannelsCta = !!user && isYourChannelsScope && joinedCuratedCount === 0;
  const scopeLaneButtons = useMemo(
    () =>
      user
        ? [
            { value: SCOPE_FOR_YOU, label: 'For You' },
            { value: SCOPE_YOUR_CHANNELS, label: 'Joined' },
            { value: SCOPE_ALL, label: 'All' },
          ]
        : [
            { value: SCOPE_ALL, label: 'All' },
          ],
    [user],
  );

  useEffect(() => {
    if (!showZeroJoinYourChannelsCta) return;
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
  }, [effectiveScope, showZeroJoinYourChannelsCta, user]);

  const visiblePosts = useMemo(() => {
    if (!posts) return [];
    if (!selectedTagSlug) return posts;
    return posts.filter((post) => post.tags.some((tag) => tag.slug === selectedTagSlug));
  }, [posts, selectedTagSlug]);

  const isForYouLoading = isForYouScope && forYouQuery.isLoading;
  const isForYouError = isForYouScope && forYouQuery.isError;
  const isBlueprintFeedLoading = !isForYouScope && wallFeedQuery.isLoading;
  const blueprintFeedError = !isForYouScope ? wallFeedQuery.error : null;

  return {
    user,
    authLoading,
    activeLane,
    effectiveScope,
    feedSort,
    isForYouScope,
    isYourChannelsScope,
    isForYouLoading,
    isForYouError,
    isBlueprintFeedLoading,
    blueprintFeedError,
    selectedTagSlug,
    showZeroJoinYourChannelsCta,
    scopeSelectOpen,
    scopeLaneButtons,
    popularTags,
    visiblePosts,
    forYouStream,
    unlockMutation,
    wallFeedQuery,
    forYouQuery,
    handleScopeSelect,
    updateSearchParams,
    setScopeSelectOpen,
    setSelectedTagSlug,
    handleTagFilter,
    handleLike,
  };
}

export type { WallFeedItem, WallForYouItem };
