import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildFeedSummary } from '@/lib/feedPreview';

const CHANNEL_FEED_BLUEPRINT_SCAN_LIMIT = 180;

export type ChannelFeedTab = 'top' | 'recent';

export interface ChannelFeedPost {
  id: string;
  title: string;
  previewSummary: string;
  likesCount: number;
  createdAt: string;
  tags: string[];
  primaryChannelSlug: string;
}

interface UseChannelFeedOptions {
  channelSlug: string;
  tab: ChannelFeedTab;
  pageSize?: number;
}

export function useChannelFeed({ channelSlug, tab, pageSize = 20 }: UseChannelFeedOptions) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [channelSlug, tab, pageSize]);

  const baseQuery = useQuery({
    queryKey: ['channel-feed-base', channelSlug],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<ChannelFeedPost[]> => {
      const { data: blueprints, error } = await supabase
        .from('blueprints')
        .select('id, title, preview_summary, likes_count, created_at')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(CHANNEL_FEED_BLUEPRINT_SCAN_LIMIT);

      if (error) throw error;
      if (!blueprints || blueprints.length === 0) return [];

      const blueprintIds = blueprints.map((row) => row.id);
      const { data: feedItems, error: feedItemsError } = await supabase
        .from('user_feed_items')
        .select('id, blueprint_id, created_at')
        .in('blueprint_id', blueprintIds);

      if (feedItemsError) throw feedItemsError;

      const blueprintIdByFeedItemId = new Map((feedItems || []).map((row) => [row.id, row.blueprint_id]));
      const feedItemIds = (feedItems || []).map((row) => row.id);
      const { data: candidateRows, error: candidateError } = feedItemIds.length > 0
        ? await supabase
            .from('channel_candidates')
            .select('user_feed_item_id')
            .eq('status', 'published')
            .eq('channel_slug', channelSlug)
            .in('user_feed_item_id', feedItemIds)
        : { data: [], error: null };

      if (candidateError) throw candidateError;

      const matchingBlueprintIds = [...new Set(
        (candidateRows || [])
          .map((row) => blueprintIdByFeedItemId.get(row.user_feed_item_id))
          .filter((value): value is string => Boolean(value)),
      )];
      if (matchingBlueprintIds.length === 0) return [];

      const { data: tagRows, error: tagError } = await supabase
        .from('blueprint_tags')
        .select('blueprint_id, tags(slug)')
        .in('blueprint_id', matchingBlueprintIds);

      if (tagError) throw tagError;

      const tagsByBlueprintId = new Map<string, string[]>();
      (tagRows || []).forEach((row) => {
        const list = tagsByBlueprintId.get(row.blueprint_id) || [];
        if (Array.isArray(row.tags)) {
          row.tags.forEach((tag) => {
            if (tag && typeof tag === 'object' && 'slug' in tag) {
              list.push(String((tag as { slug: string }).slug));
            }
          });
        } else if (row.tags && typeof row.tags === 'object' && 'slug' in row.tags) {
          list.push(String((row.tags as { slug: string }).slug));
        }
        tagsByBlueprintId.set(row.blueprint_id, list);
      });

      const matchingBlueprintIdSet = new Set(matchingBlueprintIds);

      const hydrated = blueprints.filter((row) => matchingBlueprintIdSet.has(row.id)).map((row) => {
        const tags = tagsByBlueprintId.get(row.id) || [];
        return {
          id: row.id,
          title: row.title,
          previewSummary: buildFeedSummary({
            primary: row.preview_summary,
            fallback: 'Open blueprint to view full details.',
            maxChars: 220,
          }),
          likesCount: row.likes_count,
          createdAt: row.created_at,
          tags,
          primaryChannelSlug: channelSlug,
        };
      });

      return hydrated;
    },
  });

  const sorted = useMemo(() => {
    const rows = [...(baseQuery.data || [])];
    if (tab === 'top') {
      rows.sort((a, b) => {
        if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      return rows;
    }

    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }, [baseQuery.data, tab]);

  const visiblePosts = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  return {
    posts: visiblePosts,
    totalCount: sorted.length,
    hasMore,
    loadMore: () => setVisibleCount((current) => Math.min(current + pageSize, sorted.length)),
    isLoading: baseQuery.isLoading,
    isError: baseQuery.isError,
    error: baseQuery.error,
  };
}
