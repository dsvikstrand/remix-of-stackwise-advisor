import path from 'node:path';
import { parseRuntimeFlag } from './runtimeConfig';

export type OracleSubscriptionSchedulerMode = 'supabase' | 'shadow' | 'primary';
export type OracleQueueLedgerMode = 'supabase' | 'dual' | 'primary';
export type OracleSubscriptionLedgerMode = 'supabase' | 'dual' | 'primary';
export type OracleUnlockLedgerMode = 'supabase' | 'dual' | 'primary';
export type OracleFeedLedgerMode = 'supabase' | 'dual' | 'primary';
export type OracleSourceItemLedgerMode = 'supabase' | 'dual' | 'primary';

export type OracleControlPlaneConfig = {
  enabled: boolean;
  subscriptionSchedulerMode: OracleSubscriptionSchedulerMode;
  queueLedgerMode: OracleQueueLedgerMode;
  subscriptionLedgerMode: OracleSubscriptionLedgerMode;
  unlockLedgerMode: OracleUnlockLedgerMode;
  feedLedgerMode: OracleFeedLedgerMode;
  sourceItemLedgerMode: OracleSourceItemLedgerMode;
  sqlitePath: string;
  bootstrapBatch: number;
  queueLedgerBootstrapLimit: number;
  subscriptionLedgerBootstrapLimit: number;
  unlockLedgerBootstrapLimit: number;
  feedLedgerBootstrapLimit: number;
  sourceItemLedgerBootstrapLimit: number;
  productMirrorEnabled: boolean;
  productBootstrapLimit: number;
  schedulerTickMs: number;
  primaryMinTriggerIntervalMs: number;
  primaryBatchLimit: number;
  primaryMaxBatchesPerRun: number;
  shadowBatchLimit: number;
  shadowLookaheadMs: number;
  activeRevisitMs: number;
  normalRevisitMs: number;
  quietRevisitMs: number;
  errorRetryMs: number;
  queueControlEnabled: boolean;
  queueSweepControlEnabled: boolean;
  queueAdmissionMirrorEnabled: boolean;
  queueAdmissionRefreshStaleMs: number;
  jobActivityMirrorEnabled: boolean;
  jobActivityBootstrapLimit: number;
  queueSweepHighIntervalMs: number;
  queueSweepMediumIntervalMs: number;
  queueSweepLowIntervalMs: number;
  queueSweepHighBatch: number;
  queueSweepMediumBatch: number;
  queueSweepLowBatch: number;
  queueSweepMaxSweepsPerRun: number;
  queueEmptyBackoffMinMs: number;
  queueEmptyBackoffMaxMs: number;
  queueMediumPriorityBackoffMultiplier: number;
  queueLowPriorityBackoffMultiplier: number;
};

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeOracleSubscriptionSchedulerMode(raw: string | undefined): OracleSubscriptionSchedulerMode {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'shadow') return 'shadow';
  if (normalized === 'primary') return 'primary';
  return 'supabase';
}

function normalizeOracleQueueLedgerMode(raw: string | undefined): OracleQueueLedgerMode {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'dual') return 'dual';
  if (normalized === 'primary') return 'primary';
  return 'supabase';
}

function normalizeOracleSubscriptionLedgerMode(raw: string | undefined): OracleSubscriptionLedgerMode {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'dual') return 'dual';
  if (normalized === 'primary') return 'primary';
  return 'supabase';
}

function normalizeOracleUnlockLedgerMode(raw: string | undefined): OracleUnlockLedgerMode {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'dual') return 'dual';
  if (normalized === 'primary') return 'primary';
  return 'supabase';
}

function normalizeOracleFeedLedgerMode(raw: string | undefined): OracleFeedLedgerMode {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'dual') return 'dual';
  if (normalized === 'primary') return 'primary';
  return 'supabase';
}

function normalizeOracleSourceItemLedgerMode(raw: string | undefined): OracleSourceItemLedgerMode {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'dual') return 'dual';
  if (normalized === 'primary') return 'primary';
  return 'supabase';
}

export function readOracleControlPlaneConfig(
  env: NodeJS.ProcessEnv,
  input?: { cwd?: string },
): OracleControlPlaneConfig {
  const enabled = parseRuntimeFlag(env.ORACLE_CONTROL_PLANE_ENABLED, false);
  const cwd = String(input?.cwd || process.cwd()).trim() || process.cwd();
  const sqlitePathRaw = String(env.ORACLE_CONTROL_PLANE_SQLITE_PATH || '').trim();
  const sqlitePath = path.resolve(
    cwd,
    sqlitePathRaw || path.join('.runtime', 'control-plane.sqlite'),
  );

  return {
    enabled,
    subscriptionSchedulerMode: enabled
      ? normalizeOracleSubscriptionSchedulerMode(env.ORACLE_SUBSCRIPTION_SCHEDULER_MODE)
      : 'supabase',
    queueLedgerMode: enabled
      ? normalizeOracleQueueLedgerMode(env.ORACLE_QUEUE_LEDGER_MODE)
      : 'supabase',
    subscriptionLedgerMode: enabled
      ? normalizeOracleSubscriptionLedgerMode(env.ORACLE_SUBSCRIPTION_LEDGER_MODE)
      : 'supabase',
    unlockLedgerMode: enabled
      ? normalizeOracleUnlockLedgerMode(env.ORACLE_UNLOCK_LEDGER_MODE)
      : 'supabase',
    feedLedgerMode: enabled
      ? normalizeOracleFeedLedgerMode(env.ORACLE_FEED_LEDGER_MODE)
      : 'supabase',
    sourceItemLedgerMode: enabled
      ? normalizeOracleSourceItemLedgerMode(env.ORACLE_SOURCE_ITEM_LEDGER_MODE)
      : 'supabase',
    sqlitePath,
    bootstrapBatch: clampInt(env.ORACLE_SUBSCRIPTION_BOOTSTRAP_BATCH, 250, 10, 5000),
    queueLedgerBootstrapLimit: clampInt(
      env.ORACLE_QUEUE_LEDGER_BOOTSTRAP_LIMIT,
      1_000,
      50,
      10_000,
    ),
    subscriptionLedgerBootstrapLimit: clampInt(
      env.ORACLE_SUBSCRIPTION_LEDGER_BOOTSTRAP_LIMIT,
      10_000,
      100,
      100_000,
    ),
    unlockLedgerBootstrapLimit: clampInt(
      env.ORACLE_UNLOCK_LEDGER_BOOTSTRAP_LIMIT,
      10_000,
      100,
      100_000,
    ),
    feedLedgerBootstrapLimit: clampInt(
      env.ORACLE_FEED_LEDGER_BOOTSTRAP_LIMIT,
      10_000,
      100,
      100_000,
    ),
    sourceItemLedgerBootstrapLimit: clampInt(
      env.ORACLE_SOURCE_ITEM_LEDGER_BOOTSTRAP_LIMIT,
      10_000,
      100,
      100_000,
    ),
    productMirrorEnabled: parseRuntimeFlag(env.ORACLE_PRODUCT_MIRROR_ENABLED, false),
    productBootstrapLimit: clampInt(
      env.ORACLE_PRODUCT_BOOTSTRAP_LIMIT,
      2_000,
      100,
      20_000,
    ),
    schedulerTickMs: clampInt(env.ORACLE_SUBSCRIPTION_SCHEDULER_TICK_MS, 300_000, 5_000, 60 * 60_000),
    primaryMinTriggerIntervalMs: clampInt(
      env.ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS,
      60 * 60_000,
      60_000,
      24 * 60 * 60_000,
    ),
    primaryBatchLimit: clampInt(
      env.ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT,
      150,
      1,
      5000,
    ),
    primaryMaxBatchesPerRun: clampInt(
      env.ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN,
      2,
      1,
      25,
    ),
    shadowBatchLimit: clampInt(env.ORACLE_SUBSCRIPTION_SHADOW_BATCH_LIMIT, 75, 1, 5000),
    shadowLookaheadMs: clampInt(env.ORACLE_SUBSCRIPTION_SHADOW_LOOKAHEAD_MS, 60_000, 0, 60 * 60_000),
    activeRevisitMs: clampInt(env.ORACLE_SUBSCRIPTION_REVISIT_ACTIVE_MS, 15 * 60_000, 60_000, 24 * 60 * 60_000),
    normalRevisitMs: clampInt(env.ORACLE_SUBSCRIPTION_REVISIT_NORMAL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
    quietRevisitMs: clampInt(env.ORACLE_SUBSCRIPTION_REVISIT_QUIET_MS, 90 * 60_000, 60_000, 7 * 24 * 60 * 60_000),
    errorRetryMs: clampInt(env.ORACLE_SUBSCRIPTION_RETRY_ERROR_MS, 15 * 60_000, 60_000, 24 * 60 * 60_000),
    queueControlEnabled: parseRuntimeFlag(env.ORACLE_QUEUE_CONTROL_ENABLED, false),
    queueSweepControlEnabled: parseRuntimeFlag(env.ORACLE_QUEUE_SWEEP_CONTROL_ENABLED, false),
    queueAdmissionMirrorEnabled: parseRuntimeFlag(env.ORACLE_QUEUE_ADMISSION_MIRROR_ENABLED, false),
    queueAdmissionRefreshStaleMs: clampInt(
      env.ORACLE_QUEUE_ADMISSION_REFRESH_STALE_MS,
      15_000,
      1_000,
      24 * 60 * 60_000,
    ),
    jobActivityMirrorEnabled: parseRuntimeFlag(env.ORACLE_JOB_ACTIVITY_MIRROR_ENABLED, false),
    jobActivityBootstrapLimit: clampInt(
      env.ORACLE_JOB_ACTIVITY_BOOTSTRAP_LIMIT,
      1_000,
      50,
      10_000,
    ),
    queueSweepHighIntervalMs: clampInt(
      env.ORACLE_QUEUE_SWEEP_HIGH_INTERVAL_MS,
      5_000,
      1_000,
      24 * 60 * 60_000,
    ),
    queueSweepMediumIntervalMs: clampInt(
      env.ORACLE_QUEUE_SWEEP_MEDIUM_INTERVAL_MS,
      15_000,
      1_000,
      24 * 60 * 60_000,
    ),
    queueSweepLowIntervalMs: clampInt(
      env.ORACLE_QUEUE_SWEEP_LOW_INTERVAL_MS,
      60_000,
      1_000,
      24 * 60 * 60_000,
    ),
    queueSweepHighBatch: clampInt(
      env.ORACLE_QUEUE_SWEEP_HIGH_BATCH,
      8,
      0,
      5000,
    ),
    queueSweepMediumBatch: clampInt(
      env.ORACLE_QUEUE_SWEEP_MEDIUM_BATCH,
      3,
      0,
      5000,
    ),
    queueSweepLowBatch: clampInt(
      env.ORACLE_QUEUE_SWEEP_LOW_BATCH,
      1,
      0,
      5000,
    ),
    queueSweepMaxSweepsPerRun: clampInt(
      env.ORACLE_QUEUE_SWEEP_MAX_SWEEPS_PER_RUN,
      3,
      1,
      100,
    ),
    queueEmptyBackoffMinMs: clampInt(
      env.ORACLE_QUEUE_EMPTY_BACKOFF_MIN_MS,
      15_000,
      1_000,
      24 * 60 * 60_000,
    ),
    queueEmptyBackoffMaxMs: clampInt(
      env.ORACLE_QUEUE_EMPTY_BACKOFF_MAX_MS,
      180_000,
      1_000,
      24 * 60 * 60_000,
    ),
    queueMediumPriorityBackoffMultiplier: clampInt(
      env.ORACLE_QUEUE_MEDIUM_PRIORITY_BACKOFF_MULTIPLIER,
      2,
      1,
      100,
    ),
    queueLowPriorityBackoffMultiplier: clampInt(
      env.ORACLE_QUEUE_LOW_PRIORITY_BACKOFF_MULTIPLIER,
      4,
      1,
      100,
    ),
  };
}
