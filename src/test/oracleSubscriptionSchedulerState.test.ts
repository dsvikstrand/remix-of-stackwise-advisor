import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import { bootstrapOracleSubscriptionSchedulerState } from '../../server/services/oracleSubscriptionSchedulerState';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) {
      fs.rmSync(next, { recursive: true, force: true });
    }
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-control-plane-db-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle subscription scheduler bootstrap', () => {
  it('initializes sqlite schema and bootstraps active subscriptions', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const result = await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [
          {
            id: 'sub_1',
            user_id: 'user_1',
            source_channel_id: 'channel_1',
            last_polled_at: '2026-03-31T10:00:00.000Z',
            is_active: true,
          },
          {
            id: 'sub_2',
            user_id: 'user_2',
            source_channel_id: 'channel_2',
            last_polled_at: null,
            is_active: true,
          },
        ],
      });

      expect(result).toEqual({ activeCount: 2 });

      const subscriptions = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select([
          'subscription_id',
          'user_id',
          'source_channel_id',
          'active',
          'next_due_at',
          'last_checked_at',
        ])
        .orderBy('subscription_id', 'asc')
        .execute();

      expect(subscriptions).toEqual([
        {
          subscription_id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          active: 1,
          next_due_at: '2026-03-31T10:00:00.000Z',
          last_checked_at: '2026-03-31T10:00:00.000Z',
        },
        {
          subscription_id: 'sub_2',
          user_id: 'user_2',
          source_channel_id: 'channel_2',
          active: 1,
          next_due_at: '2026-03-31T12:00:00.000Z',
          last_checked_at: null,
        },
      ]);

      const scopeRow = await controlDb.db
        .selectFrom('scope_control_state')
        .select(['scope', 'scheduler_enabled', 'last_decision_code'])
        .where('scope', '=', 'all_active_subscriptions')
        .executeTakeFirstOrThrow();

      expect(scopeRow).toEqual({
        scope: 'all_active_subscriptions',
        scheduler_enabled: 1,
        last_decision_code: 'bootstrap_only',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('is idempotent and deactivates local rows no longer present in the active set', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [
          {
            id: 'sub_1',
            user_id: 'user_1',
            source_channel_id: 'channel_1',
            last_polled_at: '2026-03-31T10:00:00.000Z',
            is_active: true,
          },
          {
            id: 'sub_2',
            user_id: 'user_2',
            source_channel_id: 'channel_2',
            last_polled_at: '2026-03-31T11:00:00.000Z',
            is_active: true,
          },
        ],
      });

      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T13:00:00.000Z',
        subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          last_polled_at: '2026-03-31T12:30:00.000Z',
          is_active: true,
        }],
      });

      const subscriptions = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select(['subscription_id', 'active', 'next_due_at'])
        .orderBy('subscription_id', 'asc')
        .execute();

      expect(subscriptions).toEqual([
        {
          subscription_id: 'sub_1',
          active: 1,
          next_due_at: '2026-03-31T12:30:00.000Z',
        },
        {
          subscription_id: 'sub_2',
          active: 0,
          next_due_at: '2026-03-31T11:00:00.000Z',
        },
      ]);
    } finally {
      await controlDb.close();
    }
  });
});
