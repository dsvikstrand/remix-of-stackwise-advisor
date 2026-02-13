import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { resolvePrimaryChannelFromTags } from '@/lib/channelMapping';

export type ChannelFeedTab = 'top' | 'recent';

export interface ChannelFeedPost {
  id: string;
  title: string;
  llmReview: string | null;
  mixNotes: string | null;
  selectedItems: Json;
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
    queryFn: async (): Promise<ChannelFeedPost[]> => {
      const { data: blueprints, error } = await supabase
        .from('blueprints')
        .select('id, title, selected_items, llm_review, mix_notes, likes_count, created_at')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(400);

      if (error) throw error;
      if (!blueprints || blueprints.length === 0) return [];

      const blueprintIds = blueprints.map((row) => row.id);

      const { data: tagRows, error: tagError } = await supabase
        .from('blueprint_tags')
        .select('blueprint_id, tags(slug)')
        .in('blueprint_id', blueprintIds);

      if (tagError) throw tagError;

      const tagsByBlueprintId = new Map<string, string[]>();
      (tagRows || []).forEach((row) => {
        const list = tagsByBlueprintId.get(row.blueprint_id) || [];
        if (row.tags && typeof row.tags === 'object' && 'slug' in row.tags) {
          list.push((row.tags as { slug: string }).slug);
        }
        tagsByBlueprintId.set(row.blueprint_id, list);
      });

      const hydrated = blueprints.map((row) => {
        const tags = tagsByBlueprintId.get(row.id) || [];
        return {
          id: row.id,
          title: row.title,
          llmReview: row.llm_review,
          mixNotes: row.mix_notes,
          selectedItems: row.selected_items,
          likesCount: row.likes_count,
          createdAt: row.created_at,
          tags,
          primaryChannelSlug: resolvePrimaryChannelFromTags(tags),
        };
      });

      return hydrated.filter((row) => row.primaryChannelSlug === channelSlug);
    },
    staleTime: 30_000,
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

  const commentQuery = useQuery({
    queryKey: ['channel-feed-comments', visiblePosts.map((row) => row.id)],
    enabled: visiblePosts.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const visibleIds = visiblePosts.map((row) => row.id);
      const { data, error } = await supabase
        .from('blueprint_comments')
        .select('blueprint_id')
        .in('blueprint_id', visibleIds);

      if (error) throw error;

      return (data || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.blueprint_id] = (acc[row.blueprint_id] || 0) + 1;
        return acc;
      }, {});
    },
  });

  return {
    posts: visiblePosts,
    totalCount: sorted.length,
    hasMore,
    loadMore: () => setVisibleCount((current) => Math.min(current + pageSize, sorted.length)),
    commentCountsByBlueprintId: commentQuery.data || {},
    isLoading: baseQuery.isLoading,
    isError: baseQuery.isError,
    error: baseQuery.error,
  };
}
