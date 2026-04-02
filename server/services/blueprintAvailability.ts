import type { SupabaseClient } from '@supabase/supabase-js';

type DbClient = SupabaseClient<any, 'public', any>;

export type BlueprintAvailabilitySourceItemLookupRow = {
  id: string | null;
};

export type BlueprintAvailabilityUnlockLookupRow = {
  updated_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
};

export type BlueprintAvailabilityReaders = {
  listSourceItemsByVideoId?: (videoId: string) => Promise<BlueprintAvailabilitySourceItemLookupRow[]>;
  listUnlockRowsBySourceItemIds?: (sourceItemIds: string[]) => Promise<BlueprintAvailabilityUnlockLookupRow[]>;
};

export type BlueprintAvailabilityStatus = 'available' | 'cooldown_active';

export type BlueprintAvailabilityDecision = {
  status: BlueprintAvailabilityStatus;
  videoId: string;
  message: string | null;
  retryAfterSeconds: number;
  cooldownUntilIso: string | null;
  failureSource: 'source_item_unlocks' | 'generation_runs' | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

const BLUEPRINT_UNAVAILABLE_MESSAGE = 'This video isn’t currently available for blueprint generation.';
const DEFAULT_COOLDOWN_HOURS = 24;
const COOLDOWN_TRIGGER_CODES = new Set([
  'TRANSCRIPT_UNAVAILABLE',
  'NO_TRANSCRIPT_PERMANENT',
  'NO_CAPTIONS',
  'TRANSCRIPT_EMPTY',
  'TRANSCRIPT_INSUFFICIENT_CONTEXT',
]);

function clampInt(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function getCooldownHours() {
  return clampInt(process.env.BLUEPRINT_VIDEO_FAILURE_COOLDOWN_HOURS, DEFAULT_COOLDOWN_HOURS, 1, 24 * 14);
}

function getCooldownWindowMs() {
  return getCooldownHours() * 60 * 60 * 1000;
}

function normalizeErrorCode(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function shouldStartCooldown(errorCode: unknown) {
  return COOLDOWN_TRIGGER_CODES.has(normalizeErrorCode(errorCode));
}

function toDateMs(value: unknown) {
  const ms = Date.parse(String(value || '').trim());
  return Number.isFinite(ms) ? ms : null;
}

function buildAvailableDecision(videoId: string): BlueprintAvailabilityDecision {
  return {
    status: 'available',
    videoId,
    message: null,
    retryAfterSeconds: 0,
    cooldownUntilIso: null,
    failureSource: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
}

function buildCooldownDecision(input: {
  videoId: string;
  lastFailureAtMs: number;
  failureSource: 'source_item_unlocks' | 'generation_runs';
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}): BlueprintAvailabilityDecision {
  const cooldownUntilMs = input.lastFailureAtMs + getCooldownWindowMs();
  const retryAfterSeconds = Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000));
  return {
    status: 'cooldown_active',
    videoId: input.videoId,
    message: BLUEPRINT_UNAVAILABLE_MESSAGE,
    retryAfterSeconds,
    cooldownUntilIso: new Date(cooldownUntilMs).toISOString(),
    failureSource: input.failureSource,
    lastErrorCode: input.lastErrorCode,
    lastErrorMessage: input.lastErrorMessage,
  };
}

async function readLatestUnlockCooldownCandidate(
  db: DbClient,
  videoId: string,
  readers?: BlueprintAvailabilityReaders,
) {
  const sourceRows = readers?.listSourceItemsByVideoId
    ? await readers.listSourceItemsByVideoId(videoId)
    : await (async () => {
      const { data, error } = await db
        .from('source_items')
        .select('id')
        .eq('source_native_id', videoId);
      if (error) throw error;
      return (data || []) as BlueprintAvailabilitySourceItemLookupRow[];
    })();

  const sourceItemIds = Array.from(new Set((sourceRows || []).map((row: any) => String(row?.id || '').trim()).filter(Boolean)));
  if (sourceItemIds.length === 0) return null;

  const unlockRows = readers?.listUnlockRowsBySourceItemIds
    ? await readers.listUnlockRowsBySourceItemIds(sourceItemIds)
    : await (async () => {
      const { data, error } = await db
        .from('source_item_unlocks')
        .select('updated_at, last_error_code, last_error_message')
        .in('source_item_id', sourceItemIds);
      if (error) throw error;
      return (data || []) as BlueprintAvailabilityUnlockLookupRow[];
    })();

  let latest: {
    atMs: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  } | null = null;

  for (const row of (unlockRows || [])) {
    const lastErrorCode = normalizeErrorCode((row as any)?.last_error_code);
    if (!shouldStartCooldown(lastErrorCode)) continue;
    const atMs = toDateMs((row as any)?.updated_at);
    if (atMs == null) continue;
    if (!latest || atMs > latest.atMs) {
      latest = {
        atMs,
        lastErrorCode: lastErrorCode || null,
        lastErrorMessage: String((row as any)?.last_error_message || '').trim() || null,
      };
    }
  }

  return latest;
}

async function readLatestGenerationRunCooldownCandidate(db: DbClient, videoId: string) {
  const { data, error } = await db
    .from('generation_runs')
    .select('updated_at, error_code, error_message')
    .eq('video_id', videoId)
    .eq('status', 'failed');
  if (error) throw error;

  let latest: {
    atMs: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  } | null = null;

  for (const row of (data || [])) {
    const lastErrorCode = normalizeErrorCode((row as any)?.error_code);
    if (!shouldStartCooldown(lastErrorCode)) continue;
    const atMs = toDateMs((row as any)?.updated_at);
    if (atMs == null) continue;
    if (!latest || atMs > latest.atMs) {
      latest = {
        atMs,
        lastErrorCode: lastErrorCode || null,
        lastErrorMessage: String((row as any)?.error_message || '').trim() || null,
      };
    }
  }

  return latest;
}

export async function getBlueprintAvailabilityForVideo(
  db: DbClient,
  videoId: string,
  readers?: BlueprintAvailabilityReaders,
): Promise<BlueprintAvailabilityDecision> {
  const normalizedVideoId = String(videoId || '').trim();
  if (!normalizedVideoId) return buildAvailableDecision('');
  if (!db || typeof (db as any).from !== 'function') {
    return buildAvailableDecision(normalizedVideoId);
  }

  const [unlockCandidate, generationCandidate] = await Promise.all([
    readLatestUnlockCooldownCandidate(db, normalizedVideoId, readers),
    readLatestGenerationRunCooldownCandidate(db, normalizedVideoId),
  ]);

  const cooldownWindowMs = getCooldownWindowMs();
  const nowMs = Date.now();
  const candidates = [
    unlockCandidate
      ? { ...unlockCandidate, failureSource: 'source_item_unlocks' as const }
      : null,
    generationCandidate
      ? { ...generationCandidate, failureSource: 'generation_runs' as const }
      : null,
  ].filter(Boolean) as Array<{
    atMs: number;
    failureSource: 'source_item_unlocks' | 'generation_runs';
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  }>;

  let latest = candidates[0] || null;
  for (const candidate of candidates.slice(1)) {
    if (!latest || candidate.atMs > latest.atMs) latest = candidate;
  }

  if (!latest) return buildAvailableDecision(normalizedVideoId);
  if (latest.atMs + cooldownWindowMs <= nowMs) return buildAvailableDecision(normalizedVideoId);

  return buildCooldownDecision({
    videoId: normalizedVideoId,
    lastFailureAtMs: latest.atMs,
    failureSource: latest.failureSource,
    lastErrorCode: latest.lastErrorCode,
    lastErrorMessage: latest.lastErrorMessage,
  });
}

export function getBlueprintUnavailableMessage() {
  return BLUEPRINT_UNAVAILABLE_MESSAGE;
}
