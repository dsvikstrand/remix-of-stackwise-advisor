import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { listMyFeedItems, type MyFeedItemView } from '@/lib/myFeedApi';

export function useMyFeed(options?: { enabled?: boolean }) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['my-feed-items', user?.id],
    enabled: !!user && (options?.enabled ?? true),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!user) {
        return {
          items: [] as MyFeedItemView[],
          staleFallback: false,
          staleReason: null,
          source: 'cache' as const,
        };
      }
      return listMyFeedItems(user.id);
    },
  });

  const grouped = useMemo(() => {
    const items = query.data?.items || [];
    return {
      needsAction: items.filter((item) => !item.candidate),
      pendingReview: items.filter((item) => item.state === 'candidate_pending_manual_review'),
      published: items.filter((item) => item.state === 'channel_published'),
      rejected: items.filter((item) => item.state === 'channel_rejected'),
      all: items,
    };
  }, [query.data]);

  return {
    ...query,
    items: query.data?.items || [],
    isDegraded: Boolean(query.data?.staleFallback),
    degradedMessage: query.data?.staleReason || null,
    grouped,
  };
}

export type { MyFeedItemView };
