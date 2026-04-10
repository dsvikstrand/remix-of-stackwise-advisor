import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { collectBlueprintTagSlugMap, listBlueprintTagRows } from '@/lib/blueprintTagsApi';
import { config } from '@/config/runtime';
import { buildFeedSummary } from '@/lib/feedPreview';

const CHANNEL_FEED_BLUEPRINT_SCAN_LIMIT = 96;

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

type ChannelFeedPage = {
  items: ChannelFeedPost[];
  next_offset: number | null;
  total_count: number | null;
};

function getChannelFeedApiBase() {
  if (!config.agenticBackendUrl) return null;
  return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function listChannelFeedFallback(input: {
  channelSlug: string;
  tab: ChannelFeedTab;
  limit: number;
  offset: number;
}): Promise<ChannelFeedPage> {
  const { channelSlug, tab, limit, offset } = input;
  const { data: blueprints, error } = await supabase
    .from('blueprints')
    .select('id, title, preview_summary, likes_count, created_at')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(CHANNEL_FEED_BLUEPRINT_SCAN_LIMIT);

  if (error) throw error;
  if (!blueprints || blueprints.length === 0) {
    return { items: [], next_offset: null, total_count: 0 };
  }

  const blueprintIds = blueprints.map((row) => row.id);
  const { data: feedItems, error: feedItemsError } = await supabase
    .from('user_feed_items')
    .select('id, blueprint_id')
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
  if (matchingBlueprintIds.length === 0) {
    return { items: [], next_offset: null, total_count: 0 };
  }

  const matchingBlueprintIdSet = new Set(matchingBlueprintIds);
  const pageBaseRows = blueprints
    .filter((row) => matchingBlueprintIdSet.has(row.id))
    .map((row) => ({
      id: row.id,
      title: row.title,
      previewSummary: buildFeedSummary({
        primary: row.preview_summary,
        fallback: 'Open blueprint to view full details.',
        maxChars: 220,
      }),
      likesCount: Number(row.likes_count || 0),
      createdAt: row.created_at,
      primaryChannelSlug: channelSlug,
    }));

  if (tab === 'top') {
    pageBaseRows.sort((a, b) => {
      if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } else {
    pageBaseRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const pagedBaseRows = pageBaseRows.slice(offset, offset + limit);
  const pageBlueprintIds = pagedBaseRows.map((row) => row.id);
  const tagRows = pageBlueprintIds.length > 0 ? await listBlueprintTagRows({ blueprintIds: pageBlueprintIds }) : [];
  const tagsByBlueprintId = collectBlueprintTagSlugMap(tagRows);

  const items = pagedBaseRows.map((row) => ({
    ...row,
    tags: tagsByBlueprintId.get(row.id) || [],
  }));
  const resolvedCount = offset + items.length;
  return {
    items,
    next_offset: pageBaseRows.length > resolvedCount ? resolvedCount : null,
    total_count: pageBaseRows.length,
  };
}

async function fetchChannelFeedPage(input: {
  channelSlug: string;
  tab: ChannelFeedTab;
  limit: number;
  offset: number;
}): Promise<ChannelFeedPage> {
  const base = getChannelFeedApiBase();
  if (!base) {
    return listChannelFeedFallback(input);
  }

  const search = new URLSearchParams({
    tab: input.tab,
    limit: String(input.limit),
    offset: String(input.offset),
  });
  const response = await fetch(`${base}/channels/${encodeURIComponent(input.channelSlug)}/feed?${search.toString()}`, {
    method: 'GET',
  });
  const json = await response.json().catch(() => null) as {
    ok?: boolean;
    message?: string;
    error_code?: string | null;
    data?: ChannelFeedPage | null;
  } | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Channel feed request failed (${response.status})`);
  }
  return json.data;
}

export function useChannelFeed({ channelSlug, tab, pageSize = 16 }: UseChannelFeedOptions) {
  const query = useInfiniteQuery({
    queryKey: ['channel-feed', channelSlug, tab, pageSize],
    enabled: Boolean(channelSlug),
    staleTime: 20 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchChannelFeedPage({
      channelSlug,
      tab,
      limit: pageSize,
      offset: Number(pageParam || 0),
    }),
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
  });

  const posts = query.data?.pages.flatMap((page) => page.items) || [];
  const totalCount = query.data?.pages[query.data.pages.length - 1]?.total_count ?? query.data?.pages[0]?.total_count ?? posts.length;

  return {
    posts,
    totalCount,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => query.fetchNextPage(),
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
  };
}
