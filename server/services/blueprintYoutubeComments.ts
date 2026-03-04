import { appendGenerationEvent } from './generationTrace';

type DbClient = any;

export type YouTubeCommentSortMode = 'top' | 'new';
export type BlueprintYouTubeRefreshKind = 'view_count' | 'comments';

export type StoredBlueprintYouTubeComment = {
  source_comment_id: string;
  display_order: number;
  author_name: string | null;
  author_avatar_url: string | null;
  content: string;
  published_at: string | null;
  like_count: number | null;
};

const YOUTUBE_COMMENT_SNAPSHOT_LIMIT = 20;
const DEFAULT_REFRESH_VIEW_INTERVAL_HOURS = 12;
const DEFAULT_REFRESH_COMMENTS_INTERVAL_HOURS = 48;
const VIEW_REFRESH_BACKOFF_HOURS = [6, 24, 48] as const;
const COMMENTS_REFRESH_BACKOFF_HOURS = [24, 72, 168] as const;
const RECENT_BLUEPRINT_WINDOW_DAYS = 7;
const YOUTUBE_COMMENT_SORT_ORDER: Record<YouTubeCommentSortMode, 'relevance' | 'time'> = {
  top: 'relevance',
  new: 'time',
};

type BlueprintYouTubeRefreshCandidate = {
  blueprint_id: string;
  youtube_video_id: string;
  source_item_id: string | null;
  next_due_at: string | null;
};

function toFutureIsoFromHours(hours: number) {
  const safeHours = Number.isFinite(hours) ? Math.max(1, Math.floor(hours)) : 1;
  return new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString();
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

export function createBlueprintYouTubeCommentsService(input: {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  refreshViewIntervalHours?: number;
  refreshCommentsIntervalHours?: number;
}) {
  const apiKey = String(input.apiKey || '').trim();
  const fetchImpl = input.fetchImpl || fetch;
  const refreshViewIntervalHours = normalizeIntervalHours(
    input.refreshViewIntervalHours,
    DEFAULT_REFRESH_VIEW_INTERVAL_HOURS,
  );
  const refreshCommentsIntervalHours = normalizeIntervalHours(
    input.refreshCommentsIntervalHours,
    DEFAULT_REFRESH_COMMENTS_INTERVAL_HOURS,
  );

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
  }) {
    const normalizedVideoId = String(args.videoId || '').trim();
    if (!normalizedVideoId) return;
    const comments = Array.isArray(args.comments) ? args.comments : [];

    const deleteQuery = await args.db
      .from('blueprint_youtube_comments')
      .delete()
      .eq('blueprint_id', args.blueprintId)
      .eq('sort_mode', args.sortMode);
    if (deleteQuery?.error) {
      if (isMissingRelationError(deleteQuery.error, 'blueprint_youtube_comments')) return;
      throw deleteQuery.error;
    }

    if (comments.length === 0) return;

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
      if (isMissingRelationError(error, 'blueprint_youtube_comments')) return;
      throw error;
    }
  }

  async function storeSourceItemViewCount(args: {
    db: DbClient;
    sourceItemId: string;
    viewCount: number | null;
  }) {
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
    const nowIso = new Date().toISOString();
    const { error } = await args.db
      .from('blueprint_youtube_refresh_state')
      .upsert({
        blueprint_id: args.blueprintId,
        youtube_video_id: args.videoId,
        source_item_id: args.sourceItemId == null ? null : String(args.sourceItemId || '').trim() || null,
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

    await upsertRefreshState({
      db: args.db,
      blueprintId: args.blueprintId,
      videoId,
      sourceItemId: args.explicitSourceItemId || null,
      patch: {
        enabled: true,
        next_view_refresh_at: toFutureIsoFromHours(refreshViewIntervalHours),
        next_comments_refresh_at: toFutureIsoFromHours(refreshCommentsIntervalHours),
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
        });
      }
    };

    const dueQuery = await args.db
      .from('blueprint_youtube_refresh_state')
      .select(`blueprint_id,youtube_video_id,source_item_id,${dueColumn}`)
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
        .select(`blueprint_id,youtube_video_id,source_item_id,${dueColumn}`)
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

    const candidates = [...rowsByKey.values()];
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

  async function hasPendingRefreshJob(args: {
    db: DbClient;
    blueprintId: string;
    kind: BlueprintYouTubeRefreshKind;
  }) {
    const { data, error } = await args.db
      .from('ingestion_jobs')
      .select('payload')
      .eq('scope', 'blueprint_youtube_refresh')
      .in('status', ['queued', 'running'])
      .limit(200);
    if (error) throw error;
    for (const row of data || []) {
      const payload = row?.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
      const record = payload as Record<string, unknown>;
      if (
        String(record.blueprint_id || '').trim() === args.blueprintId
        && String(record.refresh_kind || '').trim() === args.kind
      ) {
        return true;
      }
    }
    return false;
  }

  async function executeRefresh(args: {
    db: DbClient;
    traceDb?: DbClient | null;
    runId?: string | null;
    blueprintId: string;
    kind: BlueprintYouTubeRefreshKind;
    youtubeVideoId: string;
    sourceItemId?: string | null;
  }) {
    if (!apiKey) return;
    const nowIso = new Date().toISOString();
    const sourceItemId = String(args.sourceItemId || '').trim() || null;
    const eventPayloadBase = {
      refresh_kind: args.kind,
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
        const storedOnSourceItem = await storeSourceItemViewCount({
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

    try {
      const topComments = await fetchYouTubeCommentSnapshot({
        videoId: args.youtubeVideoId,
        sortMode: 'top',
      });
      const newComments = await fetchYouTubeCommentSnapshot({
        videoId: args.youtubeVideoId,
        sortMode: 'new',
      });
      await storeBlueprintYouTubeComments({
        db: args.db,
        blueprintId: args.blueprintId,
        videoId: args.youtubeVideoId,
        sortMode: 'top',
        comments: topComments,
      });
      await storeBlueprintYouTubeComments({
        db: args.db,
        blueprintId: args.blueprintId,
        videoId: args.youtubeVideoId,
        sortMode: 'new',
        comments: newComments,
      });
      await upsertRefreshState({
        db: args.db,
        blueprintId: args.blueprintId,
        videoId: args.youtubeVideoId,
        sourceItemId,
        patch: {
          last_comments_refresh_at: nowIso,
          last_comments_refresh_status: 'ok',
          consecutive_comments_failures: 0,
          next_comments_refresh_at: toFutureIsoFromHours(refreshCommentsIntervalHours),
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
        },
      });
      console.log('[youtube_refresh_succeeded]', JSON.stringify({
        ...eventPayloadBase,
        top_count: topComments.length,
        new_count: newComments.length,
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
          next_comments_refresh_at: toFutureIsoFromHours(backoffHours),
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
        storedOnSourceItem = await storeSourceItemViewCount({
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
    storeSourceItemViewCount,
    registerRefreshStateForBlueprint,
    listDueRefreshCandidates,
    hasPendingRefreshJob,
    executeRefresh,
    populateForBlueprint,
  };
}
