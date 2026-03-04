import { startTransition, useMemo, useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tag, Layers, Sparkles, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTrendingTags } from '@/hooks/useExploreSearch';
import { useTagFollows } from '@/hooks/useTagFollows';
import type { Json } from '@/integrations/supabase/types';
import { buildBlueprintPreviewText, buildFeedSummary } from '@/lib/feedPreview';
import { formatRelativeShort } from '@/lib/timeFormat';
import { matchesChannelByTags, resolveChannelLabelForBlueprint } from '@/lib/channelMapping';
import { normalizeTag } from '@/lib/tagging';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { logOncePerSession, logP3Event } from '@/lib/telemetry';
import { cn } from '@/lib/utils';
import { useMyFeed } from '@/hooks/useMyFeed';
import { extractYouTubeVideoId } from '@/lib/sourceIdentity';
import { ApiRequestError } from '@/lib/subscriptionsApi';
import { unlockSourcePageVideos } from '@/lib/sourcePagesApi';
import { WallBlueprintCard } from '@/components/wall/WallBlueprintCard';
import { ForYouLockedSourceCard } from '@/components/wall/ForYouLockedSourceCard';
import { useSourceUnlockJobTracker } from '@/hooks/useSourceUnlockJobTracker';

interface BlueprintPost {
  id: string;
  creator_user_id: string;
  title: string;
  sections_json: Json | null;
  steps: Json | null;
  llm_review: string | null;
  mix_notes: string | null;
  banner_url: string | null;
  likes_count: number;
  created_at: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  };
  tags: { id: string; slug: string }[];
  user_liked: boolean;
  published_channel_slug?: string | null;
  source_channel_title?: string | null;
  source_channel_avatar_url?: string | null;
  source_thumbnail_url?: string | null;
  source_view_count?: number | null;
}

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

function parseSourceViewCount(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const candidates = [metadata.view_count, metadata.viewCount];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.floor(numeric);
    }
  }
  return null;
}

type ForYouLockedItem = {
  kind: 'locked';
  feedItemId: string;
  sourceItemId: string;
  createdAt: string;
  title: string;
  sourceChannelTitle: string | null;
  sourceChannelAvatarUrl: string | null;
  sourceUrl: string;
  unlockCost: number;
  sourcePageId: string | null;
  sourceChannelId: string | null;
  unlockInProgress: boolean;
};

type ForYouBlueprintItem = {
  kind: 'blueprint';
  feedItemId: string;
  sourceItemId: string;
  createdAt: string;
  blueprintId: string;
  title: string;
  sourceChannelTitle: string | null;
  sourceChannelAvatarUrl: string | null;
  sourceThumbnailUrl: string | null;
  sourceViewCount: number | null;
  sectionsJson: Json | null;
  llmReview: string | null;
  mixNotes: string | null;
  steps: unknown;
  bannerUrl: string | null;
  tags: string[];
  publishedChannelSlug: string | null;
};

type ForYouStreamItem = ForYouLockedItem | ForYouBlueprintItem;

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
    if (error.errorCode === 'INSUFFICIENT_CREDITS') {
      return 'Not enough credits to unlock this blueprint yet.';
    }
    if (error.errorCode === 'RATE_LIMITED') {
      return 'Too many unlock requests, retry shortly.';
    }
    if (error.errorCode === 'SOURCE_PAGE_NOT_FOUND') {
      return 'Source page missing for this item. Try opening the source first.';
    }
    if (error.errorCode === 'TRANSCRIPT_UNAVAILABLE') {
      return 'Could not unlock this video right now. Please try again in a few minutes.';
    }
    if (error.errorCode === 'NO_TRANSCRIPT_PERMANENT') {
      return 'This video cannot be unlocked right now.';
    }
    return error.message || fallback;
  }
  if (error instanceof Error && /source video id/i.test(error.message)) {
    return 'Could not resolve source video id for this item. Try opening it from Source Page.';
  }
  return error instanceof Error ? error.message : fallback;
}

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

  const wallQueryKey = ['wall-blueprints', effectiveScope, feedSort, user?.id] as const;

  const { data: posts, isLoading: isBlueprintFeedLoading, error: blueprintFeedError } = useQuery({
    queryKey: wallQueryKey,
    enabled: !isForYouScope,
    queryFn: async () => {
      const scopedChannel =
        effectiveScope !== SCOPE_ALL && effectiveScope !== SCOPE_FOR_YOU && effectiveScope !== SCOPE_YOUR_CHANNELS
          ? CHANNELS_CATALOG.find((channel) => channel.slug === effectiveScope)
          : null;
      const isSpecificChannelScope = !!scopedChannel;

      const limit = isYourChannelsScope || isSpecificChannelScope ? 140 : 90;
      let query = supabase
        .from('blueprints')
        .select('id, creator_user_id, title, sections_json, steps, llm_review, mix_notes, banner_url, likes_count, created_at')
        .eq('is_public', true)
        .limit(limit);

      if (feedSort === 'trending') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 3);
        query = query
          .gte('created_at', cutoff.toISOString())
          .order('likes_count', { ascending: false })
          .order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data: blueprints, error } = await query;
      if (error) throw error;
      if (!blueprints || blueprints.length === 0) return [] as BlueprintPost[];

      const blueprintIds = blueprints.map((row) => row.id);
      const userIds = [...new Set(blueprints.map((row) => row.creator_user_id))];

      const [tagsRes, likesRes, profilesRes, feedItemsRes] = await Promise.all([
        supabase.from('blueprint_tags').select('blueprint_id, tag_id').in('blueprint_id', blueprintIds),
        user
          ? supabase.from('blueprint_likes').select('blueprint_id').eq('user_id', user.id).in('blueprint_id', blueprintIds)
          : Promise.resolve({ data: [] as { blueprint_id: string }[] }),
        supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds),
        supabase
          .from('user_feed_items')
          .select('id, blueprint_id, source_item_id, created_at')
          .in('blueprint_id', blueprintIds),
      ]);

      const tagRows = tagsRes.data || [];
      const tagIds = [...new Set(tagRows.map((row) => row.tag_id))];
      const { data: tagsData } = tagIds.length > 0
        ? await supabase.from('tags').select('id, slug').in('id', tagIds)
        : { data: [] as { id: string; slug: string }[] };

      const tagsMap = new Map((tagsData || []).map((tag) => [tag.id, tag]));
      const blueprintTags = new Map<string, { id: string; slug: string }[]>();

      tagRows.forEach((row) => {
        const tag = tagsMap.get(row.tag_id);
        if (!tag) return;
        const list = blueprintTags.get(row.blueprint_id) || [];
        list.push(tag);
        blueprintTags.set(row.blueprint_id, list);
      });

      const likedIds = new Set((likesRes.data || []).map((row) => row.blueprint_id));
      const profilesMap = new Map((profilesRes.data || []).map((profile) => [profile.user_id, profile]));
      if (feedItemsRes.error) throw feedItemsRes.error;

      const publishedChannelByBlueprint = new Map<string, { slug: string; createdAtMs: number }>();
      const sourceChannelTitleByBlueprint = new Map<string, { title: string | null; createdAtMs: number }>();
      const sourceChannelAvatarByBlueprint = new Map<string, { avatarUrl: string | null; createdAtMs: number }>();
      const sourceThumbnailByBlueprint = new Map<string, { thumbnailUrl: string | null; createdAtMs: number }>();
      const sourceViewCountByBlueprint = new Map<string, { viewCount: number | null; createdAtMs: number }>();
      const feedItems = (feedItemsRes.data || []) as Array<{ id: string; blueprint_id: string; source_item_id: string; created_at: string }>;
      const feedItemIds = feedItems.map((row) => row.id);
      const blueprintIdByFeedItemId = new Map(feedItems.map((row) => [row.id, row.blueprint_id]));
      const sourceItemIds = [...new Set(feedItems.map((row) => String(row.source_item_id || '').trim()).filter(Boolean))];

      const { data: sourceItemsData, error: sourceItemsError } = sourceItemIds.length > 0
        ? await supabase
          .from('source_items')
          .select('id, source_page_id, source_channel_id, source_channel_title, thumbnail_url, metadata')
          .in('id', sourceItemIds)
        : { data: [], error: null };
      if (sourceItemsError) throw sourceItemsError;

      const sourcePageIds = [...new Set((sourceItemsData || []).map((row) => String(row.source_page_id || '').trim()).filter(Boolean))];
      const sourceChannelIds = [...new Set((sourceItemsData || []).map((row) => String(row.source_channel_id || '').trim()).filter(Boolean))];
      const { data: sourcePagesData, error: sourcePagesError } = sourcePageIds.length > 0
        ? await supabase
          .from('source_pages')
          .select('id, avatar_url')
          .in('id', sourcePageIds)
        : { data: [], error: null };
      if (sourcePagesError) throw sourcePagesError;
      const { data: sourcePagesByExternalData, error: sourcePagesByExternalError } = sourceChannelIds.length > 0
        ? await supabase
          .from('source_pages')
          .select('external_id, avatar_url')
          .eq('platform', 'youtube')
          .in('external_id', sourceChannelIds)
        : { data: [], error: null };
      if (sourcePagesByExternalError) throw sourcePagesByExternalError;
      const sourcePageAvatarById = new Map((sourcePagesData || []).map((row) => [row.id, row.avatar_url || null]));
      const sourcePageAvatarByExternalId = new Map((sourcePagesByExternalData || []).map((row) => [row.external_id, row.avatar_url || null]));

      const sourceItemsMap = new Map(
        (sourceItemsData || []).map((row) => {
          const metadata =
            row.metadata && typeof row.metadata === 'object' && row.metadata !== null
              ? (row.metadata as Record<string, unknown>)
              : null;
          const metadataSourceTitle =
            metadata && typeof metadata.source_channel_title === 'string'
              ? String(metadata.source_channel_title || '').trim() || null
              : (
                metadata && typeof metadata.channel_title === 'string'
                  ? String(metadata.channel_title || '').trim() || null
                  : null
              );
          const metadataSourceAvatarUrl =
            metadata && typeof metadata.source_channel_avatar_url === 'string'
              ? String(metadata.source_channel_avatar_url || '').trim() || null
              : (
                metadata && typeof metadata.channel_avatar_url === 'string'
                  ? String(metadata.channel_avatar_url || '').trim() || null
                  : null
              );
          return [row.id, {
            title: row.source_channel_title || metadataSourceTitle || null,
            avatarUrl:
              metadataSourceAvatarUrl
              || sourcePageAvatarById.get(String(row.source_page_id || '').trim())
              || sourcePageAvatarByExternalId.get(String(row.source_channel_id || '').trim())
              || null,
            thumbnailUrl: String(row.thumbnail_url || '').trim() || null,
            viewCount: parseSourceViewCount(metadata),
          }] as const;
        }),
      );
      let publishedCandidateRows: Array<{
        channel_slug: string;
        created_at: string;
        user_feed_item_id: string;
      }> = [];

      if (feedItemIds.length > 0) {
        const { data: candidatesData, error: candidatesError } = await supabase
          .from('channel_candidates')
          .select('channel_slug, created_at, user_feed_item_id')
          .eq('status', 'published')
          .in('user_feed_item_id', feedItemIds);
        if (candidatesError) throw candidatesError;
        publishedCandidateRows = (candidatesData || []) as Array<{
          channel_slug: string;
          created_at: string;
          user_feed_item_id: string;
        }>;
      }

      for (const row of publishedCandidateRows) {
        const blueprintId = blueprintIdByFeedItemId.get(row.user_feed_item_id);
        const channelSlug = String(row.channel_slug || '').trim().toLowerCase();
        if (!blueprintId || !channelSlug) continue;

        const createdAtMs = Number.isFinite(Date.parse(row.created_at)) ? Date.parse(row.created_at) : 0;
        const existing = publishedChannelByBlueprint.get(blueprintId);
        if (!existing || createdAtMs > existing.createdAtMs || (createdAtMs === existing.createdAtMs && channelSlug < existing.slug)) {
          publishedChannelByBlueprint.set(blueprintId, { slug: channelSlug, createdAtMs });
        }
      }

      for (const row of feedItems) {
        const blueprintId = row.blueprint_id;
        const sourceInfo = sourceItemsMap.get(row.source_item_id) || { title: null, avatarUrl: null, thumbnailUrl: null, viewCount: null };
        const createdAtMs = Number.isFinite(Date.parse(row.created_at)) ? Date.parse(row.created_at) : 0;
        const existingTitle = sourceChannelTitleByBlueprint.get(blueprintId);
        if (!existingTitle || createdAtMs > existingTitle.createdAtMs) {
          sourceChannelTitleByBlueprint.set(blueprintId, { title: sourceInfo.title, createdAtMs });
        }
        const existingAvatar = sourceChannelAvatarByBlueprint.get(blueprintId);
        if (!existingAvatar || createdAtMs > existingAvatar.createdAtMs) {
          sourceChannelAvatarByBlueprint.set(blueprintId, { avatarUrl: sourceInfo.avatarUrl, createdAtMs });
        }
        const existingThumbnail = sourceThumbnailByBlueprint.get(blueprintId);
        if (!existingThumbnail || createdAtMs > existingThumbnail.createdAtMs) {
          sourceThumbnailByBlueprint.set(blueprintId, { thumbnailUrl: sourceInfo.thumbnailUrl, createdAtMs });
        }
        const existingViewCount = sourceViewCountByBlueprint.get(blueprintId);
        if (!existingViewCount || createdAtMs > existingViewCount.createdAtMs) {
          sourceViewCountByBlueprint.set(blueprintId, { viewCount: sourceInfo.viewCount, createdAtMs });
        }
      }

      let followTagIds = new Set<string>();
      if (isYourChannelsScope && user) {
        const followsRes = await supabase.from('tag_follows').select('tag_id').eq('user_id', user.id);
        followTagIds = new Set((followsRes.data || []).map((row) => row.tag_id));
      }

      const hydrated = blueprints.map((blueprint) => ({
        ...blueprint,
        profile: profilesMap.get(blueprint.creator_user_id) || { display_name: null, avatar_url: null },
        tags: blueprintTags.get(blueprint.id) || [],
        user_liked: likedIds.has(blueprint.id),
        published_channel_slug: publishedChannelByBlueprint.get(blueprint.id)?.slug || null,
        source_channel_title: sourceChannelTitleByBlueprint.get(blueprint.id)?.title || null,
        source_channel_avatar_url: sourceChannelAvatarByBlueprint.get(blueprint.id)?.avatarUrl || null,
        source_thumbnail_url: sourceThumbnailByBlueprint.get(blueprint.id)?.thumbnailUrl || null,
        source_view_count: sourceViewCountByBlueprint.get(blueprint.id)?.viewCount ?? null,
      })) as BlueprintPost[];

      if (isSpecificChannelScope && scopedChannel) {
        return hydrated.filter((post) => {
          if (post.published_channel_slug) {
            return post.published_channel_slug === scopedChannel.slug;
          }
          return matchesChannelByTags(scopedChannel.slug, post.tags.map((tag) => tag.slug));
        });
      }

      if (isYourChannelsScope) {
        if (followTagIds.size === 0) return hydrated;

        const joinedChannelPosts: BlueprintPost[] = [];
        const globalFillPosts: BlueprintPost[] = [];

        hydrated.forEach((post) => {
          if (post.tags.some((tag) => followTagIds.has(tag.id))) {
            joinedChannelPosts.push(post);
          } else {
            globalFillPosts.push(post);
          }
        });

        return [...joinedChannelPosts, ...globalFillPosts];
      }

      return hydrated;
    },
  });

  const postIds = useMemo(() => (posts || []).map((post) => post.id), [posts]);

  const { data: commentCountsByBlueprintId = {} } = useQuery({
    queryKey: ['wall-blueprint-comment-counts', postIds],
    enabled: !isForYouScope && postIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blueprint_comments')
        .select('blueprint_id')
        .in('blueprint_id', postIds);

      if (error) throw error;

      return (data || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.blueprint_id] = (acc[row.blueprint_id] || 0) + 1;
        return acc;
      }, {});
    },
  });

  const myFeedQuery = useMyFeed({ enabled: isForYouScope });

  const forYouSubscriptionsQuery = useQuery({
    queryKey: ['wall-for-you-subscriptions', user?.id],
    enabled: isForYouScope && !!user,
    queryFn: async () => {
      if (!user) return [] as Array<{ source_page_id: string | null; source_channel_id: string | null }>;
      const { data, error } = await supabase
        .from('user_source_subscriptions')
        .select('source_page_id, source_channel_id')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []) as Array<{ source_page_id: string | null; source_channel_id: string | null }>;
    },
  });

  const forYouStream = useMemo(() => {
    if (!isForYouScope || !myFeedQuery.data || !forYouSubscriptionsQuery.data) return [] as ForYouStreamItem[];

    const activeSourcePageIds = new Set(
      forYouSubscriptionsQuery.data
        .map((row) => String(row.source_page_id || '').trim())
        .filter(Boolean),
    );
    const activeSourceChannelIds = new Set(
      forYouSubscriptionsQuery.data
        .map((row) => String(row.source_channel_id || '').trim())
        .filter(Boolean),
    );

    const items: ForYouStreamItem[] = [];

    myFeedQuery.data.forEach((item) => {
      if (!item.source) return;
      if (item.state === 'subscription_notice') return;

      const sourcePageId = String(item.source.sourcePageId || '').trim();
      const sourceChannelId = String(item.source.sourceChannelId || '').trim();
      const isSubscribedSource =
        (sourcePageId && activeSourcePageIds.has(sourcePageId))
        || (sourceChannelId && activeSourceChannelIds.has(sourceChannelId));
      const isGeneratedByUser = Boolean(
        item.blueprint
        && user
        && String(item.blueprint.creatorUserId || '').trim() === user.id,
      );

      if (!isSubscribedSource && !isGeneratedByUser) return;

      if (item.blueprint) {
        items.push({
          kind: 'blueprint',
          feedItemId: item.id,
          sourceItemId: item.source.id,
          createdAt: item.createdAt,
          blueprintId: item.blueprint.id,
          title: item.blueprint.title,
          sourceChannelTitle: item.source.sourceChannelTitle || null,
          sourceChannelAvatarUrl: item.source.sourceChannelAvatarUrl || null,
          sourceThumbnailUrl: item.source.thumbnailUrl || null,
          sourceViewCount: item.source.viewCount ?? null,
          sectionsJson: item.blueprint.sectionsJson || null,
          llmReview: item.blueprint.llmReview,
          mixNotes: item.blueprint.mixNotes,
          steps: item.blueprint.steps,
          bannerUrl: item.blueprint.bannerUrl,
          tags: item.blueprint.tags,
          publishedChannelSlug: item.candidate?.status === 'published' ? item.candidate.channelSlug : null,
        });
        return;
      }

      items.push({
        kind: 'locked',
        feedItemId: item.id,
        sourceItemId: item.source.id,
        createdAt: item.createdAt,
        title: item.source.title,
        sourceChannelTitle: item.source.sourceChannelTitle,
        sourceChannelAvatarUrl: item.source.sourceChannelAvatarUrl || null,
        sourceUrl: item.source.sourceUrl,
        unlockCost: Number(item.source.unlockCost || 0),
        sourcePageId: item.source.sourcePageId,
        sourceChannelId: item.source.sourceChannelId,
        unlockInProgress: Boolean(item.source.unlockInProgress) || Boolean(optimisticUnlockingSourceItemIds[item.source.id]),
      });
    });

    return items;
  }, [isForYouScope, myFeedQuery.data, forYouSubscriptionsQuery.data, optimisticUnlockingSourceItemIds]);

  const forYouBlueprintIds = useMemo(
    () => forYouStream.filter((item): item is ForYouBlueprintItem => item.kind === 'blueprint').map((item) => item.blueprintId),
    [forYouStream],
  );

  const forYouStatsQuery = useQuery({
    queryKey: ['wall-for-you-blueprint-stats', user?.id, forYouBlueprintIds],
    enabled: isForYouScope && !!user && forYouBlueprintIds.length > 0,
    queryFn: async () => {
      const [{ data: blueprintRows, error: blueprintError }, { data: likedRows, error: likedError }, { data: commentRows, error: commentError }] = await Promise.all([
        supabase
          .from('blueprints')
          .select('id, likes_count')
          .in('id', forYouBlueprintIds),
        supabase
          .from('blueprint_likes')
          .select('blueprint_id')
          .eq('user_id', user!.id)
          .in('blueprint_id', forYouBlueprintIds),
        supabase
          .from('blueprint_comments')
          .select('blueprint_id')
          .in('blueprint_id', forYouBlueprintIds),
      ]);

      if (blueprintError) throw blueprintError;
      if (likedError) throw likedError;
      if (commentError) throw commentError;

      const likes = (blueprintRows || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.id] = Number(row.likes_count || 0);
        return acc;
      }, {});

      const likedIds = new Set((likedRows || []).map((row) => row.blueprint_id));
      const comments = (commentRows || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.blueprint_id] = (acc[row.blueprint_id] || 0) + 1;
        return acc;
      }, {});

      return {
        likes,
        likedIds,
        comments,
      };
    },
  });

  const likeMutation = useMutation({
    mutationFn: async ({ blueprintId, liked }: { blueprintId: string; liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (liked) {
        await supabase.from('blueprint_likes').delete().eq('blueprint_id', blueprintId).eq('user_id', user.id);
      } else {
        await supabase.from('blueprint_likes').insert({ blueprint_id: blueprintId, user_id: user.id });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wall-blueprints'] }),
        queryClient.invalidateQueries({ queryKey: ['wall-for-you-blueprint-stats'] }),
      ]);
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
        queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['wall-blueprints'] }),
        queryClient.invalidateQueries({ queryKey: ['wall-for-you-blueprint-stats'] }),
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
      // Source-page API path key expects provider external id (YouTube channel id), not source_pages UUID.
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
        queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['wall-blueprints'] }),
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
            { value: SCOPE_FOR_YOU, label: 'For You', icon: Sparkles },
            { value: SCOPE_YOUR_CHANNELS, label: 'Joined', icon: Users },
            { value: SCOPE_ALL, label: 'All', icon: Layers },
          ]
        : [
            { value: SCOPE_ALL, label: 'All', icon: Layers },
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

  const isForYouLoading = isForYouScope && (myFeedQuery.isLoading || forYouSubscriptionsQuery.isLoading);
  const isForYouError = isForYouScope && (myFeedQuery.isError || forYouSubscriptionsQuery.isError || forYouStatsQuery.isError);

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

      <main className="max-w-3xl mx-auto px-0 pb-24">
        <section className="mb-6 px-3 sm:px-4 hidden sm:block">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Home</p>
            <h1 className="text-2xl font-semibold">Live blueprint stream</h1>
            <p className="text-sm text-muted-foreground">
              For You unlocks what you follow. Your channels keeps you in the loop.
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

        <div className="space-y-3">
          <div className="px-3 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={activeLane} onValueChange={handleScopeSelect} open={scopeSelectOpen} onOpenChange={setScopeSelectOpen}>
                <SelectTrigger className="h-9 w-auto min-w-0 border-input px-2.5 outline-none ring-0 transition-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:ring-0 data-[state=open]:ring-offset-0 [&>svg]:hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeLaneButtons.map((lane) => (
                    <SelectItem key={lane.value} value={lane.value}>
                      {lane.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={feedSort}
                onValueChange={(value) => updateSearchParams({ sort: value as FeedSort })}
                disabled={isForYouScope}
              >
                <SelectTrigger className="h-9 w-auto min-w-0 border-input px-2.5 outline-none ring-0 transition-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:ring-0 data-[state=open]:ring-offset-0 [&>svg]:hidden">
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

            {showZeroJoinYourChannelsCta && (
              <div className="mb-3 mx-3 sm:mx-4 border border-border/40 px-3 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Join channels to shape this lane</p>
                  <p className="text-xs text-muted-foreground">
                    Follow channels to personalize this lane.
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

                    const likesCount = forYouStatsQuery.data?.likes[item.blueprintId] || 0;
                    const userLiked = Boolean(forYouStatsQuery.data?.likedIds.has(item.blueprintId));
                    const commentsCount = forYouStatsQuery.data?.comments[item.blueprintId] || 0;
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
                      likesCount,
                      userLiked,
                      commentsCount,
                    });

                    return (
                      <WallBlueprintCard
                        key={item.sourceItemId}
                        {...cardProps}
                        onLike={(event) => {
                          event.preventDefault();
                          handleLike(item.blueprintId, userLiked);
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
                  const commentsCount = commentCountsByBlueprintId[post.id] || 0;
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
                    commentsCount,
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
                      {isYourChannelsScope ? (
                        <Tag className="h-8 w-8 text-muted-foreground" />
                      ) : (
                        <Layers className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {isYourChannelsScope ? 'Personalize your channels lane' : 'No blueprints yet'}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {isYourChannelsScope
                          ? 'Join channels to see prioritized blueprints here.'
                          : 'Be the first to share a blueprint.'}
                      </p>
                    </div>

                    {isYourChannelsScope && popularTags.length > 0 && (
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

                    {!isYourChannelsScope && (
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
