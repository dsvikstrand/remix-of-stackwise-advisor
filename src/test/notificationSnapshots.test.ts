import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildNotificationSnapshot,
  clearNotificationSnapshot,
  readNotificationSnapshot,
  selectNotificationSnapshotSource,
  writeNotificationSnapshot,
} from '@/lib/notificationSnapshots';
import type { NotificationListPage } from '@/lib/notificationsApi';

const basePage: NotificationListPage = {
  items: [
    {
      id: 'n1',
      user_id: 'user-1',
      type: 'generation_succeeded',
      title: 'Done',
      body: 'Finished',
      link_path: '/generation-queue',
      metadata: {},
      is_read: false,
      read_at: null,
      created_at: '2026-03-10T10:00:00.000Z',
      updated_at: '2026-03-10T10:00:00.000Z',
      dedupe_key: null,
    },
  ],
  unread_count: 1,
  next_cursor: null,
};

describe('notificationSnapshots', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('a1) [have] builds and caps a user-scoped snapshot', () => {
    const page: NotificationListPage = {
      items: Array.from({ length: 60 }, (_, index) => ({
        ...basePage.items[0],
        id: `n${index}`,
      })),
      unread_count: 60,
      next_cursor: null,
    };

    const snapshot = buildNotificationSnapshot({
      userId: 'user-1',
      page,
      syncedAt: '2026-03-10T10:10:00.000Z',
    });

    expect(snapshot?.user_id).toBe('user-1');
    expect(snapshot?.items).toHaveLength(50);
    expect(snapshot?.unread_count).toBe(60);
    expect(snapshot?.synced_at).toBe('2026-03-10T10:10:00.000Z');
  });

  it('a2) [have] writes and reads a snapshot for the matching user only', () => {
    writeNotificationSnapshot('user-1', basePage, '2026-03-10T10:20:00.000Z');

    const ownSnapshot = readNotificationSnapshot('user-1');
    const otherSnapshot = readNotificationSnapshot('user-2');

    expect(ownSnapshot?.user_id).toBe('user-1');
    expect(ownSnapshot?.synced_at).toBe('2026-03-10T10:20:00.000Z');
    expect(otherSnapshot).toBeNull();
  });

  it('a3) [have] clears the cached snapshot on logout-style cleanup', () => {
    writeNotificationSnapshot('user-1', basePage, '2026-03-10T10:30:00.000Z');
    clearNotificationSnapshot('user-1');
    expect(readNotificationSnapshot('user-1')).toBeNull();
  });

  it('a4) [have] prefers live data over a cached snapshot', () => {
    const snapshot = buildNotificationSnapshot({
      userId: 'user-1',
      page: basePage,
      syncedAt: '2026-03-10T10:40:00.000Z',
    });

    const selected = selectNotificationSnapshotSource({
      liveData: {
        ...basePage,
        unread_count: 3,
      },
      snapshot,
      hasError: true,
      isOffline: true,
    });

    expect(selected.dataSource).toBe('live');
    expect(selected.isOfflineSnapshot).toBe(false);
    expect(selected.page?.unread_count).toBe(3);
    expect(selected.lastSyncedAt).toBeNull();
  });

  it('a5) [have] falls back to the cached snapshot on offline/error conditions', () => {
    const snapshot = buildNotificationSnapshot({
      userId: 'user-1',
      page: basePage,
      syncedAt: '2026-03-10T10:50:00.000Z',
    });

    const selected = selectNotificationSnapshotSource({
      liveData: null,
      snapshot,
      hasError: true,
      isOffline: true,
    });

    expect(selected.dataSource).toBe('offline_snapshot');
    expect(selected.isOfflineSnapshot).toBe(true);
    expect(selected.page?.items).toHaveLength(1);
    expect(selected.lastSyncedAt).toBe('2026-03-10T10:50:00.000Z');
  });
});
