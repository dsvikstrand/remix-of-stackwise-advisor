import { randomUUID } from 'node:crypto';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeIsoOrNull, normalizeRequiredIso } from './oracleValueNormalization';

export type OracleBlueprintLikeRow = {
  id: string;
  blueprint_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function mapBlueprintLikeRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleBlueprintLikeRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeRequiredString(row.id) || randomUUID(),
    blueprint_id: normalizeRequiredString(row.blueprint_id),
    user_id: normalizeRequiredString(row.user_id),
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

async function getControlMetaValue(input: {
  controlDb: OracleControlPlaneDb;
  key: string;
}) {
  const row = await input.controlDb.db
    .selectFrom('control_meta')
    .select(['value_json'])
    .where('key', '=', input.key)
    .executeTakeFirst();

  if (!row?.value_json) return null;
  try {
    return JSON.parse(row.value_json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function setControlMetaValue(input: {
  controlDb: OracleControlPlaneDb;
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
}) {
  await input.controlDb.db
    .insertInto('control_meta')
    .values({
      key: input.key,
      value_json: JSON.stringify(input.value),
      updated_at: input.updatedAt,
    })
    .onConflict((oc) => oc.column('key').doUpdateSet({
      value_json: JSON.stringify(input.value),
      updated_at: input.updatedAt,
    }))
    .execute();
}

export async function countOracleBlueprintLikeRows(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const row = await input.controlDb.db
    .selectFrom('blueprint_like_state')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .executeTakeFirst();

  return Number(row?.count || 0);
}

export async function getOracleBlueprintLikeRow(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
  userId: string;
}) {
  const blueprintId = normalizeRequiredString(input.blueprintId);
  const userId = normalizeRequiredString(input.userId);
  if (!blueprintId || !userId) return null;

  const row = await input.controlDb.db
    .selectFrom('blueprint_like_state')
    .selectAll()
    .where('blueprint_id', '=', blueprintId)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return row ? mapBlueprintLikeRow(row as unknown as Record<string, unknown>) : null;
}

export async function listOracleBlueprintLikeRows(input: {
  controlDb: OracleControlPlaneDb;
  userId?: string | null;
  blueprintIds?: string[];
  limit?: number;
}) {
  const userId = normalizeRequiredString(input.userId);
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => normalizeRequiredString(value)).filter(Boolean))];
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(input.limit || 5000))));

  let query = input.controlDb.db
    .selectFrom('blueprint_like_state')
    .selectAll();

  if (userId) {
    query = query.where('user_id', '=', userId);
  }
  if (blueprintIds.length > 0) {
    query = query.where('blueprint_id', 'in', blueprintIds);
  }

  const rows = await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();

  const mapped = rows.map((row) => mapBlueprintLikeRow(row as unknown as Record<string, unknown>));
  if (blueprintIds.length === 0) return mapped;

  const order = new Map(blueprintIds.map((id, index) => [id, index]));
  return mapped.sort((left, right) => (order.get(left.blueprint_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.blueprint_id) ?? Number.MAX_SAFE_INTEGER));
}

export async function upsertOracleBlueprintLikeRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleBlueprintLikeRow> & {
    blueprint_id: string;
    user_id: string;
  };
  nowIso?: string;
}) {
  const existing = await getOracleBlueprintLikeRow({
    controlDb: input.controlDb,
    blueprintId: input.row.blueprint_id,
    userId: input.row.user_id,
  });
  const nowIso = normalizeRequiredIso(input.nowIso);
  const nextRow = mapBlueprintLikeRow({
    id: input.row.id || existing?.id || randomUUID(),
    blueprint_id: input.row.blueprint_id,
    user_id: input.row.user_id,
    created_at: input.row.created_at || existing?.created_at || nowIso,
    updated_at: input.row.updated_at || nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('blueprint_like_state')
    .values(nextRow)
    .onConflict((oc) => oc.columns(['blueprint_id', 'user_id']).doUpdateSet({
      updated_at: nextRow.updated_at,
    }))
    .execute();

  return nextRow;
}

export async function deleteOracleBlueprintLikeRow(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
  userId: string;
}) {
  const blueprintId = normalizeRequiredString(input.blueprintId);
  const userId = normalizeRequiredString(input.userId);
  if (!blueprintId || !userId) return;

  await input.controlDb.db
    .deleteFrom('blueprint_like_state')
    .where('blueprint_id', '=', blueprintId)
    .where('user_id', '=', userId)
    .execute();
}

export async function listOracleLikedBlueprintIdsByUser(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  limit?: number;
}) {
  const rows = await listOracleBlueprintLikeRows({
    controlDb: input.controlDb,
    userId: input.userId,
    limit: input.limit,
  });

  return rows.map((row) => row.blueprint_id);
}

export async function hasOracleBlueprintLikeBootstrapCompleted(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const value = await getControlMetaValue({
    controlDb: input.controlDb,
    key: 'blueprint_like_state_bootstrap',
  });
  return Boolean(normalizeIsoOrNull(value?.at));
}

export async function markOracleBlueprintLikeBootstrapCompleted(input: {
  controlDb: OracleControlPlaneDb;
  nowIso?: string;
  rowCount?: number;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  await setControlMetaValue({
    controlDb: input.controlDb,
    key: 'blueprint_like_state_bootstrap',
    value: {
      at: nowIso,
      row_count: Math.max(0, Math.floor(Number(input.rowCount || 0))),
    },
    updatedAt: nowIso,
  });
}

export async function syncOracleBlueprintLikeRowsFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  batchSize?: number;
}) {
  const batchSize = Math.max(50, Math.min(1000, Math.floor(Number(input.batchSize || 250))));
  const rows: OracleBlueprintLikeRow[] = [];
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await input.db
      .from('blueprint_likes')
      .select('id, blueprint_id, user_id, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapBlueprintLikeRow({
        ...row,
        updated_at: (row as Record<string, unknown>).created_at,
      });
      if (!mapped.blueprint_id || !mapped.user_id) continue;
      rows.push(mapped);
    }

    from += data.length;
    if (data.length < batchSize) break;
  }

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('blueprint_like_state')
        .values(row)
        .onConflict((oc) => oc.columns(['blueprint_id', 'user_id']).doUpdateSet({
          updated_at: row.updated_at,
        }))
        .execute();
    }
  }

  const nowIso = new Date().toISOString();
  await markOracleBlueprintLikeBootstrapCompleted({
    controlDb: input.controlDb,
    nowIso,
    rowCount: rows.length,
  });

  return {
    rowCount: rows.length,
    bootstrappedAt: nowIso,
  };
}
