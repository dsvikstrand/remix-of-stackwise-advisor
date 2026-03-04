import { appendGenerationEvent } from './generationTrace';

type DbClient = any;

export type YouTubeCommentSortMode = 'top' | 'new';

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
const YOUTUBE_COMMENT_SORT_ORDER: Record<YouTubeCommentSortMode, 'relevance' | 'time'> = {
  top: 'relevance',
  new: 'time',
};

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
  const e = error as { message?: unknown; details?: unknown; hint?: unknown } | null;
  const hay = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
  return hay.includes('does not exist') && hay.includes(relation.toLowerCase());
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
}) {
  const apiKey = String(input.apiKey || '').trim();
  const fetchImpl = input.fetchImpl || fetch;

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
    populateForBlueprint,
  };
}
