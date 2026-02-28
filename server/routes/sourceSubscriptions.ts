import type express from 'express';

type SyncSubscriptionResult = any;
type RefreshScanCandidate = any;

export type SourceSubscriptionsRouteDeps = {
  getAuthedSupabaseClient: any;
  getServiceSupabaseClient: any;
  resolveYouTubeChannel: any;
  youtubeDataApiKey: string;
  fetchYouTubeChannelAssetMap: any;
  ensureSourcePageFromYouTubeChannel: any;
  syncSingleSubscription: any;
  markSubscriptionSyncError: any;
  upsertSubscriptionNoticeSourceItem: any;
  insertFeedItem: any;
  buildSourcePagePath: any;
  cleanupSubscriptionNoticeForChannel: any;
  refreshScanLimiter: express.RequestHandler;
  refreshGenerateLimiter: express.RequestHandler;
  RefreshSubscriptionsScanSchema: any;
  collectRefreshCandidatesForUser: any;
  RefreshSubscriptionsGenerateSchema: any;
  refreshGenerateMaxItems: number;
  recoverStaleIngestionJobs: any;
  getActiveManualRefreshJob: any;
  countQueueDepth: any;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  emitGenerationStartedNotification: any;
  getGenerationNotificationLinkPath: any;
  scheduleQueuedIngestionProcessing: any;
};

export function registerSourceSubscriptionsRoutes(app: express.Express, deps: SourceSubscriptionsRouteDeps) {
  const {
    getAuthedSupabaseClient,
    getServiceSupabaseClient,
    resolveYouTubeChannel,
    youtubeDataApiKey,
    fetchYouTubeChannelAssetMap,
    ensureSourcePageFromYouTubeChannel,
    syncSingleSubscription,
    markSubscriptionSyncError,
    upsertSubscriptionNoticeSourceItem,
    insertFeedItem,
    buildSourcePagePath,
    cleanupSubscriptionNoticeForChannel,
    refreshScanLimiter,
    refreshGenerateLimiter,
    RefreshSubscriptionsScanSchema,
    collectRefreshCandidatesForUser,
    RefreshSubscriptionsGenerateSchema,
    refreshGenerateMaxItems,
    recoverStaleIngestionJobs,
    getActiveManualRefreshJob,
    countQueueDepth,
    queueDepthHardLimit,
    queueDepthPerUserLimit,
    emitGenerationStartedNotification,
    getGenerationNotificationLinkPath,
    scheduleQueuedIngestionProcessing,
  } = deps;
app.post('/api/source-subscriptions', async (req, res) => {
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

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let resolved;
  try {
    resolved = await resolveYouTubeChannel(channelInput);
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
  if (upsertError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: upsertError.message, data: null });

  let sync: SyncSubscriptionResult | null = null;
  try {
    sync = await syncSingleSubscription(db, upserted, { trigger: 'subscription_create' });
  } catch (error) {
    await markSubscriptionSyncError(db, upserted.id, error);
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
    message: 'subscription upserted',
    data: {
      subscription: {
        ...upserted,
        source_page_path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      source_page: sourcePage,
      sync,
    },
  });
});

app.get('/api/source-subscriptions', async (_req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });

  const rows = Array.isArray(data) ? data : [];
  let assetMap = new Map<string, { avatarUrl: string | null; bannerUrl: string | null }>();
  try {
    assetMap = await fetchYouTubeChannelAssetMap({
      apiKey: youtubeDataApiKey,
      channelIds: rows.map((row) => String(row.source_channel_id || '')),
    });
  } catch (avatarError) {
    console.log('[subscription_avatars_lookup_failed]', JSON.stringify({
      user_id: userId,
      error: avatarError instanceof Error ? avatarError.message : String(avatarError),
    }));
  }
  const withAvatars = rows.map((row) => {
    const sourceChannelId = String(row.source_channel_id || '').trim();
    return {
      ...row,
      source_channel_avatar_url: assetMap.get(sourceChannelId)?.avatarUrl || null,
      source_page_path: sourceChannelId ? buildSourcePagePath('youtube', sourceChannelId) : null,
    };
  });

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscriptions fetched',
    data: withAvatars,
  });
});

app.post('/api/source-subscriptions/refresh-scan', refreshScanLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const parsed = RefreshSubscriptionsScanSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid scan request', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  try {
    const scanned = await collectRefreshCandidatesForUser(db, userId, {
      maxPerSubscription: parsed.data.max_per_subscription,
      maxTotal: parsed.data.max_total,
    });
    console.log('[subscription_refresh_scan_done]', JSON.stringify({
      user_id: userId,
      subscriptions_total: scanned.subscriptionsTotal,
      candidates_total: scanned.candidates.length,
      scan_errors: scanned.scanErrors.length,
      cooldown_filtered: scanned.cooldownFiltered,
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
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ ok: false, error_code: 'SCAN_FAILED', message, data: null });
  }
});

app.post('/api/source-subscriptions/refresh-generate', refreshGenerateLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const parsed = RefreshSubscriptionsGenerateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid generate request', data: null });
  }
  if (parsed.data.items.length > refreshGenerateMaxItems) {
    return res.status(400).json({
      ok: false,
      error_code: 'MAX_ITEMS_EXCEEDED',
      message: `Select up to ${refreshGenerateMaxItems} videos per generation run.`,
      data: null,
    });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const serviceDb = getServiceSupabaseClient();
  if (!serviceDb) {
    return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });
  }

  const recoveredJobs = await recoverStaleIngestionJobs(db, {
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

  const activeManualJob = await getActiveManualRefreshJob(db, userId);
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

  const queueDepth = await countQueueDepth(serviceDb, { includeRunning: true });
  const userQueueDepth = await countQueueDepth(serviceDb, { userId, includeRunning: true });
  if (queueDepth >= queueDepthHardLimit || userQueueDepth >= queueDepthPerUserLimit) {
    return res.status(429).json({
      ok: false,
      error_code: 'QUEUE_BACKPRESSURE',
      message: 'Generation queue is busy. Please retry shortly.',
      retry_after_seconds: 30,
      data: {
        queue_depth: queueDepth,
        user_queue_depth: userQueueDepth,
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
        items: dedupedItems,
      },
      next_run_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) {
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });
  }

  await emitGenerationStartedNotification(serviceDb, {
    userId,
    jobId: job.id,
    scope: 'manual_refresh_selection',
    queuedCount: dedupedItems.length,
    itemTitle: dedupedItems[0]?.title || null,
    linkPath: getGenerationNotificationLinkPath({ scope: 'manual_refresh_selection' }),
  });
  scheduleQueuedIngestionProcessing();

  return res.status(202).json({
    ok: true,
    error_code: null,
    message: 'background generation started',
    data: {
      job_id: job.id,
      queue_depth: queueDepth + 1,
      queued_count: dedupedItems.length,
    },
  });
});

app.patch('/api/source-subscriptions/:id', async (req, res) => {
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
    // MVP simplification: mode is accepted for compatibility but coerced to auto.
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

  const db = getAuthedSupabaseClient(authToken);
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
});

app.delete('/api/source-subscriptions/:id', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
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

  await cleanupSubscriptionNoticeForChannel(db, {
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
});

app.post('/api/source-subscriptions/:id/sync', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
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
    const sync = await syncSingleSubscription(db, subscription, { trigger: 'user_sync' });
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
    await markSubscriptionSyncError(db, subscription.id, error);
    await db.from('ingestion_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_code: 'SYNC_FAILED',
      error_message: message.slice(0, 500),
    }).eq('id', job.id);
    return res.status(500).json({ ok: false, error_code: 'SYNC_FAILED', message, data: { job_id: job.id } });
  }
});

}
