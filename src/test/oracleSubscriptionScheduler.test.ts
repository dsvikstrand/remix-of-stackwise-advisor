import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  evaluateOraclePrimarySchedulerDecision,
  evaluateOracleShadowSchedulerDecision,
} from '../../server/services/oracleSubscriptionScheduler';
import {
  bootstrapOracleSubscriptionSchedulerState,
  recordOracleSubscriptionSchedulerObservation,
} from '../../server/services/oracleSubscriptionSchedulerState';

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-shadow-scheduler-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle shadow subscription scheduler', () => {
  it('returns enqueue when due subscriptions exist and no gate is active', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          last_polled_at: '2026-03-31T11:00:00.000Z',
          is_active: true,
        }],
      });

      const decision = await evaluateOracleShadowSchedulerDecision({
        controlDb,
        config: {
          shadowBatchLimit: 75,
          shadowLookaheadMs: 0,
        },
        nowIso: '2026-03-31T12:00:00.000Z',
      });

      expect(decision).toMatchObject({
        oracleDecisionCode: 'shadow_enqueue',
        shouldEnqueue: true,
        dueSubscriptionCount: 1,
        dueSubscriptionIds: ['sub_1'],
        nextDueAt: '2026-03-31T11:00:00.000Z',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('respects local min-interval state before allowing another enqueue', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          last_polled_at: '2026-03-31T11:00:00.000Z',
          is_active: true,
        }],
      });

      await recordOracleSubscriptionSchedulerObservation({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        actualDecisionCode: 'actual_enqueued',
        oracleDecisionCode: 'shadow_enqueue',
        minIntervalMs: 30 * 60_000,
        dueSubscriptionCount: 1,
        dueSubscriptionIds: ['sub_1'],
      });

      const decision = await evaluateOracleShadowSchedulerDecision({
        controlDb,
        config: {
          shadowBatchLimit: 75,
          shadowLookaheadMs: 0,
        },
        nowIso: '2026-03-31T12:10:00.000Z',
      });

      expect(decision).toMatchObject({
        oracleDecisionCode: 'shadow_min_interval',
        shouldEnqueue: false,
        dueSubscriptionCount: 1,
      });
      expect(decision.minIntervalUntil).toBe('2026-03-31T12:30:00.000Z');
    } finally {
      await controlDb.close();
    }
  });

  it('returns a primary no-due decision when no subscriptions are currently due', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          last_polled_at: '2026-03-31T13:00:00.000Z',
          is_active: true,
        }],
      });

      const decision = await evaluateOraclePrimarySchedulerDecision({
        controlDb,
        config: {
          schedulerTickMs: 300_000,
          shadowBatchLimit: 75,
          shadowLookaheadMs: 0,
        },
        nowIso: '2026-03-31T12:00:00.000Z',
      });

      expect(decision).toMatchObject({
        actualDecisionCode: 'actual_no_due_subscriptions',
        oracleDecisionCode: 'shadow_no_due_subscriptions',
        shouldEnqueue: false,
        dueSubscriptionCount: 0,
        nextDueAt: '2026-03-31T13:00:00.000Z',
        retryAfterSeconds: 3600,
      });
    } finally {
      await controlDb.close();
    }
  });

  it('maps a due Oracle decision into a primary enqueue decision', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          last_polled_at: '2026-03-31T11:00:00.000Z',
          is_active: true,
        }],
      });

      const decision = await evaluateOraclePrimarySchedulerDecision({
        controlDb,
        config: {
          schedulerTickMs: 300_000,
          shadowBatchLimit: 75,
          shadowLookaheadMs: 0,
        },
        nowIso: '2026-03-31T12:00:00.000Z',
      });

      expect(decision).toMatchObject({
        actualDecisionCode: 'actual_enqueued',
        oracleDecisionCode: 'shadow_enqueue',
        shouldEnqueue: true,
        dueSubscriptionCount: 1,
        dueSubscriptionIds: ['sub_1'],
        retryAfterSeconds: null,
      });
    } finally {
      await controlDb.close();
    }
  });

  it('returns a primary min-interval decision from Oracle local cadence state', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          last_polled_at: '2026-03-31T11:00:00.000Z',
          is_active: true,
        }],
      });

      await recordOracleSubscriptionSchedulerObservation({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        actualDecisionCode: 'actual_enqueued',
        oracleDecisionCode: 'shadow_enqueue',
        minIntervalMs: 20 * 60_000,
        dueSubscriptionCount: 1,
        dueSubscriptionIds: ['sub_1'],
      });

      const decision = await evaluateOraclePrimarySchedulerDecision({
        controlDb,
        config: {
          schedulerTickMs: 300_000,
          shadowBatchLimit: 75,
          shadowLookaheadMs: 0,
        },
        nowIso: '2026-03-31T12:10:00.000Z',
      });

      expect(decision).toMatchObject({
        actualDecisionCode: 'actual_min_interval',
        oracleDecisionCode: 'shadow_min_interval',
        shouldEnqueue: false,
        dueSubscriptionCount: 1,
        minIntervalUntil: '2026-03-31T12:20:00.000Z',
        retryAfterSeconds: 600,
      });
    } finally {
      await controlDb.close();
    }
  });
});
