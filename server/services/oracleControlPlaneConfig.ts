import path from 'node:path';
import { parseRuntimeFlag } from './runtimeConfig';

export type OracleSubscriptionSchedulerMode = 'supabase' | 'shadow' | 'primary';

export type OracleControlPlaneConfig = {
  enabled: boolean;
  subscriptionSchedulerMode: OracleSubscriptionSchedulerMode;
  sqlitePath: string;
  bootstrapBatch: number;
  schedulerTickMs: number;
  primaryMinTriggerIntervalMs: number;
  primaryBatchLimit: number;
  shadowBatchLimit: number;
  shadowLookaheadMs: number;
  activeRevisitMs: number;
  normalRevisitMs: number;
  quietRevisitMs: number;
  errorRetryMs: number;
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
    sqlitePath,
    bootstrapBatch: clampInt(env.ORACLE_SUBSCRIPTION_BOOTSTRAP_BATCH, 250, 10, 5000),
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
    shadowBatchLimit: clampInt(env.ORACLE_SUBSCRIPTION_SHADOW_BATCH_LIMIT, 75, 1, 5000),
    shadowLookaheadMs: clampInt(env.ORACLE_SUBSCRIPTION_SHADOW_LOOKAHEAD_MS, 60_000, 0, 60 * 60_000),
    activeRevisitMs: clampInt(env.ORACLE_SUBSCRIPTION_REVISIT_ACTIVE_MS, 15 * 60_000, 60_000, 24 * 60 * 60_000),
    normalRevisitMs: clampInt(env.ORACLE_SUBSCRIPTION_REVISIT_NORMAL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
    quietRevisitMs: clampInt(env.ORACLE_SUBSCRIPTION_REVISIT_QUIET_MS, 90 * 60_000, 60_000, 7 * 24 * 60 * 60_000),
    errorRetryMs: clampInt(env.ORACLE_SUBSCRIPTION_RETRY_ERROR_MS, 15 * 60_000, 60_000, 24 * 60 * 60_000),
  };
}
