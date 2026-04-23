import { appendGenerationEvent } from './generationTrace';

type DbClient = any;

export type YouTubeCommentSortMode = 'top' | 'new';
export type BlueprintYouTubeRefreshKind = 'view_count' | 'comments';
export type BlueprintYouTubeRefreshTrigger = 'auto' | 'manual';

export type StoredBlueprintYouTubeComment = {
  source_comment_id: string;
  display_order: number;
  author_name: string | null;
  author_avatar_url: string | null;
  content: string;
  published_at: string | null;
  like_count: number | null;
};

export type StoredBlueprintYouTubeCommentRow = {
  id: string;
  blueprint_id: string;
  youtube_video_id?: string | null;
  sort_mode: YouTubeCommentSortMode;
  source_comment_id: string;
  display_order: number;
  author_name: string | null;
  author_avatar_url: string | null;
  content: string;
  published_at: string | null;
  like_count: number | null;
};

type StoreBlueprintYouTubeCommentsResult = {
  changed: boolean;
  skipped: boolean;
  previous_count: number;
  next_count: number;
};

const YOUTUBE_COMMENT_SNAPSHOT_LIMIT = 20;
const DEFAULT_REFRESH_VIEW_INTERVAL_HOURS = 24;
const DEFAULT_COMMENTS_AUTO_FIRST_DELAY_MINUTES = 60;
const DEFAULT_COMMENTS_AUTO_SECOND_DELAY_HOURS = 48;
const DEFAULT_COMMENTS_MANUAL_COOLDOWN_MINUTES = 60;
const VIEW_REFRESH_BACKOFF_HOURS = [6, 24, 48] as const;
const COMMENTS_REFRESH_BACKOFF_HOURS = [24, 72, 168] as const;
const RECENT_BLUEPRINT_WINDOW_DAYS = 3;
const YOUTUBE_COMMENT_SORT_ORDER: Record<YouTubeCommentSortMode, 'relevance' | 'time'> = {
  top: 'relevance',
  new: 'time',
};

type BlueprintYouTubeRefreshCandidate = {
  blueprint_id: string;
  youtube_video_id: string;
  source_item_id: string | null;
  next_due_at: string | null;
  comments_auto_stage?: number;
};

type PendingRefreshJobPayload = {
  blueprint_id: string;
  refresh_kind: BlueprintYouTubeRefreshKind;
};

export type BlueprintYouTubeRefreshState = {
  blueprint_id: string;
  youtube_video_id: string;
  source_item_id: string | null;
  enabled: boolean;
  comments_auto_stage: number;
  next_comments_refresh_at: string | null;
  comments_manual_cooldown_until: string | null;
  last_comments_manual_refresh_at: string | null;
  last_comments_manual_triggered_by: string | null;
};

function toFutureIsoFromHours(hours: number) {
  const safeHours = Number.isFinite(hours) ? Math.max(1, Math.floor(hours)) : 1;
  return new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString();
}

function toFutureIsoFromMinutes(minutes: number) {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(1, Math.floor(minutes)) : 1;
  return new Date(Date.now() + safeMinutes * 60 * 1000).toISOString();
}

function getBackoffHours(level: number, values: readonly [number, number, number]) {
  const normalizedLevel = Math.max(1, Math.floor(level || 1));
  const index = Math.min(values.length - 1, normalizedLevel - 1);
  return values[index];
}

function normalizeIntervalHours(raw: unknown, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function normalizeNullableIso(raw: unknown) {
  const value = raw == null ? '' : String(raw || '').trim();
  return value || null;
}

function normalizeSourceItemId(raw: unknown) {
  return raw == null ? null : String(raw || '').trim() || null;
}

function normalizeCounter(raw: unknown) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function normalizeRefreshStateComparableValue(key: string, raw: unknown) {
  switch (key) {
    case 'youtube_video_id':
      return normalizeNullableIso(raw);
    case 'source_item_id':
      return normalizeSourceItemId(raw);
    case 'enabled':
      return Boolean(raw);
    case 'comments_auto_stage':
      return normalizeAutoStage(raw);
    case 'consecutive_view_failures':
    case 'consecutive_comments_failures':
      return normalizeCounter(raw);
    case 'next_view_refresh_at':
    case 'last_view_refresh_at':
    case 'next_comments_refresh_at':
    case 'last_comments_refresh_at':
    case 'comments_manual_cooldown_until':
    case 'last_comments_manual_refresh_at':
    case 'last_comments_manual_triggered_by':
    case 'last_view_refresh_status':
    case 'last_comments_refresh_status':
    case 'last_error_message':
      return normalizeNullableIso(raw);
    default:
      if (raw == null) return null;
      if (typeof raw === 'string') return raw.trim() || null;
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
      if (typeof raw === 'boolean') return raw;
      return raw;
  }
}

async function getExistingRefreshStateRecord(args: {
  db: DbClient;
  blueprintId: string;
}) {
  const table = args.db.from('blueprint_youtube_refresh_state');
  if (!table || typeof table.select !== 'function') return null;
  const { data, error } = await table
    .select([
      'blueprint_id',
      'youtube_video_id',
      'source_item_id',
      'enabled',
      'next_view_refresh_at',
      'last_view_refresh_at',
      'last_view_refresh_status',
      'consecutive_view_failures',
      'next_comments_refresh_at',
      'last_comments_refresh_at',
      'last_comments_refresh_status',
      'consecutive_comments_failures',
      'comments_auto_stage',
      'comments_manual_cooldown_until',
      'last_comments_manual_refresh_at',
      'last_comments_manual_triggered_by',
      'last_error_message',
    ].join(','))
    .eq('blueprint_id', args.blueprintId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error, 'blueprint_youtube_refresh_state')) return null;
    throw error;
  }
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function refreshStatePatchIsNoop(args: {
  existing: Record<string, unknown> | null;
  videoId: string;
  sourceItemId: string | null;
  patch: Record<string, unknown>;
}) {
  if (!args.existing) return false;
  if (
    normalizeRefreshStateComparableValue('youtube_video_id', args.existing.youtube_video_id)
    !== normalizeRefreshStateComparableValue('youtube_video_id', args.videoId)
  ) {
    return false;
  }
  if (
    normalizeRefreshStateComparableValue('source_item_id', args.existing.source_item_id)
    !== normalizeRefreshStateComparableValue('source_item_id', args.sourceItemId)
  ) {
    return false;
  }

  for (const [key, value] of Object.entries(args.patch)) {
    if (value === undefined) continue;
    if (
      normalizeRefreshStateComparableValue(key, args.existing[key])
      !== normalizeRefreshStateComparableValue(key, value)
    ) {
      return false;
    }
  }

  return true;
}

function parseViewCount(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const items = Array.isArray(root.items) ? root.items : [];
  const first = items[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return null;
  const snippet = (first as Record<string, unknown>).statistics;
  if (!snippet || typeof snippet !== 'object' || Array.isArray(snippet)) return null;
  const raw = Number((snippet as Record<string, unknown>).viewCount);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.floor(raw));
}

function isMissingRelationError(error: unknown, relation: string) {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const hay = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
  const code = String(e?.code || '').trim().toUpperCase();
  if (code === '42P01' || code === 'PGRST205') {
    return hay.includes(relation.toLowerCase()) || hay.includes(relation.replace(/^public\./i, '').toLowerCase());
  }
  return (
    (hay.includes('does not exist') || hay.includes('could not find the table'))
    && (hay.includes(relation.toLowerCase()) || hay.includes(relation.replace(/^public\./i, '').toLowerCase()))
  );
}

function extractApiErrorReason(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const root = payload as Record<string, unknown>;
  const error = root.error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return '';
  const record = error as Record<string, unknown>;
  const errors = Array.isArray(record.errors) ? record.errors : [];
  for (const candidate of errors) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const reason = String((candidate as Record<string, unknown>).reason || '').trim();
    if (reason) return reason;
  }
  return String(record.message || '').trim();
}

function isCommentsUnavailableReason(reason: string) {
  const normalized = String(reason || '').trim().toLowerCase();
  return normalized === 'commentsdisabled'
    || normalized === 'video_not_found'
    || normalized === 'video not found'
    || normalized === 'forbidden';
}

function normalizeCommentItems(payload: unknown): StoredBlueprintYouTubeComment[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const root = payload as Record<string, unknown>;
  const items = Array.isArray(root.items) ? root.items : [];
  const comments: StoredBlueprintYouTubeComment[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const itemRecord = item as Record<string, unknown>;
    const sourceCommentId = String(itemRecord.id || '').trim();
    const snippet = itemRecord.snippet;
    if (!sourceCommentId || !snippet || typeof snippet !== 'object' || Array.isArray(snippet)) continue;
    const snippetRecord = snippet as Record<string, unknown>;
    const topLevel = snippetRecord.topLevelComment;
    if (!topLevel || typeof topLevel !== 'object' || Array.isArray(topLevel)) continue;
    const topLevelRecord = topLevel as Record<string, unknown>;
    const topSnippet = topLevelRecord.snippet;
    if (!topSnippet || typeof topSnippet !== 'object' || Array.isArray(topSnippet)) continue;
    const topSnippetRecord = topSnippet as Record<string, unknown>;
    const content = String(topSnippetRecord.textDisplay || topSnippetRecord.textOriginal || '').trim();
    if (!content) continue;
    const likeCountRaw = Number(topSnippetRecord.likeCount);
    comments.push({
      source_comment_id: sourceCommentId,
      display_order: comments.length,
      author_name: String(topSnippetRecord.authorDisplayName || '').trim() || null,
      author_avatar_url: String(topSnippetRecord.authorProfileImageUrl || '').trim() || null,
      content,
      published_at: String(topSnippetRecord.publishedAt || '').trim() || null,
      like_count: Number.isFinite(likeCountRaw) ? Math.max(0, Math.floor(likeCountRaw)) : null,
    });
    if (comments.length >= YOUTUBE_COMMENT_SNAPSHOT_LIMIT) break;
  }
  return comments;
}

function normalizeStoredCommentComparableValue(raw: unknown) {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : null;
  return raw;
}

function commentsSnapshotMatches(args: {
  existing: Array<Record<string, unknown>>;
  next: StoredBlueprintYouTubeComment[];
}) {
  if (args.existing.length !== args.next.length) return false;
  for (let index = 0; index < args.next.length; index += 1) {
    const existing = args.existing[index] || {};
    const next = args.next[index];
    if (
      normalizeStoredCommentComparableValue(existing.source_comment_id)
      !== normalizeStoredCommentComparableValue(next.source_comment_id)
    ) {
      return false;
    }
    if (
      normalizeStoredCommentComparableValue(existing.display_order)
      !== normalizeStoredCommentComparableValue(next.display_order)
    ) {
      return false;
    }
    if (
      normalizeStoredCommentComparableValue(existing.author_name)
      !== normalizeStoredCommentComparableValue(next.author_name)
    ) {
      return false;
    }
    if (
      normalizeStoredCommentComparableValue(existing.author_avatar_url)
      !== normalizeStoredCommentComparableValue(next.author_avatar_url)
    ) {
      return false;
    }
    if (
      normalizeStoredCommentComparableValue(existing.content)
      !== normalizeStoredCommentComparableValue(next.content)
    ) {
      return false;
    }
    if (
      normalizeStoredCommentComparableValue(existing.published_at)
      !== normalizeStoredCommentComparableValue(next.published_at)
    ) {
      return false;
    }
    if (
      normalizeStoredCommentComparableValue(existing.like_count)
      !== normalizeStoredCommentComparableValue(next.like_count)
    ) {
      return false;
    }
  }
  return true;
}

export function createBlueprintYouTubeCommentsService(input: {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  refreshViewIntervalHours?: number;
  commentsAutoFirstDelayMinutes?: number;
  commentsAutoSecondDelayHours?: number;
  commentsManualCooldownMinutes?: number;
  storeSourceItemViewCountOracleAware?: (input: {
    db: DbClient;
    sourceItemId: string;
    viewCount: number | null;
  }) => Promise<boolean>;
  listPendingRefreshBlueprintIdsOracleFirst?: (input: {
    db: DbClient;
    blueprintIds: string[];
    kind: BlueprintYouTubeRefreshKind;
  }) => Promise<Set<string>>;
  listOracleActiveRefreshJobs?: (input: {
    scope: string;
    limit: number;
  }) => Promise<Array<{
    payload: Record<string, unknown> | null;
  }>>;
  storeBlueprintYouTubeCommentsOracleAware?: (input: {
    db: DbClient;
    blueprintId: string;
    videoId: string;
    sortMode: YouTubeCommentSortMode;
    comments: StoredBlueprintYouTubeComment[];
  }) => Promise<StoreBlueprintYouTubeCommentsResult>;
  listBlueprintYouTubeCommentsOracleAware?: (input: {
    db: DbClient;
    blueprintId: string;
    sortMode: YouTubeCommentSortMode;
  }) => Promise<StoredBlueprintYouTubeCommentRow[]>;
}) {
  const apiKey = String(input.apiKey || '').trim();
  const fetchImpl = input.fetchImpl || fetch;
  const refreshViewIntervalHours = normalizeIntervalHours(
    input.refreshViewIntervalHours,
    DEFAULT_REFRESH_VIEW_INTERVAL_HOURS,
  );
  const commentsAutoFirstDelayMinutes = normalizeIntervalHours(
    input.commentsAutoFirstDelayMinutes,
    DEFAULT_COMMENTS_AUTO_FIRST_DELAY_MINUTES,
  );
  const commentsAutoSecondDelayHours = normalizeIntervalHours(
    input.commentsAutoSecondDelayHours,
    DEFAULT_COMMENTS_AUTO_SECOND_DELAY_HOURS,
  );
  const commentsManualCooldownMinutes = normalizeIntervalHours(
    input.commentsManualCooldownMinutes,
    DEFAULT_COMMENTS_MANUAL_COOLDOWN_MINUTES,
  );
  const storeSourceItemViewCountOracleAware = input.storeSourceItemViewCountOracleAware;
  const listPendingRefreshBlueprintIdsOracleFirst = input.listPendingRefreshBlueprintIdsOracleFirst;
  const listOracleActiveRefreshJobs = input.listOracleActiveRefreshJobs;
  const storeBlueprintYouTubeCommentsOracleAware = input.storeBlueprintYouTubeCommentsOracleAware;
  const listBlueprintYouTubeCommentsOracleAware = input.listBlueprintYouTubeCommentsOracleAware;

  async function listBlueprintYouTubeComments(args: {
    db: DbClient;
    blueprintId: string;
    sortMode: YouTubeCommentSortMode;
  }) {
    const blueprintId = String(args.blueprintId || '').trim();
    if (!blueprintId) return [] as StoredBlueprintYouTubeCommentRow[];

    if (listBlueprintYouTubeCommentsOracleAware) {
      return listBlueprintYouTubeCommentsOracleAware({
        db: args.db,
        blueprintId,
        sortMode: args.sortMode,
      });
    }

    const { data, error } = await args.db
      .from('blueprint_youtube_comments')
      .select('id, blueprint_id, youtube_video_id, sort_mode, source_comment_id, display_order, author_name, author_avatar_url, content, published_at, like_count')
      .eq('blueprint_id', blueprintId)
      .eq('sort_mode', args.sortMode)
      .order('display_order', { ascending: true });

    if (error) {
      if (isMissingRelationError(error, 'blueprint_youtube_comments')) {
        return [] as StoredBlueprintYouTubeCommentRow[];
      }
      throw error;
    }

    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id || '').trim(),
      blueprint_id: String(row.blueprint_id || '').trim(),
      youtube_video_id: String(row.youtube_video_id || '').trim() || null,
      sort_mode: String(row.sort_mode || '').trim().toLowerCase() === 'new' ? 'new' : 'top',
      source_comment_id: String(row.source_comment_id || '').trim(),
      display_order: Number.isFinite(Number(row.display_order)) ? Math.max(0, Math.floor(Number(row.display_order))) : 0,
      author_name: String(row.author_name || '').trim() || null,
      author_avatar_url: String(row.author_avatar_url || '').trim() || null,
      content: String(row.content || '').trim(),
      published_at: String(row.published_at || '').trim() || null,
      like_count: row.like_count == null ? null : (Number.isFinite(Number(row.like_count)) ? Math.max(0, Math.floor(Number(row.like_count))) : null),
    }));
  }

  async function resolveBlueprintYouTubeVideoId(args: {
    db: DbClient;
    blueprintId: string;
    explicitVideoId?: string | null;
    runId?: string | null;
  }) {
    const explicitVideoId = String(args.explicitVideoId || '').trim();
    if (explicitVideoId) return explicitVideoId;

    const normalizedRunId = String(args.runId || '').trim();
    if (normalizedRunId) {
      const { data, error } = await args.db
        .from('generation_runs')
        .select('video_id')
        .eq('run_id', normalizedRunId)
        .maybeSingle();
      if (error) throw error;
      const runVideoId = String(data?.video_id || '').trim();
      if (runVideoId) return runVideoId;
    }

    const { data: latestRun, error: latestRunError } = await args.db
      .from('generation_runs')
      .select('video_id, started_at')
      .eq('blueprint_id', args.blueprintId)
      .eq('status', 'succeeded')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestRunError) throw latestRunError;
    return String(latestRun?.video_id || '').trim() || null;
  }

  async function fetchYouTubeCommentSnapshot(args: {
    videoId: string;
    sortMode: YouTubeCommentSortMode;
  }) {
    if (!apiKey) return [] as StoredBlueprintYouTubeComment[];
    const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('videoId', args.videoId);
    url.searchParams.set('maxResults', String(YOUTUBE_COMMENT_SNAPSHOT_LIMIT));
    url.searchParams.set('order', YOUTUBE_COMMENT_SORT_ORDER[args.sortMode]);
    url.searchParams.set('textFormat', 'plainText');
    url.searchParams.set('key', apiKey);

    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = extractApiErrorReason(payload);
      if (isCommentsUnavailableReason(reason)) {
        return [] as StoredBlueprintYouTubeComment[];
      }
      throw new Error(`youtube_comments_http_${response.status}${reason ? `:${reason}` : ''}`);
    }

    return normalizeCommentItems(payload);
  }

  async function fetchYouTubeViewCount(args: {
    videoId: string;
  }) {
    if (!apiKey) return null;
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('id', args.videoId);
    url.searchParams.set('maxResults', '1');
    url.searchParams.set('key', apiKey);

    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = extractApiErrorReason(payload);
      throw new Error(`youtube_video_stats_http_${response.status}${reason ? `:${reason}` : ''}`);
    }

    return parseViewCount(payload);
  }

  async function storeBlueprintYouTubeComments(args: {
    db: DbClient;
    blueprintId: string;
    videoId: string;
    sortMode: YouTubeCommentSortMode;
    comments: StoredBlueprintYouTubeComment[];
  }): Promise<StoreBlueprintYouTubeCommentsResult> {
    const normalizedVideoId = String(args.videoId || '').trim();
    if (!normalizedVideoId) {
      return {
        changed: false,
        skipped: true,
        previous_count: 0,
        next_count: 0,
      };
    }
    const comments = Array.isArray(args.comments) ? args.comments : [];

    if (storeBlueprintYouTubeCommentsOracleAware) {
      return storeBlueprintYouTubeCommentsOracleAware({
        db: args.db,
        blueprintId: args.blueprintId,
        videoId: normalizedVideoId,
        sortMode: args.sortMode,
        comments,
      });
    }

    const existingQuery = await args.db
      .from('blueprint_youtube_comments')
      .select('source_comment_id, display_order, author_name, author_avatar_url, content, published_at, like_count')
      .eq('blueprint_id', args.blueprintId)
      .eq('sort_mode', args.sortMode)
      .order('display_order', { ascending: true });
    if (existingQuery?.error) {
      if (isMissingRelationError(existingQuery.error, 'blueprint_youtube_comments')) {
        return {
          changed: false,
          skipped: true,
          previous_count: 0,
          next_count: comments.length,
        };
      }
      throw existingQuery.error;
    }
    const existingRows = Array.isArray(existingQuery?.data)
      ? existingQuery.data as Array<Record<string, unknown>>
      : [];
    if (commentsSnapshotMatches({ existing: existingRows, next: comments })) {
      console.log('[blueprint_youtube_comments_refresh_skipped]', JSON.stringify({
        blueprint_id: args.blueprintId,
        youtube_video_id: normalizedVideoId,
        sort_mode: args.sortMode,
        comment_count: comments.length,
      }));
      return {
        changed: false,
        skipped: true,
        previous_count: existingRows.length,
        next_count: comments.length,
      };
    }

    const deleteQuery = await args.db
      .from('blueprint_youtube_comments')
      .delete()
      .eq('blueprint_id', args.blueprintId)
      .eq('sort_mode', args.sortMode);
    if (deleteQuery?.error) {
      if (isMissingRelationError(deleteQuery.error, 'blueprint_youtube_comments')) {
        return {
          changed: false,
          skipped: true,
          previous_count: existingRows.length,
          next_count: comments.length,
        };
      }
      throw deleteQuery.error;
    }

    if (comments.length === 0) {
      console.log('[blueprint_youtube_comments_refresh_changed]', JSON.stringify({
        blueprint_id: args.blueprintId,
        youtube_video_id: normalizedVideoId,
        sort_mode: args.sortMode,
        previous_count: existingRows.length,
        next_count: 0,
      }));
      return {
        changed: true,
        skipped: false,
        previous_count: existingRows.length,
        next_count: 0,
      };
    }

    const { error } = await args.db
      .from('blueprint_youtube_comments')
      .insert(
        comments.map((comment) => ({
          blueprint_id: args.blueprintId,
          youtube_video_id: normalizedVideoId,
          sort_mode: args.sortMode,
          source_comment_id: comment.source_comment_id,
          display_order: comment.display_order,
          author_name: comment.author_name,
          author_avatar_url: comment.author_avatar_url,
          content: comment.content,
          published_at: comment.published_at,
          like_count: comment.like_count,
        })),
      );
    if (error) {
      if (isMissingRelationError(error, 'blueprint_youtube_comments')) {
        return {
          changed: false,
          skipped: true,
          previous_count: existingRows.length,
          next_count: comments.length,
        };
      }
      throw error;
    }
    console.log('[blueprint_youtube_comments_refresh_changed]', JSON.stringify({
      blueprint_id: args.blueprintId,
      youtube_video_id: normalizedVideoId,
      sort_mode: args.sortMode,
      previous_count: existingRows.length,
      next_count: comments.length,
    }));
    return {
      changed: true,
      skipped: false,
      previous_count: existingRows.length,
      next_count: comments.length,
    };
  }

  async function storeSourceItemViewCount(args: {
    db: DbClient;
    sourceItemId: string;
    viewCount: number | null;
  }) {
    if (storeSourceItemViewCountOracleAware) {
      return storeSourceItemViewCountOracleAware({
        db: args.db,
        sourceItemId: args.sourceItemId,
        viewCount: args.viewCount,
      });
    }
    const normalizedSourceItemId = String(args.sourceItemId || '').trim();
    if (!normalizedSourceItemId || args.viewCount == null) return false;

    const { data: sourceRow, error: sourceError } = await args.db
      .from('source_items')
      .select('metadata')
      .eq('id', normalizedSourceItemId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!sourceRow) return false;

    const currentMetadata =
      sourceRow?.metadata && typeof sourceRow.metadata === 'object' && !Array.isArray(sourceRow.metadata)
        ? (sourceRow.metadata as Record<string, unknown>)
        : {};
    const currentViewCount = (() => {
      const parsed = Number(currentMetadata.view_count);
      return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
    })();
    if (currentViewCount === args.viewCount) return false;

    const nextMetadata = {
      ...currentMetadata,
      view_count: args.viewCount,
      view_count_fetched_at: new Date().toISOString(),
    };

    const { data: updatedRow, error: updateError } = await args.db
      .from('source_items')
      .update({ metadata: nextMetadata })
      .eq('id', normalizedSourceItemId)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    return Boolean(updatedRow?.id);
  }

  async function appendRefreshEvent(args: {
    traceDb?: DbClient | null;
    runId?: string | null;
    event: string;
    level?: 'info' | 'warn' | 'error';
    payload?: Record<string, unknown>;
  }) {
    if (!args.traceDb) return;
    const runId = String(args.runId || '').trim();
    if (!runId) return;
    await appendGenerationEvent(args.traceDb, {
      runId,
      event: args.event,
      level: args.level,
      payload: args.payload,
    });
  }

  async function upsertRefreshState(args: {
    db: DbClient;
    blueprintId: string;
    videoId: string;
    sourceItemId?: string | null;
    patch: Record<string, unknown>;
  }) {
    const normalizedSourceItemId = args.sourceItemId == null ? null : String(args.sourceItemId || '').trim() || null;
    const existingRecord = await getExistingRefreshStateRecord({
      db: args.db,
      blueprintId: args.blueprintId,
    });
    if (refreshStatePatchIsNoop({
      existing: existingRecord,
      videoId: args.videoId,
      sourceItemId: normalizedSourceItemId,
      patch: args.patch,
    })) {
      return;
    }
    const nowIso = new Date().toISOString();
    const { error } = await args.db
      .from('blueprint_youtube_refresh_state')
      .upsert({
        blueprint_id: args.blueprintId,
        youtube_video_id: args.videoId,
        source_item_id: normalizedSourceItemId,
        updated_at: nowIso,
        ...args.patch,
      }, { onConflict: 'blueprint_id' });
    if (error) {
      if (isMissingRelationError(error, 'blueprint_youtube_refresh_state')) return;
      throw error;
    }
  }

  async function getRefreshFailureCount(args: {
    db: DbClient;
    blueprintId: string;
    kind: BlueprintYouTubeRefreshKind;
  }) {
    const field = args.kind === 'view_count' ? 'consecutive_view_failures' : 'consecutive_comments_failures';
    const { data, error } = await args.db
      .from('blueprint_youtube_refresh_state')
      .select(field)
      .eq('blueprint_id', args.blueprintId)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error, 'blueprint_youtube_refresh_state')) return 0;
      throw error;
    }
    const count = Number((data as Record<string, unknown> | null)?.[field] || 0);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  }

  function normalizeAutoStage(raw: unknown) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(2, Math.max(0, Math.floor(parsed)));
  }

  async function getRefreshStateForBlueprint(args: {
    db: DbClient;
    blueprintId: string;
  }) {
    const { data, error } = await args.db
      .from('blueprint_youtube_refresh_state')
      .select(
        [
          'blueprint_id',
          'youtube_video_id',
          'source_item_id',
          'enabled',
          'comments_auto_stage',
          'next_comments_refresh_at',
          'comments_manual_cooldown_until',
          'last_comments_manual_refresh_at',
          'last_comments_manual_triggered_by',
        ].join(','),
      )
      .eq('blueprint_id', args.blueprintId)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error, 'blueprint_youtube_refresh_state')) return null;
      throw error;
    }
    if (!data) return null;
    return {
      blueprint_id: String(data.blueprint_id || '').trim(),
      youtube_video_id: String(data.youtube_video_id || '').trim(),
      source_item_id: data.source_item_id == null ? null : String(data.source_item_id || '').trim() || null,
      enabled: Boolean(data.enabled),
      comments_auto_stage: normalizeAutoStage((data as Record<string, unknown>).comments_auto_stage),
      next_comments_refresh_at: (data as Record<string, unknown>).next_comments_refresh_at == null
        ? null
        : String((data as Record<string, unknown>).next_comments_refresh_at || '').trim() || null,
      comments_manual_cooldown_until: data.comments_manual_cooldown_until == null
        ? null
        : String(data.comments_manual_cooldown_until || '').trim() || null,
      last_comments_manual_refresh_at: data.last_comments_manual_refresh_at == null
        ? null
        : String(data.last_comments_manual_refresh_at || '').trim() || null,
      last_comments_manual_triggered_by: (data as Record<string, unknown>).last_comments_manual_triggered_by == null
        ? null
        : String((data as Record<string, unknown>).last_comments_manual_triggered_by || '').trim() || null,
    } satisfies BlueprintYouTubeRefreshState;
  }

  async function claimManualCommentsRefreshCooldown(args: {
    db: DbClient;
    blueprintId: string;
    triggeredByUserId: string;
    previousCooldownUntil: string | null;
  }) {
    const nowIso = new Date().toISOString();
    const cooldownUntil = toFutureIsoFromMinutes(commentsManualCooldownMinutes);
    let query = args.db
      .from('blueprint_youtube_refresh_state')
      .update({
        comments_manual_cooldown_until: cooldownUntil,
        last_comments_manual_refresh_at: nowIso,
        last_comments_manual_triggered_by: args.triggeredByUserId,
        updated_at: nowIso,
      })
      .eq('blueprint_id', args.blueprintId)
      .eq('enabled', true);
    if (args.previousCooldownUntil) {
      query = query.eq('comments_manual_cooldown_until', args.previousCooldownUntil);
    } else {
      query = query.is('comments_manual_cooldown_until', null);
    }
    const { data, error } = await query.select('blueprint_id').maybeSingle();
    if (error) {
      if (isMissingRelationError(error, 'blueprint_youtube_refresh_state')) return { claimed: false as const, cooldownUntil: null };
      throw error;
    }
    if (!data?.blueprint_id) {
      return { claimed: false as const, cooldownUntil: null };
    }
    return {
      claimed: true as const,
      cooldownUntil,
    };
  }

  async function releaseManualCommentsRefreshCooldown(args: {
    db: DbClient;
    blueprintId: string;
    expectedCooldownUntil: string;
    previousCooldownUntil: string | null;
    previousManualRefreshAt: string | null;
    previousManualTriggeredBy: string | null;
  }) {
    const nowIso = new Date().toISOString();
    await args.db
      .from('blueprint_youtube_refresh_state')
      .update({
        comments_manual_cooldown_until: args.previousCooldownUntil,
        last_comments_manual_refresh_at: args.previousManualRefreshAt,
        last_comments_manual_triggered_by: args.previousManualTriggeredBy,
        updated_at: nowIso,
      })
      .eq('blueprint_id', args.blueprintId)
      .eq('comments_manual_cooldown_until', args.expectedCooldownUntil);
  }

  async function registerRefreshStateForBlueprint(args: {
    db: DbClient;
    blueprintId: string;
    runId?: string | null;
    explicitVideoId?: string | null;
    explicitSourceItemId?: string | null;
  }) {
    if (!apiKey) return;
    const videoId = await resolveBlueprintYouTubeVideoId({
      db: args.db,
      blueprintId: args.blueprintId,
      explicitVideoId: args.explicitVideoId,
      runId: args.runId || null,
    });
    if (!videoId) return;

    const existingState = await getRefreshStateForBlueprint({
      db: args.db,
      blueprintId: args.blueprintId,
    });
    const normalizedSourceItemId = normalizeSourceItemId(args.explicitSourceItemId);
    if (
      existingState
      && existingState.enabled
      && existingState.youtube_video_id === videoId
      && (
        normalizedSourceItemId == null
        || existingState.source_item_id === normalizedSourceItemId
      )
    ) {
      return;
    }

    await upsertRefreshState({
      db: args.db,
      blueprintId: args.blueprintId,
      videoId,
      sourceItemId: normalizedSourceItemId,
      patch: {
        enabled: true,
        next_view_refresh_at: toFutureIsoFromHours(refreshViewIntervalHours),
        next_comments_refresh_at: toFutureIsoFromMinutes(commentsAutoFirstDelayMinutes),
        comments_auto_stage: 0,
        comments_manual_cooldown_until: null,
        last_error_message: null,
      },
    });
  }

  async function listDueRefreshCandidates(args: {
    db: DbClient;
    kind: BlueprintYouTubeRefreshKind;
    limit: number;
    recentWithinDays?: number;
  }) {
    if (!apiKey) return [] as BlueprintYouTubeRefreshCandidate[];
    const limit = Math.max(1, Math.min(200, Math.floor(Number(args.limit) || 1)));
    const dueColumn = args.kind === 'view_count' ? 'next_view_refresh_at' : 'next_comments_refresh_at';
    const nowIso = new Date().toISOString();

    const rowsByKey = new Map<string, BlueprintYouTubeRefreshCandidate>();
    const tryAddRows = (rows: unknown[]) => {
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const record = row as Record<string, unknown>;
        const blueprintId = String(record.blueprint_id || '').trim();
        const videoId = String(record.youtube_video_id || '').trim();
        if (!blueprintId || !videoId || rowsByKey.has(blueprintId)) continue;
        rowsByKey.set(blueprintId, {
          blueprint_id: blueprintId,
          youtube_video_id: videoId,
          source_item_id: record.source_item_id == null ? null : String(record.source_item_id || '').trim() || null,
          next_due_at: record[dueColumn] == null ? null : String(record[dueColumn] || '').trim() || null,
          ...(args.kind === 'comments'
            ? { comments_auto_stage: normalizeAutoStage(record.comments_auto_stage) }
            : {}),
        });
      }
    };

    const dueColumnSelect = args.kind === 'comments'
      ? `blueprint_id,youtube_video_id,source_item_id,${dueColumn},comments_auto_stage`
      : `blueprint_id,youtube_video_id,source_item_id,${dueColumn}`;

    const dueQuery = await args.db
      .from('blueprint_youtube_refresh_state')
      .select(dueColumnSelect)
      .eq('enabled', true)
      .lte(dueColumn, nowIso)
      .limit(Math.max(limit * 3, 30));
    if (dueQuery.error) {
      if (isMissingRelationError(dueQuery.error, 'blueprint_youtube_refresh_state')) return [] as BlueprintYouTubeRefreshCandidate[];
      throw dueQuery.error;
    }
    tryAddRows(Array.isArray(dueQuery.data) ? dueQuery.data : []);

    if (rowsByKey.size < limit) {
      const nullQuery = await args.db
        .from('blueprint_youtube_refresh_state')
        .select(dueColumnSelect)
        .eq('enabled', true)
        .is(dueColumn, null)
        .limit(Math.max(limit * 3, 30));
      if (nullQuery.error) {
        if (!isMissingRelationError(nullQuery.error, 'blueprint_youtube_refresh_state')) {
          throw nullQuery.error;
        }
      } else {
        tryAddRows(Array.isArray(nullQuery.data) ? nullQuery.data : []);
      }
    }

    const candidates = [...rowsByKey.values()].filter((row) => {
      if (args.kind !== 'comments') return true;
      const commentsAutoStage = normalizeAutoStage((row as Record<string, unknown>).comments_auto_stage);
      return commentsAutoStage < 2;
    });
    if (candidates.length === 0) return [];

    const blueprintIds = candidates.map((row) => row.blueprint_id);
    const createdById = new Map<string, number>();
    const { data: blueprintRows, error: blueprintError } = await args.db
      .from('blueprints')
      .select('id,created_at')
      .in('id', blueprintIds);
    if (blueprintError) throw blueprintError;
    for (const row of blueprintRows || []) {
      const id = String((row as { id?: string }).id || '').trim();
      const createdAt = Date.parse(String((row as { created_at?: string }).created_at || ''));
      if (!id || Number.isNaN(createdAt)) continue;
      createdById.set(id, createdAt);
    }

    const recentWithinDays = normalizeIntervalHours(args.recentWithinDays, RECENT_BLUEPRINT_WINDOW_DAYS);
    const recentThresholdMs = Date.now() - recentWithinDays * 24 * 60 * 60 * 1000;
    candidates.sort((a, b) => {
      const aCreated = createdById.get(a.blueprint_id) ?? 0;
      const bCreated = createdById.get(b.blueprint_id) ?? 0;
      const aRecent = aCreated >= recentThresholdMs ? 1 : 0;
      const bRecent = bCreated >= recentThresholdMs ? 1 : 0;
      if (aRecent !== bRecent) return bRecent - aRecent;
      const aDue = a.next_due_at ? Date.parse(a.next_due_at) : 0;
      const bDue = b.next_due_at ? Date.parse(b.next_due_at) : 0;
      if (aDue !== bDue) return aDue - bDue;
      return aCreated - bCreated;
    });

    return candidates.slice(0, limit);
  }

  function extractPendingRefreshJobPayload(raw: unknown): PendingRefreshJobPayload | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const blueprintId = String(record.blueprint_id || '').trim();
    const refreshKindRaw = String(record.refresh_kind || '').trim().toLowerCase();
    const refreshKind: BlueprintYouTubeRefreshKind | null = refreshKindRaw === 'view_count'
      ? 'view_count'
      : refreshKindRaw === 'comments'
        ? 'comments'
        : null;
    if (!blueprintId || !refreshKind) return null;
    return {
      blueprint_id: blueprintId,
      refresh_kind: refreshKind,
    };
  }

  async function listPendingRefreshBlueprintIds(args: {
    db: DbClient;
    blueprintIds: string[];
    kind: BlueprintYouTubeRefreshKind;
  }) {
    const normalizedIds = [...new Set(
      (args.blueprintIds || [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    )];
    if (normalizedIds.length === 0) return new Set<string>();

    if (listPendingRefreshBlueprintIdsOracleFirst) {
      return listPendingRefreshBlueprintIdsOracleFirst({
        db: args.db,
        blueprintIds: normalizedIds,
        kind: args.kind,
      });
    }

    if (listOracleActiveRefreshJobs) {
      const rows = await listOracleActiveRefreshJobs({
        scope: 'blueprint_youtube_refresh',
        limit: Math.max(normalizedIds.length * 2, 50),
      });
      const allowedIds = new Set(normalizedIds);
      const pendingIds = new Set<string>();
      for (const row of rows || []) {
        const payload = extractPendingRefreshJobPayload(row?.payload);
        if (!payload || payload.refresh_kind !== args.kind || !allowedIds.has(payload.blueprint_id)) continue;
        pendingIds.add(payload.blueprint_id);
      }
      return pendingIds;
    }

    let query = args.db
      .from('ingestion_jobs')
      .select('payload')
      .eq('scope', 'blueprint_youtube_refresh')
      .in('status', ['queued', 'running']);

    if (typeof query.contains === 'function') {
      query = query.contains('payload', { refresh_kind: args.kind });
    }

    const { data, error } = await query.limit(Math.max(normalizedIds.length * 2, 50));
    if (error) throw error;

    const allowedIds = new Set(normalizedIds);
    const pendingIds = new Set<string>();
    for (const row of data || []) {
      const payload = extractPendingRefreshJobPayload(row?.payload);
      if (!payload || payload.refresh_kind !== args.kind || !allowedIds.has(payload.blueprint_id)) continue;
      pendingIds.add(payload.blueprint_id);
    }
    return pendingIds;
  }

  async function hasPendingRefreshJob(args: {
    db: DbClient;
    blueprintId: string;
    kind: BlueprintYouTubeRefreshKind;
  }) {
    const pendingIds = await listPendingRefreshBlueprintIds({
      db: args.db,
      blueprintIds: [args.blueprintId],
      kind: args.kind,
    });
    return pendingIds.has(String(args.blueprintId || '').trim());
  }

  async function executeRefresh(args: {
    db: DbClient;
    traceDb?: DbClient | null;
    runId?: string | null;
    blueprintId: string;
    kind: BlueprintYouTubeRefreshKind;
    trigger?: BlueprintYouTubeRefreshTrigger;
    youtubeVideoId: string;
    sourceItemId?: string | null;
    triggeredByUserId?: string | null;
  }) {
    if (!apiKey) return;
    const nowIso = new Date().toISOString();
    const sourceItemId = String(args.sourceItemId || '').trim() || null;
    const eventPayloadBase = {
      refresh_kind: args.kind,
      refresh_trigger: args.trigger || 'auto',
      blueprint_id: args.blueprintId,
      video_id: args.youtubeVideoId,
    };

    await appendRefreshEvent({
      traceDb: args.traceDb,
      runId: args.runId,
      event: 'youtube_refresh_started',
      payload: eventPayloadBase,
    });
    console.log('[youtube_refresh_started]', JSON.stringify(eventPayloadBase));

    if (args.kind === 'view_count') {
      if (!sourceItemId) {
        await upsertRefreshState({
          db: args.db,
          blueprintId: args.blueprintId,
          videoId: args.youtubeVideoId,
          sourceItemId: null,
          patch: {
            last_view_refresh_status: 'skipped',
            next_view_refresh_at: toFutureIsoFromHours(24),
          },
        });
        await appendRefreshEvent({
          traceDb: args.traceDb,
          runId: args.runId,
          event: 'youtube_refresh_succeeded',
          payload: {
            ...eventPayloadBase,
            status: 'skipped',
          },
        });
        console.log('[youtube_refresh_succeeded]', JSON.stringify({
          ...eventPayloadBase,
          status: 'skipped',
        }));
        return;
      }

      try {
        const viewCount = await fetchYouTubeViewCount({ videoId: args.youtubeVideoId });
        const storedOnSourceItem = storeSourceItemViewCountOracleAware
          ? await storeSourceItemViewCountOracleAware({
              db: args.db,
              sourceItemId,
              viewCount,
            })
          : await storeSourceItemViewCount({
              db: args.db,
              sourceItemId,
              viewCount,
            });
        const status = storedOnSourceItem ? 'ok' : 'skipped';
        await upsertRefreshState({
          db: args.db,
          blueprintId: args.blueprintId,
          videoId: args.youtubeVideoId,
          sourceItemId,
          patch: {
            last_view_refresh_at: nowIso,
            last_view_refresh_status: status,
            consecutive_view_failures: 0,
            next_view_refresh_at: status === 'ok'
              ? toFutureIsoFromHours(refreshViewIntervalHours)
              : toFutureIsoFromHours(24),
            last_error_message: null,
          },
        });
        await appendRefreshEvent({
          traceDb: args.traceDb,
          runId: args.runId,
          event: 'youtube_refresh_succeeded',
          payload: {
            ...eventPayloadBase,
            status,
            view_count: viewCount,
            stored_on_source_item: storedOnSourceItem,
          },
        });
        console.log('[youtube_refresh_succeeded]', JSON.stringify({
          ...eventPayloadBase,
          status,
          view_count: viewCount,
          stored_on_source_item: storedOnSourceItem,
        }));
      } catch (error) {
        const previousFailures = await getRefreshFailureCount({
          db: args.db,
          blueprintId: args.blueprintId,
          kind: 'view_count',
        });
        const nextFailures = previousFailures + 1;
        const backoffHours = getBackoffHours(nextFailures, VIEW_REFRESH_BACKOFF_HOURS);
        const message = error instanceof Error ? error.message : String(error);
        await upsertRefreshState({
          db: args.db,
          blueprintId: args.blueprintId,
          videoId: args.youtubeVideoId,
          sourceItemId,
          patch: {
            last_view_refresh_status: 'failed',
            consecutive_view_failures: nextFailures,
            next_view_refresh_at: toFutureIsoFromHours(backoffHours),
            last_error_message: message,
          },
        });
        await appendRefreshEvent({
          traceDb: args.traceDb,
          runId: args.runId,
          event: 'youtube_refresh_failed',
          level: 'warn',
          payload: {
            ...eventPayloadBase,
            error_message: message,
            backoff_hours: backoffHours,
          },
        });
        console.log('[youtube_refresh_failed]', JSON.stringify({
          ...eventPayloadBase,
          error_message: message,
          backoff_hours: backoffHours,
        }));
      }
      return;
    }

    const refreshState = await getRefreshStateForBlueprint({
      db: args.db,
      blueprintId: args.blueprintId,
    });
    const trigger = args.trigger === 'manual' ? 'manual' : 'auto';
    const currentAutoStage = normalizeAutoStage(refreshState?.comments_auto_stage);
    const nextBootstrapDueAt = (() => {
      if (currentAutoStage >= 2) return null;
      const existingDueAt = normalizeNullableIso(refreshState?.next_comments_refresh_at);
      if (existingDueAt) return existingDueAt;
      return currentAutoStage <= 0
        ? toFutureIsoFromMinutes(commentsAutoFirstDelayMinutes)
        : toFutureIsoFromHours(commentsAutoSecondDelayHours);
    })();

    try {
      const topComments = await fetchYouTubeCommentSnapshot({
        videoId: args.youtubeVideoId,
        sortMode: 'top',
      });
      const newComments = await fetchYouTubeCommentSnapshot({
        videoId: args.youtubeVideoId,
        sortMode: 'new',
      });
      const topWrite = await storeBlueprintYouTubeComments({
        db: args.db,
        blueprintId: args.blueprintId,
        videoId: args.youtubeVideoId,
        sortMode: 'top',
        comments: topComments,
      });
      const newWrite = await storeBlueprintYouTubeComments({
        db: args.db,
        blueprintId: args.blueprintId,
        videoId: args.youtubeVideoId,
        sortMode: 'new',
        comments: newComments,
      });
      const nowIsoNext = new Date().toISOString();
      const nextAutoStage = trigger === 'manual'
        ? Math.max(1, currentAutoStage)
        : (currentAutoStage <= 0 ? 1 : 2);
      const nextCommentsRefreshAt = trigger === 'manual'
        ? (nextAutoStage >= 2 ? null : toFutureIsoFromHours(commentsAutoSecondDelayHours))
        : (nextAutoStage >= 2 ? null : toFutureIsoFromHours(commentsAutoSecondDelayHours));
      await upsertRefreshState({
        db: args.db,
        blueprintId: args.blueprintId,
        videoId: args.youtubeVideoId,
        sourceItemId,
        patch: {
          last_comments_refresh_at: nowIso,
          last_comments_refresh_status: 'ok',
          consecutive_comments_failures: 0,
          comments_auto_stage: nextAutoStage,
          next_comments_refresh_at: nextCommentsRefreshAt,
          ...(trigger === 'manual'
            ? {
                last_comments_manual_refresh_at: nowIsoNext,
                comments_manual_cooldown_until: toFutureIsoFromMinutes(commentsManualCooldownMinutes),
                last_comments_manual_triggered_by: args.triggeredByUserId || null,
              }
            : {}),
          last_error_message: null,
        },
      });
      await appendRefreshEvent({
        traceDb: args.traceDb,
        runId: args.runId,
        event: 'youtube_refresh_succeeded',
        payload: {
          ...eventPayloadBase,
          top_count: topComments.length,
          new_count: newComments.length,
          top_skipped: topWrite.skipped,
          new_skipped: newWrite.skipped,
        },
      });
      console.log('[youtube_refresh_succeeded]', JSON.stringify({
        ...eventPayloadBase,
        top_count: topComments.length,
        new_count: newComments.length,
        top_skipped: topWrite.skipped,
        new_skipped: newWrite.skipped,
      }));
    } catch (error) {
      const previousFailures = await getRefreshFailureCount({
        db: args.db,
        blueprintId: args.blueprintId,
        kind: 'comments',
      });
      const nextFailures = previousFailures + 1;
      const backoffHours = getBackoffHours(nextFailures, COMMENTS_REFRESH_BACKOFF_HOURS);
      const message = error instanceof Error ? error.message : String(error);
      await upsertRefreshState({
        db: args.db,
        blueprintId: args.blueprintId,
        videoId: args.youtubeVideoId,
        sourceItemId,
        patch: {
          last_comments_refresh_status: 'failed',
          consecutive_comments_failures: nextFailures,
          next_comments_refresh_at: trigger === 'manual'
            ? nextBootstrapDueAt
            : toFutureIsoFromHours(backoffHours),
          ...(trigger === 'manual'
            ? {
                comments_manual_cooldown_until: toFutureIsoFromMinutes(commentsManualCooldownMinutes),
                last_comments_manual_refresh_at: nowIso,
                last_comments_manual_triggered_by: args.triggeredByUserId || null,
              }
            : {}),
          last_error_message: message,
        },
      });
      await appendRefreshEvent({
        traceDb: args.traceDb,
        runId: args.runId,
        event: 'youtube_refresh_failed',
        level: 'warn',
        payload: {
          ...eventPayloadBase,
          error_message: message,
          backoff_hours: backoffHours,
        },
      });
      console.log('[youtube_refresh_failed]', JSON.stringify({
        ...eventPayloadBase,
        error_message: message,
        backoff_hours: backoffHours,
      }));
    }
  }

  async function populateForBlueprint(args: {
    db: DbClient;
    traceDb?: DbClient | null;
    runId: string;
    blueprintId: string;
    explicitVideoId?: string | null;
    explicitSourceItemId?: string | null;
  }) {
    if (!apiKey) return;

    const videoId = await resolveBlueprintYouTubeVideoId({
      db: args.db,
      blueprintId: args.blueprintId,
      explicitVideoId: args.explicitVideoId,
      runId: args.runId,
    });
    if (!videoId) return;

    if (args.traceDb) {
      await appendGenerationEvent(args.traceDb, {
        runId: args.runId,
        event: 'youtube_comments_fetch_started',
        payload: {
          video_id: videoId,
        },
      });
    }

    try {
      const viewCount = await fetchYouTubeViewCount({ videoId });
      const sourceItemId = String(args.explicitSourceItemId || '').trim();
      let storedOnSourceItem = false;
      if (sourceItemId) {
        storedOnSourceItem = storeSourceItemViewCountOracleAware
          ? await storeSourceItemViewCountOracleAware({
              db: args.db,
              sourceItemId,
              viewCount,
            })
          : await storeSourceItemViewCount({
              db: args.db,
              sourceItemId,
              viewCount,
            });
      }
      if (args.traceDb) {
        await appendGenerationEvent(args.traceDb, {
          runId: args.runId,
          event: 'youtube_video_stats_fetched',
          payload: {
            video_id: videoId,
            view_count: viewCount,
            stored_on_source_item: storedOnSourceItem,
          },
        });
      }
    } catch (error) {
      if (args.traceDb) {
        await appendGenerationEvent(args.traceDb, {
          runId: args.runId,
          level: 'warn',
          event: 'youtube_video_stats_fetch_failed',
          payload: {
            video_id: videoId,
            error_message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    let topCount = 0;
    let newCount = 0;

    for (const sortMode of ['top', 'new'] as const) {
      try {
        const comments = await fetchYouTubeCommentSnapshot({
          videoId,
          sortMode,
        });
        await storeBlueprintYouTubeComments({
          db: args.db,
          blueprintId: args.blueprintId,
          videoId,
          sortMode,
          comments,
        });
        if (sortMode === 'top') topCount = comments.length;
        if (sortMode === 'new') newCount = comments.length;
      } catch (error) {
        if (args.traceDb) {
          await appendGenerationEvent(args.traceDb, {
            runId: args.runId,
            level: 'warn',
            event: 'youtube_comments_fetch_failed',
            payload: {
              video_id: videoId,
              stage: sortMode,
              error_message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    }

    if (args.traceDb) {
      await appendGenerationEvent(args.traceDb, {
        runId: args.runId,
        event: 'youtube_comments_fetch_succeeded',
        payload: {
          video_id: videoId,
          top_count: topCount,
          new_count: newCount,
        },
      });
    }
  }

  return {
    resolveBlueprintYouTubeVideoId,
    fetchYouTubeCommentSnapshot,
    fetchYouTubeViewCount,
    storeBlueprintYouTubeComments,
    listBlueprintYouTubeComments,
    storeSourceItemViewCount,
    registerRefreshStateForBlueprint,
    getRefreshStateForBlueprint,
    claimManualCommentsRefreshCooldown,
    releaseManualCommentsRefreshCooldown,
    listDueRefreshCandidates,
    listPendingRefreshBlueprintIds,
    hasPendingRefreshJob,
    executeRefresh,
    populateForBlueprint,
  };
}
