import type { SupabaseClient } from '@supabase/supabase-js';

type DbClient = SupabaseClient<any, 'public', any>;

const MANUAL_UNLOCK_COST = 1.0;
const UNLOCK_COST_SCALE = 1000;

function round3(value: number) {
  return Math.round(value * UNLOCK_COST_SCALE) / UNLOCK_COST_SCALE;
}

function asNumber(value: string | number | null | undefined, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeTranscriptProbeMeta(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeTranscriptStatus(value: unknown): UnlockTranscriptStatus {
  const normalized = String(value || '').trim();
  if (
    normalized === 'unknown'
    || normalized === 'retrying'
    || normalized === 'confirmed_no_speech'
    || normalized === 'transient_error'
  ) {
    return normalized;
  }
  return 'unknown';
}

export type SourceUnlockStatus = 'available' | 'reserved' | 'processing' | 'ready';
export type UnlockTranscriptStatus = 'unknown' | 'retrying' | 'confirmed_no_speech' | 'transient_error';

const unlockSelect =
  'id, source_item_id, source_page_id, status, estimated_cost, reserved_by_user_id, reservation_expires_at, reserved_ledger_id, auto_unlock_intent_id, blueprint_id, job_id, last_error_code, last_error_message, transcript_status, transcript_attempt_count, transcript_no_caption_hits, transcript_last_probe_at, transcript_retry_after, transcript_probe_meta, created_at, updated_at';

export type SourceItemUnlockRow = {
  id: string;
  source_item_id: string;
  source_page_id: string | null;
  status: SourceUnlockStatus;
  estimated_cost: string | number;
  reserved_by_user_id: string | null;
  reservation_expires_at: string | null;
  reserved_ledger_id: string | null;
  auto_unlock_intent_id?: string | null;
  blueprint_id: string | null;
  job_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  transcript_status?: UnlockTranscriptStatus | string | null;
  transcript_attempt_count?: number | null;
  transcript_no_caption_hits?: number | null;
  transcript_last_probe_at?: string | null;
  transcript_retry_after?: string | null;
  transcript_probe_meta?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export function normalizeSupabaseUnlockShadowRow(input: {
  row: SourceItemUnlockRow;
  oracleQueuePrimaryEnabled: boolean;
}) {
  if (!input.oracleQueuePrimaryEnabled || !input.row.job_id) {
    return input.row;
  }

  return {
    ...input.row,
    job_id: null,
  };
}

export function computeUnlockCost(activeSubscriberCount: number) {
  void activeSubscriberCount;
  return round3(MANUAL_UNLOCK_COST);
}

async function readUnlockBySourceItemId(db: DbClient, sourceItemId: string) {
  const { data, error } = await db
    .from('source_item_unlocks')
    .select(unlockSelect)
    .eq('source_item_id', sourceItemId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SourceItemUnlockRow | null;
}

async function readUnlockById(db: DbClient, unlockId: string) {
  const { data, error } = await db
    .from('source_item_unlocks')
    .select(unlockSelect)
    .eq('id', unlockId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SourceItemUnlockRow | null;
}

export async function getSourceItemUnlockBySourceItemId(db: DbClient, sourceItemId: string) {
  return readUnlockBySourceItemId(db, sourceItemId);
}

export async function getSourceItemUnlockById(db: DbClient, unlockId: string) {
  return readUnlockById(db, unlockId);
}

export async function getSourceItemUnlocksBySourceItemIds(db: DbClient, sourceItemIds: string[]) {
  const uniqueIds = Array.from(new Set(sourceItemIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [] as SourceItemUnlockRow[];

  const { data, error } = await db
    .from('source_item_unlocks')
    .select(unlockSelect)
    .in('source_item_id', uniqueIds);
  if (error) throw error;
  return (data || []) as SourceItemUnlockRow[];
}

export async function countActiveSubscribersForSourcePage(db: DbClient, sourcePageId: string | null) {
  const pageId = String(sourcePageId || '').trim();
  if (!pageId) return 0;

  const { count, error } = await db
    .from('user_source_subscriptions')
    .select('id', { head: true, count: 'exact' })
    .eq('source_page_id', pageId)
    .eq('is_active', true);
  if (error) throw error;
  return Number(count || 0);
}

export async function ensureSourceItemUnlock(db: DbClient, input: {
  sourceItemId: string;
  sourcePageId?: string | null;
  estimatedCost: number;
}) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId) throw new Error('SOURCE_ITEM_REQUIRED');

  const existing = await readUnlockBySourceItemId(db, sourceItemId);
  if (existing) {
    const nextCost = round3(input.estimatedCost);
    const currentCost = round3(asNumber(existing.estimated_cost, 1));
    const nextSourcePageId = input.sourcePageId || existing.source_page_id || null;

    if (currentCost !== nextCost || nextSourcePageId !== existing.source_page_id) {
      const { data, error } = await db
        .from('source_item_unlocks')
        .update({
          estimated_cost: nextCost,
          source_page_id: nextSourcePageId,
          transcript_status: normalizeTranscriptStatus(existing.transcript_status),
          transcript_probe_meta: normalizeTranscriptProbeMeta(existing.transcript_probe_meta),
        })
        .eq('id', existing.id)
        .select(unlockSelect)
        .single();
      if (error) throw error;
      return data as SourceItemUnlockRow;
    }

    return existing;
  }

  const { data, error } = await db
    .from('source_item_unlocks')
    .insert({
      source_item_id: sourceItemId,
      source_page_id: input.sourcePageId || null,
      status: 'available',
      estimated_cost: round3(input.estimatedCost),
      transcript_status: 'unknown',
      transcript_probe_meta: {},
    })
    .select(unlockSelect)
    .single();

  if (error) {
    const code = String((error as { code?: string }).code || '').trim();
    if (code === '23505') {
      const reloaded = await readUnlockBySourceItemId(db, sourceItemId);
      if (reloaded) return reloaded;
    }
    throw error;
  }

  return data as SourceItemUnlockRow;
}

export type ReserveUnlockResult =
  | { ok: true; state: 'ready'; unlock: SourceItemUnlockRow; reservedNow: false }
  | { ok: true; state: 'in_progress'; unlock: SourceItemUnlockRow; reservedNow: false }
  | { ok: true; state: 'reserved'; unlock: SourceItemUnlockRow; reservedNow: boolean };

function isExpired(isoValue: string | null | undefined) {
  if (!isoValue) return false;
  const ms = Date.parse(isoValue);
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

async function transitionToAvailable(db: DbClient, unlock: SourceItemUnlockRow) {
  const { data, error } = await db
    .from('source_item_unlocks')
    .update({
      status: 'available',
      reserved_by_user_id: null,
      reservation_expires_at: null,
      reserved_ledger_id: null,
      auto_unlock_intent_id: null,
      transcript_probe_meta: normalizeTranscriptProbeMeta(unlock.transcript_probe_meta),
    })
    .eq('id', unlock.id)
    .eq('updated_at', unlock.updated_at)
    .select(unlockSelect)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SourceItemUnlockRow | null;
}

export async function reserveUnlock(db: DbClient, input: {
  unlock: SourceItemUnlockRow;
  userId: string;
  estimatedCost: number;
  reservationSeconds: number;
}) : Promise<ReserveUnlockResult> {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('AUTH_REQUIRED');

  let unlock = input.unlock;

  if (unlock.status === 'ready' && unlock.blueprint_id) {
    return { ok: true, state: 'ready', unlock, reservedNow: false };
  }

  if (unlock.status === 'reserved' && !isExpired(unlock.reservation_expires_at)) {
    if (unlock.reserved_by_user_id === userId) {
      return { ok: true, state: 'reserved', unlock, reservedNow: false };
    }
    return { ok: true, state: 'in_progress', unlock, reservedNow: false };
  }

  if (unlock.status === 'processing' && !isExpired(unlock.reservation_expires_at)) {
    return { ok: true, state: 'in_progress', unlock, reservedNow: false };
  }

  if ((unlock.status === 'reserved' || unlock.status === 'processing') && isExpired(unlock.reservation_expires_at)) {
    const reset = await transitionToAvailable(db, unlock);
    if (reset) unlock = reset;
    else {
      const reloaded = await readUnlockBySourceItemId(db, unlock.source_item_id);
      if (reloaded) unlock = reloaded;
    }
  }

  if (unlock.status === 'ready' && unlock.blueprint_id) {
    return { ok: true, state: 'ready', unlock, reservedNow: false };
  }
  if (unlock.status === 'processing') {
    return { ok: true, state: 'in_progress', unlock, reservedNow: false };
  }

  const reservationExpiresAt = new Date(Date.now() + Math.max(30, input.reservationSeconds) * 1000).toISOString();
  const { data, error } = await db
    .from('source_item_unlocks')
    .update({
      status: 'reserved',
      estimated_cost: round3(input.estimatedCost),
      reserved_by_user_id: userId,
      reservation_expires_at: reservationExpiresAt,
      auto_unlock_intent_id: unlock.auto_unlock_intent_id || null,
      last_error_code: null,
      last_error_message: null,
      transcript_probe_meta: normalizeTranscriptProbeMeta(unlock.transcript_probe_meta),
    })
    .eq('id', unlock.id)
    .eq('updated_at', unlock.updated_at)
    .select(unlockSelect)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const reloaded = await readUnlockBySourceItemId(db, unlock.source_item_id);
    if (!reloaded) throw new Error('UNLOCK_NOT_FOUND');
    if (reloaded.status === 'ready' && reloaded.blueprint_id) {
      return { ok: true, state: 'ready', unlock: reloaded, reservedNow: false };
    }
    return { ok: true, state: 'in_progress', unlock: reloaded, reservedNow: false };
  }

  return {
    ok: true,
    state: 'reserved',
    unlock: data as SourceItemUnlockRow,
    reservedNow: true,
  };
}

export async function attachReservationLedger(db: DbClient, input: {
  unlockId: string;
  userId: string;
  ledgerId: string | null;
  amount: number;
}) {
  const { data, error } = await db
    .from('source_item_unlocks')
    .update({
      reserved_ledger_id: input.ledgerId,
      estimated_cost: round3(input.amount),
      status: 'reserved',
      reserved_by_user_id: input.userId,
      auto_unlock_intent_id: null,
    })
    .eq('id', input.unlockId)
    .select(unlockSelect)
    .single();
  if (error) throw error;
  return data as SourceItemUnlockRow;
}

export async function attachAutoUnlockIntent(db: DbClient, input: {
  unlockId: string;
  userId: string;
  intentId: string | null;
  amount: number;
}) {
  const { data, error } = await db
    .from('source_item_unlocks')
    .update({
      auto_unlock_intent_id: input.intentId,
      estimated_cost: round3(input.amount),
      status: 'reserved',
      reserved_by_user_id: input.userId,
      reserved_ledger_id: null,
    })
    .eq('id', input.unlockId)
    .select(unlockSelect)
    .single();
  if (error) throw error;
  return data as SourceItemUnlockRow;
}

export async function markUnlockProcessing(db: DbClient, input: {
  unlockId: string;
  userId: string;
  jobId: string;
  reservationSeconds?: number;
}) {
  const { data, error } = await db
    .from('source_item_unlocks')
    .update({
      status: 'processing',
      job_id: input.jobId,
      reservation_expires_at: new Date(Date.now() + Math.max(30, input.reservationSeconds || 300) * 1000).toISOString(),
    })
    .eq('id', input.unlockId)
    .eq('reserved_by_user_id', input.userId)
    .eq('status', 'reserved')
    .select(unlockSelect)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as SourceItemUnlockRow | null;
}

export async function completeUnlock(db: DbClient, input: {
  unlockId: string;
  blueprintId: string;
  jobId: string;
  expectedJobId?: string;
}) {
  let query = db
    .from('source_item_unlocks')
    .update({
      status: 'ready',
      blueprint_id: input.blueprintId,
      job_id: input.jobId,
      reserved_by_user_id: null,
      reservation_expires_at: null,
      reserved_ledger_id: null,
      auto_unlock_intent_id: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq('id', input.unlockId)
    .eq('status', 'processing')
    .eq('job_id', input.expectedJobId || input.jobId)
    .select(unlockSelect)
    .maybeSingle();
  const { data, error } = await query;
  if (error) throw error;
  if (!data) {
    const reloaded = await readUnlockById(db, input.unlockId);
    if (!reloaded) throw new Error('UNLOCK_NOT_FOUND');
    return reloaded;
  }
  return data as SourceItemUnlockRow;
}

export async function failUnlock(db: DbClient, input: {
  unlockId: string;
  errorCode: string;
  errorMessage: string;
  expectedJobId?: string;
}) {
  let query = db
    .from('source_item_unlocks')
    .update({
      status: 'available',
      reserved_by_user_id: null,
      reservation_expires_at: null,
      reserved_ledger_id: null,
      auto_unlock_intent_id: null,
      job_id: null,
      last_error_code: String(input.errorCode || '').slice(0, 120) || 'UNLOCK_GENERATION_FAILED',
      last_error_message: String(input.errorMessage || '').slice(0, 500),
    })
    .eq('id', input.unlockId)
    .in('status', ['processing', 'reserved'])
    .select(unlockSelect)
    .maybeSingle();
  if (input.expectedJobId) {
    query = query.eq('job_id', input.expectedJobId);
  }
  const { data, error } = await query;
  if (error) throw error;
  if (!data) {
    const reloaded = await readUnlockById(db, input.unlockId);
    if (!reloaded) throw new Error('UNLOCK_NOT_FOUND');
    return reloaded;
  }
  return data as SourceItemUnlockRow;
}

export async function findExpiredReservedUnlocks(db: DbClient, limit = 100) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('source_item_unlocks')
    .select(unlockSelect)
    .eq('status', 'reserved')
    .not('reservation_expires_at', 'is', null)
    .lt('reservation_expires_at', nowIso)
    .limit(Math.max(1, Math.min(500, limit)));
  if (error) throw error;
  return (data || []) as SourceItemUnlockRow[];
}
