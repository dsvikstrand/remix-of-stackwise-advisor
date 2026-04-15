import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  configureNotificationOracleWriteAdapter,
  createNotificationFromEvent,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../server/services/notifications';
import {
  getOracleNotificationRowById,
  upsertOracleNotificationRow,
  markOracleNotificationRead,
  markAllOracleNotificationsRead,
} from '../../server/services/oracleNotifications';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  configureNotificationOracleWriteAdapter(null);
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-notifications-service-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('notifications service', () => {
  it('creates separate generation_started notifications for different job ids', async () => {
    const db = createMockSupabase({
      notifications: [],
    }) as any;

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: 'user_1',
      jobId: 'job_1',
      scope: 'source_item_unlock_generation',
      queuedCount: 1,
      itemTitle: 'Blueprint A',
    });

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: 'user_1',
      jobId: 'job_2',
      scope: 'source_item_unlock_generation',
      queuedCount: 1,
      itemTitle: 'Blueprint B',
    });

    const page = await listNotificationsForUser(db, {
      userId: 'user_1',
      limit: 10,
    });

    expect(page.items).toHaveLength(2);
    expect(page.items.map((item) => item.type)).toEqual([
      'generation_started',
      'generation_started',
    ]);
    expect(page.items.map((item) => item.metadata.job_id)).toEqual([
      'job_2',
      'job_1',
    ]);
  });

  it('dedupes repeated generation_started emits for the same job id', async () => {
    const db = createMockSupabase({
      notifications: [],
    }) as any;

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: 'user_1',
      jobId: 'job_1',
      scope: 'search_video_generate',
      queuedCount: 1,
      itemTitle: 'Blueprint A',
    });

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: 'user_1',
      jobId: 'job_1',
      scope: 'search_video_generate',
      queuedCount: 1,
      itemTitle: 'Blueprint A',
    });

    const page = await listNotificationsForUser(db, {
      userId: 'user_1',
      limit: 10,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.metadata.job_id).toBe('job_1');
  });

  it('stores retry action metadata for retryable source unlock failures', async () => {
    const db = createMockSupabase({
      notifications: [],
    }) as any;

    await createNotificationFromEvent(db, {
      kind: 'generation_terminal',
      userId: 'user_1',
      jobId: 'job_retry_1',
      scope: 'source_item_unlock_generation',
      inserted: 0,
      skipped: 0,
      failed: 1,
      itemTitle: 'Retry me',
      failureSummary: 'Transcript temporarily unavailable. Try again later.',
      retryAction: {
        kind: 'retry_source_unlock',
        platform: 'youtube',
        external_id: 'channel_1',
        item: {
          video_id: 'video_1',
          video_url: 'https://www.youtube.com/watch?v=video_1',
          title: 'Retry me',
          duration_seconds: 42,
        },
      },
    });

    const page = await listNotificationsForUser(db, {
      userId: 'user_1',
      limit: 10,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.type).toBe('generation_failed');
    expect(page.items[0]?.metadata.retry_action).toEqual({
      kind: 'retry_source_unlock',
      platform: 'youtube',
      external_id: 'channel_1',
      item: {
        video_id: 'video_1',
        video_url: 'https://www.youtube.com/watch?v=video_1',
        title: 'Retry me',
        duration_seconds: 42,
      },
    });
  });

  it('writes notifications to Oracle while shadowing Supabase for current reads', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      notifications: [],
    }) as any;

    configureNotificationOracleWriteAdapter({
      upsertNotification: async (input) => upsertOracleNotificationRow({
        controlDb,
        row: input.row,
        nowIso: input.nowIso,
      }),
      markNotificationRead: async (input) => markOracleNotificationRead({
        controlDb,
        userId: input.userId,
        notificationId: input.notificationId,
        readAt: input.readAt,
      }),
      markAllNotificationsRead: async (input) => markAllOracleNotificationsRead({
        controlDb,
        userId: input.userId,
        readAt: input.readAt,
      }),
    });

    try {
      const created = await createNotificationFromEvent(db, {
        kind: 'generation_started',
        userId: 'user_1',
        jobId: 'job_oracle_1',
        scope: 'search_video_generate',
        queuedCount: 1,
        itemTitle: 'Oracle first',
      });

      expect(created).toBeTruthy();
      expect(db.state.notifications).toHaveLength(1);
      expect(db.state.notifications[0]?.id).toBe(created?.id);

      const oracleRow = await getOracleNotificationRowById({
        controlDb,
        notificationId: String(created?.id || ''),
      });
      expect(oracleRow).toMatchObject({
        id: created?.id,
        user_id: 'user_1',
        type: 'generation_started',
      });

      const marked = await markNotificationRead(db, {
        userId: 'user_1',
        notificationId: String(created?.id || ''),
      });

      expect(marked).toMatchObject({
        id: created?.id,
        is_read: true,
      });

      const oracleAfterRead = await getOracleNotificationRowById({
        controlDb,
        notificationId: String(created?.id || ''),
      });
      expect(oracleAfterRead?.is_read).toBe(true);

      const markAll = await markAllNotificationsRead(db, {
        userId: 'user_1',
      });
      expect(markAll.updated_count).toBe(0);
    } finally {
      await controlDb.close();
    }
  });
});
