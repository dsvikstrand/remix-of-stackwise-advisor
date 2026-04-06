import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

type DbClient = SupabaseClient<any, 'public', any>;

export type OracleFeedLedgerRow = {
  id: string;
  user_id: string;
  source_item_id: string | null;
  blueprint_id: string | null;
  state: string;
  last_decision_code: string | null;
  generated_at_on_wall: string | null;
  created_at: string;
  updated_at: string;
};

export type OracleFeedLedgerCursor = {
  createdAt: string;
  feedItemId: string;
};

const FEED_LEDGER_SELECT = [
  'id',
  'user_id',
  'source_item_id',
  'blueprint_id',
  'state',
  'last_decision_code',
  'generated_at_on_wall',
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

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function mapFeedLedgerRow(row: Record<string, unknown>, nowIso?: string): OracleFeedLedgerRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim() || randomUUID(),
    user_id: String(row.user_id || '').trim(),
    source_item_id: normalizeStringOrNull(row.source_item_id),
    blueprint_id: normalizeStringOrNull(row.blueprint_id),
    state: String(row.state || '').trim() || 'my_feed_unlockable',
    last_decision_code: normalizeStringOrNull(row.last_decision_code),
    generated_at_on_wall: normalizeIsoOrNull(row.generated_at_on_wall),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function upsertOracleFeedLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapFeedLedgerRow(row, nowIso))
    .filter((row) => Boolean(row.id && row.user_id && row.state));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('feed_ledger_state')
        .values(row)
        .onConflict((oc) => oc.column('id').doUpdateSet(row))
        .execute();
    }
  }

  return rows;
}

export async function upsertOracleFeedLedgerRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Record<string, unknown>;
  nowIso?: string;
}) {
  const [row] = await upsertOracleFeedLedgerRows({
    controlDb: input.controlDb,
    rows: [input.row],
    nowIso: input.nowIso,
  });
  return row || null;
}

export async function deleteOracleFeedLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  ids?: string[];
  userId?: string | null;
  sourceItemId?: string | null;
  state?: string | null;
}) {
  const ids = [...new Set((input.ids || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const userId = String(input.userId || '').trim();
  const sourceItemId = String(input.sourceItemId || '').trim();
  const state = String(input.state || '').trim();

  if (ids.length === 0 && !userId && !sourceItemId && !state) {
    return 0;
  }

  let query = input.controlDb.db.deleteFrom('feed_ledger_state');

  if (ids.length > 0) {
    query = query.where('id', 'in', ids);
  } else {
    if (userId) query = query.where('user_id', '=', userId);
    if (sourceItemId) query = query.where('source_item_id', '=', sourceItemId);
    if (state) query = query.where('state', '=', state);
  }

  const result = await query.executeTakeFirst();
  return Number(result.numDeletedRows || 0);
}

export async function syncOracleFeedLedgerFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  limit: number;
  nowIso?: string;
}) {
  const limit = Math.max(100, Math.floor(Number(input.limit) || 0));
  const pageSize = Math.min(1000, limit);
  const rows: Array<Record<string, unknown>> = [];

  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(limit, from + pageSize) - 1;
    const { data, error } = await input.db
      .from('user_feed_items')
      .select(FEED_LEDGER_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throw error;

    const batch = (data || []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }

  await input.controlDb.db.deleteFrom('feed_ledger_state').execute();
  const synced = await upsertOracleFeedLedgerRows({
    controlDb: input.controlDb,
    rows,
    nowIso: input.nowIso,
  });

  return {
    rowCount: synced.length,
    activeCount: synced.filter((row) => {
      const state = String(row.state || '').trim();
      return state === 'my_feed_unlockable' || state === 'my_feed_unlocking';
    }).length,
  };
}

export async function getOracleFeedLedgerById(input: {
  controlDb: OracleControlPlaneDb;
  feedItemId: string;
  userId?: string | null;
}) {
  const feedItemId = String(input.feedItemId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!feedItemId) return null;

  let query = input.controlDb.db
    .selectFrom('feed_ledger_state')
    .selectAll()
    .where('id', '=', feedItemId);

  if (userId) {
    query = query.where('user_id', '=', userId);
  }

  const row = await query.executeTakeFirst();
  return row
    ? mapFeedLedgerRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function getOracleFeedLedgerByUserSourceItem(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  sourceItemId: string;
}) {
  const userId = String(input.userId || '').trim();
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!userId || !sourceItemId) return null;

  const row = await input.controlDb.db
    .selectFrom('feed_ledger_state')
    .selectAll()
    .where('user_id', '=', userId)
    .where('source_item_id', '=', sourceItemId)
    .orderBy('generated_at_on_wall', 'desc')
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();

  return row
    ? mapFeedLedgerRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function listOracleFeedLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  userId?: string | null;
  state?: string | null;
  limit?: number;
  sourceItemIds?: string[];
  blueprintIds?: string[];
  ids?: string[];
  requireBlueprint?: boolean;
  cursor?: OracleFeedLedgerCursor | null;
  orderByWallActivity?: boolean;
}) {
  const userId = String(input.userId || '').trim();
  const state = String(input.state || '').trim();
  const ids = [...new Set((input.ids || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const sourceItemIds = [...new Set((input.sourceItemIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const cursorCreatedAt = String(input.cursor?.createdAt || '').trim();
  const cursorFeedItemId = String(input.cursor?.feedItemId || '').trim();
  const hasCursor = Boolean(cursorCreatedAt && cursorFeedItemId);

  if (!userId && !state && ids.length === 0 && blueprintIds.length === 0 && sourceItemIds.length === 0) {
    return [] as OracleFeedLedgerRow[];
  }

  let query = input.controlDb.db
    .selectFrom('feed_ledger_state')
    .selectAll()
    .limit(Math.max(1, Math.min(5000, Number(input.limit || 200))));

  if (input.orderByWallActivity) {
    query = query
      .orderBy('generated_at_on_wall', 'desc')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  } else {
    query = query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  }

  if (userId) {
    query = query.where('user_id', '=', userId);
  }
  if (state) {
    query = query.where('state', '=', state);
  }
  if (ids.length > 0) {
    query = query.where('id', 'in', ids);
  }
  if (sourceItemIds.length > 0) {
    query = query.where('source_item_id', 'in', sourceItemIds);
  }
  if (blueprintIds.length > 0) {
    query = query.where('blueprint_id', 'in', blueprintIds);
  }
  if (input.requireBlueprint) {
    query = query.where('blueprint_id', 'is not', null);
  }
  if (hasCursor) {
    query = query.where((eb) => eb.or([
      eb('created_at', '<', cursorCreatedAt),
      eb.and([
        eb('created_at', '=', cursorCreatedAt),
        eb('id', '<', cursorFeedItemId),
      ]),
    ]));
  }

  const rows = await query.execute();
  return rows.map((row) => mapFeedLedgerRow(row as unknown as Record<string, unknown>));
}
