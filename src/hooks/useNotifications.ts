import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationListPage,
} from '@/lib/notificationsApi';

export function useNotifications(input?: { limit?: number }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const limit = Math.max(1, Math.min(50, Number(input?.limit || 20)));
  const queryKey = ['notifications', user?.id, limit];

  const query = useQuery({
    queryKey,
    queryFn: () => listNotifications({ limit }),
    enabled: Boolean(user?.id),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NotificationListPage>(queryKey);
      if (!previous) return { previous };
      const nextItems = previous.items.map((item) => (
        item.id === notificationId
          ? {
              ...item,
              is_read: true,
              read_at: item.read_at || new Date().toISOString(),
            }
          : item
      ));
      const unreadCount = nextItems.reduce((acc, item) => acc + (item.is_read ? 0 : 1), 0);
      queryClient.setQueryData<NotificationListPage>(queryKey, {
        ...previous,
        items: nextItems,
        unread_count: unreadCount,
      });
      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NotificationListPage>(queryKey);
      if (!previous) return { previous };
      const nowIso = new Date().toISOString();
      const nextItems = previous.items.map((item) => ({
        ...item,
        is_read: true,
        read_at: item.read_at || nowIso,
      }));
      queryClient.setQueryData<NotificationListPage>(queryKey, {
        ...previous,
        items: nextItems,
        unread_count: 0,
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const unreadCount = query.data?.unread_count ?? 0;
  const items = query.data?.items || [];
  const unreadItems = useMemo(
    () => items.filter((item) => !item.is_read),
    [items],
  );

  return {
    isEnabled: Boolean(user?.id),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    items,
    unreadItems,
    unreadCount,
    markRead: markReadMutation.mutateAsync,
    markAllRead: markAllMutation.mutateAsync,
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllMutation.isPending,
    refetch: query.refetch,
  };
}

export type { NotificationItem };
