import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readOracleControlPlaneConfig } from '../../server/services/oracleControlPlaneConfig';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) {
      fs.rmSync(next, { recursive: true, force: true });
    }
  }
});

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-control-plane-config-'));
  tempDirs.push(dir);
  return dir;
}

describe('oracle control-plane config', () => {
  it('defaults to disabled supabase mode and a local runtime sqlite path', () => {
    const cwd = createTempDir();

    expect(readOracleControlPlaneConfig({}, { cwd })).toEqual({
      enabled: false,
      subscriptionSchedulerMode: 'supabase',
      sqlitePath: path.resolve(cwd, '.runtime', 'control-plane.sqlite'),
      bootstrapBatch: 250,
      schedulerTickMs: 300_000,
      primaryMinTriggerIntervalMs: 3_600_000,
      primaryBatchLimit: 150,
      primaryMaxBatchesPerRun: 2,
      shadowBatchLimit: 75,
      shadowLookaheadMs: 60_000,
      activeRevisitMs: 900_000,
      normalRevisitMs: 1_800_000,
      quietRevisitMs: 5_400_000,
      errorRetryMs: 900_000,
      queueControlEnabled: false,
      queueEmptyBackoffMinMs: 15_000,
      queueEmptyBackoffMaxMs: 180_000,
      queueMediumPriorityBackoffMultiplier: 2,
      queueLowPriorityBackoffMultiplier: 4,
    });
  });

  it('resolves enabled shadow mode and custom values', () => {
    const cwd = createTempDir();

    expect(readOracleControlPlaneConfig({
      ORACLE_CONTROL_PLANE_ENABLED: 'true',
      ORACLE_SUBSCRIPTION_SCHEDULER_MODE: 'shadow',
      ORACLE_CONTROL_PLANE_SQLITE_PATH: '/tmp/agentic-runtime/control-plane.sqlite',
      ORACLE_SUBSCRIPTION_BOOTSTRAP_BATCH: '123',
      ORACLE_SUBSCRIPTION_SCHEDULER_TICK_MS: '45000',
      ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS: '1800000',
      ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT: '222',
      ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN: '4',
      ORACLE_SUBSCRIPTION_SHADOW_BATCH_LIMIT: '33',
      ORACLE_SUBSCRIPTION_SHADOW_LOOKAHEAD_MS: '15000',
      ORACLE_SUBSCRIPTION_REVISIT_ACTIVE_MS: '120000',
      ORACLE_SUBSCRIPTION_REVISIT_NORMAL_MS: '240000',
      ORACLE_SUBSCRIPTION_REVISIT_QUIET_MS: '720000',
      ORACLE_SUBSCRIPTION_RETRY_ERROR_MS: '180000',
      ORACLE_QUEUE_CONTROL_ENABLED: 'true',
      ORACLE_QUEUE_EMPTY_BACKOFF_MIN_MS: '12000',
      ORACLE_QUEUE_EMPTY_BACKOFF_MAX_MS: '60000',
      ORACLE_QUEUE_MEDIUM_PRIORITY_BACKOFF_MULTIPLIER: '3',
      ORACLE_QUEUE_LOW_PRIORITY_BACKOFF_MULTIPLIER: '6',
    }, { cwd })).toEqual({
      enabled: true,
      subscriptionSchedulerMode: 'shadow',
      sqlitePath: path.resolve(cwd, '/tmp/agentic-runtime/control-plane.sqlite'),
      bootstrapBatch: 123,
      schedulerTickMs: 45_000,
      primaryMinTriggerIntervalMs: 1_800_000,
      primaryBatchLimit: 222,
      primaryMaxBatchesPerRun: 4,
      shadowBatchLimit: 33,
      shadowLookaheadMs: 15_000,
      activeRevisitMs: 120_000,
      normalRevisitMs: 240_000,
      quietRevisitMs: 720_000,
      errorRetryMs: 180_000,
      queueControlEnabled: true,
      queueEmptyBackoffMinMs: 12_000,
      queueEmptyBackoffMaxMs: 60_000,
      queueMediumPriorityBackoffMultiplier: 3,
      queueLowPriorityBackoffMultiplier: 6,
    });
  });

  it('falls back to supabase mode when the scheduler mode is unknown', () => {
    const cwd = createTempDir();

    expect(readOracleControlPlaneConfig({
      ORACLE_CONTROL_PLANE_ENABLED: 'true',
      ORACLE_SUBSCRIPTION_SCHEDULER_MODE: 'unknown',
    }, { cwd }).subscriptionSchedulerMode).toBe('supabase');
  });
});
