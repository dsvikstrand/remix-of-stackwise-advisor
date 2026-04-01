import type { OracleControlPlaneConfig } from './oracleControlPlaneConfig';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import type { QueuePriorityTier } from './queuePriority';
import type { QueueSweepPlanEntry } from './queuedIngestionWorkerController';

function parseDateMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIsoOrNull(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function addMsToIso(iso: string, ms: number) {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed + Math.max(0, Math.floor(ms))).toISOString();
}

function clampInt(raw: number | string | null | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeTier(tier?: QueuePriorityTier | null) {
  if (tier === 'high' || tier === 'medium' || tier === 'low') return tier;
  return 'medium' as const;
}

function normalizeScopes(scopes: readonly string[]) {
  return [...new Set(
    scopes
      .map((scope) => String(scope || '').trim())
      .filter(Boolean),
  )].sort();
}

function getSweepIntervalMs(input: {
  tier: QueuePriorityTier;
  config: Pick<
    OracleControlPlaneConfig,
    'queueSweepHighIntervalMs' | 'queueSweepMediumIntervalMs' | 'queueSweepLowIntervalMs'
  >;
}) {
  if (input.tier === 'high') return input.config.queueSweepHighIntervalMs;
  if (input.tier === 'low') return input.config.queueSweepLowIntervalMs;
  return input.config.queueSweepMediumIntervalMs;
}

function getBackoffMultiplier(input: {
  tier: QueuePriorityTier;
  config: Pick<
    OracleControlPlaneConfig,
    'queueMediumPriorityBackoffMultiplier' | 'queueLowPriorityBackoffMultiplier'
  >;
}) {
  if (input.tier === 'low') return input.config.queueLowPriorityBackoffMultiplier;
  if (input.tier === 'medium') return input.config.queueMediumPriorityBackoffMultiplier;
  return 1;
}

function resolveSweepInflightMs(input: {
  tier: QueuePriorityTier;
  config: Pick<
    OracleControlPlaneConfig,
    'queueSweepHighIntervalMs' | 'queueSweepMediumIntervalMs' | 'queueSweepLowIntervalMs'
  >;
}) {
  const intervalMs = getSweepIntervalMs(input);
  return Math.max(5_000, Math.min(60_000, intervalMs));
}

export function buildOracleQueueSweepKey(input: {
  tier?: QueuePriorityTier | null;
  scopes: readonly string[];
  maxJobs: number;
}) {
  const tier = normalizeTier(input.tier);
  const scopes = normalizeScopes(input.scopes);
  const maxJobs = Math.max(1, Math.floor(Number(input.maxJobs) || 1));
  return `tier=${tier}|max=${maxJobs}|scopes=${scopes.join(',')}`;
}

export async function selectDueOracleQueueSweeps(input: {
  controlDb: OracleControlPlaneDb;
  config: Pick<
    OracleControlPlaneConfig,
    'queueSweepHighIntervalMs'
    | 'queueSweepMediumIntervalMs'
    | 'queueSweepLowIntervalMs'
    | 'queueSweepMaxSweepsPerRun'
  >;
  basePlan: readonly QueueSweepPlanEntry[];
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const nowMs = parseDateMs(nowIso) ?? Date.now();
  const maxSweepsPerRun = clampInt(input.config.queueSweepMaxSweepsPerRun, 3, 1, 50);
  const selected: QueueSweepPlanEntry[] = [];

  for (const planEntry of input.basePlan) {
    if (selected.length >= maxSweepsPerRun) break;
    const tier = normalizeTier(planEntry.tier);
    const scopeKey = normalizeScopes(planEntry.scopes).join(',');
    const sweepKey = buildOracleQueueSweepKey({
      tier,
      scopes: planEntry.scopes,
      maxJobs: planEntry.maxJobs,
    });
    const row = await input.controlDb.db
      .selectFrom('queue_sweep_control_state')
      .selectAll()
      .where('sweep_key', '=', sweepKey)
      .executeTakeFirst();

    const inflightUntilMs = parseDateMs(row?.inflight_until);
    if (inflightUntilMs != null && inflightUntilMs > nowMs) {
      continue;
    }

    const nextDueMs = parseDateMs(row?.next_due_at);
    if (nextDueMs != null && nextDueMs > nowMs) {
      continue;
    }

    const inflightUntil = addMsToIso(nowIso, resolveSweepInflightMs({
      tier,
      config: input.config,
    }));

    await input.controlDb.db
      .insertInto('queue_sweep_control_state')
      .values({
        sweep_key: sweepKey,
        priority_tier: tier,
        scope_key: scopeKey,
        next_due_at: row?.next_due_at || nowIso,
        last_attempted_at: row?.last_attempted_at || null,
        last_claimed_at: row?.last_claimed_at || null,
        consecutive_empty_sweeps: clampInt(row?.consecutive_empty_sweeps, 0, 0, 1_000_000),
        last_claimed_count: clampInt(row?.last_claimed_count, 0, 0, 1_000_000),
        last_batch_size: Math.max(0, Math.floor(Number(row?.last_batch_size) || 0)) || Math.max(1, Math.floor(Number(planEntry.maxJobs) || 1)),
        inflight_until: inflightUntil,
        updated_at: nowIso,
      })
      .onConflict((oc) => oc.column('sweep_key').doUpdateSet({
        priority_tier: tier,
        scope_key: scopeKey,
        inflight_until: inflightUntil,
        last_batch_size: Math.max(1, Math.floor(Number(planEntry.maxJobs) || 1)),
        updated_at: nowIso,
      }))
      .execute();

    selected.push(planEntry);
  }

  return selected;
}

export async function recordOracleQueueSweepResult(input: {
  controlDb: OracleControlPlaneDb;
  config: Pick<
    OracleControlPlaneConfig,
    'queueSweepHighIntervalMs'
    | 'queueSweepMediumIntervalMs'
    | 'queueSweepLowIntervalMs'
    | 'queueEmptyBackoffMinMs'
    | 'queueEmptyBackoffMaxMs'
    | 'queueMediumPriorityBackoffMultiplier'
    | 'queueLowPriorityBackoffMultiplier'
  >;
  tier?: QueuePriorityTier | null;
  scopes: readonly string[];
  maxJobs: number;
  claimedCount: number;
  nowIso?: string;
}) {
  const tier = normalizeTier(input.tier);
  const scopeKey = normalizeScopes(input.scopes).join(',');
  const sweepKey = buildOracleQueueSweepKey({
    tier,
    scopes: input.scopes,
    maxJobs: input.maxJobs,
  });
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const claimedCount = Math.max(0, Math.floor(Number(input.claimedCount) || 0));
  const maxJobs = Math.max(1, Math.floor(Number(input.maxJobs) || 1));
  const existing = await input.controlDb.db
    .selectFrom('queue_sweep_control_state')
    .selectAll()
    .where('sweep_key', '=', sweepKey)
    .executeTakeFirst();

  const previousEmptySweeps = clampInt(existing?.consecutive_empty_sweeps, 0, 0, 1_000_000);
  const nextEmptySweeps = claimedCount > 0 ? 0 : previousEmptySweeps + 1;
  const intervalMs = getSweepIntervalMs({
    tier,
    config: input.config,
  });
  const backoffMultiplier = getBackoffMultiplier({
    tier,
    config: input.config,
  });
  const minBackoffMs = clampInt(input.config.queueEmptyBackoffMinMs, 15_000, 1_000, 24 * 60 * 60_000);
  const maxBackoffMs = clampInt(input.config.queueEmptyBackoffMaxMs, 180_000, minBackoffMs, 24 * 60 * 60_000);
  const emptyBackoffMs = Math.min(
    maxBackoffMs,
    minBackoffMs * backoffMultiplier * (2 ** Math.max(0, nextEmptySweeps - 1)),
  );

  let nextDueAt = addMsToIso(nowIso, intervalMs);
  if (claimedCount === 0) {
    nextDueAt = addMsToIso(nowIso, Math.max(intervalMs, emptyBackoffMs));
  } else if (claimedCount >= maxJobs) {
    nextDueAt = addMsToIso(nowIso, Math.min(intervalMs, minBackoffMs));
  }

  await input.controlDb.db
    .insertInto('queue_sweep_control_state')
    .values({
      sweep_key: sweepKey,
      priority_tier: tier,
      scope_key: scopeKey,
      next_due_at: nextDueAt,
      last_attempted_at: nowIso,
      last_claimed_at: claimedCount > 0 ? nowIso : (existing?.last_claimed_at || null),
      consecutive_empty_sweeps: nextEmptySweeps,
      last_claimed_count: claimedCount,
      last_batch_size: maxJobs,
      inflight_until: null,
      updated_at: nowIso,
    })
    .onConflict((oc) => oc.column('sweep_key').doUpdateSet({
      priority_tier: tier,
      scope_key: scopeKey,
      next_due_at: nextDueAt,
      last_attempted_at: nowIso,
      last_claimed_at: claimedCount > 0 ? nowIso : (existing?.last_claimed_at || null),
      consecutive_empty_sweeps: nextEmptySweeps,
      last_claimed_count: claimedCount,
      last_batch_size: maxJobs,
      inflight_until: null,
      updated_at: nowIso,
    }))
    .execute();
}

export async function getOracleQueueSweepNextDelayMs(input: {
  controlDb: OracleControlPlaneDb;
  basePlan: readonly QueueSweepPlanEntry[];
  fallbackMs: number;
  minDelayMs?: number;
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const nowMs = parseDateMs(nowIso) ?? Date.now();
  const minDelayMs = Math.max(0, Math.floor(Number(input.minDelayMs) || 0));
  let soonestDelayMs: number | null = null;

  for (const planEntry of input.basePlan) {
    const sweepKey = buildOracleQueueSweepKey({
      tier: planEntry.tier,
      scopes: planEntry.scopes,
      maxJobs: planEntry.maxJobs,
    });
    const row = await input.controlDb.db
      .selectFrom('queue_sweep_control_state')
      .select(['next_due_at', 'inflight_until'])
      .where('sweep_key', '=', sweepKey)
      .executeTakeFirst();

    if (!row) {
      return 0;
    }

    const nextDueMs = parseDateMs(row.next_due_at);
    if (nextDueMs == null || nextDueMs <= nowMs) {
      return 0;
    }

    const inflightUntilMs = parseDateMs(row.inflight_until);
    const effectiveDelayMs = inflightUntilMs != null && inflightUntilMs > nowMs
      ? Math.min(nextDueMs, inflightUntilMs) - nowMs
      : nextDueMs - nowMs;

    if (soonestDelayMs == null || effectiveDelayMs < soonestDelayMs) {
      soonestDelayMs = effectiveDelayMs;
    }
  }

  if (soonestDelayMs == null) {
    return Math.max(minDelayMs, Math.floor(Number(input.fallbackMs) || 0));
  }

  return Math.max(minDelayMs, soonestDelayMs);
}
