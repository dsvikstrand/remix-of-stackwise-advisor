import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationListPage,
} from '@/lib/notificationsApi';
import {
  readNotificationSnapshot,
  selectNotificationSnapshotSource,
  writeNotificationSnapshot,
} from '@/lib/notificationSnapshots';

export function useNotifications(input?: { limit?: number; enabled?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const limit = Math.max(1, Math.min(50, Number(input?.limit || 20)));
  const queryKey = ['notifications', user?.id, limit];
  const isQueryEnabled = Boolean(user?.id) && (input?.enabled ?? true);

  const query = useQuery({
    queryKey,
    queryFn: () => listNotifications({ limit }),
    enabled: isQueryEnabled,
    staleTime: 15_000,
    refetchInterval: 20_000,
    retry: false,
  });

  const snapshot = useMemo(
    () => (user?.id ? readNotificationSnapshot(user.id) : null),
    [user?.id, query.isError, query.dataUpdatedAt],
  );

  useEffect(() => {
    if (!user?.id || !query.data) return;
    writeNotificationSnapshot(user.id, query.data);
  }, [user?.id, query.data]);

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const selectedSource = useMemo(
    () => selectNotificationSnapshotSource({
      liveData: query.data,
      snapshot,
      hasError: isQueryEnabled && query.isError,
      isOffline: isQueryEnabled && isOffline,
    }),
    [isOffline, isQueryEnabled, query.data, query.isError, snapshot],
  );

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

  const unreadCount = selectedSource.page?.unread_count ?? 0;
  const items = selectedSource.page?.items || [];
  const unreadItems = useMemo(
    () => items.filter((item) => !item.is_read),
    [items],
  );

  return {
    isEnabled: Boolean(user?.id),
    isLoading: query.isLoading && !selectedSource.page,
    isFetching: query.isFetching,
    isError: query.isError && !selectedSource.isOfflineSnapshot,
    error: selectedSource.isOfflineSnapshot ? null : query.error,
    items,
    unreadItems,
    unreadCount,
    isOfflineSnapshot: selectedSource.isOfflineSnapshot,
    lastSyncedAt: selectedSource.lastSyncedAt,
    dataSource: selectedSource.dataSource,
    markRead: markReadMutation.mutateAsync,
    markAllRead: markAllMutation.mutateAsync,
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllMutation.isPending,
    refetch: query.refetch,
  };
}

export type { NotificationItem };
