import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

type DbClient = SupabaseClient<any, 'public', any>;

export type OracleSubscriptionLedgerRow = {
  id: string;
  user_id: string;
  source_type: string;
  source_channel_id: string | null;
  source_channel_url: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  mode: string | null;
  auto_unlock_enabled: boolean;
  is_active: boolean;
  last_polled_at: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

const SUBSCRIPTION_LEDGER_SELECT = [
  'id',
  'user_id',
  'source_type',
  'source_channel_id',
  'source_channel_url',
  'source_channel_title',
  'source_page_id',
  'mode',
  'auto_unlock_enabled',
  'is_active',
  'last_polled_at',
  'last_seen_published_at',
  'last_seen_video_id',
  'last_sync_error',
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

function normalizeBool(value: unknown) {
  return value === true || value === 1 || String(value || '').trim().toLowerCase() === 'true';
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function mapSubscriptionLedgerRow(row: Record<string, unknown>, nowIso?: string): OracleSubscriptionLedgerRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim() || randomUUID(),
    user_id: String(row.user_id || '').trim(),
    source_type: String(row.source_type || '').trim() || 'youtube',
    source_channel_id: normalizeStringOrNull(row.source_channel_id),
    source_channel_url: normalizeStringOrNull(row.source_channel_url),
    source_channel_title: normalizeStringOrNull(row.source_channel_title),
    source_page_id: normalizeStringOrNull(row.source_page_id),
    mode: normalizeStringOrNull(row.mode),
    auto_unlock_enabled: normalizeBool(row.auto_unlock_enabled),
    is_active: normalizeBool(row.is_active),
    last_polled_at: normalizeIsoOrNull(row.last_polled_at),
    last_seen_published_at: normalizeIsoOrNull(row.last_seen_published_at),
    last_seen_video_id: normalizeStringOrNull(row.last_seen_video_id),
    last_sync_error: normalizeStringOrNull(row.last_sync_error),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function upsertOracleSubscriptionLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapSubscriptionLedgerRow(row, nowIso))
    .filter((row) => Boolean(row.id && row.user_id && row.source_type));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('subscription_ledger_state')
        .values({
          ...row,
          auto_unlock_enabled: row.auto_unlock_enabled ? 1 : 0,
          is_active: row.is_active ? 1 : 0,
        })
        .onConflict((oc) => oc.column('id').doUpdateSet({
          ...row,
          auto_unlock_enabled: row.auto_unlock_enabled ? 1 : 0,
          is_active: row.is_active ? 1 : 0,
        }))
        .execute();
    }
  }

  return rows;
}

export async function upsertOracleSubscriptionLedgerRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Record<string, unknown>;
  nowIso?: string;
}) {
  const [row] = await upsertOracleSubscriptionLedgerRows({
    controlDb: input.controlDb,
    rows: [input.row],
    nowIso: input.nowIso,
  });
  return row || null;
}

export async function deleteOracleSubscriptionLedgerRow(input: {
  controlDb: OracleControlPlaneDb;
  subscriptionId: string;
}) {
  const subscriptionId = String(input.subscriptionId || '').trim();
  if (!subscriptionId) return;
  await input.controlDb.db
    .deleteFrom('subscription_ledger_state')
    .where('id', '=', subscriptionId)
    .execute();
}

export async function syncOracleSubscriptionLedgerFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  limit: number;
  nowIso?: string;
}) {
  const limit = Math.max(100, Math.floor(Number(input.limit) || 0));
  const { data, error } = await input.db
    .from('user_source_subscriptions')
    .select(SUBSCRIPTION_LEDGER_SELECT)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  await input.controlDb.db.deleteFrom('subscription_ledger_state').execute();
  const synced = await upsertOracleSubscriptionLedgerRows({
    controlDb: input.controlDb,
    rows,
    nowIso: input.nowIso,
  });

  return {
    rowCount: synced.length,
    activeCount: synced.filter((row) => row.is_active).length,
  };
}

export async function getOracleSubscriptionLedgerById(input: {
  controlDb: OracleControlPlaneDb;
  subscriptionId: string;
  userId?: string | null;
}) {
  const subscriptionId = String(input.subscriptionId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!subscriptionId) return null;

  let query = input.controlDb.db
    .selectFrom('subscription_ledger_state')
    .selectAll()
    .where('id', '=', subscriptionId);

  if (userId) {
    query = query.where('user_id', '=', userId);
  }

  const row = await query.executeTakeFirst();
  return row
    ? mapSubscriptionLedgerRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function getOracleSubscriptionLedgerByUserChannel(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  sourceType: string;
  sourceChannelId: string;
}) {
  const userId = String(input.userId || '').trim();
  const sourceType = String(input.sourceType || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();
  if (!userId || !sourceType || !sourceChannelId) return null;

  const row = await input.controlDb.db
    .selectFrom('subscription_ledger_state')
    .selectAll()
    .where('user_id', '=', userId)
    .where('source_type', '=', sourceType)
    .where('source_channel_id', '=', sourceChannelId)
    .orderBy('updated_at', 'desc')
    .executeTakeFirst();

  return row
    ? mapSubscriptionLedgerRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function getOracleSubscriptionLedgerState(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  sourcePageId?: string | null;
  sourceChannelId?: string | null;
}) {
  const userId = String(input.userId || '').trim();
  const sourcePageId = String(input.sourcePageId || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();
  if (!userId || (!sourcePageId && !sourceChannelId)) return null;

  let query = input.controlDb.db
    .selectFrom('subscription_ledger_state')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('updated_at', 'desc')
    .limit(10);

  if (sourcePageId && sourceChannelId) {
    query = query.where((eb) => eb.or([
      eb('source_page_id', '=', sourcePageId),
      eb('source_channel_id', '=', sourceChannelId),
    ]));
  } else if (sourcePageId) {
    query = query.where('source_page_id', '=', sourcePageId);
  } else {
    query = query.where('source_channel_id', '=', sourceChannelId);
  }

  const rows = await query.execute();
  const activeRow = rows.find((row) => Number(row.is_active || 0) === 1) || rows[0];
  return activeRow
    ? mapSubscriptionLedgerRow(activeRow as unknown as Record<string, unknown>)
    : null;
}

export async function listOracleSubscriptionLedgerRowsForUser(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
}) {
  const userId = String(input.userId || '').trim();
  if (!userId) return [] as OracleSubscriptionLedgerRow[];

  const rows = await input.controlDb.db
    .selectFrom('subscription_ledger_state')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('updated_at', 'desc')
    .execute();

  return rows.map((row) => mapSubscriptionLedgerRow(row as unknown as Record<string, unknown>));
}

export async function listOracleSubscriptionLedgerRowsByIds(input: {
  controlDb: OracleControlPlaneDb;
  subscriptionIds: string[];
  userId?: string | null;
}) {
  const subscriptionIds = [...new Set(
    (Array.isArray(input.subscriptionIds) ? input.subscriptionIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  const userId = String(input.userId || '').trim();
  if (subscriptionIds.length === 0) return [] as OracleSubscriptionLedgerRow[];

  let query = input.controlDb.db
    .selectFrom('subscription_ledger_state')
    .selectAll()
    .where('id', 'in', subscriptionIds)
    .orderBy('updated_at', 'desc');

  if (userId) {
    query = query.where('user_id', '=', userId);
  }

  const rows = await query.execute();
  return rows.map((row) => mapSubscriptionLedgerRow(row as unknown as Record<string, unknown>));
}

export async function listOracleSubscriptionLedgerActiveSubscriptionsForUser(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
}) {
  const userId = String(input.userId || '').trim();
  if (!userId) return [] as Array<{ source_page_id: string | null; source_channel_id: string | null }>;

  const rows = await input.controlDb.db
    .selectFrom('subscription_ledger_state')
    .select(['source_page_id', 'source_channel_id'])
    .where('user_id', '=', userId)
    .where('is_active', '=', 1)
    .execute();

  return rows.map((row) => ({
    source_page_id: row.source_page_id || null,
    source_channel_id: row.source_channel_id || null,
  }));
}

export async function countOracleSubscriptionLedgerActiveSubscriptions(input: {
  controlDb: OracleControlPlaneDb;
  sourcePageId?: string | null;
  sourceChannelId?: string | null;
  userId?: string | null;
}) {
  const sourcePageId = String(input.sourcePageId || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!sourcePageId && !sourceChannelId && !userId) return 0;

  let query = input.controlDb.db
    .selectFrom('subscription_ledger_state')
    .select('id')
    .where('is_active', '=', 1);

  if (userId) {
    query = query.where('user_id', '=', userId);
  }

  if (sourcePageId && sourceChannelId) {
    query = query.where((eb) => eb.or([
      eb('source_page_id', '=', sourcePageId),
      eb('source_channel_id', '=', sourceChannelId),
    ]));
  } else if (sourcePageId) {
    query = query.where('source_page_id', '=', sourcePageId);
  } else if (sourceChannelId) {
    query = query.where('source_channel_id', '=', sourceChannelId);
  }

  const rows = await query.execute();
  return rows.length;
}

export async function listOracleSubscriptionLedgerActiveUserIdsForSource(input: {
  controlDb: OracleControlPlaneDb;
  sourcePageId?: string | null;
  sourceChannelId?: string | null;
  autoUnlockEnabled?: boolean;
}) {
  const sourcePageId = String(input.sourcePageId || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();
  if (!sourcePageId && !sourceChannelId) return [] as string[];

  let query = input.controlDb.db
    .selectFrom('subscription_ledger_state')
    .select('user_id')
    .where('is_active', '=', 1);

  if (input.autoUnlockEnabled === true) {
    query = query.where('auto_unlock_enabled', '=', 1);
  }

  if (sourcePageId && sourceChannelId) {
    query = query.where((eb) => eb.or([
      eb('source_page_id', '=', sourcePageId),
      eb('source_channel_id', '=', sourceChannelId),
    ]));
  } else if (sourcePageId) {
    query = query.where('source_page_id', '=', sourcePageId);
  } else {
    query = query
      .where('source_type', '=', 'youtube')
      .where('source_channel_id', '=', sourceChannelId);
  }

  const rows = await query.execute();
  return [...new Set(
    rows
      .map((row) => String(row.user_id || '').trim())
      .filter(Boolean),
  )];
}
