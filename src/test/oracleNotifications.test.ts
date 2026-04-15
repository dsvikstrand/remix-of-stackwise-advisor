import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  getOracleNotificationRowById,
  markAllOracleNotificationsRead,
  markOracleNotificationRead,
  upsertOracleNotificationRow,
} from '../../server/services/oracleNotifications';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-notification-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle notifications', () => {
  it('dedupes notifications by user and dedupe key while preserving the original id', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const first = await upsertOracleNotificationRow({
        controlDb,
        row: {
          id: 'notif_original',
          user_id: 'user_1',
          type: 'generation_started',
          title: 'Started',
          body: 'First body',
          metadata: { job_id: 'job_1' },
          dedupe_key: 'generation_started:scope:job_1',
        },
        nowIso: '2026-04-15T09:00:00.000Z',
      });

      const second = await upsertOracleNotificationRow({
        controlDb,
        row: {
          id: 'notif_replacement',
          user_id: 'user_1',
          type: 'generation_started',
          title: 'Started again',
          body: 'Second body',
          metadata: { job_id: 'job_1' },
          dedupe_key: 'generation_started:scope:job_1',
        },
        nowIso: '2026-04-15T09:01:00.000Z',
      });

      expect(first.id).toBe('notif_original');
      expect(second.id).toBe('notif_original');
      expect(second.created_at).toBe('2026-04-15T09:00:00.000Z');
      expect(second.updated_at).toBe('2026-04-15T09:01:00.000Z');

      const row = await getOracleNotificationRowById({
        controlDb,
        notificationId: 'notif_original',
      });
      expect(row).toMatchObject({
        id: 'notif_original',
        title: 'Started again',
        body: 'Second body',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('marks single and bulk notification reads in Oracle state', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleNotificationRow({
        controlDb,
        row: {
          id: 'notif_1',
          user_id: 'user_1',
          type: 'generation_succeeded',
          title: 'Ready',
          body: 'Blueprint ready',
          metadata: {},
        },
        nowIso: '2026-04-15T09:00:00.000Z',
      });

      await upsertOracleNotificationRow({
        controlDb,
        row: {
          id: 'notif_2',
          user_id: 'user_1',
          type: 'generation_failed',
          title: 'Failed',
          body: 'Try again',
          metadata: {},
        },
        nowIso: '2026-04-15T09:02:00.000Z',
      });

      const single = await markOracleNotificationRead({
        controlDb,
        userId: 'user_1',
        notificationId: 'notif_1',
        readAt: '2026-04-15T09:05:00.000Z',
      });

      expect(single).toMatchObject({
        id: 'notif_1',
        is_read: true,
        read_at: '2026-04-15T09:05:00.000Z',
      });

      const bulk = await markAllOracleNotificationsRead({
        controlDb,
        userId: 'user_1',
        readAt: '2026-04-15T09:06:00.000Z',
      });

      expect(bulk).toEqual({
        updated_count: 1,
        read_at: '2026-04-15T09:06:00.000Z',
      });

      const rowTwo = await getOracleNotificationRowById({
        controlDb,
        notificationId: 'notif_2',
      });
      expect(rowTwo).toMatchObject({
        id: 'notif_2',
        is_read: true,
        read_at: '2026-04-15T09:06:00.000Z',
      });
    } finally {
      await controlDb.close();
    }
  });
});
