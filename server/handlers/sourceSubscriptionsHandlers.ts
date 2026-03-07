import type express from 'express';
import type {
  RefreshScanCandidate,
  SourceSubscriptionsRouteDeps,
  SyncSubscriptionResult,
} from '../contracts/api/sourceSubscriptions';
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

type StoredSourcePageAssetRow = {
  id: string;
  external_id: string;
  avatar_url: string | null;
  banner_url: string | null;
};

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
  if (upsertError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: upsertError.message, data: null });

  let sync: SyncSubscriptionResult | null = null;
  try {
    sync = await deps.syncSingleSubscription(db, upserted, { trigger: 'subscription_create' });
  } catch (error) {
    await deps.markSubscriptionSyncError(db, upserted.id, error);
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

export async function handleListSourceSubscriptions(_req: express.Request, res: express.Response, deps: SourceSubscriptionsRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = deps.getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = deps.getServiceSupabaseClient?.() || db;

  const { data, error } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });

  const rows = Array.isArray(data) ? data : [];
  try {
    const storedAssets = await loadStoredSourcePageAssets(sourcePageDb, rows);
    if (storedAssets.needsSweep && typeof deps.runSourcePageAssetSweep === 'function' && sourcePageDb) {
      void deps.runSourcePageAssetSweep(sourcePageDb, { mode: 'opportunistic' });
    }

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

  const subscriptionIds = Array.from(new Set(parsed.data.items.map((item) => item.subscription_id)));
  const { data: subscriptions, error: subscriptionsError } = await db
    .from('user_source_subscriptions')
    .select('id, source_channel_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('id', subscriptionIds);
  if (subscriptionsError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: subscriptionsError.message, data: null });
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
      await deps.insertFeedItem(db, {
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

  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
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
    })
    .select('id')
    .single();
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
  deps.scheduleQueuedIngestionProcessing();

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

  const { data, error } = await db
    .from('user_source_subscriptions')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error.message, data: null });
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

  const { data, error } = await db
    .from('user_source_subscriptions')
    .update({ is_active: false })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select('id, source_channel_id, source_page_id')
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error.message, data: null });
  if (!data) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });

  await deps.cleanupSubscriptionNoticeForChannel(db, {
    userId,
    subscriptionId: data.id,
    channelId: data.source_channel_id,
  });

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

  const { data: subscription, error: subscriptionError } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, mode, source_channel_id, source_page_id, last_seen_published_at, last_seen_video_id, is_active')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (subscriptionError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: subscriptionError.message, data: null });
  if (!subscription) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });
  if (!subscription.is_active) return res.status(400).json({ ok: false, error_code: 'INACTIVE_SUBSCRIPTION', message: 'Subscription is inactive', data: null });

  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'user_sync',
      scope: 'subscription',
      status: 'running',
      requested_by_user_id: userId,
      subscription_id: subscription.id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });

  try {
    const sync = await deps.syncSingleSubscription(db, subscription, { trigger: 'user_sync' });
    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: sync.processed,
      inserted_count: sync.inserted,
      skipped_count: sync.skipped,
      error_code: null,
      error_message: null,
    }).eq('id', job.id);

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
    await deps.markSubscriptionSyncError(db, subscription.id, error);
    await db.from('ingestion_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_code: 'SYNC_FAILED',
      error_message: message.slice(0, 500),
    }).eq('id', job.id);
    return res.status(500).json({ ok: false, error_code: 'SYNC_FAILED', message, data: { job_id: job.id } });
  }
}
