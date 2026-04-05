import type express from 'express';
import type {
  RefreshScanCandidate,
  SourceSubscriptionsRouteDeps,
  SyncSubscriptionResult,
} from '../contracts/api/sourceSubscriptions';
import {
  YouTubeChannelLookupError,
  YouTubePublicSubscriptionsError,
} from '../services/youtubeSubscriptions';
import { fetchYouTubeDurationMap, YouTubeDurationLookupError } from '../services/youtubeDuration';
import { splitByDurationPolicy, toDurationSeconds } from '../services/videoDurationPolicy';
import {
  buildManualGenerationReservation,
  releaseManualGeneration,
} from '../services/manualGenerationBilling';
import {
  buildManualGenerationResultBuckets,
  classifyManualGenerationCandidates,
  readQueueAdmissionCounts,
  reserveManualGenerationWorkPrefix,
  wouldExceedQueueAdmission,
} from '../services/generationPreflight';
import { backfillSubscribedCreatorForSparseForYou } from '../services/subscriptionBackfill';

type StoredSourcePageAssetRow = {
  id: string;
  external_id: string;
  avatar_url: string | null;
  banner_url: string | null;
};

const PUBLIC_YOUTUBE_PREVIEW_DEFAULT_PAGE_SIZE = 50;
const PUBLIC_YOUTUBE_PREVIEW_MAX_PAGE_SIZE = 50;

async function loadStoredSourcePageAssets(
  db: any,
  rows: Array<{ source_page_id?: string | null; source_channel_id?: string | null }>,
) {
  const byPageId = new Map<string, StoredSourcePageAssetRow>();
  const byChannelId = new Map<string, StoredSourcePageAssetRow>();
  if (!db || rows.length === 0) {
    return {
      byPageId,
      byChannelId,
      needsSweep: false,
    };
  }

  const sourcePageIds = Array.from(new Set(
    rows.map((row) => String(row.source_page_id || '').trim()).filter(Boolean),
  ));
  const sourceChannelIds = Array.from(new Set(
    rows.map((row) => String(row.source_channel_id || '').trim()).filter(Boolean),
  ));

  if (sourcePageIds.length > 0) {
    const { data, error } = await db
      .from('source_pages')
      .select('id, external_id, avatar_url, banner_url')
      .in('id', sourcePageIds);
    if (error) throw error;
    for (const row of (data || []) as StoredSourcePageAssetRow[]) {
      const sourcePageId = String(row.id || '').trim();
      const sourceChannelId = String(row.external_id || '').trim();
      if (sourcePageId) byPageId.set(sourcePageId, row);
      if (sourceChannelId) byChannelId.set(sourceChannelId, row);
    }
  }

  const unresolvedChannelIds = sourceChannelIds.filter((channelId) => !byChannelId.has(channelId));
  if (unresolvedChannelIds.length > 0) {
    const { data, error } = await db
      .from('source_pages')
      .select('id, external_id, avatar_url, banner_url')
      .eq('platform', 'youtube')
      .in('external_id', unresolvedChannelIds);
    if (error) throw error;
    for (const row of (data || []) as StoredSourcePageAssetRow[]) {
      const sourcePageId = String(row.id || '').trim();
      const sourceChannelId = String(row.external_id || '').trim();
      if (sourcePageId) byPageId.set(sourcePageId, row);
      if (sourceChannelId) byChannelId.set(sourceChannelId, row);
    }
  }

  const needsSweep = rows.some((row) => {
    const sourcePageId = String(row.source_page_id || '').trim();
    const sourceChannelId = String(row.source_channel_id || '').trim();
    const assetRow = (sourcePageId ? byPageId.get(sourcePageId) : null)
      || (sourceChannelId ? byChannelId.get(sourceChannelId) : null)
      || null;
    if (!assetRow) return true;
    return !assetRow.avatar_url || !assetRow.banner_url;
  });

  return {
    byPageId,
    byChannelId,
    needsSweep,
  };
}

function mapPublicYouTubePreviewError(error: unknown) {
  if (error instanceof YouTubeChannelLookupError) {
    if (error.code === 'CHANNEL_NOT_FOUND') {
      return {
        status: 404,
        error_code: 'PUBLIC_IMPORT_CHANNEL_NOT_FOUND',
        message: 'Could not find that YouTube channel.',
      };
    }

    return {
      status: 503,
      error_code: 'PUBLIC_IMPORT_UNAVAILABLE',
      message: error.message || 'Could not resolve YouTube channel.',
    };
  }

  if (error instanceof YouTubePublicSubscriptionsError) {
    if (error.code === 'PUBLIC_IMPORT_CHANNEL_NOT_FOUND') {
      return {
        status: 404,
        error_code: 'PUBLIC_IMPORT_CHANNEL_NOT_FOUND',
        message: 'Could not find that YouTube channel.',
      };
    }
    if (error.code === 'PUBLIC_SUBSCRIPTIONS_PRIVATE') {
      return {
        status: 403,
        error_code: 'PUBLIC_SUBSCRIPTIONS_PRIVATE',
        message: 'The channel subscriptions are private or inaccessible.',
      };
    }

    return {
      status: 503,
      error_code: 'PUBLIC_IMPORT_UNAVAILABLE',
      message: error.message || 'Could not fetch public YouTube subscriptions.',
    };
  }

  return {
    status: 503,
    error_code: 'PUBLIC_IMPORT_UNAVAILABLE',
    message: error instanceof Error ? error.message : 'Could not fetch public YouTube subscriptions.',
  };
}

export async function handleCreateSourceSubscription(req: express.Request, res: express.Response, deps: SourceSubscriptionsRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const body = req.body as { channel_input?: string; mode?: string };
  const channelInput = String(body.channel_input || '').trim();
  if (!channelInput) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'channel_input required', data: null });
  }

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = deps.getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let resolved;
  try {
    resolved = await deps.resolveYouTubeChannel(channelInput);
  } catch {
    return res.status(400).json({ ok: false, error_code: 'INVALID_CHANNEL', message: 'Could not resolve YouTube channel', data: null });
  }

  let channelAvatarUrl: string | null = null;
  let channelBannerUrl: string | null = null;
  if (deps.youtubeDataApiKey) {
    try {
      const assetMap = await deps.fetchYouTubeChannelAssetMap({
        apiKey: deps.youtubeDataApiKey,
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
    sourcePage = await deps.ensureSourcePageFromYouTubeChannel(sourcePageDb, {
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

  let upserted;
  let previousSubscription = null;
  try {
    const result = await deps.upsertSourceSubscription(db, {
      userId,
      sourceType: 'youtube',
      sourceChannelId: resolved.channelId,
      sourceChannelUrl: resolved.channelUrl,
      sourceChannelTitle: resolved.channelTitle,
      sourcePageId: sourcePage.id,
      mode: 'auto',
      isActive: true,
      lastSyncError: null,
    });
    upserted = result.row;
    previousSubscription = result.current;
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'WRITE_FAILED',
      message: error instanceof Error ? error.message : String(error),
      data: null,
    });
  }
  const isCreateOrReactivate = !previousSubscription || !previousSubscription.is_active;

  let sync: SyncSubscriptionResult | null = null;
  try {
    sync = await deps.syncSingleSubscription(db, upserted, { trigger: 'subscription_create' });
  } catch (error) {
    await deps.markSubscriptionSyncError(db, upserted, error);
  }

  if (isCreateOrReactivate) {
    try {
      const noticeSource = await deps.upsertSubscriptionNoticeSourceItem(db, {
        channelId: resolved.channelId,
        channelTitle: resolved.channelTitle,
        channelUrl: resolved.channelUrl,
        channelAvatarUrl,
        channelBannerUrl,
      });
      await deps.insertFeedItem(db, {
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

    try {
      await backfillSubscribedCreatorForSparseForYou({
        db,
        sourcePageDb,
        userId,
        sourcePageId: sourcePage.id,
        channelId: resolved.channelId,
        channelTitle: resolved.channelTitle,
        youtubeDataApiKey: deps.youtubeDataApiKey,
        listYouTubeSourceVideos: deps.listYouTubeSourceVideos,
        upsertSourceItemFromVideo: deps.upsertSourceItemFromVideo,
        resolveVariantOrReady: deps.resolveVariantOrReady,
        insertFeedItem: deps.insertFeedItem,
        upsertFeedItemWithBlueprint: deps.upsertFeedItemWithBlueprint,
      });
    } catch (backfillError) {
      console.log('[subscription_backfill_failed]', JSON.stringify({
        user_id: userId,
        source_channel_id: resolved.channelId,
        source_page_id: sourcePage.id,
        error: backfillError instanceof Error ? backfillError.message : String(backfillError),
      }));
    }
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscription upserted',
    data: {
      subscription: {
        ...upserted,
        source_page_path: deps.buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      source_page: sourcePage,
      sync,
    },
  });
}

export async function handlePreviewPublicYouTubeSubscriptions(
  req: express.Request,
  res: express.Response,
  deps: SourceSubscriptionsRouteDeps,
) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const channelInput = String((req.body as { channel_input?: string } | null)?.channel_input || '').trim();
  const pageToken = String((req.body as { page_token?: string } | null)?.page_token || '').trim() || null;
  const requestedPageSize = Number((req.body as { page_size?: number } | null)?.page_size);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.max(1, Math.min(Math.floor(requestedPageSize), PUBLIC_YOUTUBE_PREVIEW_MAX_PAGE_SIZE))
    : PUBLIC_YOUTUBE_PREVIEW_DEFAULT_PAGE_SIZE;
  if (!channelInput) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'channel_input required', data: null });
  }

  if (!deps.youtubeDataApiKey) {
    return res.status(503).json({
      ok: false,
      error_code: 'PUBLIC_IMPORT_UNAVAILABLE',
      message: 'Public YouTube import is not configured.',
      data: null,
    });
  }

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  let resolved;
  try {
    resolved = await deps.resolvePublicYouTubeChannel({
      channelInput,
      apiKey: deps.youtubeDataApiKey,
    });
  } catch (error) {
    const mapped = mapPublicYouTubePreviewError(error);
    return res.status(mapped.status).json({ ok: false, error_code: mapped.error_code, message: mapped.message, data: null });
  }

  let preview;
  try {
    preview = await deps.fetchPublicYouTubeSubscriptions({
      apiKey: deps.youtubeDataApiKey,
      channelId: resolved.channelId,
      pageToken,
      pageSize,
    });
  } catch (error) {
    const mapped = mapPublicYouTubePreviewError(error);
    return res.status(mapped.status).json({ ok: false, error_code: mapped.error_code, message: mapped.message, data: null });
  }

  const channelIds = preview.items
    .map((item: { channelId?: string | null }) => String(item.channelId || '').trim())
    .filter(Boolean);

  let existing: Array<{ source_channel_id: string; is_active: boolean }> = [];
  try {
    const rows = channelIds.length === 0
      ? []
      : await deps.listSourceSubscriptionsForUser(db, userId);
    existing = rows
      .filter((row: any) => String(row.source_type || '').trim() === 'youtube')
      .filter((row: any) => channelIds.includes(String(row.source_channel_id || '').trim()))
      .map((row: any) => ({
        source_channel_id: String(row.source_channel_id || '').trim(),
        is_active: row.is_active === true,
      }));
  } catch (existingError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: existingError instanceof Error ? existingError.message : String(existingError),
      data: null,
    });
  }

  const existingByChannelId = new Map(
    (existing || []).map((row) => [String(row.source_channel_id || '').trim(), row.is_active]),
  );

  return res.json({
    ok: true,
    error_code: null,
    message: 'public youtube subscriptions preview',
    data: {
      source_channel_id: resolved.channelId,
      source_channel_title: resolved.channelTitle,
      source_channel_url: resolved.channelUrl,
      creators_total: preview.items.length,
      next_page_token: preview.nextPageToken,
      has_more: Boolean(preview.hasMore),
      creators: preview.items.map((item: {
        channelId: string;
        channelTitle: string;
        channelUrl: string;
        thumbnailUrl: string | null;
      }) => ({
        channel_id: item.channelId,
        channel_title: item.channelTitle,
        channel_url: item.channelUrl,
        thumbnail_url: item.thumbnailUrl,
        already_active: existingByChannelId.get(item.channelId) === true,
        already_exists_inactive: existingByChannelId.get(item.channelId) === false,
      })),
    },
  });
}

export async function handleListSourceSubscriptions(_req: express.Request, res: express.Response, deps: SourceSubscriptionsRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = deps.getServiceSupabaseClient?.() || db;

  let rows = [] as Array<Record<string, unknown>>;
  try {
    rows = await deps.listSourceSubscriptionsForUser(db, userId);
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : String(error),
      data: null,
    });
  }
  try {
    const storedAssets = await loadStoredSourcePageAssets(sourcePageDb, rows);
    const withAvatars = rows.map((row) => {
      const sourcePageId = String(row.source_page_id || '').trim();
      const sourceChannelId = String(row.source_channel_id || '').trim();
      const assetRow = (sourcePageId ? storedAssets.byPageId.get(sourcePageId) : null)
        || (sourceChannelId ? storedAssets.byChannelId.get(sourceChannelId) : null)
        || null;
      return {
        ...row,
        source_channel_avatar_url: assetRow?.avatar_url || null,
        source_page_path: sourceChannelId ? deps.buildSourcePagePath('youtube', sourceChannelId) : null,
      };
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'subscriptions fetched',
      data: withAvatars,
    });
  } catch (avatarError) {
    console.log('[subscription_stored_assets_lookup_failed]', JSON.stringify({
      user_id: userId,
      error: avatarError instanceof Error ? avatarError.message : String(avatarError),
    }));
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscriptions fetched',
    data: rows.map((row) => {
      const sourceChannelId = String(row.source_channel_id || '').trim();
      return {
        ...row,
        source_channel_avatar_url: null,
        source_page_path: sourceChannelId ? deps.buildSourcePagePath('youtube', sourceChannelId) : null,
      };
    }),
  });
}

export async function handleRefreshScan(req: express.Request, res: express.Response, deps: SourceSubscriptionsRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const parsed = deps.RefreshSubscriptionsScanSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid scan request', data: null });
  }

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  try {
    const scanned = await deps.collectRefreshCandidatesForUser(db, userId, {
      maxPerSubscription: parsed.data.max_per_subscription,
      maxTotal: parsed.data.max_total,
    });
    console.log('[subscription_refresh_scan_done]', JSON.stringify({
      user_id: userId,
      subscriptions_total: scanned.subscriptionsTotal,
      candidates_total: scanned.candidates.length,
      scan_errors: scanned.scanErrors.length,
      cooldown_filtered: scanned.cooldownFiltered,
      duration_filtered: scanned.durationFilteredCount || 0,
    }));
    return res.json({
      ok: true,
      error_code: null,
      message: 'refresh scan complete',
      data: {
        subscriptions_total: scanned.subscriptionsTotal,
        candidates_total: scanned.candidates.length,
        candidates: scanned.candidates,
        scan_errors: scanned.scanErrors,
        cooldown_filtered: scanned.cooldownFiltered,
        duration_filtered_count: scanned.durationFilteredCount || 0,
        duration_filtered_reasons: scanned.durationFilteredReasons || { too_long: 0, unknown: 0 },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ ok: false, error_code: 'SCAN_FAILED', message, data: null });
  }
}

export async function handleRefreshGenerate(req: express.Request, res: express.Response, deps: SourceSubscriptionsRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const parsed = deps.RefreshSubscriptionsGenerateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid generate request', data: null });
  }
  if (parsed.data.items.length > deps.refreshGenerateMaxItems) {
    return res.status(400).json({
      ok: false,
      error_code: 'MAX_ITEMS_EXCEEDED',
      message: `Select up to ${deps.refreshGenerateMaxItems} videos per generation run.`,
      data: null,
    });
  }
  const requestedTier = deps.normalizeRequestedGenerationTier(parsed.data.requested_tier);
  const resolvedTier = 'tier' as const;
  const dualGenerateEnabled = false;
  const dualGenerateTiers = ['tier'] as const;

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const serviceDb = deps.getServiceSupabaseClient();
  if (!serviceDb) {
    return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });
  }

  const recoveredJobs = await deps.recoverStaleIngestionJobs(db, {
    scope: 'manual_refresh_selection',
    requestedByUserId: userId,
  });
  if (recoveredJobs.length > 0) {
    console.log('[ingestion_stale_recovered]', JSON.stringify({
      scope: 'manual_refresh_selection',
      user_id: userId,
      recovered_count: recoveredJobs.length,
      recovered_job_ids: recoveredJobs.map((row) => row.id),
    }));
  }

  const activeManualJob = await deps.getActiveManualRefreshJob(db, userId);
  if (activeManualJob?.id) {
    return res.status(409).json({
      ok: false,
      error_code: 'JOB_ALREADY_RUNNING',
      message: 'Background generation is already running for this account.',
      data: {
        job_id: activeManualJob.id,
      },
    });
  }

  const subscriptionIds = new Set(parsed.data.items.map((item) => item.subscription_id));
  let subscriptions: Array<{ id: string; source_channel_id: string; is_active: boolean }> = [];
  try {
    const rows = await deps.listSourceSubscriptionsForUser(db, userId);
    subscriptions = rows
      .filter((row: any) => subscriptionIds.has(String(row.id || '').trim()))
      .map((row: any) => ({
        id: String(row.id || '').trim(),
        source_channel_id: String(row.source_channel_id || '').trim(),
        is_active: row.is_active === true,
      }))
      .filter((row) => row.is_active);
  } catch (subscriptionsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: subscriptionsError instanceof Error ? subscriptionsError.message : String(subscriptionsError),
      data: null,
    });
  }

  const activeById = new Map((subscriptions || []).map((row) => [row.id, row]));
  const allowedItems = parsed.data.items.filter((item) => {
    const sub = activeById.get(item.subscription_id);
    if (!sub) return false;
    return String(sub.source_channel_id || '').trim() === String(item.source_channel_id || '').trim();
  });

  const dedupedMap = new Map<string, RefreshScanCandidate>();
  for (const item of allowedItems) {
    dedupedMap.set(`${item.subscription_id}:${item.video_id}`, {
      subscription_id: item.subscription_id,
      source_channel_id: item.source_channel_id,
      source_channel_title: item.source_channel_title || null,
      source_channel_url: item.source_channel_url || null,
      video_id: item.video_id,
      video_url: item.video_url,
      title: item.title,
      published_at: item.published_at || null,
      thumbnail_url: item.thumbnail_url || null,
      duration_seconds: toDurationSeconds(item.duration_seconds),
    });
  }
  const dedupedItems = Array.from(dedupedMap.values());

  if (dedupedItems.length === 0) {
    return res.status(400).json({
      ok: false,
      error_code: 'NO_ELIGIBLE_ITEMS',
      message: 'No eligible videos found for active subscriptions',
      data: null,
    });
  }
  let allowedDurationItems = dedupedItems;
  let durationBlocked: Array<{
    video_id: string;
    title: string;
    error_code: 'VIDEO_TOO_LONG' | 'VIDEO_DURATION_UNAVAILABLE';
    reason: 'too_long' | 'unknown';
    max_duration_seconds: number;
    video_duration_seconds: number | null;
  }> = [];
  if (deps.generationDurationCapEnabled) {
    try {
      const durationMap = await fetchYouTubeDurationMap({
        apiKey: deps.youtubeDataApiKey,
        videoIds: dedupedItems.filter((item) => item.duration_seconds == null).map((item) => item.video_id),
        timeoutMs: deps.generationDurationLookupTimeoutMs,
        userAgent: 'bleuv1-refresh-generate/1.0 (+https://api.bleup.app)',
      });
      const withResolvedDurations = dedupedItems.map((item) => ({
        ...item,
        duration_seconds: item.duration_seconds ?? durationMap.get(item.video_id) ?? null,
      }));
      const split = splitByDurationPolicy({
        items: withResolvedDurations,
        config: {
          enabled: deps.generationDurationCapEnabled,
          maxSeconds: deps.generationMaxVideoSeconds,
          blockUnknown: deps.generationBlockUnknownDuration,
        },
        getVideoId: (item) => item.video_id,
        getTitle: (item) => item.title,
        getDurationSeconds: (item) => item.duration_seconds ?? null,
      });
      allowedDurationItems = split.allowed;
      durationBlocked = split.blocked;
    } catch (error) {
      if (error instanceof YouTubeDurationLookupError) {
        if (error.code === 'RATE_LIMITED') {
          return res.status(429).json({
            ok: false,
            error_code: 'RATE_LIMITED',
            message: 'Too many requests right now. Please retry shortly.',
            data: null,
          });
        }
        return res.status(502).json({
          ok: false,
          error_code: 'PROVIDER_FAIL',
          message: 'Video metadata provider is currently unavailable. Please try again.',
          data: null,
        });
      }
      throw error;
    }
  }

  if (allowedDurationItems.length === 0 && durationBlocked.length > 0) {
    return res.status(422).json({
      ok: false,
      error_code: 'VIDEO_DURATION_POLICY_BLOCKED',
      message: 'All selected videos are blocked by duration policy.',
      data: {
        duration_blocked_count: durationBlocked.length,
        duration_blocked: durationBlocked,
      },
    });
  }
  const {
    ready: skippedExisting,
    inProgress,
    billable: billableItems,
  } = await classifyManualGenerationCandidates({
    items: allowedDurationItems,
    generationTier: resolvedTier,
    getVideoId: (item) => item.video_id,
    getTitle: (item) => item.title,
    upsertSourceItem: async (item) => deps.upsertSourceItemFromVideo(serviceDb, {
      video: {
        videoId: item.video_id,
        title: item.title,
        url: item.video_url,
        publishedAt: item.published_at || null,
        thumbnailUrl: item.thumbnail_url || null,
        durationSeconds: item.duration_seconds,
      },
      channelId: item.source_channel_id,
      channelTitle: item.source_channel_title || null,
      sourcePageId: null,
    }),
    resolveVariantOrReady: ({ sourceItemId, generationTier }) => deps.resolveVariantOrReady({
      sourceItemId,
      generationTier,
    }),
    onReady: async ({ sourceItemId, blueprintId }) => {
      await deps.upsertFeedItemWithBlueprint(db, {
        userId,
        sourceItemId,
        blueprintId,
        state: 'my_feed_published',
      });
    },
  });

  const requestId = `refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let reservationResult;
  try {
    reservationResult = await reserveManualGenerationWorkPrefix({
      db: serviceDb,
      items: billableItems.map((item, index) => ({
        item,
        reservation: buildManualGenerationReservation({
          scope: 'manual_refresh_selection',
          userId,
          requestId: `${requestId}:${index}`,
          videoId: item.video_id,
          sourceItemId: item.source_item_id,
          metadata: {
            source: 'manual_refresh_selection',
            subscription_id: item.subscription_id,
            source_channel_id: item.source_channel_id,
          },
        }),
      })),
      mapSkippedUnaffordable: ({ item, required, balance }) => ({
        video_id: item.video_id,
        title: item.title,
        required,
        balance,
      }),
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error_code: 'CREDITS_UNAVAILABLE',
      message: error instanceof Error ? error.message : 'Credits backend unavailable.',
      data: null,
    });
  }
  const skippedUnaffordable = reservationResult.skippedUnaffordable;
  const queuedItems = reservationResult.reserved.map(({ item, reservation }) => ({
    ...item,
    reservation,
  }));
  let queueDepth = 0;
  let userQueueDepth = 0;
  let queueWorkItems = 0;
  let userQueueWorkItems = 0;
  if (queuedItems.length > 0) {
    const queueCounts = await readQueueAdmissionCounts({
      db: serviceDb,
      userId,
      countQueueDepth: deps.countQueueDepth,
      countQueueWorkItems: deps.countQueueWorkItems,
    });
    queueDepth = queueCounts.queue_depth;
    userQueueDepth = queueCounts.user_queue_depth;
    queueWorkItems = queueCounts.queue_work_items;
    userQueueWorkItems = queueCounts.user_queue_work_items;
    const queueAdmission = wouldExceedQueueAdmission({
      counts: queueCounts,
      newWorkItems: queuedItems.length,
      queueDepthHardLimit: deps.queueDepthHardLimit,
      queueDepthPerUserLimit: deps.queueDepthPerUserLimit,
      queueWorkItemsHardLimit: deps.queueWorkItemsHardLimit,
      queueWorkItemsPerUserLimit: deps.queueWorkItemsPerUserLimit,
    });
    if (queueAdmission.blocked) {
      for (const item of queuedItems) {
        await releaseManualGeneration(serviceDb, item.reservation);
      }
      return res.status(429).json({
        ok: false,
        error_code: 'QUEUE_BACKPRESSURE',
        message: 'Generation queue is busy. Please retry shortly.',
        retry_after_seconds: 30,
        data: {
          queue_depth: queueDepth,
          user_queue_depth: userQueueDepth,
          queue_work_items: queueWorkItems,
          user_queue_work_items: userQueueWorkItems,
        },
      });
    }
  }

  if (queuedItems.length === 0) {
    if (durationBlocked.length > 0 && skippedExisting.length === 0 && inProgress.length === 0 && skippedUnaffordable.length === 0) {
      return res.status(422).json({
        ok: false,
        error_code: 'VIDEO_DURATION_POLICY_BLOCKED',
        message: 'All selected videos are blocked by duration policy.',
        data: {
          duration_blocked_count: durationBlocked.length,
          duration_blocked: durationBlocked,
        },
      });
    }
      return res.status(200).json({
        ok: true,
        error_code: null,
        message: 'No new generation queued.',
        data: {
          job_id: null,
          queue_depth: queueDepth,
          queue_work_items: queueWorkItems,
          user_queue_work_items: userQueueWorkItems,
          queued_count: 0,
          requested_tier: requestedTier || null,
          resolved_tier: resolvedTier,
          variant_status: 'no_new_work',
          dual_generate_enabled: dualGenerateEnabled,
          dual_generate_tiers: Array.from(dualGenerateTiers),
          ...buildManualGenerationResultBuckets({
            durationBlocked,
            skippedExisting,
            inProgress,
            skippedUnaffordable,
          }),
        },
    });
  }

  const jobInsert = await deps.enqueueIngestionJob(db, {
    trigger: 'user_sync',
    scope: 'manual_refresh_selection',
    status: 'queued',
    requested_by_user_id: userId,
    payload: {
      user_id: userId,
      generation_tier: resolvedTier,
      items: queuedItems,
    },
    next_run_at: new Date().toISOString(),
  });
  const { data: job, error: jobCreateError } = jobInsert;
  if (jobCreateError) {
    for (const item of queuedItems) {
      await releaseManualGeneration(serviceDb, item.reservation);
    }
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });
  }

  await deps.emitGenerationStartedNotification(serviceDb, {
    userId,
    jobId: job.id,
    scope: 'manual_refresh_selection',
    queuedCount: queuedItems.length,
    itemTitle: queuedItems[0]?.title || null,
    linkPath: deps.getGenerationNotificationLinkPath({ scope: 'manual_refresh_selection' }),
  });
  deps.scheduleQueuedIngestionProcessing({
    scopes: ['manual_refresh_selection'],
    expedite: true,
    reason: 'manual_refresh_selection',
  });

  return res.status(202).json({
    ok: true,
    error_code: null,
    message: 'background generation started',
    data: {
      job_id: job.id,
      queue_depth: queueDepth + 1,
      queue_work_items: queueWorkItems + queuedItems.length,
      user_queue_work_items: userQueueWorkItems + queuedItems.length,
      queued_count: queuedItems.length,
      requested_tier: requestedTier || null,
      resolved_tier: resolvedTier,
      variant_status: 'queued',
      dual_generate_enabled: dualGenerateEnabled,
      dual_generate_tiers: Array.from(dualGenerateTiers),
      ...buildManualGenerationResultBuckets({
        durationBlocked,
        skippedExisting,
        inProgress,
        skippedUnaffordable,
      }),
    },
  });
}

export async function handlePatchSourceSubscription(req: express.Request, res: express.Response, deps: SourceSubscriptionsRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const modeRaw = req.body?.mode;
  const isActiveRaw = req.body?.is_active;
  const autoUnlockEnabledRaw = req.body?.auto_unlock_enabled;
  const updates: Record<string, unknown> = {};
  if (typeof modeRaw === 'string') {
    const mode = modeRaw.trim().toLowerCase();
    if (mode !== 'manual' && mode !== 'auto') {
      return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid mode', data: null });
    }
    updates.mode = 'auto';
  }
  if (typeof isActiveRaw === 'boolean') {
    updates.is_active = isActiveRaw;
  }
  if (typeof autoUnlockEnabledRaw === 'boolean') {
    updates.auto_unlock_enabled = autoUnlockEnabledRaw;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'No valid fields to update', data: null });
  }

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  let data;
  try {
    data = await deps.patchSourceSubscriptionById(db, {
      subscriptionId: req.params.id,
      userId,
      patch: updates,
      action: 'subscription_patch',
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'WRITE_FAILED',
      message: error instanceof Error ? error.message : String(error),
      data: null,
    });
  }
  if (!data) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscription updated',
    data,
  });
}

export async function handleDeleteSourceSubscription(req: express.Request, res: express.Response, deps: SourceSubscriptionsRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  let data;
  try {
    data = await deps.deactivateSourceSubscriptionById(db, {
      subscriptionId: req.params.id,
      userId,
      action: 'subscription_deactivate',
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'WRITE_FAILED',
      message: error instanceof Error ? error.message : String(error),
      data: null,
    });
  }
  if (!data) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscription deactivated',
    data,
  });
}

export async function handleSyncSourceSubscription(req: express.Request, res: express.Response, deps: SourceSubscriptionsRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  let subscription;
  try {
    subscription = await deps.getSourceSubscriptionById(db, {
      subscriptionId: req.params.id,
      userId,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : String(error),
      data: null,
    });
  }
  if (!subscription) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });
  if (!subscription.is_active) return res.status(400).json({ ok: false, error_code: 'INACTIVE_SUBSCRIPTION', message: 'Subscription is inactive', data: null });

  const { data: job, error: jobCreateError } = await deps.enqueueIngestionJob(db, {
    trigger: 'user_sync',
    scope: 'subscription',
    status: 'running',
    requested_by_user_id: userId,
    subscription_id: subscription.id,
    started_at: new Date().toISOString(),
    next_run_at: new Date().toISOString(),
  });
  if (jobCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });

  try {
    const sync = await deps.syncSingleSubscription(db, subscription, { trigger: 'user_sync' });
    await deps.finalizeIngestionJob(db, {
      jobId: job.id,
      status: 'succeeded',
      processedCount: sync.processed,
      insertedCount: sync.inserted,
      skippedCount: sync.skipped,
      action: 'subscription_sync_terminal',
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'subscription sync complete',
      data: {
        job_id: job.id,
        ...sync,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.markSubscriptionSyncError(db, subscription, error);
    await deps.finalizeIngestionJob(db, {
      jobId: job.id,
      status: 'failed',
      processedCount: 0,
      insertedCount: 0,
      skippedCount: 0,
      errorCode: 'SYNC_FAILED',
      errorMessage: message.slice(0, 500),
      action: 'subscription_sync_failed',
    });
    return res.status(500).json({ ok: false, error_code: 'SYNC_FAILED', message, data: { job_id: job.id } });
  }
}
