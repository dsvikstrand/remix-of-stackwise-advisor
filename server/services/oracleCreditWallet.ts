import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeRequiredIso } from './oracleValueNormalization';

export type OracleCreditWalletRow = {
  user_id: string;
  balance: number;
  capacity: number;
  refill_rate_per_sec: number;
  last_refill_at: string;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mapOracleCreditWalletRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleCreditWalletRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    user_id: normalizeRequiredString(row.user_id),
    balance: round2(normalizeNumber(row.balance)),
    capacity: round2(normalizeNumber(row.capacity)),
    refill_rate_per_sec: round6(normalizeNumber(row.refill_rate_per_sec)),
    last_refill_at: normalizeRequiredIso(row.last_refill_at, createdAt),
    created_at: createdAt,
    updated_at: normalizeRequiredIso(row.updated_at, createdAt),
  };
}

export async function getOracleCreditWalletRow(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
}) {
  const userId = normalizeRequiredString(input.userId);
  if (!userId) return null;

  const row = await input.controlDb.db
    .selectFrom('credit_wallet_state')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return row
    ? mapOracleCreditWalletRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function upsertOracleCreditWalletRow(input: {
  controlDb: OracleControlPlaneDb;
  row: OracleCreditWalletRow;
}) {
  const row = mapOracleCreditWalletRow(input.row as unknown as Record<string, unknown>);
  if (!row.user_id) throw new Error('CREDIT_WALLET_USER_REQUIRED');

  await input.controlDb.db
    .insertInto('credit_wallet_state')
    .values(row)
    .onConflict((oc) => oc.column('user_id').doUpdateSet({
      balance: row.balance,
      capacity: row.capacity,
      refill_rate_per_sec: row.refill_rate_per_sec,
      last_refill_at: row.last_refill_at,
      updated_at: row.updated_at,
    }))
    .execute();

  return row;
}

export async function compareAndSetOracleCreditWalletRow(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  expectedBalance: number;
  expectedLastRefillAt: string;
  nextRow: OracleCreditWalletRow;
}) {
  const userId = normalizeRequiredString(input.userId);
  if (!userId) return null;

  const nextRow = mapOracleCreditWalletRow(input.nextRow as unknown as Record<string, unknown>);
  const result = await input.controlDb.db
    .updateTable('credit_wallet_state')
    .set({
      balance: nextRow.balance,
      capacity: nextRow.capacity,
      refill_rate_per_sec: nextRow.refill_rate_per_sec,
      last_refill_at: nextRow.last_refill_at,
      updated_at: nextRow.updated_at,
    })
    .where('user_id', '=', userId)
    .where('balance', '=', round2(input.expectedBalance))
    .where('last_refill_at', '=', input.expectedLastRefillAt)
    .executeTakeFirst();

  const updatedRows = Number((result as { numUpdatedRows?: bigint | number } | undefined)?.numUpdatedRows || 0);
  if (updatedRows < 1) return null;
  return nextRow;
}

export async function listOracleCreditWalletRowsByUserIds(input: {
  controlDb: OracleControlPlaneDb;
  userIds: string[];
}) {
  const userIds = Array.from(new Set(input.userIds.map((value) => normalizeRequiredString(value)).filter(Boolean)));
  if (userIds.length === 0) return [] as OracleCreditWalletRow[];

  const rows = await input.controlDb.db
    .selectFrom('credit_wallet_state')
    .selectAll()
    .where('user_id', 'in', userIds)
    .execute();

  return rows.map((row) => mapOracleCreditWalletRow(row as unknown as Record<string, unknown>));
}
