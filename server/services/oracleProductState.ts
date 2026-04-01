import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

type DbClient = SupabaseClient<any, 'public', any>;

export type OracleProductSubscriptionRow = {
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

export type OracleProductSourceItemRow = {
  id: string;
  source_type: string | null;
  source_native_id: string | null;
  canonical_key: string | null;
  source_url: string | null;
  title: string | null;
  published_at: string | null;
  ingest_status: string | null;
  source_channel_id: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type OracleProductUnlockRow = {
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

export type OracleProductFeedRow = {
  id: string;
  user_id: string;
  source_item_id: string | null;
  blueprint_id: string | null;
  state: string;
  last_decision_code: string | null;
  created_at: string;
  updated_at: string;
};

type ProductSyncResult = {
  subscriptionCount: number;
  sourceItemCount: number;
  unlockCount: number;
  feedCount: number;
};

const SUBSCRIPTION_SELECT = [
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

const SOURCE_ITEM_SELECT = [
  'id',
  'source_type',
  'source_native_id',
  'canonical_key',
  'source_url',
  'title',
  'published_at',
  'ingest_status',
  'source_channel_id',
  'source_channel_title',
  'source_page_id',
  'thumbnail_url',
  'metadata',
  'created_at',
  'updated_at',
].join(', ');

const UNLOCK_SELECT = [
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

const FEED_SELECT = [
  'id',
  'user_id',
  'source_item_id',
  'blueprint_id',
  'state',
  'last_decision_code',
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
  return value === true;
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

function mapSubscriptionRow(row: Record<string, unknown>, nowIso?: string): OracleProductSubscriptionRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim(),
    user_id: String(row.user_id || '').trim(),
    source_type: String(row.source_type || '').trim(),
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

function mapSourceItemRow(row: Record<string, unknown>, nowIso?: string): OracleProductSourceItemRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim(),
    source_type: normalizeStringOrNull(row.source_type),
    source_native_id: normalizeStringOrNull(row.source_native_id),
    canonical_key: normalizeStringOrNull(row.canonical_key),
    source_url: normalizeStringOrNull(row.source_url),
    title: normalizeStringOrNull(row.title),
    published_at: normalizeIsoOrNull(row.published_at),
    ingest_status: normalizeStringOrNull(row.ingest_status),
    source_channel_id: normalizeStringOrNull(row.source_channel_id),
    source_channel_title: normalizeStringOrNull(row.source_channel_title),
    source_page_id: normalizeStringOrNull(row.source_page_id),
    thumbnail_url: normalizeStringOrNull(row.thumbnail_url),
    metadata: normalizeObject(row.metadata),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function mapUnlockRow(row: Record<string, unknown>, nowIso?: string): OracleProductUnlockRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim(),
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

function mapFeedRow(row: Record<string, unknown>, nowIso?: string): OracleProductFeedRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim(),
    user_id: String(row.user_id || '').trim(),
    source_item_id: normalizeStringOrNull(row.source_item_id),
    blueprint_id: normalizeStringOrNull(row.blueprint_id),
    state: String(row.state || '').trim(),
    last_decision_code: normalizeStringOrNull(row.last_decision_code),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function upsertOracleProductSubscriptionRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapSubscriptionRow(row, nowIso))
    .filter((row) => Boolean(row.id && row.user_id));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('product_subscription_state')
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

export async function upsertOracleProductSourceItemRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapSourceItemRow(row, nowIso))
    .filter((row) => Boolean(row.id));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('product_source_item_state')
        .values({
          id: row.id,
          source_type: row.source_type,
          source_native_id: row.source_native_id,
          canonical_key: row.canonical_key,
          source_url: row.source_url,
          title: row.title,
          published_at: row.published_at,
          ingest_status: row.ingest_status,
          source_channel_id: row.source_channel_id,
          source_channel_title: row.source_channel_title,
          source_page_id: row.source_page_id,
          thumbnail_url: row.thumbnail_url,
          metadata_json: row.metadata == null ? null : JSON.stringify(row.metadata),
          created_at: row.created_at,
          updated_at: row.updated_at,
        })
        .onConflict((oc) => oc.column('id').doUpdateSet({
          source_type: row.source_type,
          source_native_id: row.source_native_id,
          canonical_key: row.canonical_key,
          source_url: row.source_url,
          title: row.title,
          published_at: row.published_at,
          ingest_status: row.ingest_status,
          source_channel_id: row.source_channel_id,
          source_channel_title: row.source_channel_title,
          source_page_id: row.source_page_id,
          thumbnail_url: row.thumbnail_url,
          metadata_json: row.metadata == null ? null : JSON.stringify(row.metadata),
          created_at: row.created_at,
          updated_at: row.updated_at,
        }))
        .execute();
    }
  }

  return rows;
}

export async function upsertOracleProductUnlockRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapUnlockRow(row, nowIso))
    .filter((row) => Boolean(row.id && row.source_item_id));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('product_unlock_state')
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
    }
  }

  return rows;
}

export async function upsertOracleProductFeedRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapFeedRow(row, nowIso))
    .filter((row) => Boolean(row.id && row.user_id));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('product_feed_state')
        .values(row)
        .onConflict((oc) => oc.column('id').doUpdateSet(row))
        .execute();
    }
  }

  return rows;
}

export async function syncOracleProductStateFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  recentLimit: number;
  nowIso?: string;
}): Promise<ProductSyncResult> {
  const recentLimit = Math.max(100, Math.floor(Number(input.recentLimit) || 0));
  const [
    activeSubscriptionsResult,
    recentSubscriptionsResult,
    sourceItemsResult,
    unlocksResult,
    feedResult,
  ] = await Promise.all([
    input.db
      .from('user_source_subscriptions')
      .select(SUBSCRIPTION_SELECT)
      .eq('is_active', true),
    input.db
      .from('user_source_subscriptions')
      .select(SUBSCRIPTION_SELECT)
      .order('updated_at', { ascending: false })
      .limit(recentLimit),
    input.db
      .from('source_items')
      .select(SOURCE_ITEM_SELECT)
      .order('updated_at', { ascending: false })
      .limit(recentLimit),
    input.db
      .from('source_item_unlocks')
      .select(UNLOCK_SELECT)
      .order('updated_at', { ascending: false })
      .limit(recentLimit),
    input.db
      .from('user_feed_items')
      .select(FEED_SELECT)
      .order('created_at', { ascending: false })
      .limit(recentLimit),
  ]);

  if (activeSubscriptionsResult.error) throw activeSubscriptionsResult.error;
  if (recentSubscriptionsResult.error) throw recentSubscriptionsResult.error;
  if (sourceItemsResult.error) throw sourceItemsResult.error;
  if (unlocksResult.error) throw unlocksResult.error;
  if (feedResult.error) throw feedResult.error;

  const subscriptionMap = new Map<string, Record<string, unknown>>();
  for (const row of recentSubscriptionsResult.data || []) {
    const id = String((row as Record<string, unknown>).id || '').trim();
    if (id) subscriptionMap.set(id, row as Record<string, unknown>);
  }
  for (const row of activeSubscriptionsResult.data || []) {
    const id = String((row as Record<string, unknown>).id || '').trim();
    if (id) subscriptionMap.set(id, row as Record<string, unknown>);
  }

  const nowIso = normalizeRequiredIso(input.nowIso);
  await input.controlDb.db.transaction().execute(async (trx) => {
    await trx.deleteFrom('product_subscription_state').execute();
    await trx.deleteFrom('product_source_item_state').execute();
    await trx.deleteFrom('product_unlock_state').execute();
    await trx.deleteFrom('product_feed_state').execute();
  });

  const [subscriptions, sourceItems, unlocks, feedRows] = await Promise.all([
    upsertOracleProductSubscriptionRows({
      controlDb: input.controlDb,
      rows: [...subscriptionMap.values()],
      nowIso,
    }),
    upsertOracleProductSourceItemRows({
      controlDb: input.controlDb,
      rows: (sourceItemsResult.data || []) as Array<Record<string, unknown>>,
      nowIso,
    }),
    upsertOracleProductUnlockRows({
      controlDb: input.controlDb,
      rows: (unlocksResult.data || []) as Array<Record<string, unknown>>,
      nowIso,
    }),
    upsertOracleProductFeedRows({
      controlDb: input.controlDb,
      rows: (feedResult.data || []) as Array<Record<string, unknown>>,
      nowIso,
    }),
  ]);

  return {
    subscriptionCount: subscriptions.length,
    sourceItemCount: sourceItems.length,
    unlockCount: unlocks.length,
    feedCount: feedRows.length,
  };
}

export async function getOracleProductSubscriptionState(input: {
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
    .selectFrom('product_subscription_state')
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
  if (!activeRow) return null;
  return {
    id: activeRow.id,
    user_id: activeRow.user_id,
    source_type: activeRow.source_type,
    source_channel_id: activeRow.source_channel_id,
    source_page_id: activeRow.source_page_id,
    is_active: Number(activeRow.is_active || 0) === 1,
    auto_unlock_enabled: Number(activeRow.auto_unlock_enabled || 0) === 1,
    updated_at: activeRow.updated_at,
  };
}

export async function countOracleProductActiveSubscriptions(input: {
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
    .selectFrom('product_subscription_state')
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

export async function listOracleProductActiveSubscriptionsForUser(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
}) {
  const userId = String(input.userId || '').trim();
  if (!userId) return [] as Array<{ source_page_id: string | null; source_channel_id: string | null }>;

  const rows = await input.controlDb.db
    .selectFrom('product_subscription_state')
    .select(['source_page_id', 'source_channel_id'])
    .where('user_id', '=', userId)
    .where('is_active', '=', 1)
    .execute();

  return rows.map((row) => ({
    source_page_id: row.source_page_id || null,
    source_channel_id: row.source_channel_id || null,
  }));
}

export async function listOracleProductSourceItems(input: {
  controlDb: OracleControlPlaneDb;
  ids?: string[];
  sourceNativeId?: string | null;
}) {
  const ids = [...new Set((input.ids || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const sourceNativeId = String(input.sourceNativeId || '').trim();
  if (ids.length === 0 && !sourceNativeId) return [] as OracleProductSourceItemRow[];

  let query = input.controlDb.db
    .selectFrom('product_source_item_state')
    .selectAll();

  if (ids.length > 0 && sourceNativeId) {
    query = query.where((eb) => eb.or([
      eb('id', 'in', ids),
      eb('source_native_id', '=', sourceNativeId),
    ]));
  } else if (ids.length > 0) {
    query = query.where('id', 'in', ids);
  } else {
    query = query.where('source_native_id', '=', sourceNativeId);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    id: row.id,
    source_type: row.source_type,
    source_native_id: row.source_native_id,
    canonical_key: row.canonical_key,
    source_url: row.source_url,
    title: row.title,
    published_at: row.published_at,
    ingest_status: row.ingest_status,
    source_channel_id: row.source_channel_id,
    source_channel_title: row.source_channel_title,
    source_page_id: row.source_page_id,
    thumbnail_url: row.thumbnail_url,
    metadata: normalizeObject(row.metadata_json ? JSON.parse(row.metadata_json) : null),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function listOracleProductUnlocks(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemIds: string[];
}) {
  const ids = [...new Set((input.sourceItemIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length === 0) return [] as OracleProductUnlockRow[];

  const rows = await input.controlDb.db
    .selectFrom('product_unlock_state')
    .selectAll()
    .where('source_item_id', 'in', ids)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    source_item_id: row.source_item_id,
    source_page_id: row.source_page_id,
    status: row.status,
    estimated_cost: normalizeNumber(row.estimated_cost),
    reserved_by_user_id: row.reserved_by_user_id,
    reservation_expires_at: row.reservation_expires_at,
    reserved_ledger_id: row.reserved_ledger_id,
    auto_unlock_intent_id: row.auto_unlock_intent_id,
    blueprint_id: row.blueprint_id,
    job_id: row.job_id,
    last_error_code: row.last_error_code,
    last_error_message: row.last_error_message,
    transcript_status: row.transcript_status,
    transcript_attempt_count: normalizeInt(row.transcript_attempt_count),
    transcript_no_caption_hits: normalizeInt(row.transcript_no_caption_hits),
    transcript_last_probe_at: row.transcript_last_probe_at,
    transcript_retry_after: row.transcript_retry_after,
    transcript_probe_meta: normalizeObject(row.transcript_probe_meta_json ? JSON.parse(row.transcript_probe_meta_json) : null),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function getOracleProductUnlockBySourceItemId(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
}) {
  const rows = await listOracleProductUnlocks({
    controlDb: input.controlDb,
    sourceItemIds: [input.sourceItemId],
  });
  return rows[0] || null;
}

export async function listOracleProductFeedRows(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  limit?: number;
  sourceItemIds?: string[];
  requireBlueprint?: boolean;
}) {
  const userId = String(input.userId || '').trim();
  if (!userId) return [] as OracleProductFeedRow[];

  let query = input.controlDb.db
    .selectFrom('product_feed_state')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .limit(Math.max(1, Math.min(5000, Number(input.limit || 200))));

  const sourceItemIds = [...new Set((input.sourceItemIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (sourceItemIds.length > 0) {
    query = query.where('source_item_id', 'in', sourceItemIds);
  }
  if (input.requireBlueprint) {
    query = query.where('blueprint_id', 'is not', null);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    source_item_id: row.source_item_id,
    blueprint_id: row.blueprint_id,
    state: row.state,
    last_decision_code: row.last_decision_code,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}
