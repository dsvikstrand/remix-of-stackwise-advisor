import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  expediteOracleQueueSweeps,
  getOracleQueueSweepNextDelayMs,
  recordOracleQueueSweepResult,
  selectDueOracleQueueSweeps,
} from '../../server/services/oracleQueueSweepScheduler';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-queue-sweep-scheduler-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

const baseConfig = {
  queueSweepHighIntervalMs: 5_000,
  queueSweepMediumIntervalMs: 15_000,
  queueSweepLowIntervalMs: 60_000,
  queueSweepMaxSweepsPerRun: 3,
  queueEmptyBackoffMinMs: 15_000,
  queueEmptyBackoffMaxMs: 180_000,
  queueMediumPriorityBackoffMultiplier: 2,
  queueLowPriorityBackoffMultiplier: 4,
};

describe('oracle queue sweep scheduler', () => {
  it('selects unscheduled sweeps immediately and then waits until the next due time', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const basePlan = [{ tier: 'medium' as const, scopes: ['source_auto_unlock_retry'], maxJobs: 2 }];
      const initial = await selectDueOracleQueueSweeps({
        controlDb,
        config: baseConfig,
        basePlan,
        nowIso: '2026-04-01T10:00:00.000Z',
      });
      expect(initial).toEqual(basePlan);

      await recordOracleQueueSweepResult({
        controlDb,
        config: baseConfig,
        tier: 'medium',
        scopes: ['source_auto_unlock_retry'],
        maxJobs: 2,
        claimedCount: 0,
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      const blocked = await selectDueOracleQueueSweeps({
        controlDb,
        config: baseConfig,
        basePlan,
        nowIso: '2026-04-01T10:00:10.000Z',
      });
      expect(blocked).toEqual([]);

      const resumed = await selectDueOracleQueueSweeps({
        controlDb,
        config: baseConfig,
        basePlan,
        nowIso: '2026-04-01T10:00:30.000Z',
      });
      expect(resumed).toEqual(basePlan);
    } finally {
      await controlDb.close();
    }
  });

  it('uses the Oracle next-due timestamp to override idle wakeups', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const basePlan = [{ tier: 'low' as const, scopes: ['all_active_subscriptions'], maxJobs: 1 }];
      await selectDueOracleQueueSweeps({
        controlDb,
        config: baseConfig,
        basePlan,
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      await recordOracleQueueSweepResult({
        controlDb,
        config: baseConfig,
        tier: 'low',
        scopes: ['all_active_subscriptions'],
        maxJobs: 1,
        claimedCount: 0,
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      const nextDelayMs = await getOracleQueueSweepNextDelayMs({
        controlDb,
        basePlan,
        fallbackMs: 600_000,
        minDelayMs: 1_500,
        nowIso: '2026-04-01T10:00:10.000Z',
      });

      expect(nextDelayMs).toBe(50_000);
    } finally {
      await controlDb.close();
    }
  });

  it('waits for inflight sweep control instead of returning a zero-delay idle override', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const basePlan = [{ tier: 'high' as const, scopes: ['source_item_unlock_generation'], maxJobs: 8 }];
      await selectDueOracleQueueSweeps({
        controlDb,
        config: baseConfig,
        basePlan,
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      const nextDelayMs = await getOracleQueueSweepNextDelayMs({
        controlDb,
        basePlan,
        fallbackMs: 600_000,
        minDelayMs: 1_500,
        nowIso: '2026-04-01T10:00:01.000Z',
      });

      expect(nextDelayMs).toBe(4_000);
    } finally {
      await controlDb.close();
    }
  });

  it('can expedite a blocked high-priority sweep for interactive work', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const basePlan = [{ tier: 'high' as const, scopes: ['source_item_unlock_generation'], maxJobs: 8 }];
      await selectDueOracleQueueSweeps({
        controlDb,
        config: baseConfig,
        basePlan,
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      await recordOracleQueueSweepResult({
        controlDb,
        config: baseConfig,
        tier: 'high',
        scopes: ['source_item_unlock_generation'],
        maxJobs: 8,
        claimedCount: 0,
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      const blocked = await selectDueOracleQueueSweeps({
        controlDb,
        config: baseConfig,
        basePlan,
        nowIso: '2026-04-01T10:00:10.000Z',
      });
      expect(blocked).toEqual([]);

      await expediteOracleQueueSweeps({
        controlDb,
        planEntries: basePlan,
        nowIso: '2026-04-01T10:00:10.000Z',
      });

      const expedited = await selectDueOracleQueueSweeps({
        controlDb,
        config: baseConfig,
        basePlan,
        nowIso: '2026-04-01T10:00:10.000Z',
      });
      expect(expedited).toEqual(basePlan);
    } finally {
      await controlDb.close();
    }
  });
});
