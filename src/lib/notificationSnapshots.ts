import type { NotificationItem, NotificationListPage } from '@/lib/notificationsApi';

const NOTIFICATION_SNAPSHOT_PREFIX = 'bleup:notifications-snapshot:v1:';
const NOTIFICATION_SNAPSHOT_MAX_ITEMS = 50;

export type NotificationSnapshot = {
  user_id: string;
  items: NotificationItem[];
  unread_count: number;
  synced_at: string;
};

export type NotificationSnapshotSelection = {
  page: NotificationListPage | null;
  dataSource: 'live' | 'offline_snapshot' | null;
  isOfflineSnapshot: boolean;
  lastSyncedAt: string | null;
};

function getNotificationSnapshotKey(userId: string) {
  return `${NOTIFICATION_SNAPSHOT_PREFIX}${String(userId || '').trim()}`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function buildNotificationSnapshot(input: {
  userId: string;
  page: NotificationListPage;
  syncedAt?: string;
}): NotificationSnapshot | null {
  const userId = String(input.userId || '').trim();
  if (!userId) return null;
  const items = Array.isArray(input.page?.items) ? input.page.items.slice(0, NOTIFICATION_SNAPSHOT_MAX_ITEMS) : [];
  const unreadCount = Number.isFinite(input.page?.unread_count)
    ? Math.max(0, Math.floor(Number(input.page.unread_count)))
    : items.reduce((acc, item) => acc + (item?.is_read ? 0 : 1), 0);

  return {
    user_id: userId,
    items,
    unread_count: unreadCount,
    synced_at: String(input.syncedAt || new Date().toISOString()),
  };
}

export function readNotificationSnapshot(userId: string): NotificationSnapshot | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(getNotificationSnapshotKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotificationSnapshot> | null;
    if (!parsed || parsed.user_id !== userId || !Array.isArray(parsed.items) || typeof parsed.synced_at !== 'string') {
      return null;
    }

    return buildNotificationSnapshot({
      userId,
      page: {
        items: parsed.items,
        unread_count: Number(parsed.unread_count || 0),
        next_cursor: null,
      },
      syncedAt: parsed.synced_at,
    });
  } catch {
    return null;
  }
}

export function writeNotificationSnapshot(userId: string, page: NotificationListPage, syncedAt?: string) {
  if (!canUseStorage()) return;

  const snapshot = buildNotificationSnapshot({ userId, page, syncedAt });
  if (!snapshot) return;

  try {
    window.localStorage.setItem(getNotificationSnapshotKey(userId), JSON.stringify(snapshot));
  } catch {
    // Ignore quota/privacy failures; snapshot fallback is best-effort only.
  }
}

export function clearNotificationSnapshot(userId: string) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(getNotificationSnapshotKey(userId));
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function selectNotificationSnapshotSource(input: {
  liveData: NotificationListPage | null | undefined;
  snapshot: NotificationSnapshot | null;
  hasError: boolean;
  isOffline: boolean;
}): NotificationSnapshotSelection {
  if (input.liveData) {
    return {
      page: input.liveData,
      dataSource: 'live',
      isOfflineSnapshot: false,
      lastSyncedAt: null,
    };
  }

  if ((input.hasError || input.isOffline) && input.snapshot) {
    return {
      page: {
        items: input.snapshot.items,
        unread_count: input.snapshot.unread_count,
        next_cursor: null,
      },
      dataSource: 'offline_snapshot',
      isOfflineSnapshot: true,
      lastSyncedAt: input.snapshot.synced_at,
    };
  }

  return {
    page: null,
    dataSource: null,
    isOfflineSnapshot: false,
    lastSyncedAt: null,
  };
}
