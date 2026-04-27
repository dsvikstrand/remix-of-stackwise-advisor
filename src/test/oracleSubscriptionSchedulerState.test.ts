import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  bootstrapOracleSubscriptionSchedulerState,
  getOracleScopeControlState,
  recordOracleSubscriptionSchedulerObservation,
  recordOracleSubscriptionSyncOutcome,
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

  it('preserves local schedule continuity and deactivates rows no longer present in the active set', async () => {
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
          next_due_at: '2026-03-31T10:00:00.000Z',
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

  it('records shadow observations and carries forward the actual min-interval window', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [],
      });

      await recordOracleSubscriptionSchedulerObservation({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        actualDecisionCode: 'actual_min_interval',
        oracleDecisionCode: 'shadow_enqueue',
        latestActivityAt: '2026-03-31T11:50:00.000Z',
        minIntervalMs: 30 * 60_000,
        dueSubscriptionCount: 4,
        dueSubscriptionIds: ['sub_1', 'sub_2'],
        nextDueAt: '2026-03-31T12:05:00.000Z',
      });

      const scopeState = await getOracleScopeControlState({
        controlDb,
      });

      expect(scopeState).toMatchObject({
        scope: 'all_active_subscriptions',
        lastDecisionCode: 'actual_min_interval',
        minIntervalUntil: '2026-03-31T12:20:00.000Z',
      });
      expect(scopeState?.lastResultSummaryJson).toContain('"oracle_decision_code":"shadow_enqueue"');
      expect(scopeState?.lastResultSummaryJson).toContain('"due_subscription_count":4');
    } finally {
      await controlDb.close();
    }
  });

  it('prefers an explicit Oracle min-interval-until value when recording scheduler observations', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await bootstrapOracleSubscriptionSchedulerState({
        controlDb,
        nowIso: '2026-03-31T12:00:00.000Z',
        subscriptions: [],
      });

      await recordOracleSubscriptionSchedulerObservation({
        controlDb,
        nowIso: '2026-03-31T12:10:00.000Z',
        actualDecisionCode: 'actual_min_interval',
        oracleDecisionCode: 'shadow_min_interval',
        minIntervalUntil: '2026-03-31T12:25:00.000Z',
        latestActivityAt: '2026-03-31T11:00:00.000Z',
        minIntervalMs: 60 * 60_000,
      });

      const scopeState = await getOracleScopeControlState({
        controlDb,
      });

      expect(scopeState).toMatchObject({
        scope: 'all_active_subscriptions',
        lastDecisionCode: 'actual_min_interval',
        minIntervalUntil: '2026-03-31T12:25:00.000Z',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('updates next_due_at from actual sync outcomes and escalates repeated noops to the quiet interval', async () => {
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
          last_polled_at: '2026-03-31T11:30:00.000Z',
          is_active: true,
        }],
      });

      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-03-31T12:00:00.000Z',
        resultCode: 'checked_no_insert',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
      });
      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-03-31T12:30:00.000Z',
        resultCode: 'checked_no_insert',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
      });
      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-03-31T13:00:00.000Z',
        resultCode: 'checked_no_insert',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
      });

      const afterNoops = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select([
          'subscription_id',
          'next_due_at',
          'last_result_code',
          'consecutive_noop_count',
          'consecutive_error_count',
        ])
        .where('subscription_id', '=', 'sub_1')
        .executeTakeFirstOrThrow();

      expect(afterNoops).toEqual({
        subscription_id: 'sub_1',
        next_due_at: '2026-03-31T14:30:00.000Z',
        last_result_code: 'checked_no_insert',
        consecutive_noop_count: 3,
        consecutive_error_count: 0,
      });

      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-03-31T14:30:00.000Z',
        resultCode: 'new_items',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
        inserted: 2,
      });

      const afterInsert = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select([
          'subscription_id',
          'next_due_at',
          'last_result_code',
          'consecutive_noop_count',
          'consecutive_error_count',
        ])
        .where('subscription_id', '=', 'sub_1')
        .executeTakeFirstOrThrow();

      expect(afterInsert).toEqual({
        subscription_id: 'sub_1',
        next_due_at: '2026-03-31T14:45:00.000Z',
        last_result_code: 'new_items',
        consecutive_noop_count: 0,
        consecutive_error_count: 0,
      });
    } finally {
      await controlDb.close();
    }
  });

  it('differentiates transient feed failures from persistent not-found feed failures', async () => {
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
          last_polled_at: '2026-03-31T11:30:00.000Z',
          is_active: true,
        }],
      });

      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-03-31T12:00:00.000Z',
        resultCode: 'feed_transient_error',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
        errorMessage: 'FEED_FETCH_FAILED:500',
      });

      const afterTransient = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select(['next_due_at', 'last_result_code', 'consecutive_error_count'])
        .where('subscription_id', '=', 'sub_1')
        .executeTakeFirstOrThrow();

      expect(afterTransient).toEqual({
        next_due_at: '2026-03-31T12:15:00.000Z',
        last_result_code: 'feed_transient_error',
        consecutive_error_count: 1,
      });

      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-03-31T12:15:00.000Z',
        resultCode: 'feed_not_found',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
        errorMessage: 'FEED_FETCH_FAILED:404',
      });

      const afterNotFound = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select(['next_due_at', 'last_result_code', 'consecutive_error_count'])
        .where('subscription_id', '=', 'sub_1')
        .executeTakeFirstOrThrow();

      expect(afterNotFound).toEqual({
        next_due_at: '2026-03-31T13:45:00.000Z',
        last_result_code: 'feed_not_found',
        consecutive_error_count: 2,
      });

      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-03-31T13:45:00.000Z',
        resultCode: 'feed_not_found',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
        errorMessage: 'FEED_FETCH_FAILED:404',
      });

      const afterRepeatedNotFound = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select(['next_due_at', 'last_result_code', 'consecutive_error_count'])
        .where('subscription_id', '=', 'sub_1')
        .executeTakeFirstOrThrow();

      expect(afterRepeatedNotFound).toEqual({
        next_due_at: '2026-03-31T19:45:00.000Z',
        last_result_code: 'feed_not_found',
        consecutive_error_count: 3,
      });

      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-03-31T19:45:00.000Z',
        resultCode: 'feed_not_found',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
        errorMessage: 'FEED_FETCH_FAILED:404',
      });
      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-04-01T01:45:00.000Z',
        resultCode: 'feed_not_found',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
        errorMessage: 'FEED_FETCH_FAILED:404',
      });

      const afterQuarantineCandidate = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select(['next_due_at', 'last_result_code', 'consecutive_error_count', 'scheduler_notes_json'])
        .where('subscription_id', '=', 'sub_1')
        .executeTakeFirstOrThrow();
      const schedulerNotes = JSON.parse(String(afterQuarantineCandidate.scheduler_notes_json || '{}'));

      expect(afterQuarantineCandidate.next_due_at).toBe('2026-04-02T01:45:00.000Z');
      expect(afterQuarantineCandidate.last_result_code).toBe('feed_not_found');
      expect(afterQuarantineCandidate.consecutive_error_count).toBe(5);
      expect(schedulerNotes).toMatchObject({
        source_health_state: 'feed_not_found_quarantine_candidate',
        source_health_error_class: 'youtube_feed_404',
        quarantine_candidate: true,
        consecutive_error_count: 5,
        next_due_at: '2026-04-02T01:45:00.000Z',
      });

      await recordOracleSubscriptionSyncOutcome({
        controlDb,
        subscriptionId: 'sub_1',
        nowIso: '2026-04-01T02:00:00.000Z',
        resultCode: 'checked_no_insert',
        activeRevisitMs: 15 * 60_000,
        normalRevisitMs: 30 * 60_000,
        quietRevisitMs: 90 * 60_000,
        errorRetryMs: 15 * 60_000,
        errorMessage: null,
      });

      const afterRecovery = await controlDb.db
        .selectFrom('subscription_schedule_state')
        .select(['next_due_at', 'last_completed_at', 'last_result_code', 'consecutive_error_count', 'scheduler_notes_json'])
        .where('subscription_id', '=', 'sub_1')
        .executeTakeFirstOrThrow();
      const recoveryNotes = JSON.parse(String(afterRecovery.scheduler_notes_json || '{}'));

      expect(afterRecovery).toMatchObject({
        next_due_at: '2026-04-01T02:30:00.000Z',
        last_completed_at: '2026-04-01T02:00:00.000Z',
        last_result_code: 'checked_no_insert',
        consecutive_error_count: 0,
      });
      expect(recoveryNotes).toMatchObject({
        source_health_state: 'healthy',
        source_health_error_class: null,
        quarantine_candidate: false,
        consecutive_error_count: 0,
      });
    } finally {
      await controlDb.close();
    }
  });
});
