import type express from 'express';
import type {
  SourceItemUnlockRow,
  SourcePageBlueprintCursor,
  SourcePageFeedScanRow,
  SourcePageFeedSourceRow,
  SourcePageSearchRow,
  SourcePagesRouteDeps,
  SourcePageVideoExistingState,
  SourcePageVideoGenerateItem,
  SourceUnlockQueueItem,
  SyncSubscriptionResult,
} from '../contracts/api/sourcePages';
import { fetchYouTubeDurationMap, YouTubeDurationLookupError } from '../services/youtubeDuration';
import { splitByDurationPolicy, toDurationSeconds } from '../services/videoDurationPolicy';
import { getBlueprintSummaryText } from '../services/blueprintSections';
import {
  readQueueAdmissionCounts,
  resolveSourcePageSubscriptionAccess,
  wouldExceedQueueAdmission,
} from '../services/generationPreflight';
import { getBlueprintGenerationChargePolicy } from '../services/generationChargePolicy';
import {
  getBlueprintAvailabilityForVideo,
  getBlueprintUnavailableMessage,
} from '../services/blueprintAvailability';

export function registerSourcePagesRouteHandlers(app: express.Express, deps: SourcePagesRouteDeps) {
  const {
    clampInt,
    getAuthedSupabaseClient,
    getServiceSupabaseClient,
    buildSourcePagePath,
    normalizeSourcePagePlatform,
    getSourcePageByPlatformExternalId,
    youtubeDataApiKey,
    getUserSubscriptionStateForSourcePage,
    sourceVideoListBurstLimiter,
    sourceVideoListSustainedLimiter,
    sourceVideoUnlockBurstLimiter,
    sourceVideoUnlockSustainedLimiter,
    clampYouTubeSourceVideoLimit,
    normalizeYouTubeSourceVideoKind,
    runUnlockSweeps,
    listYouTubeSourceVideos,
    YouTubeSourceVideosError,
    loadExistingSourceVideoStateForUser,
    countActiveSubscribersForSourcePage,
    computeUnlockCost,
    getSourceItemUnlocksBySourceItemIds,
    toUnlockSnapshot,
    isConfirmedNoTranscriptUnlock,
    createUnlockTraceId,
    SourcePageVideosGenerateSchema,
    sourceUnlockGenerateMaxItems,
    generationDurationCapEnabled,
    generationMaxVideoSeconds,
    generationBlockUnknownDuration,
    generationDurationLookupTimeoutMs,
    logUnlockEvent,
    normalizeSourcePageVideoGenerateItem,
    upsertSourceItemFromVideo,
    ensureSourceItemUnlock,
    getTranscriptCooldownState,
    reserveUnlock,
    sourceUnlockReservationSeconds,
    reserveCredits,
    refundReservation,
    buildUnlockLedgerIdempotencyKey,
    failUnlock,
    attachReservationLedger,
    markUnlockProcessing,
    countQueueDepth,
    countQueueWorkItems,
    unlockIntakeEnabled,
    queueDepthHardLimit,
    queueDepthPerUserLimit,
    queueWorkItemsHardLimit,
    queueWorkItemsPerUserLimit,
    workerConcurrency,
    emitGenerationStartedNotification,
    getGenerationNotificationLinkPath,
    scheduleQueuedIngestionProcessing,
    settleReservation,
    completeUnlock,
    runYouTubePipeline,
    getFailureTransition,
    sourceTranscriptMaxAttempts,
    resolveYouTubeChannel,
    fetchYouTubeChannelAssetMap,
    ensureSourcePageFromYouTubeChannel,
    syncSingleSubscription,
    markSubscriptionSyncError,
    upsertSubscriptionNoticeSourceItem,
    insertFeedItem,
    resolveGenerationTierAccess,
    resolveRequestedGenerationTier,
    normalizeRequestedGenerationTier,
    resolveVariantOrReady,
  } = deps;
function normalizeSourcePageBlueprintCursor(input: SourcePageBlueprintCursor) {
  const createdAtMs = Date.parse(input.createdAt);
  if (!Number.isFinite(createdAtMs)) return null;
  const feedItemId = String(input.feedItemId || '').trim();
  if (!feedItemId) return null;
  return {
    createdAt: new Date(createdAtMs).toISOString(),
    feedItemId,
  };
}

function encodeSourcePageBlueprintCursor(input: SourcePageBlueprintCursor) {
  const normalized = normalizeSourcePageBlueprintCursor(input);
  if (!normalized) return null;
  const payload = JSON.stringify({
    created_at: normalized.createdAt,
    feed_item_id: normalized.feedItemId,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeSourcePageBlueprintCursor(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { created_at?: string; feed_item_id?: string };
    return normalizeSourcePageBlueprintCursor({
      createdAt: String(parsed.created_at || ''),
      feedItemId: String(parsed.feed_item_id || ''),
    });
  } catch {
    return null;
  }
}

function buildSourcePageCursorFilter(cursor: SourcePageBlueprintCursor) {
  const normalized = normalizeSourcePageBlueprintCursor(cursor);
  if (!normalized) return null;
  return `created_at.lt.${normalized.createdAt},and(created_at.eq.${normalized.createdAt},id.lt.${normalized.feedItemId})`;
}

function cleanSourcePageSummaryText(raw: string) {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .trim();
}

function buildSourcePageSummary(input: {
  sectionsJson?: unknown;
  steps?: unknown;
  llmReview: string | null;
  fallbackTitle: string;
  maxChars?: number;
}) {
  const maxChars = Math.max(80, Math.min(320, Number(input.maxChars || 220)));
  const schemaSummary = getBlueprintSummaryText({
    sectionsJson: input.sectionsJson,
    steps: input.steps,
    maxChars,
  });
  const candidate = cleanSourcePageSummaryText(
    String(schemaSummary || input.llmReview || input.fallbackTitle || ''),
  );
  if (!candidate) return 'Open to view the full step-by-step blueprint.';
  if (candidate.length <= maxChars) return candidate;
  return `${candidate.slice(0, maxChars).trim()}...`;
}

function normalizeSourcePageSearchToken(raw: string) {
  return String(raw || '').trim().toLowerCase();
}

function scoreSourcePageSearchRow(row: SourcePageSearchRow, normalizedQuery: string) {
  const normalizedTitle = normalizeSourcePageSearchToken(row.title);
  const normalizedExternalId = normalizeSourcePageSearchToken(row.external_id);
  if (!normalizedQuery) return 99;
  if (normalizedTitle === normalizedQuery || normalizedExternalId === normalizedQuery) return 0;
  if (normalizedTitle.startsWith(normalizedQuery)) return 1;
  if (normalizedExternalId.startsWith(normalizedQuery)) return 2;
  if (normalizedTitle.includes(normalizedQuery)) return 3;
  if (normalizedExternalId.includes(normalizedQuery)) return 4;
  return 9;
}

app.get('/api/source-pages/search', async (req, res) => {
  const rawQuery = String(req.query.q || '').trim();
  if (rawQuery.length < 2) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_QUERY',
      message: 'Query must be at least 2 characters.',
      data: null,
    });
  }

  const limit = clampInt(req.query.limit, 12, 1, 25);
  const scanLimit = clampInt(limit * 4, 48, 20, 100);
  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const likePattern = `%${rawQuery}%`;
  const [titleResult, externalResult] = await Promise.all([
    db
      .from('source_pages')
      .select('id, platform, external_id, external_url, title, avatar_url, is_active')
      .eq('is_active', true)
      .ilike('title', likePattern)
      .limit(scanLimit),
    db
      .from('source_pages')
      .select('id, platform, external_id, external_url, title, avatar_url, is_active')
      .eq('is_active', true)
      .ilike('external_id', likePattern)
      .limit(scanLimit),
  ]);

  if (titleResult.error || externalResult.error) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_SEARCH_FAILED',
      message: titleResult.error?.message || externalResult.error?.message || 'Could not search source pages.',
      data: null,
    });
  }

  const dedupedById = new Map<string, SourcePageSearchRow>();
  for (const row of ([...(titleResult.data || []), ...(externalResult.data || [])] as SourcePageSearchRow[])) {
    if (!row?.id) continue;
    dedupedById.set(row.id, row);
  }

  const normalizedQuery = normalizeSourcePageSearchToken(rawQuery);
  const items = Array.from(dedupedById.values())
    .sort((a, b) => {
      const scoreDelta = scoreSourcePageSearchRow(a, normalizedQuery) - scoreSourcePageSearchRow(b, normalizedQuery);
      if (scoreDelta !== 0) return scoreDelta;
      const titleDelta = String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
      if (titleDelta !== 0) return titleDelta;
      return String(a.external_id || '').localeCompare(String(b.external_id || ''), undefined, { sensitivity: 'base' });
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      platform: row.platform,
      external_id: row.external_id,
      external_url: row.external_url,
      title: row.title,
      avatar_url: row.avatar_url,
      is_active: row.is_active,
      path: buildSourcePagePath(row.platform, row.external_id),
    }));

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page search',
    data: {
      items,
    },
  });
});

app.get('/api/source-pages/:platform/:externalId', async (req, res) => {
  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'externalId required',
      data: null,
    });
  }

  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(db, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not fetch source page.',
      data: null,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: null,
    });
  }

  const { count: linkedFollowerCount, error: linkedFollowerCountError } = await db
    .from('user_source_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('source_page_id', sourcePage.id)
    .eq('is_active', true);
  if (linkedFollowerCountError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: linkedFollowerCountError.message, data: null });
  }

  let followerCount = Number(linkedFollowerCount || 0);
  if (followerCount === 0 && platform === 'youtube') {
    const { count: fallbackFollowerCount } = await db
      .from('user_source_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('source_type', 'youtube')
      .eq('source_channel_id', sourcePage.external_id)
      .eq('is_active', true);
    followerCount = Number(fallbackFollowerCount || 0);
  }

  const userId = (res.locals.user as { id?: string } | undefined)?.id || null;
  let subscribed = false;
  let subscriptionId: string | null = null;
  if (userId) {
    try {
      const access = await resolveSourcePageSubscriptionAccess({
        db,
        userId,
        sourcePageId: sourcePage.id,
        sourceChannelId: sourcePage.external_id,
        getUserSubscriptionStateForSourcePage,
      });
      subscribed = access.subscribed;
      subscriptionId = access.subscription_id;
    } catch {
      // Optional viewer state should not fail public reads.
      subscribed = false;
      subscriptionId = null;
    }
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page fetched',
    data: {
      source_page: {
        ...sourcePage,
        path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
        follower_count: followerCount,
      },
      viewer: {
        authenticated: Boolean(userId),
        subscribed,
        subscription_id: subscriptionId,
      },
    },
  });
});

app.get(
  '/api/source-pages/:platform/:externalId/videos',
  sourceVideoListBurstLimiter,
  sourceVideoListSustainedLimiter,
  async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }
  if (platform !== 'youtube') {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Only YouTube source pages are supported in this version.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'externalId required',
      data: null,
    });
  }

  const limit = clampYouTubeSourceVideoLimit(Number(req.query.limit), 12);
  const pageToken = String(req.query.page_token || '').trim();
  const kind = normalizeYouTubeSourceVideoKind(String(req.query.kind || ''), 'full');
  const shortsMaxSeconds = 60;

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(sourcePageDb, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not read source page.',
      data: null,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: null,
    });
  }

  try {
    const access = await resolveSourcePageSubscriptionAccess({
      db,
      userId,
      sourcePageId: sourcePage.id,
      sourceChannelId: sourcePage.external_id,
      getUserSubscriptionStateForSourcePage,
    });
    if (!access.subscribed) {
      return res.status(403).json({
        ok: false,
        error_code: 'SOURCE_PAGE_SUBSCRIPTION_REQUIRED',
        message: 'Subscribe to this source to browse its video library.',
        data: null,
      });
    }
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not resolve source subscription.',
      data: null,
    });
  }

  let page;
  try {
    await runUnlockSweeps(sourcePageDb, { mode: 'opportunistic' });
    page = await listYouTubeSourceVideos({
      apiKey: youtubeDataApiKey,
      channelId: sourcePage.external_id,
      limit,
      pageToken: pageToken || undefined,
      kind,
      shortsMaxSeconds,
    });
  } catch (error) {
    if (error instanceof YouTubeSourceVideosError) {
      if (error.code === 'RATE_LIMITED') {
        return res.status(429).json({
          ok: false,
          error_code: 'RATE_LIMITED',
          message: error.message,
          data: null,
        });
      }
      if (error.code === 'SEARCH_DISABLED') {
        return res.status(503).json({
          ok: false,
          error_code: 'SOURCE_VIDEO_LIST_FAILED',
          message: error.message,
          data: null,
        });
      }
      return res.status(502).json({
        ok: false,
        error_code: 'SOURCE_VIDEO_LIST_FAILED',
        message: error.message,
        data: null,
      });
    }
    return res.status(502).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_LIST_FAILED',
      message: error instanceof Error ? error.message : 'Could not load source videos.',
      data: null,
    });
  }

  let existingByVideoId = new Map<string, SourcePageVideoExistingState>();
  try {
    existingByVideoId = await loadExistingSourceVideoStateForUser(
      db,
      userId,
      page.results.map((item) => item.video_id),
    );
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not resolve duplicate state.',
      data: null,
    });
  }

  const fallbackUnlockCost = 1;

  const sourceItemIds = Array.from(new Set(
    page.results
      .map((item) => existingByVideoId.get(item.video_id)?.source_item_id || null)
      .filter((value): value is string => Boolean(value)),
  ));
  let unlockBySourceItemId = new Map<string, SourceItemUnlockRow>();
  if (sourceItemIds.length > 0) {
    try {
      const unlockRows = await getSourceItemUnlocksBySourceItemIds(sourcePageDb, sourceItemIds);
      unlockBySourceItemId = new Map(unlockRows.map((row) => [row.source_item_id, row]));
    } catch (error) {
      console.log('[source_video_unlock_lookup_failed]', JSON.stringify({
        source_page_id: sourcePage.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const items = page.results
    .map((item) => {
      const existing = existingByVideoId.get(item.video_id);
      const unlock = existing?.source_item_id ? unlockBySourceItemId.get(existing.source_item_id) || null : null;
      return {
        unlock,
        payload: {
          video_id: item.video_id,
          video_url: item.video_url,
          title: item.title,
          description: item.description,
          thumbnail_url: item.thumbnail_url,
          published_at: item.published_at,
          duration_seconds: item.duration_seconds,
          channel_id: item.channel_id,
          channel_title: item.channel_title,
          already_exists_for_user: Boolean(existing?.already_exists_for_user),
          existing_blueprint_id: existing?.existing_blueprint_id || null,
          existing_feed_item_id: existing?.existing_feed_item_id || null,
          ...toUnlockSnapshot({
            unlock,
            fallbackCost: fallbackUnlockCost,
          }),
        },
      };
    })
    .filter((row) => !isConfirmedNoTranscriptUnlock(row.unlock))
    .map((row) => row.payload);

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page videos',
    data: {
      items,
      next_page_token: page.nextPageToken,
      kind,
      shorts_max_seconds: shortsMaxSeconds,
    },
  });
  },
);

async function handleSourcePageVideosUnlock(req: express.Request, res: express.Response) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }
  const traceId = createUnlockTraceId();
  const traceData = { trace_id: traceId };

  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: traceData,
    });
  }
  if (platform !== 'youtube') {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Only YouTube source pages are supported in this version.',
      data: traceData,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'externalId required',
      data: traceData,
    });
  }

  const parsed = SourcePageVideosGenerateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_INVALID_INPUT',
      message: 'Invalid unlock payload.',
      data: traceData,
    });
  }
  if (parsed.data.items.length > sourceUnlockGenerateMaxItems) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_INVALID_INPUT',
      message: `Select up to ${sourceUnlockGenerateMaxItems} videos per request.`,
      data: traceData,
    });
  }
  const requestedTier = normalizeRequestedGenerationTier(parsed.data.requested_tier);
  const resolvedTier = 'tier' as const;
  const dualGenerateEnabled = false;
  const dualGenerateTiers = ['tier'] as const;

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: traceData });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: traceData });

  logUnlockEvent('unlock_request_received', { trace_id: traceId, user_id: userId, platform, external_id: externalId }, {
    requested_items: parsed.data.items.length,
    route: req.path,
  });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(sourcePageDb, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not read source page.',
      data: traceData,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: traceData,
    });
  }

  try {
    const access = await resolveSourcePageSubscriptionAccess({
      db,
      userId,
      sourcePageId: sourcePage.id,
      sourceChannelId: sourcePage.external_id,
      getUserSubscriptionStateForSourcePage,
    });
    if (!access.subscribed) {
      return res.status(403).json({
        ok: false,
        error_code: 'SOURCE_PAGE_SUBSCRIPTION_REQUIRED',
        message: 'Subscribe to this source before unlocking videos.',
        data: traceData,
      });
    }
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not resolve source subscription.',
      data: traceData,
    });
  }

  await runUnlockSweeps(sourcePageDb, { mode: 'opportunistic', traceId });

  const dedupedMap = new Map<string, SourcePageVideoGenerateItem>();
  for (const item of parsed.data.items) {
    const normalized = normalizeSourcePageVideoGenerateItem(item);
    if (!normalized) continue;
    dedupedMap.set(normalized.video_id, normalized);
  }
  const normalizedItems = Array.from(dedupedMap.values());
  if (normalizedItems.length === 0) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_INVALID_INPUT',
      message: 'No valid videos selected for generation.',
      data: traceData,
    });
  }
  let existingByVideoId = new Map<string, SourcePageVideoExistingState>();
  try {
    existingByVideoId = await loadExistingSourceVideoStateForUser(
      db,
      userId,
      normalizedItems.map((item) => item.video_id),
    );
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not resolve duplicate state.',
      data: traceData,
    });
  }

  const duplicateRows = normalizedItems
    .map((item) => ({
      item,
      existing: existingByVideoId.get(item.video_id),
    }))
    .filter((row) => Boolean(row.existing?.already_exists_for_user));

  const estimatedUnlockCost = 1;
  const generationChargePolicy = await getBlueprintGenerationChargePolicy();
  const waiveGenerationCharges = generationChargePolicy.mode === 'free_window_open';

  const queueItems: SourceUnlockQueueItem[] = [];
  let queueDepth = 0;
  let userQueueDepth = 0;
  let queueWorkItems = 0;
  let userQueueWorkItems = 0;
  const inProgressRows: Array<{ video_id: string; title: string }> = [];
  const readyRows: Array<{ video_id: string; title: string; blueprint_id: string | null }> = [];
  const insufficientRows: Array<{ video_id: string; title: string; required: number; balance: number }> = [];
  const blueprintUnavailableRows: Array<{ video_id: string; title: string; retry_after_seconds: number }> = [];
  const transcriptUnavailableRows: Array<{ video_id: string; title: string; retry_after_seconds: number }> = [];
  const permanentNoTranscriptRows: Array<{ video_id: string; title: string }> = [];

  const candidateRows = normalizedItems.filter((item) => !existingByVideoId.get(item.video_id)?.already_exists_for_user);
  let durationBlocked: Array<{
    video_id: string;
    title: string;
    error_code: 'VIDEO_TOO_LONG' | 'VIDEO_DURATION_UNAVAILABLE';
    reason: 'too_long' | 'unknown';
    max_duration_seconds: number;
    video_duration_seconds: number | null;
  }> = [];
  let eligibleCandidateRows = candidateRows;
  if (generationDurationCapEnabled && candidateRows.length > 0) {
    try {
      const durationMap = await fetchYouTubeDurationMap({
        apiKey: youtubeDataApiKey,
        videoIds: candidateRows.filter((row) => row.duration_seconds == null).map((row) => row.video_id),
        timeoutMs: generationDurationLookupTimeoutMs,
        userAgent: 'bleuv1-source-page-unlock/1.0 (+https://api.bleup.app)',
      });
      const withResolvedDurations = candidateRows.map((item) => ({
        ...item,
        duration_seconds: item.duration_seconds ?? durationMap.get(item.video_id) ?? null,
      }));
      const split = splitByDurationPolicy({
        items: withResolvedDurations,
        config: {
          enabled: generationDurationCapEnabled,
          maxSeconds: generationMaxVideoSeconds,
          blockUnknown: generationBlockUnknownDuration,
        },
        getVideoId: (item) => item.video_id,
        getTitle: (item) => item.title,
        getDurationSeconds: (item) => item.duration_seconds ?? null,
      });
      eligibleCandidateRows = split.allowed;
      durationBlocked = split.blocked;
    } catch (error) {
      if (error instanceof YouTubeDurationLookupError) {
        if (error.code === 'RATE_LIMITED') {
          return res.status(429).json({
            ok: false,
            error_code: 'RATE_LIMITED',
            message: 'Too many requests right now. Please retry shortly.',
            data: traceData,
          });
        }
        return res.status(502).json({
          ok: false,
          error_code: 'SOURCE_VIDEO_GENERATE_FAILED',
          message: 'Video metadata provider is currently unavailable. Please try again.',
          data: traceData,
        });
      }
      throw error;
    }
  }

  if (eligibleCandidateRows.length > 0) {
    if (!unlockIntakeEnabled) {
      return res.status(503).json({
        ok: false,
        error_code: 'QUEUE_INTAKE_DISABLED',
        message: 'Unlock intake is temporarily paused.',
        data: {
          ...traceData,
          queue_depth: 0,
        },
      });
    }
  }

  for (const item of eligibleCandidateRows) {
    try {
      const source = await upsertSourceItemFromVideo(sourcePageDb, {
        video: {
          videoId: item.video_id,
          title: item.title,
          url: item.video_url,
          publishedAt: item.published_at || null,
          thumbnailUrl: item.thumbnail_url || null,
          durationSeconds: item.duration_seconds,
        },
        channelId: sourcePage.external_id,
        channelTitle: sourcePage.title || sourcePage.external_id,
        sourcePageId: sourcePage.id,
      });

      const variantState = await resolveVariantOrReady({
        sourceItemId: source.id,
        generationTier: resolvedTier,
      });
      if (variantState?.state === 'ready') {
        readyRows.push({
          video_id: item.video_id,
          title: item.title,
          blueprint_id: variantState.blueprintId || null,
        });
        continue;
      }
      if (variantState?.state === 'in_progress') {
        inProgressRows.push({
          video_id: item.video_id,
          title: item.title,
        });
        continue;
      }
      const blueprintAvailability = await getBlueprintAvailabilityForVideo(sourcePageDb, item.video_id);
      if (blueprintAvailability.status === 'cooldown_active') {
        blueprintUnavailableRows.push({
          video_id: item.video_id,
          title: item.title,
          retry_after_seconds: blueprintAvailability.retryAfterSeconds,
        });
        continue;
      }

      const unlockSeed = await ensureSourceItemUnlock(sourcePageDb, {
        sourceItemId: source.id,
        sourcePageId: sourcePage.id,
        estimatedCost: estimatedUnlockCost,
      });
      if (isConfirmedNoTranscriptUnlock(unlockSeed)) {
        permanentNoTranscriptRows.push({
          video_id: item.video_id,
          title: item.title,
        });
        continue;
      }
      const transcriptCooldown = getTranscriptCooldownState(unlockSeed);
      if (transcriptCooldown.active) {
        transcriptUnavailableRows.push({
          video_id: item.video_id,
          title: item.title,
          retry_after_seconds: transcriptCooldown.retryAfterSeconds,
        });
        continue;
      }

      const reserveResult = await reserveUnlock(sourcePageDb, {
        unlock: unlockSeed,
        userId,
        estimatedCost: estimatedUnlockCost,
        reservationSeconds: sourceUnlockReservationSeconds,
      });

      if (reserveResult.state === 'ready') {
        readyRows.push({
          video_id: item.video_id,
          title: item.title,
          blueprint_id: reserveResult.unlock.blueprint_id || null,
        });
        continue;
      }

      if (reserveResult.state === 'in_progress') {
        inProgressRows.push({
          video_id: item.video_id,
          title: item.title,
        });
        continue;
      }

      let reservedUnlock = reserveResult.unlock;
      const reservedCost = dualGenerateEnabled
        ? 0
        : waiveGenerationCharges
          ? 0
        : Math.max(0.001, Number(reservedUnlock.estimated_cost || estimatedUnlockCost));
      if (!reservedUnlock.reserved_ledger_id) {
        if (!dualGenerateEnabled && !waiveGenerationCharges) {
          const hold = await reserveCredits(sourcePageDb, {
            userId,
            amount: reservedCost,
            idempotencyKey: buildUnlockLedgerIdempotencyKey({
              unlockId: reservedUnlock.id,
              userId,
              action: 'hold',
            }),
            reasonCode: 'UNLOCK_HOLD',
            context: {
              source_item_id: source.id,
              source_page_id: sourcePage.id,
              unlock_id: reservedUnlock.id,
              metadata: {
                source: 'source_page_video_library',
                video_id: item.video_id,
                trace_id: traceId,
              },
            },
          });

          if (!hold.ok) {
            await failUnlock(sourcePageDb, {
              unlockId: reservedUnlock.id,
              errorCode: 'INSUFFICIENT_CREDITS',
              errorMessage: 'Insufficient credits to reserve unlock.',
            });
            insufficientRows.push({
              video_id: item.video_id,
              title: item.title,
              required: reservedCost,
              balance: hold.wallet.balance,
            });
            continue;
          }

          reservedUnlock = await attachReservationLedger(sourcePageDb, {
            unlockId: reservedUnlock.id,
            userId,
            ledgerId: hold.ledger_id || null,
            amount: hold.reserved_amount,
          });
        }
      }

      queueItems.push({
        unlock_id: reservedUnlock.id,
        source_item_id: source.id,
        source_page_id: sourcePage.id,
        source_channel_id: sourcePage.external_id,
        source_channel_title: sourcePage.title || sourcePage.external_id,
        video_id: item.video_id,
        video_url: item.video_url,
        title: item.title,
        duration_seconds: toDurationSeconds(item.duration_seconds),
        reserved_cost: reservedCost,
        reserved_by_user_id: userId,
        unlock_origin: 'manual_unlock',
        generation_tier: resolvedTier,
        dual_generate_enabled: dualGenerateEnabled,
        charge_mode: waiveGenerationCharges ? 'free_window_open' : 'wallet',
      });
      logUnlockEvent(
        'unlock_item_queued',
        {
          trace_id: traceId,
          user_id: userId,
          source_page_id: sourcePage.id,
          unlock_id: reservedUnlock.id,
          source_item_id: source.id,
          video_id: item.video_id,
        },
        {
          cost: reservedCost,
          dual_generate_enabled: dualGenerateEnabled,
        },
      );
    } catch (error) {
      logUnlockEvent(
        'source_unlock_prepare_failed',
        { trace_id: traceId, user_id: userId, source_page_id: sourcePage.id, video_id: item.video_id },
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      inProgressRows.push({
        video_id: item.video_id,
        title: item.title,
      });
    }
  }

  if (
    queueItems.length === 0
    && durationBlocked.length > 0
    && insufficientRows.length === 0
    && blueprintUnavailableRows.length === 0
    && transcriptUnavailableRows.length === 0
    && permanentNoTranscriptRows.length === 0
    && readyRows.length === 0
    && inProgressRows.length === 0
    && duplicateRows.length === 0
  ) {
    return res.status(422).json({
      ok: false,
      error_code: 'VIDEO_DURATION_POLICY_BLOCKED',
      message: 'All selected videos are blocked by duration policy.',
      data: {
        ...traceData,
        duration_blocked_count: durationBlocked.length,
        duration_blocked: durationBlocked,
      },
    });
  }

  if (
    queueItems.length === 0
    && insufficientRows.length > 0
    && blueprintUnavailableRows.length === 0
    && transcriptUnavailableRows.length === 0
    && permanentNoTranscriptRows.length === 0
    && readyRows.length === 0
    && inProgressRows.length === 0
    && duplicateRows.length === 0
  ) {
    return res.status(402).json({
      ok: false,
      error_code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits for unlock.',
      data: {
        ...traceData,
        required: insufficientRows[0]?.required || 0,
        balance: insufficientRows[0]?.balance || 0,
        insufficient: insufficientRows,
        duration_blocked_count: durationBlocked.length,
        duration_blocked: durationBlocked,
      },
    });
  }

  if (
    queueItems.length === 0
    && blueprintUnavailableRows.length > 0
    && insufficientRows.length === 0
    && transcriptUnavailableRows.length === 0
    && permanentNoTranscriptRows.length === 0
    && readyRows.length === 0
    && inProgressRows.length === 0
    && duplicateRows.length === 0
  ) {
    return res.status(422).json({
      ok: false,
      error_code: 'VIDEO_BLUEPRINT_UNAVAILABLE',
      message: getBlueprintUnavailableMessage(),
      retry_after_seconds: Math.max(...blueprintUnavailableRows.map((row) => row.retry_after_seconds)),
      data: {
        ...traceData,
        unavailable_count: blueprintUnavailableRows.length,
        unavailable: blueprintUnavailableRows,
        duration_blocked_count: durationBlocked.length,
        duration_blocked: durationBlocked,
      },
    });
  }

  if (
    queueItems.length === 0
    && transcriptUnavailableRows.length > 0
    && insufficientRows.length === 0
    && blueprintUnavailableRows.length === 0
    && permanentNoTranscriptRows.length === 0
    && readyRows.length === 0
    && inProgressRows.length === 0
    && duplicateRows.length === 0
  ) {
    const retryAfterSeconds = Math.max(...transcriptUnavailableRows.map((row) => row.retry_after_seconds));
    logUnlockEvent(
      'auto_transcript_manual_add_error_returned',
      { trace_id: traceId, user_id: userId, source_page_id: sourcePage.id },
      {
        transcript_unavailable_count: transcriptUnavailableRows.length,
        retry_after_seconds: retryAfterSeconds,
        video_ids: transcriptUnavailableRows.map((row) => row.video_id),
      },
    );
    return res.status(422).json({
      ok: false,
      error_code: 'TRANSCRIPT_UNAVAILABLE',
      message: 'Only videos with speech can be generated. If this video has speech, please try again in a few minutes.',
      retry_after_seconds: retryAfterSeconds,
      data: {
        ...traceData,
        transcript_unavailable_count: transcriptUnavailableRows.length,
        transcript_unavailable: transcriptUnavailableRows,
        duration_blocked_count: durationBlocked.length,
        duration_blocked: durationBlocked,
      },
    });
  }

  if (
    queueItems.length === 0
    && permanentNoTranscriptRows.length > 0
    && transcriptUnavailableRows.length === 0
    && blueprintUnavailableRows.length === 0
    && insufficientRows.length === 0
    && readyRows.length === 0
    && inProgressRows.length === 0
    && duplicateRows.length === 0
  ) {
    return res.status(422).json({
      ok: false,
      error_code: 'NO_TRANSCRIPT_PERMANENT',
      message: 'No transcript is available for this video.',
      data: {
        ...traceData,
        transcript_status: 'confirmed_no_speech',
        transcript_attempt_count: sourceTranscriptMaxAttempts,
        transcript_retry_after_seconds: 0,
        no_transcript_count: permanentNoTranscriptRows.length,
        no_transcript: permanentNoTranscriptRows,
        duration_blocked_count: durationBlocked.length,
        duration_blocked: durationBlocked,
      },
    });
  }

  if (queueItems.length === 0) {
    return res.json({
      ok: true,
      error_code: null,
      message: 'source unlock status resolved',
      data: {
        ...traceData,
        job_id: null,
        queued_count: 0,
        skipped_existing_count: duplicateRows.length,
        skipped_existing: duplicateRows.map((row) => ({
          video_id: row.item.video_id,
          title: row.item.title,
          existing_blueprint_id: row.existing?.existing_blueprint_id || null,
          existing_feed_item_id: row.existing?.existing_feed_item_id || null,
        })),
        ready_count: readyRows.length,
        ready: readyRows,
        in_progress_count: inProgressRows.length,
        in_progress: inProgressRows,
        insufficient_count: insufficientRows.length,
        insufficient: insufficientRows,
        unavailable_count: blueprintUnavailableRows.length,
        unavailable: blueprintUnavailableRows,
        transcript_unavailable_count: transcriptUnavailableRows.length,
        transcript_unavailable: transcriptUnavailableRows,
        transcript_status: transcriptUnavailableRows.length > 0 ? 'retrying' : null,
        transcript_attempt_count: null,
        transcript_retry_after_seconds: transcriptUnavailableRows.length > 0
          ? Math.max(...transcriptUnavailableRows.map((row) => row.retry_after_seconds))
          : 0,
        no_transcript_count: permanentNoTranscriptRows.length,
        no_transcript: permanentNoTranscriptRows,
        duration_blocked_count: durationBlocked.length,
        duration_blocked: durationBlocked,
      },
    });
  }

  const queueCounts = await readQueueAdmissionCounts({
    db: sourcePageDb,
    userId,
    scope: 'source_item_unlock_generation',
    countQueueDepth,
    countQueueWorkItems,
  });
  queueDepth = queueCounts.queue_depth;
  userQueueDepth = queueCounts.user_queue_depth;
  queueWorkItems = queueCounts.queue_work_items;
  userQueueWorkItems = queueCounts.user_queue_work_items;
  const queueAdmission = wouldExceedQueueAdmission({
    counts: queueCounts,
    newWorkItems: queueItems.length,
    queueDepthHardLimit,
    queueDepthPerUserLimit,
    queueWorkItemsHardLimit,
    queueWorkItemsPerUserLimit,
  });
  if (queueAdmission.blocked) {
    for (const item of queueItems) {
      if (item.reserved_cost > 0) {
        await refundReservation(sourcePageDb, {
          userId: item.reserved_by_user_id,
          amount: item.reserved_cost,
          idempotencyKey: buildUnlockLedgerIdempotencyKey({
            unlockId: item.unlock_id,
            userId: item.reserved_by_user_id,
            action: 'refund',
          }),
          reasonCode: 'UNLOCK_REFUND',
          context: {
            source_item_id: item.source_item_id,
            source_page_id: item.source_page_id,
            unlock_id: item.unlock_id,
            metadata: {
              source: 'source_page_video_library',
              error_code: 'QUEUE_BACKPRESSURE',
              trace_id: traceId,
            },
          },
        });
      }
      await failUnlock(sourcePageDb, {
        unlockId: item.unlock_id,
        errorCode: 'QUEUE_BACKPRESSURE',
        errorMessage: 'Unlock queue is busy. Please retry shortly.',
      });
    }
    return res.status(429).json({
      ok: false,
      error_code: 'QUEUE_BACKPRESSURE',
      message: 'Unlock queue is busy. Please retry shortly.',
      retry_after_seconds: 30,
      data: {
        ...traceData,
        queue_depth: queueDepth,
        user_queue_depth: userQueueDepth,
        queue_work_items: queueWorkItems,
        user_queue_work_items: userQueueWorkItems,
      },
    });
  }

  const jobInsert = await deps.enqueueIngestionJob(db, {
    trigger: 'user_sync',
    scope: 'source_item_unlock_generation',
    status: 'queued',
    requested_by_user_id: userId,
    trace_id: traceId,
    payload: {
      user_id: userId,
      trace_id: traceId,
      generation_tier: resolvedTier,
      items: queueItems,
    },
    next_run_at: new Date().toISOString(),
  });
  const { data: job, error: jobCreateError } = jobInsert;
  if (jobCreateError) {
    for (const item of queueItems) {
      if (item.reserved_cost > 0) {
        await refundReservation(sourcePageDb, {
          userId: item.reserved_by_user_id,
          amount: item.reserved_cost,
          idempotencyKey: buildUnlockLedgerIdempotencyKey({
            unlockId: item.unlock_id,
            userId: item.reserved_by_user_id,
            action: 'refund',
          }),
          reasonCode: 'UNLOCK_REFUND',
          context: {
            source_item_id: item.source_item_id,
            source_page_id: item.source_page_id,
            unlock_id: item.unlock_id,
            metadata: {
              source: 'source_page_video_library',
              error_code: 'QUEUE_INSERT_FAILED',
              trace_id: traceId,
            },
          },
        });
      }
      await failUnlock(sourcePageDb, {
        unlockId: item.unlock_id,
        errorCode: 'SOURCE_VIDEO_GENERATE_FAILED',
        errorMessage: jobCreateError.message,
      });
    }
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_FAILED',
      message: jobCreateError.message,
      data: traceData,
    });
  }

  await emitGenerationStartedNotification(sourcePageDb, {
    userId,
    jobId: job.id,
    scope: 'source_item_unlock_generation',
    queuedCount: queueItems.length,
    itemTitle: queueItems[0]?.title || null,
    traceId: traceId || null,
    linkPath: getGenerationNotificationLinkPath({
      scope: 'source_item_unlock_generation',
      sourcePagePath: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
    }),
  });

  scheduleQueuedIngestionProcessing();

  return res.status(202).json({
    ok: true,
    error_code: null,
    message: 'background unlock generation started',
    data: {
      ...traceData,
      job_id: job.id,
      queue_depth: queueDepth + 1,
      queue_work_items: queueWorkItems + queueItems.length,
      user_queue_work_items: userQueueWorkItems + queueItems.length,
      estimated_start_seconds: Math.max(1, Math.ceil((queueDepth + 1) / Math.max(1, workerConcurrency)) * 4),
      queued_count: queueItems.length,
      requested_tier: requestedTier || null,
      resolved_tier: resolvedTier,
      variant_status: 'queued',
      dual_generate_enabled: dualGenerateEnabled,
      dual_generate_tiers: Array.from(dualGenerateTiers),
      skipped_existing_count: duplicateRows.length,
      skipped_existing: duplicateRows.map((row) => ({
        video_id: row.item.video_id,
        title: row.item.title,
        existing_blueprint_id: row.existing?.existing_blueprint_id || null,
        existing_feed_item_id: row.existing?.existing_feed_item_id || null,
      })),
      ready_count: readyRows.length,
      ready: readyRows,
      in_progress_count: inProgressRows.length,
      in_progress: inProgressRows,
      insufficient_count: insufficientRows.length,
      insufficient: insufficientRows,
      transcript_unavailable_count: transcriptUnavailableRows.length,
      transcript_unavailable: transcriptUnavailableRows,
      transcript_status: transcriptUnavailableRows.length > 0 ? 'retrying' : null,
      transcript_attempt_count: null,
      transcript_retry_after_seconds: transcriptUnavailableRows.length > 0
        ? Math.max(...transcriptUnavailableRows.map((row) => row.retry_after_seconds))
        : 0,
      no_transcript_count: permanentNoTranscriptRows.length,
      no_transcript: permanentNoTranscriptRows,
      duration_blocked_count: durationBlocked.length,
      duration_blocked: durationBlocked,
    },
  });
}

app.post(
  '/api/source-pages/:platform/:externalId/videos/unlock',
  sourceVideoUnlockBurstLimiter,
  sourceVideoUnlockSustainedLimiter,
  handleSourcePageVideosUnlock,
);

app.get('/api/source-pages/:platform/:externalId/blueprints', async (req, res) => {
  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'externalId required',
      data: null,
    });
  }

  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(db, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not fetch source page.',
      data: null,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: null,
    });
  }

  const limit = clampInt(req.query.limit, 12, 1, 24);
  const rawCursor = String(req.query.cursor || '').trim();
  const decodedCursor = rawCursor ? decodeSourcePageBlueprintCursor(rawCursor) : null;
  if (rawCursor && !decodedCursor) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_CURSOR',
      message: 'Invalid cursor.',
      data: null,
    });
  }

  const scanBatch = Math.max(limit * 6, 48);
  const maxScanRows = 2000;
  const seenSourceItemIds = new Set<string>();
  const selectedRows: Array<{
    sourceItemId: string;
    blueprintId: string;
    createdAt: string;
    sourceUrl: string;
    sourceThumbnailUrl: string | null;
  }> = [];

  let scanRows = 0;
  let cursor = decodedCursor;
  let exhausted = false;
  let reachedLimit = false;
  let lastAcceptedCursor: SourcePageBlueprintCursor | null = null;
  let lastScannedCursor: SourcePageBlueprintCursor | null = null;

  while (!reachedLimit && !exhausted && scanRows < maxScanRows) {
    let feedQuery = db
      .from('user_feed_items')
      .select('id, source_item_id, blueprint_id, created_at')
      .eq('state', 'channel_published')
      .not('blueprint_id', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(scanBatch);

    const cursorFilter = cursor ? buildSourcePageCursorFilter(cursor) : null;
    if (cursorFilter) feedQuery = feedQuery.or(cursorFilter);

    const { data: feedRowsData, error: feedRowsError } = await feedQuery;
    if (feedRowsError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: feedRowsError.message,
        data: null,
      });
    }

    const feedRows = (feedRowsData || []) as SourcePageFeedScanRow[];
    if (!feedRows.length) {
      exhausted = true;
      break;
    }

    scanRows += feedRows.length;
    const lastFeedRow = feedRows[feedRows.length - 1];
    const normalizedLastFeedCursor = normalizeSourcePageBlueprintCursor({
      createdAt: lastFeedRow.created_at,
      feedItemId: lastFeedRow.id,
    });
    if (normalizedLastFeedCursor) {
      lastScannedCursor = normalizedLastFeedCursor;
      cursor = normalizedLastFeedCursor;
    }

    const sourceItemIds = Array.from(new Set(feedRows.map((row) => String(row.source_item_id || '').trim()).filter(Boolean)));
    const chunkBlueprintIds = Array.from(new Set(feedRows.map((row) => String(row.blueprint_id || '').trim()).filter(Boolean)));
    if (!sourceItemIds.length || !chunkBlueprintIds.length) {
      if (feedRows.length < scanBatch) exhausted = true;
      continue;
    }

    const [{ data: sourceRowsData, error: sourceRowsError }, { data: blueprintVisibilityData, error: blueprintVisibilityError }] = await Promise.all([
      db
        .from('source_items')
        .select('id, source_page_id, source_channel_id, source_url, thumbnail_url')
        .in('id', sourceItemIds),
      db
        .from('blueprints')
        .select('id, is_public')
        .in('id', chunkBlueprintIds),
    ]);

    if (sourceRowsError || blueprintVisibilityError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: sourceRowsError?.message || blueprintVisibilityError?.message || 'Could not load source-page feed rows.',
        data: null,
      });
    }

    const sourceMap = new Map((sourceRowsData || []).map((row) => [row.id, row as SourcePageFeedSourceRow]));
    const publicBlueprintIds = new Set(
      (blueprintVisibilityData || [])
        .filter((row) => Boolean(row.is_public))
        .map((row) => String(row.id || '').trim())
        .filter(Boolean),
    );

    for (const row of feedRows) {
      const sourceItemId = String(row.source_item_id || '').trim();
      const blueprintId = String(row.blueprint_id || '').trim();
      if (!sourceItemId || !blueprintId) continue;
      if (!publicBlueprintIds.has(blueprintId)) continue;

      const source = sourceMap.get(sourceItemId);
      if (!source) continue;

      const sourcePageId = String(source.source_page_id || '').trim() || null;
      const sourceChannelId = String(source.source_channel_id || '').trim() || null;
      const matchesLinkedSource = sourcePageId === sourcePage.id;
      const matchesLegacyYoutubeFallback =
        platform === 'youtube'
        && !sourcePageId
        && sourceChannelId === sourcePage.external_id;
      if (!matchesLinkedSource && !matchesLegacyYoutubeFallback) continue;

      if (seenSourceItemIds.has(sourceItemId)) continue;
      seenSourceItemIds.add(sourceItemId);

      const normalizedAcceptedCursor = normalizeSourcePageBlueprintCursor({
        createdAt: row.created_at,
        feedItemId: row.id,
      });
      if (normalizedAcceptedCursor) lastAcceptedCursor = normalizedAcceptedCursor;

      selectedRows.push({
        sourceItemId,
        blueprintId,
        createdAt: normalizedAcceptedCursor?.createdAt || row.created_at,
        sourceUrl: String(source.source_url || '').trim(),
        sourceThumbnailUrl: String(source.thumbnail_url || '').trim() || null,
      });

      if (selectedRows.length >= limit) {
        reachedLimit = true;
        break;
      }
    }

    if (feedRows.length < scanBatch) exhausted = true;
  }

  if (!selectedRows.length) {
    return res.json({
      ok: true,
      error_code: null,
      message: 'source page blueprints',
      data: {
        items: [],
        next_cursor: null,
      },
    });
  }

  const blueprintIds = Array.from(new Set(selectedRows.map((row) => row.blueprintId)));
  const [{ data: blueprintRowsData, error: blueprintRowsError }, { data: tagRowsData, error: tagRowsError }] = await Promise.all([
    db
      .from('blueprints')
      .select('id, title, llm_review, banner_url, sections_json, steps, is_public')
      .in('id', blueprintIds),
    db
      .from('blueprint_tags')
      .select('blueprint_id, tag_id')
      .in('blueprint_id', blueprintIds),
  ]);

  if (blueprintRowsError || tagRowsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: blueprintRowsError?.message || tagRowsError?.message || 'Could not load source-page blueprints.',
      data: null,
    });
  }

  const tagIds = Array.from(new Set((tagRowsData || []).map((row) => String(row.tag_id || '').trim()).filter(Boolean)));
  const { data: tagDefsData, error: tagDefsError } = tagIds.length
    ? await db
      .from('tags')
      .select('id, slug')
      .in('id', tagIds)
    : { data: [], error: null };
  if (tagDefsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: tagDefsError.message,
      data: null,
    });
  }

  const { data: allPublishedFeedRows, error: allPublishedFeedRowsError } = await db
    .from('user_feed_items')
    .select('id, blueprint_id')
    .eq('state', 'channel_published')
    .in('blueprint_id', blueprintIds);
  if (allPublishedFeedRowsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: allPublishedFeedRowsError.message,
      data: null,
    });
  }

  const publishedFeedItemIds = Array.from(new Set((allPublishedFeedRows || []).map((row) => String(row.id || '').trim()).filter(Boolean)));
  const blueprintIdByFeedItemId = new Map(
    (allPublishedFeedRows || []).map((row) => [String(row.id || '').trim(), String(row.blueprint_id || '').trim()]),
  );

  const { data: candidateRowsData, error: candidateRowsError } = publishedFeedItemIds.length
    ? await db
      .from('channel_candidates')
      .select('user_feed_item_id, channel_slug, created_at')
      .eq('status', 'published')
      .in('user_feed_item_id', publishedFeedItemIds)
      .order('created_at', { ascending: false })
    : { data: [], error: null };
  if (candidateRowsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: candidateRowsError.message,
      data: null,
    });
  }

  const publicBlueprintMap = new Map(
    (blueprintRowsData || [])
      .filter((row) => Boolean(row.is_public))
      .map((row) => [String(row.id || '').trim(), row]),
  );
  const tagDefMap = new Map((tagDefsData || []).map((row) => [String(row.id || '').trim(), String(row.slug || '').trim()]));
  const tagsByBlueprint = new Map<string, Array<{ id: string; slug: string }>>();
  for (const row of tagRowsData || []) {
    const blueprintId = String(row.blueprint_id || '').trim();
    const tagId = String(row.tag_id || '').trim();
    const tagSlug = tagDefMap.get(tagId);
    if (!blueprintId || !tagId || !tagSlug) continue;
    const list = tagsByBlueprint.get(blueprintId) || [];
    list.push({ id: tagId, slug: tagSlug });
    tagsByBlueprint.set(blueprintId, list);
  }

  const publishedChannelByBlueprint = new Map<string, { slug: string; createdAtMs: number }>();
  for (const row of candidateRowsData || []) {
    const feedItemId = String(row.user_feed_item_id || '').trim();
    const blueprintId = blueprintIdByFeedItemId.get(feedItemId);
    const channelSlug = String(row.channel_slug || '').trim().toLowerCase();
    if (!blueprintId || !channelSlug) continue;
    const createdAtMs = Date.parse(String(row.created_at || ''));
    const safeCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : 0;
    const existing = publishedChannelByBlueprint.get(blueprintId);
    if (!existing || safeCreatedAtMs > existing.createdAtMs || (safeCreatedAtMs === existing.createdAtMs && channelSlug < existing.slug)) {
      publishedChannelByBlueprint.set(blueprintId, {
        slug: channelSlug,
        createdAtMs: safeCreatedAtMs,
      });
    }
  }

  const items = selectedRows
    .map((row) => {
      const blueprint = publicBlueprintMap.get(row.blueprintId);
      if (!blueprint) return null;
      return {
        source_item_id: row.sourceItemId,
        blueprint_id: row.blueprintId,
        title: String(blueprint.title || '').trim() || 'Untitled blueprint',
        summary: buildSourcePageSummary({
          sectionsJson: blueprint.sections_json ?? null,
          steps: blueprint.steps ?? null,
          llmReview: blueprint.llm_review || null,
          fallbackTitle: String(blueprint.title || ''),
        }),
        banner_url: blueprint.banner_url || null,
        created_at: row.createdAt,
        published_channel_slug: publishedChannelByBlueprint.get(row.blueprintId)?.slug || null,
        tags: tagsByBlueprint.get(row.blueprintId) || [],
        source_url: row.sourceUrl || '',
        source_thumbnail_url: row.sourceThumbnailUrl,
      };
    })
    .filter(Boolean);

  let nextCursor: string | null = null;
  if (reachedLimit && lastAcceptedCursor) {
    nextCursor = encodeSourcePageBlueprintCursor(lastAcceptedCursor);
  } else if (!exhausted && lastScannedCursor) {
    nextCursor = encodeSourcePageBlueprintCursor(lastScannedCursor);
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page blueprints',
    data: {
      items,
      next_cursor: nextCursor,
    },
  });
});

app.post('/api/source-pages/:platform/:externalId/subscribe', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }
  if (platform !== 'youtube') {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Only YouTube source pages are supported in this version.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'externalId required', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let resolved;
  try {
    resolved = await resolveYouTubeChannel(externalId);
  } catch {
    return res.status(400).json({ ok: false, error_code: 'INVALID_CHANNEL', message: 'Could not resolve YouTube channel', data: null });
  }

  let channelAvatarUrl: string | null = null;
  let channelBannerUrl: string | null = null;
  if (youtubeDataApiKey) {
    try {
      const assetMap = await fetchYouTubeChannelAssetMap({
        apiKey: youtubeDataApiKey,
        channelIds: [resolved.channelId],
      });
      const assets = assetMap.get(resolved.channelId);
      channelAvatarUrl = assets?.avatarUrl || null;
      channelBannerUrl = assets?.bannerUrl || null;
    } catch (assetError) {
      console.log('[source_page_assets_lookup_failed]', JSON.stringify({
        source_channel_id: resolved.channelId,
        error: assetError instanceof Error ? assetError.message : String(assetError),
      }));
    }
  }

  let sourcePage;
  try {
    sourcePage = await ensureSourcePageFromYouTubeChannel(sourcePageDb, {
      channelId: resolved.channelId,
      channelUrl: resolved.channelUrl,
      title: resolved.channelTitle,
      avatarUrl: channelAvatarUrl,
      bannerUrl: channelBannerUrl,
    });
  } catch (sourcePageError) {
    return res.status(500).json({
      ok: false,
      error_code: 'SOURCE_PAGE_SUBSCRIBE_FAILED',
      message: sourcePageError instanceof Error ? sourcePageError.message : 'Could not prepare source page.',
      data: null,
    });
  }

  const { data: existingSub } = await db
    .from('user_source_subscriptions')
    .select('id, is_active, auto_unlock_enabled')
    .eq('user_id', userId)
    .eq('source_type', 'youtube')
    .eq('source_channel_id', resolved.channelId)
    .maybeSingle();
  const isCreateOrReactivate = !existingSub || !existingSub.is_active;

  const { data: upserted, error: upsertError } = await db
    .from('user_source_subscriptions')
    .upsert(
      {
        user_id: userId,
        source_type: 'youtube',
        source_channel_id: resolved.channelId,
        source_channel_url: resolved.channelUrl,
        source_channel_title: resolved.channelTitle,
        source_page_id: sourcePage.id,
        mode: 'auto',
        auto_unlock_enabled: existingSub?.auto_unlock_enabled ?? true,
        is_active: true,
        last_sync_error: null,
      },
      { onConflict: 'user_id,source_type,source_channel_id' },
    )
    .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
    .single();
  if (upsertError) {
    return res.status(400).json({ ok: false, error_code: 'SOURCE_PAGE_SUBSCRIBE_FAILED', message: upsertError.message, data: null });
  }

  let sync: SyncSubscriptionResult | null = null;
  try {
    sync = await syncSingleSubscription(db, upserted, { trigger: 'subscription_create' });
  } catch (error) {
    await markSubscriptionSyncError(db, upserted, error);
  }

  if (isCreateOrReactivate) {
    try {
      const noticeSource = await upsertSubscriptionNoticeSourceItem(db, {
        channelId: resolved.channelId,
        channelTitle: resolved.channelTitle,
        channelUrl: resolved.channelUrl,
        channelAvatarUrl,
        channelBannerUrl,
      });
      await insertFeedItem(db, {
        userId,
        sourceItemId: noticeSource.id,
        blueprintId: null,
        state: 'subscription_notice',
      });
    } catch (noticeError) {
      console.log('[subscription_notice_insert_failed]', JSON.stringify({
        user_id: userId,
        source_channel_id: resolved.channelId,
        error: noticeError instanceof Error ? noticeError.message : String(noticeError),
      }));
    }
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page subscribed',
    data: {
      source_page: {
        ...sourcePage,
        path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      subscription: {
        ...upserted,
        source_page_path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      sync,
    },
  });
});

app.delete('/api/source-pages/:platform/:externalId/subscribe', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }
  if (platform !== 'youtube') {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Only YouTube source pages are supported in this version.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'externalId required', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(sourcePageDb, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not read source page.',
      data: null,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: null,
    });
  }

  const { data, error } = await db
    .from('user_source_subscriptions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('source_type', 'youtube')
    .eq('source_channel_id', sourcePage.external_id)
    .select('id, source_channel_id')
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'SOURCE_PAGE_UNSUBSCRIBE_FAILED', message: error.message, data: null });
  if (!data) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page unsubscribed',
    data: {
      source_page: {
        ...sourcePage,
        path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      subscription: data,
    },
  });
});

}
