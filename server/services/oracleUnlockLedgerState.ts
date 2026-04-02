import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

type DbClient = SupabaseClient<any, 'public', any>;

export type OracleUnlockLedgerRow = {
  id: string;
  source_item_id: string;
  source_page_id: string | null;
  status: string;
  estimated_cost: number;
  reserved_by_user_id: string | null;
  reservation_expires_at: string | null;
  reserved_ledger_id: string | null;
  auto_unlock_intent_id: string | null;
  blueprint_id: string | null;
  job_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  transcript_status: string | null;
  transcript_attempt_count: number;
  transcript_no_caption_hits: number;
  transcript_last_probe_at: string | null;
  transcript_retry_after: string | null;
  transcript_probe_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const UNLOCK_LEDGER_SELECT = [
  'id',
  'source_item_id',
  'source_page_id',
  'status',
  'estimated_cost',
  'reserved_by_user_id',
  'reservation_expires_at',
  'reserved_ledger_id',
  'auto_unlock_intent_id',
  'blueprint_id',
  'job_id',
  'last_error_code',
  'last_error_message',
  'transcript_status',
  'transcript_attempt_count',
  'transcript_no_caption_hits',
  'transcript_last_probe_at',
  'transcript_retry_after',
  'transcript_probe_meta',
  'created_at',
  'updated_at',
].join(', ');

function normalizeIsoOrNull(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeRequiredIso(value: unknown, fallbackIso?: string) {
  return normalizeIsoOrNull(value) || fallbackIso || new Date().toISOString();
}

function normalizeStringOrNull(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeInt(value: unknown, fallback = 0, min = 0, max = 100_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function mapUnlockLedgerRow(row: Record<string, unknown>, nowIso?: string): OracleUnlockLedgerRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim() || randomUUID(),
    source_item_id: String(row.source_item_id || '').trim(),
    source_page_id: normalizeStringOrNull(row.source_page_id),
    status: String(row.status || '').trim() || 'available',
    estimated_cost: normalizeNumber(row.estimated_cost),
    reserved_by_user_id: normalizeStringOrNull(row.reserved_by_user_id),
    reservation_expires_at: normalizeIsoOrNull(row.reservation_expires_at),
    reserved_ledger_id: normalizeStringOrNull(row.reserved_ledger_id),
    auto_unlock_intent_id: normalizeStringOrNull(row.auto_unlock_intent_id),
    blueprint_id: normalizeStringOrNull(row.blueprint_id),
    job_id: normalizeStringOrNull(row.job_id),
    last_error_code: normalizeStringOrNull(row.last_error_code),
    last_error_message: normalizeStringOrNull(row.last_error_message),
    transcript_status: normalizeStringOrNull(row.transcript_status),
    transcript_attempt_count: normalizeInt(row.transcript_attempt_count),
    transcript_no_caption_hits: normalizeInt(row.transcript_no_caption_hits),
    transcript_last_probe_at: normalizeIsoOrNull(row.transcript_last_probe_at),
    transcript_retry_after: normalizeIsoOrNull(row.transcript_retry_after),
    transcript_probe_meta: normalizeObject(row.transcript_probe_meta),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function writeUnlockLedgerRow(
  controlDb: OracleControlPlaneDb,
  row: OracleUnlockLedgerRow,
  expectedUpdatedAt?: string | null,
) {
  if (expectedUpdatedAt) {
    const result = await controlDb.db
      .updateTable('unlock_ledger_state')
      .set({
        source_item_id: row.source_item_id,
        source_page_id: row.source_page_id,
        status: row.status,
        estimated_cost: row.estimated_cost,
        reserved_by_user_id: row.reserved_by_user_id,
        reservation_expires_at: row.reservation_expires_at,
        reserved_ledger_id: row.reserved_ledger_id,
        auto_unlock_intent_id: row.auto_unlock_intent_id,
        blueprint_id: row.blueprint_id,
        job_id: row.job_id,
        last_error_code: row.last_error_code,
        last_error_message: row.last_error_message,
        transcript_status: row.transcript_status,
        transcript_attempt_count: row.transcript_attempt_count,
        transcript_no_caption_hits: row.transcript_no_caption_hits,
        transcript_last_probe_at: row.transcript_last_probe_at,
        transcript_retry_after: row.transcript_retry_after,
        transcript_probe_meta_json: row.transcript_probe_meta == null ? null : JSON.stringify(row.transcript_probe_meta),
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
      .where('id', '=', row.id)
      .where('updated_at', '=', expectedUpdatedAt)
      .executeTakeFirst();
    return Number(result.numUpdatedRows || 0) > 0;
  }

  await controlDb.db
    .insertInto('unlock_ledger_state')
    .values({
      id: row.id,
      source_item_id: row.source_item_id,
      source_page_id: row.source_page_id,
      status: row.status,
      estimated_cost: row.estimated_cost,
      reserved_by_user_id: row.reserved_by_user_id,
      reservation_expires_at: row.reservation_expires_at,
      reserved_ledger_id: row.reserved_ledger_id,
      auto_unlock_intent_id: row.auto_unlock_intent_id,
      blueprint_id: row.blueprint_id,
      job_id: row.job_id,
      last_error_code: row.last_error_code,
      last_error_message: row.last_error_message,
      transcript_status: row.transcript_status,
      transcript_attempt_count: row.transcript_attempt_count,
      transcript_no_caption_hits: row.transcript_no_caption_hits,
      transcript_last_probe_at: row.transcript_last_probe_at,
      transcript_retry_after: row.transcript_retry_after,
      transcript_probe_meta_json: row.transcript_probe_meta == null ? null : JSON.stringify(row.transcript_probe_meta),
      created_at: row.created_at,
      updated_at: row.updated_at,
    })
    .onConflict((oc) => oc.column('id').doUpdateSet({
      source_item_id: row.source_item_id,
      source_page_id: row.source_page_id,
      status: row.status,
      estimated_cost: row.estimated_cost,
      reserved_by_user_id: row.reserved_by_user_id,
      reservation_expires_at: row.reservation_expires_at,
      reserved_ledger_id: row.reserved_ledger_id,
      auto_unlock_intent_id: row.auto_unlock_intent_id,
      blueprint_id: row.blueprint_id,
      job_id: row.job_id,
      last_error_code: row.last_error_code,
      last_error_message: row.last_error_message,
      transcript_status: row.transcript_status,
      transcript_attempt_count: row.transcript_attempt_count,
      transcript_no_caption_hits: row.transcript_no_caption_hits,
      transcript_last_probe_at: row.transcript_last_probe_at,
      transcript_retry_after: row.transcript_retry_after,
      transcript_probe_meta_json: row.transcript_probe_meta == null ? null : JSON.stringify(row.transcript_probe_meta),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
    .execute();
  return true;
}

export async function upsertOracleUnlockLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapUnlockLedgerRow(row, nowIso))
    .filter((row) => Boolean(row.id && row.source_item_id));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await writeUnlockLedgerRow(input.controlDb, row);
    }
  }

  return rows;
}

export async function upsertOracleUnlockLedgerRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Record<string, unknown>;
  nowIso?: string;
}) {
  const [row] = await upsertOracleUnlockLedgerRows({
    controlDb: input.controlDb,
    rows: [input.row],
    nowIso: input.nowIso,
  });
  return row || null;
}

export async function replaceOracleUnlockLedgerRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Record<string, unknown>;
  expectedUpdatedAt?: string | null;
  nowIso?: string;
}) {
  const row = mapUnlockLedgerRow(input.row, normalizeRequiredIso(input.nowIso));
  return writeUnlockLedgerRow(input.controlDb, row, normalizeStringOrNull(input.expectedUpdatedAt));
}

export async function deleteOracleUnlockLedgerRow(input: {
  controlDb: OracleControlPlaneDb;
  unlockId: string;
}) {
  const unlockId = String(input.unlockId || '').trim();
  if (!unlockId) return;
  await input.controlDb.db
    .deleteFrom('unlock_ledger_state')
    .where('id', '=', unlockId)
    .execute();
}

export async function syncOracleUnlockLedgerFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  limit: number;
  nowIso?: string;
}) {
  const limit = Math.max(100, Math.floor(Number(input.limit) || 0));
  const { data, error } = await input.db
    .from('source_item_unlocks')
    .select(UNLOCK_LEDGER_SELECT)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  await input.controlDb.db.deleteFrom('unlock_ledger_state').execute();
  const synced = await upsertOracleUnlockLedgerRows({
    controlDb: input.controlDb,
    rows,
    nowIso: input.nowIso,
  });

  return {
    rowCount: synced.length,
    activeCount: synced.filter((row) => row.status === 'reserved' || row.status === 'processing').length,
  };
}

export async function getOracleUnlockLedgerById(input: {
  controlDb: OracleControlPlaneDb;
  unlockId: string;
}) {
  const unlockId = String(input.unlockId || '').trim();
  if (!unlockId) return null;

  const row = await input.controlDb.db
    .selectFrom('unlock_ledger_state')
    .selectAll()
    .where('id', '=', unlockId)
    .executeTakeFirst();

  return row
    ? mapUnlockLedgerRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function getOracleUnlockLedgerBySourceItemId(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
}) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId) return null;

  const row = await input.controlDb.db
    .selectFrom('unlock_ledger_state')
    .selectAll()
    .where('source_item_id', '=', sourceItemId)
    .executeTakeFirst();

  return row
    ? mapUnlockLedgerRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function listOracleUnlockLedgerRowsBySourceItemIds(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemIds: string[];
}) {
  const sourceItemIds = [...new Set(
    (input.sourceItemIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (sourceItemIds.length === 0) return [] as OracleUnlockLedgerRow[];

  const rows = await input.controlDb.db
    .selectFrom('unlock_ledger_state')
    .selectAll()
    .where('source_item_id', 'in', sourceItemIds)
    .execute();

  return rows.map((row) => mapUnlockLedgerRow(row as unknown as Record<string, unknown>));
}

export async function listOracleUnlockLedgerExpiredReservedRows(input: {
  controlDb: OracleControlPlaneDb;
  limit: number;
  nowIso?: string;
}) {
  const limit = Math.max(1, Math.min(1000, Math.floor(Number(input.limit) || 0)));
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = await input.controlDb.db
    .selectFrom('unlock_ledger_state')
    .selectAll()
    .where('status', '=', 'reserved')
    .where('reservation_expires_at', 'is not', null)
    .where('reservation_expires_at', '<', nowIso)
    .orderBy('reservation_expires_at', 'asc')
    .limit(limit)
    .execute();

  return rows.map((row) => mapUnlockLedgerRow(row as unknown as Record<string, unknown>));
}

export async function listOracleUnlockLedgerProcessingRows(input: {
  controlDb: OracleControlPlaneDb;
  limit: number;
}) {
  const limit = Math.max(1, Math.min(1000, Math.floor(Number(input.limit) || 0)));
  const rows = await input.controlDb.db
    .selectFrom('unlock_ledger_state')
    .selectAll()
    .where('status', '=', 'processing')
    .orderBy('updated_at', 'asc')
    .limit(limit)
    .execute();

  return rows.map((row) => mapUnlockLedgerRow(row as unknown as Record<string, unknown>));
}

export async function countOracleUnlockLedgerActiveLinksForJobs(input: {
  controlDb: OracleControlPlaneDb;
  jobIds: string[];
}) {
  const jobIds = [...new Set(
    (input.jobIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  const map = new Map<string, number>();
  if (jobIds.length === 0) return map;

  const rows = await input.controlDb.db
    .selectFrom('unlock_ledger_state')
    .select(['job_id'])
    .where('job_id', 'in', jobIds)
    .where('status', 'in', ['reserved', 'processing'])
    .execute();

  for (const row of rows) {
    const jobId = String(row.job_id || '').trim();
    if (!jobId) continue;
    map.set(jobId, (map.get(jobId) || 0) + 1);
  }

  return map;
}
