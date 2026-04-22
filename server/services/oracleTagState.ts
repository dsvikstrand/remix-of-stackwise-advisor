import { randomUUID } from 'node:crypto';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeIsoOrNull, normalizeRequiredIso } from './oracleValueNormalization';

export type OracleTagRow = {
  id: string;
  slug: string;
  follower_count: number;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeTagSlug(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeFollowerCount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function mapTagRow(row: Record<string, unknown>, fallbackIso?: string): OracleTagRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeRequiredString(row.id) || randomUUID(),
    slug: normalizeTagSlug(row.slug),
    follower_count: normalizeFollowerCount(row.follower_count),
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

export async function countOracleTagRows(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const row = await input.controlDb.db
    .selectFrom('tag_state')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .executeTakeFirst();

  return Number(row?.count || 0);
}

export async function getOracleTagRowById(input: {
  controlDb: OracleControlPlaneDb;
  tagId: string;
}) {
  const tagId = normalizeRequiredString(input.tagId);
  if (!tagId) return null;

  const row = await input.controlDb.db
    .selectFrom('tag_state')
    .selectAll()
    .where('id', '=', tagId)
    .executeTakeFirst();

  return row ? mapTagRow(row as unknown as Record<string, unknown>) : null;
}

export async function getOracleTagRowBySlug(input: {
  controlDb: OracleControlPlaneDb;
  slug: string;
}) {
  const slug = normalizeTagSlug(input.slug);
  if (!slug) return null;

  const row = await input.controlDb.db
    .selectFrom('tag_state')
    .selectAll()
    .where('slug', '=', slug)
    .executeTakeFirst();

  return row ? mapTagRow(row as unknown as Record<string, unknown>) : null;
}

export async function listOracleTagRows(input: {
  controlDb: OracleControlPlaneDb;
  tagIds?: string[];
  slugs?: string[];
  limit?: number;
}) {
  const tagIds = [...new Set((input.tagIds || []).map((value) => normalizeRequiredString(value)).filter(Boolean))];
  const slugs = [...new Set((input.slugs || []).map((value) => normalizeTagSlug(value)).filter(Boolean))];
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(input.limit || 5000))));

  let query = input.controlDb.db
    .selectFrom('tag_state')
    .selectAll();

  if (tagIds.length > 0) {
    query = query.where('id', 'in', tagIds);
  }
  if (slugs.length > 0) {
    query = query.where('slug', 'in', slugs);
  }

  const rows = await query
    .orderBy('follower_count', 'desc')
    .orderBy('slug', 'asc')
    .limit(limit)
    .execute();

  const mapped = rows.map((row) => mapTagRow(row as unknown as Record<string, unknown>));
  if (tagIds.length === 0 && slugs.length === 0) return mapped;

  const slugOrder = new Map(slugs.map((slug, index) => [slug, index]));
  const tagIdOrder = new Map(tagIds.map((tagId, index) => [tagId, index]));
  return mapped.sort((left, right) => {
    const leftSlugOrder = slugOrder.get(left.slug);
    const rightSlugOrder = slugOrder.get(right.slug);
    if (leftSlugOrder != null || rightSlugOrder != null) {
      return (leftSlugOrder ?? Number.MAX_SAFE_INTEGER) - (rightSlugOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return (tagIdOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (tagIdOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER);
  });
}

export async function upsertOracleTagRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleTagRow> & {
    slug: string;
  };
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const existingById = input.row.id
    ? await getOracleTagRowById({
        controlDb: input.controlDb,
        tagId: input.row.id,
      })
    : null;
  const existingBySlug = await getOracleTagRowBySlug({
    controlDb: input.controlDb,
    slug: input.row.slug,
  });
  const existing = existingById || existingBySlug;
  const nextRow = mapTagRow({
    id: input.row.id || existing?.id || randomUUID(),
    slug: input.row.slug,
    follower_count: input.row.follower_count ?? existing?.follower_count ?? 0,
    created_at: input.row.created_at || existing?.created_at || nowIso,
    updated_at: input.row.updated_at || nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('tag_state')
    .values(nextRow)
    .onConflict((oc) => oc.column('id').doUpdateSet({
      slug: nextRow.slug,
      follower_count: nextRow.follower_count,
      updated_at: nextRow.updated_at,
    }))
    .execute();

  if (existingBySlug && existingBySlug.id !== nextRow.id) {
    await input.controlDb.db
      .deleteFrom('tag_state')
      .where('id', '=', existingBySlug.id)
      .execute();
  }

  return nextRow;
}

export async function incrementOracleTagFollowerCount(input: {
  controlDb: OracleControlPlaneDb;
  tagId: string;
  delta: number;
}) {
  const existing = await getOracleTagRowById({
    controlDb: input.controlDb,
    tagId: input.tagId,
  });
  if (!existing) return null;

  return upsertOracleTagRow({
    controlDb: input.controlDb,
    row: {
      id: existing.id,
      slug: existing.slug,
      follower_count: Math.max(0, existing.follower_count + Math.floor(Number(input.delta || 0))),
      created_at: existing.created_at,
    },
  });
}

export async function hasOracleTagBootstrapCompleted(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const value = await getControlMetaValue({
    controlDb: input.controlDb,
    key: 'tag_state_bootstrap',
  });
  return Boolean(normalizeIsoOrNull(value?.at));
}

export async function markOracleTagBootstrapCompleted(input: {
  controlDb: OracleControlPlaneDb;
  nowIso?: string;
  rowCount?: number;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  await setControlMetaValue({
    controlDb: input.controlDb,
    key: 'tag_state_bootstrap',
    value: {
      at: nowIso,
      row_count: Math.max(0, Math.floor(Number(input.rowCount || 0))),
    },
    updatedAt: nowIso,
  });
}

export async function syncOracleTagRowsFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  batchSize?: number;
}) {
  const batchSize = Math.max(50, Math.min(1000, Math.floor(Number(input.batchSize || 250))));
  const rows: OracleTagRow[] = [];
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await input.db
      .from('tags')
      .select('id, slug, follower_count, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapTagRow({
        ...row,
        updated_at: (row as Record<string, unknown>).created_at,
      });
      if (!mapped.id || !mapped.slug) continue;
      rows.push(mapped);
    }

    from += data.length;
    if (data.length < batchSize) break;
  }

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('tag_state')
        .values(row)
        .onConflict((oc) => oc.column('id').doUpdateSet({
          slug: row.slug,
          follower_count: row.follower_count,
          updated_at: row.updated_at,
        }))
        .execute();
    }
  }

  await markOracleTagBootstrapCompleted({
    controlDb: input.controlDb,
    rowCount: rows.length,
  });

  return {
    rowCount: rows.length,
  };
}
