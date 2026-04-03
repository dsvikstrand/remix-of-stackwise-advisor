import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import type { QueuePriorityTier } from './queuePriority';

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

export function buildOracleQueueClaimKey(input: {
  tier?: QueuePriorityTier | null;
  scopes: readonly string[];
  maxJobs: number;
}) {
  const tier = normalizeTier(input.tier);
  const scopes = normalizeScopes(input.scopes);
  const maxJobs = Math.max(1, Math.floor(Number(input.maxJobs) || 1));
  return `tier=${tier}|max=${maxJobs}|scopes=${scopes.join(',')}`;
}

function getBackoffMultiplier(input: {
  tier: QueuePriorityTier;
  mediumPriorityMultiplier: number;
  lowPriorityMultiplier: number;
}) {
  if (input.tier === 'low') return input.lowPriorityMultiplier;
  if (input.tier === 'medium') return input.mediumPriorityMultiplier;
  return 1;
}

export type OracleQueueClaimGovernorConfig = {
  emptyBackoffMinMs: number;
  emptyBackoffMaxMs: number;
  mediumPriorityMultiplier: number;
  lowPriorityMultiplier: number;
};

export async function shouldAttemptOracleQueueClaim(input: {
  controlDb: OracleControlPlaneDb;
  tier?: QueuePriorityTier | null;
  scopes: readonly string[];
  maxJobs: number;
  nowIso?: string;
}) {
  const tier = normalizeTier(input.tier);
  const claimKey = buildOracleQueueClaimKey({
    tier,
    scopes: input.scopes,
    maxJobs: input.maxJobs,
  });
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const nowMs = parseDateMs(nowIso) ?? Date.now();

  const row = await input.controlDb.db
    .selectFrom('queue_claim_control_state')
    .selectAll()
    .where('claim_key', '=', claimKey)
    .executeTakeFirst();

  const nextAllowedAt = normalizeIsoOrNull(row?.next_allowed_claim_at || null);
  const nextAllowedMs = parseDateMs(nextAllowedAt);
  return {
    allowed: nextAllowedMs == null || nextAllowedMs <= nowMs,
    claimKey,
    nextAllowedAt,
    consecutiveEmptyClaims: clampInt(row?.consecutive_empty_claims, 0, 0, 1_000_000),
  };
}

export async function recordOracleQueueClaimResult(input: {
  controlDb: OracleControlPlaneDb;
  config: OracleQueueClaimGovernorConfig;
  tier?: QueuePriorityTier | null;
  scopes: readonly string[];
  maxJobs: number;
  claimedCount: number;
  nowIso?: string;
}) {
  const tier = normalizeTier(input.tier);
  const scopeKey = normalizeScopes(input.scopes).join(',');
  const claimKey = buildOracleQueueClaimKey({
    tier,
    scopes: input.scopes,
    maxJobs: input.maxJobs,
  });
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const claimedCount = Math.max(0, Math.floor(Number(input.claimedCount) || 0));
  const existing = await input.controlDb.db
    .selectFrom('queue_claim_control_state')
    .selectAll()
    .where('claim_key', '=', claimKey)
    .executeTakeFirst();

  const previousEmptyClaims = clampInt(existing?.consecutive_empty_claims, 0, 0, 1_000_000);
  const nextEmptyClaims = claimedCount > 0 ? 0 : previousEmptyClaims + 1;
  const multiplier = getBackoffMultiplier({
    tier,
    mediumPriorityMultiplier: clampInt(input.config.mediumPriorityMultiplier, 2, 1, 100),
    lowPriorityMultiplier: clampInt(input.config.lowPriorityMultiplier, 4, 1, 100),
  });
  const minBackoffMs = clampInt(input.config.emptyBackoffMinMs, 15_000, 1_000, 24 * 60 * 60_000);
  const maxBackoffMs = clampInt(input.config.emptyBackoffMaxMs, 180_000, minBackoffMs, 24 * 60 * 60_000);
  const rawDelayMs = minBackoffMs * multiplier * (2 ** Math.max(0, nextEmptyClaims - 1));
  const nextAllowedAt = claimedCount > 0
    ? null
    : addMsToIso(nowIso, Math.min(maxBackoffMs, rawDelayMs));

  await input.controlDb.db
    .insertInto('queue_claim_control_state')
    .values({
      claim_key: claimKey,
      priority_tier: tier,
      scope_key: scopeKey,
      next_allowed_claim_at: nextAllowedAt,
      last_attempted_at: nowIso,
      last_claimed_at: claimedCount > 0 ? nowIso : (existing?.last_claimed_at || null),
      consecutive_empty_claims: nextEmptyClaims,
      last_claimed_count: claimedCount,
      updated_at: nowIso,
    })
    .onConflict((oc) => oc.column('claim_key').doUpdateSet({
      priority_tier: tier,
      scope_key: scopeKey,
      next_allowed_claim_at: nextAllowedAt,
      last_attempted_at: nowIso,
      last_claimed_at: claimedCount > 0 ? nowIso : (existing?.last_claimed_at || null),
      consecutive_empty_claims: nextEmptyClaims,
      last_claimed_count: claimedCount,
      updated_at: nowIso,
    }))
    .execute();
}

export async function clearOracleQueueClaimCooldowns(input: {
  controlDb: OracleControlPlaneDb;
  tier?: QueuePriorityTier | null;
  scopes: readonly string[];
  maxJobs: number;
  nowIso?: string;
}) {
  const tier = normalizeTier(input.tier);
  const scopeKey = normalizeScopes(input.scopes).join(',');
  const claimKey = buildOracleQueueClaimKey({
    tier,
    scopes: input.scopes,
    maxJobs: input.maxJobs,
  });
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();

  await input.controlDb.db
    .insertInto('queue_claim_control_state')
    .values({
      claim_key: claimKey,
      priority_tier: tier,
      scope_key: scopeKey,
      next_allowed_claim_at: null,
      last_attempted_at: null,
      last_claimed_at: null,
      consecutive_empty_claims: 0,
      last_claimed_count: 0,
      updated_at: nowIso,
    })
    .onConflict((oc) => oc.column('claim_key').doUpdateSet({
      priority_tier: tier,
      scope_key: scopeKey,
      next_allowed_claim_at: null,
      consecutive_empty_claims: 0,
      updated_at: nowIso,
    }))
    .execute();
}
