import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

export type OracleBlueprintYoutubeCommentSnapshotInput = {
  source_comment_id: string;
  display_order: number;
  author_name: string | null;
  author_avatar_url: string | null;
  content: string;
  published_at: string | null;
  like_count: number | null;
};

export type OracleBlueprintYoutubeCommentRow = {
  id: string;
  blueprint_id: string;
  youtube_video_id: string;
  sort_mode: 'top' | 'new';
  source_comment_id: string;
  display_order: number;
  author_name: string | null;
  author_avatar_url: string | null;
  content: string;
  published_at: string | null;
  like_count: number | null;
  created_at: string;
  updated_at: string;
};

function normalizeStringOrNull(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeRequiredIso(value: unknown, fallbackIso?: string) {
  const normalized = String(value || '').trim();
  if (!normalized) return fallbackIso || new Date().toISOString();
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : (fallbackIso || new Date().toISOString());
}

function normalizeInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function normalizeSortMode(value: unknown): 'top' | 'new' {
  return String(value || '').trim().toLowerCase() === 'new' ? 'new' : 'top';
}

function buildCommentRowId(input: {
  blueprintId: string;
  sortMode: 'top' | 'new';
  sourceCommentId: string;
}) {
  return `${input.blueprintId}:${input.sortMode}:${input.sourceCommentId}`;
}

function commentRowsMatch(args: {
  existing: OracleBlueprintYoutubeCommentRow[];
  next: OracleBlueprintYoutubeCommentSnapshotInput[];
}) {
  if (args.existing.length !== args.next.length) return false;
  for (let index = 0; index < args.existing.length; index += 1) {
    const existing = args.existing[index];
    const next = args.next[index];
    if (!existing || !next) return false;
    if (existing.source_comment_id !== normalizeRequiredString(next.source_comment_id)) return false;
    if (existing.display_order !== normalizeInt(next.display_order)) return false;
    if ((existing.author_name || null) !== normalizeStringOrNull(next.author_name)) return false;
    if ((existing.author_avatar_url || null) !== normalizeStringOrNull(next.author_avatar_url)) return false;
    if (existing.content !== normalizeRequiredString(next.content)) return false;
    if ((existing.published_at || null) !== normalizeStringOrNull(next.published_at)) return false;
    if ((existing.like_count ?? null) !== (next.like_count == null ? null : normalizeInt(next.like_count))) return false;
  }
  return true;
}

export async function listOracleBlueprintYoutubeComments(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
  sortMode?: 'top' | 'new' | null;
}) {
  const blueprintId = normalizeRequiredString(input.blueprintId);
  if (!blueprintId) return [] as OracleBlueprintYoutubeCommentRow[];
  const sortMode = normalizeSortMode(input.sortMode);

  const rows = await input.controlDb.db
    .selectFrom('blueprint_youtube_comment_state')
    .selectAll()
    .where('blueprint_id', '=', blueprintId)
    .where('sort_mode', '=', sortMode)
    .orderBy('display_order', 'asc')
    .orderBy('id', 'asc')
    .execute();

  return rows.map((row) => ({
    id: normalizeRequiredString(row.id),
    blueprint_id: normalizeRequiredString(row.blueprint_id),
    youtube_video_id: normalizeRequiredString(row.youtube_video_id),
    sort_mode: normalizeSortMode(row.sort_mode),
    source_comment_id: normalizeRequiredString(row.source_comment_id),
    display_order: normalizeInt(row.display_order),
    author_name: normalizeStringOrNull(row.author_name),
    author_avatar_url: normalizeStringOrNull(row.author_avatar_url),
    content: normalizeRequiredString(row.content),
    published_at: normalizeStringOrNull(row.published_at),
    like_count: row.like_count == null ? null : normalizeInt(row.like_count),
    created_at: normalizeRequiredIso(row.created_at),
    updated_at: normalizeRequiredIso(row.updated_at),
  }));
}

export async function replaceOracleBlueprintYoutubeCommentsSnapshot(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
  youtubeVideoId: string;
  sortMode: 'top' | 'new';
  comments: OracleBlueprintYoutubeCommentSnapshotInput[];
  nowIso?: string;
}) {
  const blueprintId = normalizeRequiredString(input.blueprintId);
  const youtubeVideoId = normalizeRequiredString(input.youtubeVideoId);
  const sortMode = normalizeSortMode(input.sortMode);
  const nowIso = normalizeRequiredIso(input.nowIso);
  const comments = Array.isArray(input.comments) ? input.comments : [];

  if (!blueprintId || !youtubeVideoId) {
    return {
      changed: false,
      skipped: true,
      previous_count: 0,
      next_count: 0,
    };
  }

  const existing = await listOracleBlueprintYoutubeComments({
    controlDb: input.controlDb,
    blueprintId,
    sortMode,
  });

  if (commentRowsMatch({ existing, next: comments })) {
    return {
      changed: false,
      skipped: true,
      previous_count: existing.length,
      next_count: comments.length,
    };
  }

  const createdAtById = new Map(existing.map((row) => [row.id, row.created_at]));
  const nextRows = comments.map((comment) => {
    const sourceCommentId = normalizeRequiredString(comment.source_comment_id);
    const rowId = buildCommentRowId({ blueprintId, sortMode, sourceCommentId });
    return {
      id: rowId,
      blueprint_id: blueprintId,
      youtube_video_id: youtubeVideoId,
      sort_mode: sortMode,
      source_comment_id: sourceCommentId,
      display_order: normalizeInt(comment.display_order),
      author_name: normalizeStringOrNull(comment.author_name),
      author_avatar_url: normalizeStringOrNull(comment.author_avatar_url),
      content: normalizeRequiredString(comment.content),
      published_at: normalizeStringOrNull(comment.published_at),
      like_count: comment.like_count == null ? null : normalizeInt(comment.like_count),
      created_at: normalizeRequiredIso(createdAtById.get(rowId), nowIso),
      updated_at: nowIso,
    } satisfies OracleBlueprintYoutubeCommentRow;
  });

  await input.controlDb.db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('blueprint_youtube_comment_state')
      .where('blueprint_id', '=', blueprintId)
      .where('sort_mode', '=', sortMode)
      .execute();

    for (const row of nextRows) {
      await trx
        .insertInto('blueprint_youtube_comment_state')
        .values(row)
        .execute();
    }
  });

  return {
    changed: true,
    skipped: false,
    previous_count: existing.length,
    next_count: comments.length,
  };
}
