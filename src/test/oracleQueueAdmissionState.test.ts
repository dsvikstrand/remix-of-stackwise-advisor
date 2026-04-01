import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  readOracleQueueAdmissionCounts,
  replaceOracleQueueAdmissionMirror,
  supportsOracleQueueAdmissionMirror,
} from '../../server/services/oracleQueueAdmissionState';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-queue-admission-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle queue admission state', () => {
  it('reads mirrored global and user counts from local SQLite', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await replaceOracleQueueAdmissionMirror({
        controlDb,
        activeRows: [
          { scope: 'source_item_unlock_generation', requested_by_user_id: 'user_1' },
          { scope: 'source_item_unlock_generation', requested_by_user_id: 'user_1' },
          { scope: 'manual_refresh_selection', requested_by_user_id: 'user_2' },
        ],
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      const counts = await readOracleQueueAdmissionCounts({
        controlDb,
        db: {} as any,
        refreshStaleMs: 60_000,
        userId: 'user_1',
        scope: 'source_item_unlock_generation',
        nowIso: '2026-04-01T10:00:10.000Z',
      });

      expect(counts).toEqual({
        queue_depth: 2,
        user_queue_depth: 2,
        queue_work_items: 2,
        user_queue_work_items: 2,
        source: 'oracle_mirror',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('sums mirrored counts across multiple scopes', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await replaceOracleQueueAdmissionMirror({
        controlDb,
        activeRows: [
          { scope: 'source_item_unlock_generation', requested_by_user_id: 'user_1' },
          { scope: 'manual_refresh_selection', requested_by_user_id: 'user_1' },
          { scope: 'all_active_subscriptions', requested_by_user_id: null },
        ],
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      const counts = await readOracleQueueAdmissionCounts({
        controlDb,
        db: {} as any,
        refreshStaleMs: 60_000,
        userId: 'user_1',
        scopes: ['source_item_unlock_generation', 'manual_refresh_selection'],
        nowIso: '2026-04-01T10:00:05.000Z',
      });

      expect(counts.queue_depth).toBe(2);
      expect(counts.user_queue_depth).toBe(2);
    } finally {
      await controlDb.close();
    }
  });

  it('only supports active queue count shapes', () => {
    expect(supportsOracleQueueAdmissionMirror({ includeRunning: true })).toBe(true);
    expect(supportsOracleQueueAdmissionMirror({ statuses: ['queued', 'running'] })).toBe(true);
    expect(supportsOracleQueueAdmissionMirror({ statuses: ['queued'] })).toBe(false);
    expect(supportsOracleQueueAdmissionMirror({})).toBe(false);
  });
});
