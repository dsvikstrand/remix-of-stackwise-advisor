import { randomUUID } from 'node:crypto';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeRequiredIso } from './oracleValueNormalization';

export type OracleBlueprintCommentRow = {
  id: string;
  blueprint_id: string;
  user_id: string;
  content: string;
  likes_count: number;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeCommentContent(value: unknown) {
  return String(value || '').trim();
}

function normalizeNonNegativeInt(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function isMissingColumnError(error: unknown, column: string) {
  const hay = `${(error as { message?: string } | null)?.message || ''}`.toLowerCase();
  return hay.includes('does not exist') && hay.includes(column.toLowerCase());
}

function mapBlueprintCommentRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleBlueprintCommentRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeRequiredString(row.id) || randomUUID(),
    blueprint_id: normalizeRequiredString(row.blueprint_id),
    user_id: normalizeRequiredString(row.user_id),
    content: normalizeCommentContent(row.content),
    likes_count: normalizeNonNegativeInt(row.likes_count),
    created_at: createdAt,
    updated_at: normalizeRequiredIso(row.updated_at, createdAt),
  };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function countOracleBlueprintCommentRows(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const row = await input.controlDb.db
    .selectFrom('blueprint_comment_state')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .executeTakeFirst();

  return Number(row?.count || 0);
}

export async function listOracleBlueprintCommentRows(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
  sortMode?: 'top' | 'new' | null;
  limit?: number;
}) {
  const blueprintId = normalizeRequiredString(input.blueprintId);
  if (!blueprintId) return [] as OracleBlueprintCommentRow[];

  const sortMode = String(input.sortMode || '').trim().toLowerCase() === 'top' ? 'top' : 'new';
  const limit = Math.max(1, Math.min(500, Math.floor(Number(input.limit || 100))));

  let query = input.controlDb.db
    .selectFrom('blueprint_comment_state')
    .selectAll()
    .where('blueprint_id', '=', blueprintId);

  if (sortMode === 'top') {
    query = query
      .orderBy('likes_count', 'desc')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  } else {
    query = query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
  }

  const rows = await query
    .limit(limit)
    .execute();

  return rows.map((row) => mapBlueprintCommentRow(row as unknown as Record<string, unknown>));
}

export async function listOracleBlueprintCommentRowsByUser(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  limit?: number;
}) {
  const userId = normalizeRequiredString(input.userId);
  if (!userId) return [] as OracleBlueprintCommentRow[];
  const limit = Math.max(1, Math.min(500, Math.floor(Number(input.limit || 100))));

  const rows = await input.controlDb.db
    .selectFrom('blueprint_comment_state')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();

  return rows.map((row) => mapBlueprintCommentRow(row as unknown as Record<string, unknown>));
}

export async function insertOracleBlueprintCommentRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleBlueprintCommentRow> & {
    blueprint_id: string;
    user_id: string;
    content: string;
  };
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const nextRow = mapBlueprintCommentRow({
    id: normalizeRequiredString(input.row.id) || randomUUID(),
    blueprint_id: input.row.blueprint_id,
    user_id: input.row.user_id,
    content: input.row.content,
    likes_count: input.row.likes_count ?? 0,
    created_at: input.row.created_at || nowIso,
    updated_at: input.row.updated_at || nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('blueprint_comment_state')
    .values(nextRow)
    .execute();

  return nextRow;
}

export async function syncOracleBlueprintCommentRowsFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  batchSize?: number;
}) {
  const batchSize = Math.max(50, Math.min(1000, Math.floor(Number(input.batchSize || 250))));
  const rows: OracleBlueprintCommentRow[] = [];
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    let { data, error } = await input.db
      .from('blueprint_comments')
      .select('id, blueprint_id, user_id, content, likes_count, created_at, updated_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error && isMissingColumnError(error, 'likes_count')) {
      const fallback = await input.db
        .from('blueprint_comments')
        .select('id, blueprint_id, user_id, content, created_at, updated_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      data = (fallback.data || []).map((row: Record<string, unknown>) => ({
        ...row,
        likes_count: 0,
      }));
      error = fallback.error;
    }
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapBlueprintCommentRow(row as unknown as Record<string, unknown>);
      if (!mapped.id || !mapped.blueprint_id || !mapped.user_id || !mapped.content) continue;
      rows.push(mapped);
    }

    from += data.length;
    if (data.length < batchSize) break;
  }

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('blueprint_comment_state')
        .values(row)
        .onConflict((oc) => oc.column('id').doUpdateSet({
          blueprint_id: row.blueprint_id,
          user_id: row.user_id,
          content: row.content,
          likes_count: row.likes_count,
          updated_at: row.updated_at,
        }))
        .execute();
    }
  }

  return {
    rowCount: rows.length,
  };
}
