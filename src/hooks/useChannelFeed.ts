import { useInfiniteQuery } from '@tanstack/react-query';
import { config } from '@/config/runtime';

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

async function fetchChannelFeedPage(input: {
  channelSlug: string;
  tab: ChannelFeedTab;
  limit: number;
  offset: number;
}): Promise<ChannelFeedPage> {
  const base = getChannelFeedApiBase();
  if (!base) {
    throw new Error('Backend API is not configured.');
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
