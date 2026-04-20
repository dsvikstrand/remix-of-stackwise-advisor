import type { Json } from '../../src/integrations/supabase/types';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeIsoOrNull, normalizeRequiredIso, normalizeStringOrNull } from './oracleValueNormalization';

export type OracleBlueprintRow = {
  id: string;
  inventory_id: string | null;
  creator_user_id: string;
  title: string;
  sections_json: Json | null;
  mix_notes: string | null;
  review_prompt: string | null;
  banner_url: string | null;
  llm_review: string | null;
  preview_summary: string | null;
  is_public: boolean;
  likes_count: number;
  source_blueprint_id: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeInt(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : 0;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 't';
}

function normalizeJson(value: unknown): Json | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as Json;
    } catch {
      return null;
    }
  }
  return value as Json;
}

function mapOracleBlueprintRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleBlueprintRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeRequiredString(row.id),
    inventory_id: normalizeStringOrNull(row.inventory_id),
    creator_user_id: normalizeRequiredString(row.creator_user_id),
    title: normalizeRequiredString(row.title),
    sections_json: normalizeJson(row.sections_json),
    mix_notes: normalizeStringOrNull(row.mix_notes),
    review_prompt: normalizeStringOrNull(row.review_prompt),
    banner_url: normalizeStringOrNull(row.banner_url),
    llm_review: normalizeStringOrNull(row.llm_review),
    preview_summary: normalizeStringOrNull(row.preview_summary),
    is_public: normalizeBoolean(row.is_public),
    likes_count: normalizeInt(row.likes_count),
    source_blueprint_id: normalizeStringOrNull(row.source_blueprint_id),
    created_at: createdAt,
    updated_at: normalizeRequiredIso(row.updated_at, createdAt),
  };
}

function toSqliteBlueprintRow(row: OracleBlueprintRow) {
  return {
    id: row.id,
    inventory_id: row.inventory_id,
    creator_user_id: row.creator_user_id,
    title: row.title,
    sections_json: row.sections_json == null ? null : JSON.stringify(row.sections_json),
    mix_notes: row.mix_notes,
    review_prompt: row.review_prompt,
    banner_url: row.banner_url,
    llm_review: row.llm_review,
    preview_summary: row.preview_summary,
    is_public: row.is_public ? 1 : 0,
    likes_count: row.likes_count,
    source_blueprint_id: row.source_blueprint_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function countOracleBlueprintRows(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const row = await input.controlDb.db
    .selectFrom('blueprint_state')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .executeTakeFirst();

  return Number(row?.count || 0);
}

export async function getOracleBlueprintRow(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
}) {
  const blueprintId = normalizeRequiredString(input.blueprintId);
  if (!blueprintId) return null;

  const row = await input.controlDb.db
    .selectFrom('blueprint_state')
    .selectAll()
    .where('id', '=', blueprintId)
    .executeTakeFirst();

  return row ? mapOracleBlueprintRow(row as unknown as Record<string, unknown>) : null;
}

export async function listOracleBlueprintRows(input: {
  controlDb: OracleControlPlaneDb;
  blueprintIds?: string[];
  creatorUserId?: string | null;
  isPublic?: boolean | null;
  limit?: number;
}) {
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => normalizeRequiredString(value)).filter(Boolean))];
  const creatorUserId = normalizeRequiredString(input.creatorUserId);
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(input.limit || 500))));

  let query = input.controlDb.db
    .selectFrom('blueprint_state')
    .selectAll();

  if (blueprintIds.length > 0) {
    query = query.where('id', 'in', blueprintIds);
  }
  if (creatorUserId) {
    query = query.where('creator_user_id', '=', creatorUserId);
  }
  if (typeof input.isPublic === 'boolean') {
    query = query.where('is_public', '=', input.isPublic ? 1 : 0);
  }

  const rows = await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();

  const mapped = rows.map((row) => mapOracleBlueprintRow(row as unknown as Record<string, unknown>));
  if (blueprintIds.length === 0) return mapped;

  const order = new Map(blueprintIds.map((id, index) => [id, index]));
  return mapped.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));
}

export async function upsertOracleBlueprintRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleBlueprintRow> & {
    id: string;
    creator_user_id: string;
    title: string;
  };
  nowIso?: string;
}) {
  const existing = await getOracleBlueprintRow({
    controlDb: input.controlDb,
    blueprintId: input.row.id,
  });
  const nowIso = normalizeRequiredIso(input.nowIso);
  const nextRow = mapOracleBlueprintRow({
    id: input.row.id,
    inventory_id: input.row.inventory_id ?? existing?.inventory_id,
    creator_user_id: input.row.creator_user_id || existing?.creator_user_id,
    title: input.row.title || existing?.title,
    sections_json: input.row.sections_json ?? existing?.sections_json,
    mix_notes: input.row.mix_notes ?? existing?.mix_notes,
    review_prompt: input.row.review_prompt ?? existing?.review_prompt,
    banner_url: input.row.banner_url ?? existing?.banner_url,
    llm_review: input.row.llm_review ?? existing?.llm_review,
    preview_summary: input.row.preview_summary ?? existing?.preview_summary,
    is_public: input.row.is_public ?? existing?.is_public ?? false,
    likes_count: input.row.likes_count ?? existing?.likes_count ?? 0,
    source_blueprint_id: input.row.source_blueprint_id ?? existing?.source_blueprint_id,
    created_at: input.row.created_at || existing?.created_at || nowIso,
    updated_at: input.row.updated_at || nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('blueprint_state')
    .values(toSqliteBlueprintRow(nextRow))
    .onConflict((oc) => oc.column('id').doUpdateSet({
      inventory_id: nextRow.inventory_id,
      creator_user_id: nextRow.creator_user_id,
      title: nextRow.title,
      sections_json: nextRow.sections_json == null ? null : JSON.stringify(nextRow.sections_json),
      mix_notes: nextRow.mix_notes,
      review_prompt: nextRow.review_prompt,
      banner_url: nextRow.banner_url,
      llm_review: nextRow.llm_review,
      preview_summary: nextRow.preview_summary,
      is_public: nextRow.is_public ? 1 : 0,
      likes_count: nextRow.likes_count,
      source_blueprint_id: nextRow.source_blueprint_id,
      updated_at: nextRow.updated_at,
    }))
    .execute();

  return nextRow;
}

export async function patchOracleBlueprintRow(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
  patch: Partial<Omit<OracleBlueprintRow, 'id' | 'creator_user_id' | 'title' | 'created_at'>>;
  nowIso?: string;
}) {
  const existing = await getOracleBlueprintRow({
    controlDb: input.controlDb,
    blueprintId: input.blueprintId,
  });
  if (!existing) return null;

  return upsertOracleBlueprintRow({
    controlDb: input.controlDb,
    row: {
      id: existing.id,
      creator_user_id: existing.creator_user_id,
      title: existing.title,
      inventory_id: existing.inventory_id,
      sections_json: existing.sections_json,
      mix_notes: existing.mix_notes,
      review_prompt: existing.review_prompt,
      banner_url: input.patch.banner_url ?? existing.banner_url,
      llm_review: input.patch.llm_review ?? existing.llm_review,
      preview_summary: input.patch.preview_summary ?? existing.preview_summary,
      is_public: input.patch.is_public ?? existing.is_public,
      likes_count: input.patch.likes_count ?? existing.likes_count,
      source_blueprint_id: input.patch.source_blueprint_id ?? existing.source_blueprint_id,
      updated_at: input.patch.updated_at ?? input.nowIso ?? normalizeRequiredIso(undefined),
    },
    nowIso: input.nowIso,
  });
}

export async function syncOracleBlueprintRowFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  blueprintId: string;
}) {
  const blueprintId = normalizeRequiredString(input.blueprintId);
  if (!blueprintId) return null;

  const { data, error } = await input.db
    .from('blueprints')
    .select('id, inventory_id, creator_user_id, title, sections_json, mix_notes, review_prompt, banner_url, llm_review, preview_summary, is_public, likes_count, source_blueprint_id, created_at, updated_at')
    .eq('id', blueprintId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return upsertOracleBlueprintRow({
    controlDb: input.controlDb,
    row: mapOracleBlueprintRow(data as Record<string, unknown>),
  });
}

export async function syncOracleBlueprintRowsFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  batchSize?: number;
}) {
  const batchSize = Math.max(50, Math.min(1000, Math.floor(Number(input.batchSize || 250))));
  const rows: OracleBlueprintRow[] = [];
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await input.db
      .from('blueprints')
      .select('id, inventory_id, creator_user_id, title, sections_json, mix_notes, review_prompt, banner_url, llm_review, preview_summary, is_public, likes_count, source_blueprint_id, created_at, updated_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapOracleBlueprintRow(row as Record<string, unknown>);
      if (!mapped.id || !mapped.creator_user_id || !mapped.title) continue;
      rows.push(mapped);
    }

    from += data.length;
    if (data.length < batchSize) break;
  }

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('blueprint_state')
        .values(toSqliteBlueprintRow(row))
        .onConflict((oc) => oc.column('id').doUpdateSet({
          inventory_id: row.inventory_id,
          creator_user_id: row.creator_user_id,
          title: row.title,
          sections_json: row.sections_json == null ? null : JSON.stringify(row.sections_json),
          mix_notes: row.mix_notes,
          review_prompt: row.review_prompt,
          banner_url: row.banner_url,
          llm_review: row.llm_review,
          preview_summary: row.preview_summary,
          is_public: row.is_public ? 1 : 0,
          likes_count: row.likes_count,
          source_blueprint_id: row.source_blueprint_id,
          updated_at: row.updated_at,
        }))
        .execute();
    }
  }

  return {
    rowCount: rows.length,
  };
}
