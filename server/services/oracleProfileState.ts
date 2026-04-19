import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeRequiredIso, normalizeStringOrNull } from './oracleValueNormalization';

export type OracleProfileRow = {
  id: string | null;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  follower_count: number;
  following_count: number;
  unlocked_blueprints_count: number;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 't';
}

function normalizeInt(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : 0;
}

function mapOracleProfileRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleProfileRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeStringOrNull(row.id ?? row.profile_id),
    user_id: normalizeRequiredString(row.user_id),
    display_name: normalizeStringOrNull(row.display_name),
    avatar_url: normalizeStringOrNull(row.avatar_url),
    bio: normalizeStringOrNull(row.bio),
    is_public: normalizeBoolean(row.is_public),
    follower_count: normalizeInt(row.follower_count),
    following_count: normalizeInt(row.following_count),
    unlocked_blueprints_count: normalizeInt(row.unlocked_blueprints_count),
    created_at: createdAt,
    updated_at: normalizeRequiredIso(row.updated_at, createdAt),
  };
}

function toSqliteProfileRow(row: OracleProfileRow) {
  return {
    user_id: row.user_id,
    profile_id: row.id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    is_public: row.is_public ? 1 : 0,
    follower_count: row.follower_count,
    following_count: row.following_count,
    unlocked_blueprints_count: row.unlocked_blueprints_count,
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

export async function countOracleProfileRows(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const row = await input.controlDb.db
    .selectFrom('profile_state')
    .select(({ fn }) => fn.count<number>('user_id').as('count'))
    .executeTakeFirst();
  return Number(row?.count || 0);
}

export async function getOracleProfileRow(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
}) {
  const userId = normalizeRequiredString(input.userId);
  if (!userId) return null;

  const row = await input.controlDb.db
    .selectFrom('profile_state')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return row ? mapOracleProfileRow(row as unknown as Record<string, unknown>) : null;
}

export async function listOracleProfileRows(input: {
  controlDb: OracleControlPlaneDb;
  userIds?: string[];
  isPublic?: boolean | null;
  limit?: number;
}) {
  const userIds = [...new Set((input.userIds || []).map((value) => normalizeRequiredString(value)).filter(Boolean))];
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(input.limit || 500))));

  let query = input.controlDb.db
    .selectFrom('profile_state')
    .selectAll();

  if (userIds.length > 0) {
    query = query.where('user_id', 'in', userIds);
  }
  if (typeof input.isPublic === 'boolean') {
    query = query.where('is_public', '=', input.isPublic ? 1 : 0);
  }

  const rows = await query
    .orderBy('updated_at', 'desc')
    .orderBy('user_id', 'asc')
    .limit(limit)
    .execute();

  const mapped = rows.map((row) => mapOracleProfileRow(row as unknown as Record<string, unknown>));
  if (userIds.length === 0) return mapped;

  const order = new Map(userIds.map((id, index) => [id, index]));
  return mapped.sort((left, right) => (order.get(left.user_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.user_id) ?? Number.MAX_SAFE_INTEGER));
}

export async function upsertOracleProfileRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleProfileRow> & {
    user_id: string;
  };
  nowIso?: string;
}) {
  const existing = await getOracleProfileRow({
    controlDb: input.controlDb,
    userId: input.row.user_id,
  });
  const nowIso = normalizeRequiredIso(input.nowIso);
  const nextRow = mapOracleProfileRow({
    id: input.row.id ?? existing?.id,
    user_id: input.row.user_id,
    display_name: input.row.display_name ?? existing?.display_name,
    avatar_url: input.row.avatar_url ?? existing?.avatar_url,
    bio: input.row.bio ?? existing?.bio,
    is_public: input.row.is_public ?? existing?.is_public ?? false,
    follower_count: input.row.follower_count ?? existing?.follower_count ?? 0,
    following_count: input.row.following_count ?? existing?.following_count ?? 0,
    unlocked_blueprints_count: input.row.unlocked_blueprints_count ?? existing?.unlocked_blueprints_count ?? 0,
    created_at: input.row.created_at || existing?.created_at || nowIso,
    updated_at: input.row.updated_at || nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('profile_state')
    .values(toSqliteProfileRow(nextRow))
    .onConflict((oc) => oc.column('user_id').doUpdateSet({
      profile_id: nextRow.id,
      display_name: nextRow.display_name,
      avatar_url: nextRow.avatar_url,
      bio: nextRow.bio,
      is_public: nextRow.is_public ? 1 : 0,
      follower_count: nextRow.follower_count,
      following_count: nextRow.following_count,
      unlocked_blueprints_count: nextRow.unlocked_blueprints_count,
      updated_at: nextRow.updated_at,
    }))
    .execute();

  return nextRow;
}

export async function syncOracleProfileRowFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  userId: string;
}) {
  const userId = normalizeRequiredString(input.userId);
  if (!userId) return null;

  const { data, error } = await input.db
    .from('profiles')
    .select('id, user_id, display_name, avatar_url, bio, is_public, follower_count, following_count, unlocked_blueprints_count, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.user_id) return null;

  return upsertOracleProfileRow({
    controlDb: input.controlDb,
    row: mapOracleProfileRow(data as Record<string, unknown>),
  });
}

export async function syncOracleProfileRowsFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: {
    from: (table: string) => any;
  };
  batchSize?: number;
}) {
  const batchSize = Math.max(50, Math.min(1000, Math.floor(Number(input.batchSize || 250))));
  const rows: OracleProfileRow[] = [];
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await input.db
      .from('profiles')
      .select('id, user_id, display_name, avatar_url, bio, is_public, follower_count, following_count, unlocked_blueprints_count, created_at, updated_at')
      .order('created_at', { ascending: true })
      .order('user_id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapOracleProfileRow(row as Record<string, unknown>);
      if (!mapped.user_id) continue;
      rows.push(mapped);
    }

    from += data.length;
    if (data.length < batchSize) break;
  }

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('profile_state')
        .values(toSqliteProfileRow(row))
        .onConflict((oc) => oc.column('user_id').doUpdateSet({
          profile_id: row.id,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          bio: row.bio,
          is_public: row.is_public ? 1 : 0,
          follower_count: row.follower_count,
          following_count: row.following_count,
          unlocked_blueprints_count: row.unlocked_blueprints_count,
          updated_at: row.updated_at,
        }))
        .execute();
    }
  }

  return {
    rowCount: rows.length,
  };
}
