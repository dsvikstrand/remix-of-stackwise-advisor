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
      queueLedgerMode: 'supabase',
      subscriptionLedgerMode: 'supabase',
      sqlitePath: path.resolve(cwd, '.runtime', 'control-plane.sqlite'),
      bootstrapBatch: 250,
      queueLedgerBootstrapLimit: 1_000,
      subscriptionLedgerBootstrapLimit: 10_000,
      productMirrorEnabled: false,
      productBootstrapLimit: 2_000,
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
      queueSweepControlEnabled: false,
      queueAdmissionMirrorEnabled: false,
      queueAdmissionRefreshStaleMs: 15_000,
      jobActivityMirrorEnabled: false,
      jobActivityBootstrapLimit: 1_000,
      queueSweepHighIntervalMs: 5_000,
      queueSweepMediumIntervalMs: 15_000,
      queueSweepLowIntervalMs: 60_000,
      queueSweepHighBatch: 8,
      queueSweepMediumBatch: 3,
      queueSweepLowBatch: 1,
      queueSweepMaxSweepsPerRun: 3,
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
      ORACLE_QUEUE_LEDGER_MODE: 'dual',
      ORACLE_SUBSCRIPTION_LEDGER_MODE: 'primary',
      ORACLE_CONTROL_PLANE_SQLITE_PATH: '/tmp/agentic-runtime/control-plane.sqlite',
      ORACLE_SUBSCRIPTION_BOOTSTRAP_BATCH: '123',
      ORACLE_QUEUE_LEDGER_BOOTSTRAP_LIMIT: '1400',
      ORACLE_SUBSCRIPTION_LEDGER_BOOTSTRAP_LIMIT: '2200',
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
      ORACLE_QUEUE_SWEEP_CONTROL_ENABLED: 'true',
      ORACLE_QUEUE_ADMISSION_MIRROR_ENABLED: 'true',
      ORACLE_QUEUE_ADMISSION_REFRESH_STALE_MS: '30000',
      ORACLE_JOB_ACTIVITY_MIRROR_ENABLED: 'true',
      ORACLE_JOB_ACTIVITY_BOOTSTRAP_LIMIT: '1500',
      ORACLE_QUEUE_SWEEP_HIGH_INTERVAL_MS: '7000',
      ORACLE_QUEUE_SWEEP_MEDIUM_INTERVAL_MS: '21000',
      ORACLE_QUEUE_SWEEP_LOW_INTERVAL_MS: '90000',
      ORACLE_QUEUE_SWEEP_HIGH_BATCH: '11',
      ORACLE_QUEUE_SWEEP_MEDIUM_BATCH: '7',
      ORACLE_QUEUE_SWEEP_LOW_BATCH: '4',
      ORACLE_QUEUE_SWEEP_MAX_SWEEPS_PER_RUN: '5',
      ORACLE_QUEUE_EMPTY_BACKOFF_MIN_MS: '12000',
      ORACLE_QUEUE_EMPTY_BACKOFF_MAX_MS: '60000',
      ORACLE_QUEUE_MEDIUM_PRIORITY_BACKOFF_MULTIPLIER: '3',
      ORACLE_QUEUE_LOW_PRIORITY_BACKOFF_MULTIPLIER: '6',
    }, { cwd })).toEqual({
      enabled: true,
      subscriptionSchedulerMode: 'shadow',
      queueLedgerMode: 'dual',
      subscriptionLedgerMode: 'primary',
      sqlitePath: path.resolve(cwd, '/tmp/agentic-runtime/control-plane.sqlite'),
      bootstrapBatch: 123,
      queueLedgerBootstrapLimit: 1_400,
      subscriptionLedgerBootstrapLimit: 2_200,
      productMirrorEnabled: false,
      productBootstrapLimit: 2_000,
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
      queueSweepControlEnabled: true,
      queueAdmissionMirrorEnabled: true,
      queueAdmissionRefreshStaleMs: 30_000,
      jobActivityMirrorEnabled: true,
      jobActivityBootstrapLimit: 1_500,
      queueSweepHighIntervalMs: 7_000,
      queueSweepMediumIntervalMs: 21_000,
      queueSweepLowIntervalMs: 90_000,
      queueSweepHighBatch: 11,
      queueSweepMediumBatch: 7,
      queueSweepLowBatch: 4,
      queueSweepMaxSweepsPerRun: 5,
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

  it('falls back to supabase queue-ledger mode when the mode is unknown', () => {
    const cwd = createTempDir();

    expect(readOracleControlPlaneConfig({
      ORACLE_CONTROL_PLANE_ENABLED: 'true',
      ORACLE_QUEUE_LEDGER_MODE: 'unknown',
    }, { cwd }).queueLedgerMode).toBe('supabase');
  });

  it('falls back to supabase subscription-ledger mode when the mode is unknown', () => {
    const cwd = createTempDir();

    expect(readOracleControlPlaneConfig({
      ORACLE_CONTROL_PLANE_ENABLED: 'true',
      ORACLE_SUBSCRIPTION_LEDGER_MODE: 'unknown',
    }, { cwd }).subscriptionLedgerMode).toBe('supabase');
  });
});
