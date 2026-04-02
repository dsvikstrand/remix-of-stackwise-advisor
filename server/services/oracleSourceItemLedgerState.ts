import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import {
  normalizeIsoOrNull,
  normalizeObject,
  normalizeRequiredIso,
  normalizeStringOrNull,
} from './oracleValueNormalization';

type DbClient = SupabaseClient<any, 'public', any>;

export type OracleSourceItemLedgerRow = {
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

const SOURCE_ITEM_LEDGER_SELECT = [
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

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function mapSourceItemLedgerRow(row: Record<string, unknown>, nowIso?: string): OracleSourceItemLedgerRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim() || randomUUID(),
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

function parseSourceItemLedgerMetadataJson(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    return normalizeObject(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function upsertOracleSourceItemLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapSourceItemLedgerRow(row, nowIso))
    .filter((row) => Boolean(row.id));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('source_item_ledger_state')
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

export async function upsertOracleSourceItemLedgerRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Record<string, unknown>;
  nowIso?: string;
}) {
  const [row] = await upsertOracleSourceItemLedgerRows({
    controlDb: input.controlDb,
    rows: [input.row],
    nowIso: input.nowIso,
  });
  return row || null;
}

export async function deleteOracleSourceItemLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  ids: string[];
}) {
  const ids = [...new Set((input.ids || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length === 0) return 0;

  const result = await input.controlDb.db
    .deleteFrom('source_item_ledger_state')
    .where('id', 'in', ids)
    .executeTakeFirst();

  return Number(result.numDeletedRows || 0);
}

export async function syncOracleSourceItemLedgerFromSupabase(input: {
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
      .from('source_items')
      .select(SOURCE_ITEM_LEDGER_SELECT)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throw error;

    const batch = (data || []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }

  await input.controlDb.db.deleteFrom('source_item_ledger_state').execute();
  const synced = await upsertOracleSourceItemLedgerRows({
    controlDb: input.controlDb,
    rows,
    nowIso: input.nowIso,
  });

  return {
    rowCount: synced.length,
  };
}

export async function getOracleSourceItemLedgerById(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
}) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId) return null;

  const row = await input.controlDb.db
    .selectFrom('source_item_ledger_state')
    .selectAll()
    .where('id', '=', sourceItemId)
    .executeTakeFirst();

  return row
    ? mapSourceItemLedgerRow({
        ...row,
        metadata: parseSourceItemLedgerMetadataJson(row.metadata_json),
      } as Record<string, unknown>)
    : null;
}

export async function getOracleSourceItemLedgerByCanonicalKey(input: {
  controlDb: OracleControlPlaneDb;
  canonicalKey: string;
}) {
  const canonicalKey = String(input.canonicalKey || '').trim();
  if (!canonicalKey) return null;

  const row = await input.controlDb.db
    .selectFrom('source_item_ledger_state')
    .selectAll()
    .where('canonical_key', '=', canonicalKey)
    .orderBy('updated_at', 'desc')
    .executeTakeFirst();

  return row
    ? mapSourceItemLedgerRow({
        ...row,
        metadata: parseSourceItemLedgerMetadataJson(row.metadata_json),
      } as Record<string, unknown>)
    : null;
}

export async function listOracleSourceItemLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  ids?: string[];
  sourceNativeId?: string | null;
  canonicalKeys?: string[];
  limit?: number;
}) {
  const ids = [...new Set((input.ids || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const sourceNativeId = String(input.sourceNativeId || '').trim();
  const canonicalKeys = [...new Set((input.canonicalKeys || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length === 0 && !sourceNativeId && canonicalKeys.length === 0) {
    return [] as OracleSourceItemLedgerRow[];
  }

  const limit = Math.max(1, Math.min(5000, Number(input.limit || 500)));
  const queries: Array<Promise<Array<any>>> = [];
  if (ids.length > 0) {
    queries.push(
      input.controlDb.db
        .selectFrom('source_item_ledger_state')
        .selectAll()
        .where('id', 'in', ids)
        .orderBy('updated_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit)
        .execute(),
    );
  }
  if (sourceNativeId) {
    queries.push(
      input.controlDb.db
        .selectFrom('source_item_ledger_state')
        .selectAll()
        .where('source_native_id', '=', sourceNativeId)
        .orderBy('updated_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit)
        .execute(),
    );
  }
  if (canonicalKeys.length > 0) {
    queries.push(
      input.controlDb.db
        .selectFrom('source_item_ledger_state')
        .selectAll()
        .where('canonical_key', 'in', canonicalKeys)
        .orderBy('updated_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit)
        .execute(),
    );
  }

  const settled = await Promise.all(queries);
  const rows = new Map<string, OracleSourceItemLedgerRow>();
  for (const batch of settled) {
    for (const row of batch) {
      const normalized = mapSourceItemLedgerRow({
        ...row,
        metadata: parseSourceItemLedgerMetadataJson(row.metadata_json),
      } as Record<string, unknown>);
      const existing = rows.get(normalized.id);
      if (!existing || normalized.updated_at > existing.updated_at) {
        rows.set(normalized.id, normalized);
      }
    }
  }

  return [...rows.values()]
    .sort((left, right) => {
      if (left.updated_at === right.updated_at) {
        return right.id.localeCompare(left.id);
      }
      return right.updated_at.localeCompare(left.updated_at);
    })
    .slice(0, limit);
}
