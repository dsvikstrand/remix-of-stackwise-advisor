import { randomUUID } from 'node:crypto';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import {
  normalizeObject,
  normalizeRequiredIso,
  normalizeStringOrNull,
} from './oracleValueNormalization';

export type OracleCreditLedgerEntryType = 'grant' | 'hold' | 'settle' | 'refund' | 'adjust';

export type OracleCreditLedgerRow = {
  id: string;
  user_id: string;
  delta: number;
  entry_type: OracleCreditLedgerEntryType;
  reason_code: string;
  source_item_id: string | null;
  source_page_id: string | null;
  unlock_id: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

function normalizeRequiredString(value: unknown, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeEntryType(value: unknown): OracleCreditLedgerEntryType {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'grant') return 'grant';
  if (normalized === 'hold') return 'hold';
  if (normalized === 'refund') return 'refund';
  if (normalized === 'adjust') return 'adjust';
  return 'settle';
}

function parseMetadataJson(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return {} as Record<string, unknown>;
  try {
    return normalizeObject(JSON.parse(normalized)) || {};
  } catch {
    return {};
  }
}

function mapCreditLedgerRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleCreditLedgerRow {
  return {
    id: normalizeRequiredString(row.id, randomUUID()),
    user_id: normalizeRequiredString(row.user_id),
    delta: round2(normalizeNumber(row.delta)),
    entry_type: normalizeEntryType(row.entry_type),
    reason_code: normalizeRequiredString(row.reason_code),
    source_item_id: normalizeStringOrNull(row.source_item_id),
    source_page_id: normalizeStringOrNull(row.source_page_id),
    unlock_id: normalizeStringOrNull(row.unlock_id),
    idempotency_key: normalizeRequiredString(row.idempotency_key),
    metadata: parseMetadataJson(row.metadata_json),
    created_at: normalizeRequiredIso(row.created_at, fallbackIso),
  };
}

export async function getOracleCreditLedgerByIdempotencyKey(input: {
  controlDb: OracleControlPlaneDb;
  idempotencyKey: string;
}) {
  const idempotencyKey = normalizeRequiredString(input.idempotencyKey);
  if (!idempotencyKey) return null;

  const row = await input.controlDb.db
    .selectFrom('credit_ledger_state')
    .selectAll()
    .where('idempotency_key', '=', idempotencyKey)
    .executeTakeFirst();

  return row
    ? mapCreditLedgerRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function insertOracleCreditLedgerEntry(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleCreditLedgerRow> & {
    user_id: string;
    delta: number;
    entry_type: OracleCreditLedgerEntryType;
    reason_code: string;
    idempotency_key: string;
  };
}) {
  const nowIso = normalizeRequiredIso(input.row.created_at);
  const nextRow = mapCreditLedgerRow({
    id: input.row.id || randomUUID(),
    user_id: input.row.user_id,
    delta: input.row.delta,
    entry_type: input.row.entry_type,
    reason_code: input.row.reason_code,
    source_item_id: input.row.source_item_id ?? null,
    source_page_id: input.row.source_page_id ?? null,
    unlock_id: input.row.unlock_id ?? null,
    idempotency_key: input.row.idempotency_key,
    metadata_json: JSON.stringify(input.row.metadata || {}),
    created_at: input.row.created_at || nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('credit_ledger_state')
    .values({
      id: nextRow.id,
      user_id: nextRow.user_id,
      delta: nextRow.delta,
      entry_type: nextRow.entry_type,
      reason_code: nextRow.reason_code,
      source_item_id: nextRow.source_item_id,
      source_page_id: nextRow.source_page_id,
      unlock_id: nextRow.unlock_id,
      idempotency_key: nextRow.idempotency_key,
      metadata_json: JSON.stringify(nextRow.metadata),
      created_at: nextRow.created_at,
    })
    .onConflict((oc) => oc.column('idempotency_key').doNothing())
    .execute();

  const inserted = await getOracleCreditLedgerByIdempotencyKey({
    controlDb: input.controlDb,
    idempotencyKey: nextRow.idempotency_key,
  });
  if (!inserted) {
    throw new Error('ORACLE_CREDIT_LEDGER_INSERT_FAILED');
  }
  return inserted;
}

export async function listOracleCreditLedgerRowsForUser(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  limit?: number;
}) {
  const userId = normalizeRequiredString(input.userId);
  if (!userId) return [] as OracleCreditLedgerRow[];

  const rows = await input.controlDb.db
    .selectFrom('credit_ledger_state')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(Math.max(1, Math.floor(Number(input.limit || 100))))
    .execute();

  return rows.map((row) => mapCreditLedgerRow(row as unknown as Record<string, unknown>));
}
