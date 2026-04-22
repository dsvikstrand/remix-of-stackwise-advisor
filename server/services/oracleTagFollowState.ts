import { randomUUID } from 'node:crypto';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeIsoOrNull, normalizeRequiredIso } from './oracleValueNormalization';
import {
  getOracleTagRowById,
  incrementOracleTagFollowerCount,
} from './oracleTagState';

export type OracleTagFollowRow = {
  id: string;
  tag_id: string;
  tag_slug: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeTagSlug(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function mapTagFollowRow(row: Record<string, unknown>, fallbackIso?: string): OracleTagFollowRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeRequiredString(row.id) || randomUUID(),
    tag_id: normalizeRequiredString(row.tag_id),
    tag_slug: normalizeTagSlug(row.tag_slug),
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

export async function countOracleTagFollowRows(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const row = await input.controlDb.db
    .selectFrom('tag_follow_state')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .executeTakeFirst();

  return Number(row?.count || 0);
}

export async function getOracleTagFollowRow(input: {
  controlDb: OracleControlPlaneDb;
  tagId: string;
  userId: string;
}) {
  const tagId = normalizeRequiredString(input.tagId);
  const userId = normalizeRequiredString(input.userId);
  if (!tagId || !userId) return null;

  const row = await input.controlDb.db
    .selectFrom('tag_follow_state')
    .selectAll()
    .where('tag_id', '=', tagId)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return row ? mapTagFollowRow(row as unknown as Record<string, unknown>) : null;
}

export async function listOracleTagFollowRows(input: {
  controlDb: OracleControlPlaneDb;
  userId?: string | null;
  tagIds?: string[];
  limit?: number;
}) {
  const userId = normalizeRequiredString(input.userId);
  const tagIds = [...new Set((input.tagIds || []).map((value) => normalizeRequiredString(value)).filter(Boolean))];
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(input.limit || 5000))));

  let query = input.controlDb.db
    .selectFrom('tag_follow_state')
    .selectAll();

  if (userId) {
    query = query.where('user_id', '=', userId);
  }
  if (tagIds.length > 0) {
    query = query.where('tag_id', 'in', tagIds);
  }

  const rows = await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();

  return rows.map((row) => mapTagFollowRow(row as unknown as Record<string, unknown>));
}

export async function listOracleFollowedTagIds(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  limit?: number;
}) {
  const rows = await listOracleTagFollowRows({
    controlDb: input.controlDb,
    userId: input.userId,
    limit: input.limit,
  });
  return rows.map((row) => row.tag_id);
}

export async function listOracleFollowedTagSlugs(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  limit?: number;
}) {
  const rows = await listOracleTagFollowRows({
    controlDb: input.controlDb,
    userId: input.userId,
    limit: input.limit,
  });
  return Array.from(new Set(rows.map((row) => row.tag_slug).filter(Boolean)));
}

export async function upsertOracleTagFollowRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleTagFollowRow> & {
    tag_id: string;
    tag_slug: string;
    user_id: string;
  };
  nowIso?: string;
}) {
  const existing = await getOracleTagFollowRow({
    controlDb: input.controlDb,
    tagId: input.row.tag_id,
    userId: input.row.user_id,
  });
  const nowIso = normalizeRequiredIso(input.nowIso);
  const nextRow = mapTagFollowRow({
    id: input.row.id || existing?.id || randomUUID(),
    tag_id: input.row.tag_id,
    tag_slug: input.row.tag_slug,
    user_id: input.row.user_id,
    created_at: input.row.created_at || existing?.created_at || nowIso,
    updated_at: input.row.updated_at || nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('tag_follow_state')
    .values(nextRow)
    .onConflict((oc) => oc.columns(['tag_id', 'user_id']).doUpdateSet({
      tag_slug: nextRow.tag_slug,
      updated_at: nextRow.updated_at,
    }))
    .execute();

  if (!existing) {
    await incrementOracleTagFollowerCount({
      controlDb: input.controlDb,
      tagId: nextRow.tag_id,
      delta: 1,
    });
  }

  return nextRow;
}

export async function deleteOracleTagFollowRow(input: {
  controlDb: OracleControlPlaneDb;
  tagId: string;
  userId: string;
}) {
  const existing = await getOracleTagFollowRow({
    controlDb: input.controlDb,
    tagId: input.tagId,
    userId: input.userId,
  });
  if (!existing) return false;

  await input.controlDb.db
    .deleteFrom('tag_follow_state')
    .where('tag_id', '=', existing.tag_id)
    .where('user_id', '=', existing.user_id)
    .execute();

  await incrementOracleTagFollowerCount({
    controlDb: input.controlDb,
    tagId: existing.tag_id,
    delta: -1,
  });

  return true;
}

export async function hasOracleTagFollowBootstrapCompleted(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const value = await getControlMetaValue({
    controlDb: input.controlDb,
    key: 'tag_follow_state_bootstrap',
  });
  return Boolean(normalizeIsoOrNull(value?.at));
}

export async function markOracleTagFollowBootstrapCompleted(input: {
  controlDb: OracleControlPlaneDb;
  nowIso?: string;
  rowCount?: number;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  await setControlMetaValue({
    controlDb: input.controlDb,
    key: 'tag_follow_state_bootstrap',
    value: {
      at: nowIso,
      row_count: Math.max(0, Math.floor(Number(input.rowCount || 0))),
    },
    updatedAt: nowIso,
  });
}

export async function syncOracleTagFollowRowsFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  batchSize?: number;
}) {
  const batchSize = Math.max(50, Math.min(1000, Math.floor(Number(input.batchSize || 250))));
  const rows: OracleTagFollowRow[] = [];
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await input.db
      .from('tag_follows')
      .select('id, tag_id, user_id, created_at, tags(slug)')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const joined = (row as {
        tags?: { slug?: string } | Array<{ slug?: string }> | null;
      }).tags;
      const tagCandidates = Array.isArray(joined) ? joined : joined ? [joined] : [];
      const tagSlug = normalizeTagSlug(tagCandidates[0]?.slug);
      const mapped = mapTagFollowRow({
        ...row,
        tag_slug: tagSlug,
        updated_at: (row as Record<string, unknown>).created_at,
      });
      if (!mapped.tag_id || !mapped.tag_slug || !mapped.user_id) continue;
      rows.push(mapped);
    }

    from += data.length;
    if (data.length < batchSize) break;
  }

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      const tag = await getOracleTagRowById({
        controlDb: input.controlDb,
        tagId: row.tag_id,
      });
      if (!tag) continue;
      await input.controlDb.db
        .insertInto('tag_follow_state')
        .values(row)
        .onConflict((oc) => oc.columns(['tag_id', 'user_id']).doUpdateSet({
          tag_slug: row.tag_slug,
          updated_at: row.updated_at,
        }))
        .execute();
    }
  }

  await markOracleTagFollowBootstrapCompleted({
    controlDb: input.controlDb,
    rowCount: rows.length,
  });

  return {
    rowCount: rows.length,
  };
}
