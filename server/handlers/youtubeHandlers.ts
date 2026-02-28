import type express from 'express';
import type {
  SearchVideoGenerateItem,
  SourcePageVideoExistingState,
  UserYouTubeConnectionRow,
  YouTubeRouteDeps,
} from '../contracts/api/youtube';

export function registerYouTubeRouteHandlers(app: express.Express, deps: YouTubeRouteDeps) {
  const {
    yt2bpIpHourlyLimiter,
    yt2bpAnonLimiter,
    yt2bpAuthLimiter,
    yt2bpEnabled,
    yt2bpCoreTimeoutMs,
    searchApiLimiter,
    sourceVideoUnlockBurstLimiter,
    sourceVideoUnlockSustainedLimiter,
    sourceVideoListBurstLimiter,
    sourceVideoListSustainedLimiter,
    youtubeConnectStartLimiter,
    youtubePreviewLimiter,
    youtubeImportLimiter,
    youtubeDisconnectLimiter,
    youtubeDataApiKey,
    sourceUnlockGenerateMaxItems,
    queueDepthHardLimit,
    queueDepthPerUserLimit,
    workerConcurrency,
    youtubeOAuthStateTtlSeconds,
    youtubeImportMaxChannels,
    tokenEncryptionKey,
    YouTubeToBlueprintRequestSchema,
    SearchVideosGenerateSchema,
    YouTubeConnectionStartSchema,
    YouTubeSubscriptionsImportSchema,
    getAdapterForUrl,
    consumeCredit,
    getServiceSupabaseClient,
    withTimeout,
    runYouTubePipeline,
    mapPipelineError,
    clampYouTubeSearchLimit,
    getAuthedSupabaseClient,
    searchYouTubeVideos,
    loadExistingSourceVideoStateForUser,
    YouTubeSearchError,
    countQueueDepth,
    emitGenerationStartedNotification,
    getGenerationNotificationLinkPath,
    scheduleQueuedIngestionProcessing,
    clampYouTubeChannelSearchLimit,
    searchYouTubeChannels,
    YouTubeChannelSearchError,
    clampYouTubeSourceVideoLimit,
    normalizeYouTubeSourceVideoKind,
    listYouTubeSourceVideos,
    YouTubeSourceVideosError,
    ensureYouTubeOAuthConfig,
    normalizeReturnToUrl,
    buildDefaultReturnTo,
    randomBytes,
    hashOAuthState,
    buildYouTubeOAuthUrl,
    youtubeOAuthConfig,
    appendReturnToQuery,
    exchangeYouTubeOAuthCode,
    fetchYouTubeOAuthAccountProfile,
    encryptToken,
    mapYouTubeOAuthError,
    getUsableYouTubeAccessToken,
    fetchYouTubeUserSubscriptions,
    fetchYouTubeChannelAssetMap,
    ensureSourcePageFromYouTubeChannel,
    syncSingleSubscription,
    markSubscriptionSyncError,
    upsertSubscriptionNoticeSourceItem,
    insertFeedItem,
    decryptToken,
    revokeYouTubeToken,
  } = deps;
app.post('/api/youtube-to-blueprint', yt2bpIpHourlyLimiter, yt2bpAnonLimiter, yt2bpAuthLimiter, async (req, res) => {
  if (!yt2bpEnabled) {
    res.locals.bucketErrorCode = 'SERVICE_DISABLED';
    return res.status(503).json({
      ok: false,
      error_code: 'SERVICE_DISABLED',
      message: 'YouTube to Blueprint is temporarily unavailable. Please try again later.',
      run_id: null,
    });
  }

  const parsed = YouTubeToBlueprintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_URL',
      message: 'Invalid request payload.',
      run_id: null,
    });
  }

  const runId = `yt2bp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adapter = getAdapterForUrl(parsed.data.video_url);
  if (!adapter) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_URL',
      message: 'Only YouTube URLs are supported.',
      run_id: runId,
    });
  }
  const validatedUrl = adapter.validate(parsed.data.video_url);
  if (!validatedUrl.ok) {
    return res.status(400).json({
      ok: false,
      error_code: validatedUrl.errorCode,
      message: validatedUrl.message,
      run_id: runId,
    });
  }

  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (userId) {
    const creditCheck = await consumeCredit(userId, {
      reasonCode: 'YOUTUBE_TO_BLUEPRINT',
    });
    if (!creditCheck.ok) {
      return res.status(429).json({
        ok: false,
        error_code: 'GENERATION_FAIL',
        message: creditCheck.reason === 'global'
          ? 'We’re at capacity right now. Please try again in a few minutes.'
          : 'Insufficient credits right now. Please wait for refill and try again.',
        run_id: runId,
      });
    }
  }

  try {
    const traceDb = getServiceSupabaseClient();
    const result = await withTimeout(
      runYouTubePipeline({
        runId,
        videoId: validatedUrl.sourceNativeId,
        videoUrl: parsed.data.video_url,
        generateReview: false,
        generateBanner: parsed.data.generate_banner,
        authToken,
        trace: {
          db: traceDb,
          userId: userId || null,
          sourceScope: 'youtube_to_blueprint_api',
          sourceTag: 'youtube_to_blueprint_api',
        },
      }),
      yt2bpCoreTimeoutMs
    );
    return res.json(result);
  } catch (error) {
    const known = mapPipelineError(error);
    if (known) {
      res.locals.bucketErrorCode = known.error_code;
      const status =
        known.error_code === 'TIMEOUT' ? 504
          : known.error_code === 'INVALID_URL' ? 400
            : known.error_code === 'NO_CAPTIONS' || known.error_code === 'TRANSCRIPT_EMPTY' ? 422
              : known.error_code === 'PROVIDER_FAIL' ? 502
                : known.error_code === 'PII_BLOCKED' || known.error_code === 'SAFETY_BLOCKED' ? 422
                  : known.error_code === 'RATE_LIMITED' ? 429
                : 500;
      return res.status(status).json({
        ok: false,
        ...known,
        run_id: runId,
      });
    }
    const message = error instanceof Error ? error.message : 'Could not complete YouTube blueprint.';
    return res.status(500).json({
      ok: false,
      error_code: 'GENERATION_FAIL',
      message,
      run_id: runId,
    });
  }
});

app.get('/api/youtube-search', searchApiLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_QUERY',
      message: 'Query must be at least 2 characters.',
      data: null,
    });
  }

  if (!youtubeDataApiKey) {
    return res.status(503).json({
      ok: false,
      error_code: 'SEARCH_DISABLED',
      message: 'YouTube search is not configured.',
      data: null,
    });
  }

  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const limit = clampYouTubeSearchLimit(rawLimit, 10);
  const pageToken = typeof req.query.page_token === 'string' ? req.query.page_token.trim() : '';
  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  try {
    const result = await searchYouTubeVideos({
      apiKey: youtubeDataApiKey,
      query,
      limit,
      pageToken: pageToken || undefined,
    });
    let existingByVideoId = new Map<string, SourcePageVideoExistingState>();
    try {
      existingByVideoId = await loadExistingSourceVideoStateForUser(
        db,
        userId,
        result.results.map((row) => row.video_id),
      );
    } catch (existingError) {
      console.log('[youtube_search_existing_state_failed]', JSON.stringify({
        user_id: userId,
        error: existingError instanceof Error ? existingError.message : String(existingError),
      }));
    }

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube search complete',
      data: {
        results: result.results.map((row) => {
          const existing = existingByVideoId.get(row.video_id);
          return {
            ...row,
            already_exists_for_user: Boolean(existing?.already_exists_for_user),
            existing_blueprint_id: existing?.existing_blueprint_id || null,
            existing_feed_item_id: existing?.existing_feed_item_id || null,
          };
        }),
        next_page_token: result.nextPageToken,
      },
    });
  } catch (error) {
    if (error instanceof YouTubeSearchError) {
      const status = error.code === 'INVALID_QUERY'
        ? 400
        : error.code === 'SEARCH_DISABLED'
          ? 503
          : error.code === 'RATE_LIMITED'
            ? 429
            : 502;
      return res.status(status).json({
        ok: false,
        error_code: error.code,
        message: error.message,
        data: null,
      });
    }

    const message = error instanceof Error ? error.message : 'YouTube search failed.';
    return res.status(502).json({
      ok: false,
      error_code: 'PROVIDER_FAIL',
      message,
      data: null,
    });
  }
});

app.post(
  '/api/search/videos/generate',
  sourceVideoUnlockBurstLimiter,
  sourceVideoUnlockSustainedLimiter,
  async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const parsed = SearchVideosGenerateSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_INPUT',
        message: 'Invalid generate request',
        data: null,
      });
    }

    if (parsed.data.items.length > sourceUnlockGenerateMaxItems) {
      return res.status(400).json({
        ok: false,
        error_code: 'MAX_ITEMS_EXCEEDED',
        message: `Select up to ${sourceUnlockGenerateMaxItems} videos per generation run.`,
        data: null,
      });
    }

    const db = getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
    const serviceDb = getServiceSupabaseClient();
    if (!serviceDb) {
      return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });
    }

    const dedupedMap = new Map<string, SearchVideoGenerateItem>();
    for (const item of parsed.data.items) {
      const key = String(item.video_id || '').trim();
      if (!key) continue;
      dedupedMap.set(key, {
        video_id: key,
        video_url: String(item.video_url || '').trim(),
        title: String(item.title || '').trim(),
        channel_id: String(item.channel_id || '').trim(),
        channel_title: item.channel_title == null ? null : String(item.channel_title || '').trim() || null,
        channel_url: item.channel_url == null ? null : String(item.channel_url || '').trim() || null,
        published_at: item.published_at == null ? null : String(item.published_at || '').trim() || null,
        thumbnail_url: item.thumbnail_url == null ? null : String(item.thumbnail_url || '').trim() || null,
      });
    }
    const dedupedItems = Array.from(dedupedMap.values())
      .filter((item) => item.video_id && item.video_url && item.title && item.channel_id);
    if (dedupedItems.length === 0) {
      return res.status(400).json({
        ok: false,
        error_code: 'NO_ELIGIBLE_ITEMS',
        message: 'No eligible videos found for generation.',
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
        scope: 'search_video_generate',
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
      scope: 'search_video_generate',
      queuedCount: dedupedItems.length,
      itemTitle: dedupedItems[0]?.title || null,
      linkPath: getGenerationNotificationLinkPath({ scope: 'search_video_generate' }),
    });

    scheduleQueuedIngestionProcessing();

    return res.status(202).json({
      ok: true,
      error_code: null,
      message: 'background generation started',
      data: {
        job_id: job.id,
        queue_depth: queueDepth + 1,
        estimated_start_seconds: Math.max(1, Math.ceil((queueDepth + 1) / Math.max(1, workerConcurrency)) * 4),
        queued_count: dedupedItems.length,
      },
    });
  },
);

app.get('/api/youtube-channel-search', searchApiLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_QUERY',
      message: 'Query must be at least 2 characters.',
      data: null,
    });
  }

  if (!youtubeDataApiKey) {
    return res.status(503).json({
      ok: false,
      error_code: 'SEARCH_DISABLED',
      message: 'YouTube channel search is not configured.',
      data: null,
    });
  }

  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const limit = clampYouTubeChannelSearchLimit(rawLimit, 10);
  const pageToken = typeof req.query.page_token === 'string' ? req.query.page_token.trim() : '';

  try {
    const result = await searchYouTubeChannels({
      apiKey: youtubeDataApiKey,
      query,
      limit,
      pageToken: pageToken || undefined,
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube channel search complete',
      data: {
        results: result.results,
        next_page_token: result.nextPageToken,
      },
    });
  } catch (error) {
    if (error instanceof YouTubeChannelSearchError) {
      const status = error.code === 'INVALID_QUERY'
        ? 400
        : error.code === 'SEARCH_DISABLED'
          ? 503
          : error.code === 'RATE_LIMITED'
            ? 429
            : 502;
      return res.status(status).json({
        ok: false,
        error_code: error.code,
        message: error.message,
        data: null,
      });
    }

    const message = error instanceof Error ? error.message : 'YouTube channel search failed.';
    return res.status(502).json({
      ok: false,
      error_code: 'PROVIDER_FAIL',
      message,
      data: null,
    });
  }
});

app.get(
  '/api/youtube/channels/:channelId/videos',
  searchApiLimiter,
  sourceVideoListBurstLimiter,
  sourceVideoListSustainedLimiter,
  async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const channelId = String(req.params.channelId || '').trim();
    if (!channelId) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_INPUT',
        message: 'channelId required',
        data: null,
      });
    }

    const limit = clampYouTubeSourceVideoLimit(Number(req.query.limit), 12);
    const pageToken = String(req.query.page_token || '').trim();
    const kind = normalizeYouTubeSourceVideoKind(String(req.query.kind || ''), 'all');
    const shortsMaxSeconds = 60;

    const db = getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    let page;
    try {
      page = await listYouTubeSourceVideos({
        apiKey: youtubeDataApiKey,
        channelId,
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
        message: error instanceof Error ? error.message : 'Could not load channel videos.',
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

    const items = page.results.map((item) => {
      const existing = existingByVideoId.get(item.video_id);
      return {
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
      };
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube channel videos',
      data: {
        items,
        next_page_token: page.nextPageToken,
        kind,
        shorts_max_seconds: shortsMaxSeconds,
      },
    });
  },
);

app.get('/api/youtube/connection/status', async (_req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('user_youtube_connections')
    .select('id, user_id, youtube_channel_title, youtube_channel_url, youtube_channel_avatar_url, refresh_token_encrypted, token_expires_at, last_import_at, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });

  if (!data || !data.is_active) {
    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube connection status',
      data: {
        connected: false,
        needs_reauth: false,
        channel_title: null,
        channel_url: null,
        channel_avatar_url: null,
        last_import_at: null,
      },
    });
  }

  const expiresAtMs = data.token_expires_at ? Date.parse(data.token_expires_at) : null;
  const hasRefreshToken = Boolean(String(data.refresh_token_encrypted || '').trim());
  const needsReauth = Boolean(expiresAtMs && expiresAtMs <= Date.now() + 60_000 && !hasRefreshToken);

  return res.json({
    ok: true,
    error_code: null,
    message: 'youtube connection status',
    data: {
      connected: true,
      needs_reauth: needsReauth,
      channel_title: data.youtube_channel_title || null,
      channel_url: data.youtube_channel_url || null,
      channel_avatar_url: data.youtube_channel_avatar_url || null,
      last_import_at: data.last_import_at || null,
    },
  });
});

app.post('/api/youtube/connection/start', youtubeConnectStartLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const parsed = YouTubeConnectionStartSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid connect request.', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const returnTo = normalizeReturnToUrl(String(parsed.data.return_to || '').trim(), req) || buildDefaultReturnTo(req);
  if (!returnTo) {
    return res.status(400).json({
      ok: false,
      error_code: 'YT_RETURN_TO_INVALID',
      message: 'Invalid return URL. Please retry from the app.',
      data: null,
    });
  }

  await db
    .from('youtube_oauth_states')
    .delete()
    .eq('user_id', userId)
    .not('consumed_at', 'is', null);
  await db
    .from('youtube_oauth_states')
    .delete()
    .eq('user_id', userId)
    .lt('expires_at', new Date().toISOString());

  const state = randomBytes(24).toString('base64url');
  const stateHash = hashOAuthState(state);
  const expiresAt = new Date(Date.now() + youtubeOAuthStateTtlSeconds * 1000).toISOString();

  const { error: insertError } = await db
    .from('youtube_oauth_states')
    .insert({
      user_id: userId,
      state_hash: stateHash,
      return_to: returnTo,
      expires_at: expiresAt,
    });
  if (insertError) {
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: insertError.message, data: null });
  }

  const authUrl = buildYouTubeOAuthUrl(youtubeOAuthConfig, state);
  return res.json({
    ok: true,
    error_code: null,
    message: 'youtube connection started',
    data: {
      auth_url: authUrl,
    },
  });
});

app.get('/api/youtube/connection/callback', async (req, res) => {
  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const state = String(req.query.state || '').trim();
  if (!state) {
    return res.status(400).json({ ok: false, error_code: 'YT_STATE_INVALID', message: 'Invalid OAuth state.', data: null });
  }

  const stateHash = hashOAuthState(state);
  const { data: oauthState, error: stateError } = await db
    .from('youtube_oauth_states')
    .select('id, user_id, return_to, expires_at, consumed_at')
    .eq('state_hash', stateHash)
    .maybeSingle();
  if (stateError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: stateError.message, data: null });
  }
  if (!oauthState?.id) {
    return res.status(400).json({ ok: false, error_code: 'YT_STATE_INVALID', message: 'Invalid OAuth state.', data: null });
  }

  const returnTo = String(oauthState.return_to || '').trim();
  const redirectWith = (params: Record<string, string>) => res.redirect(appendReturnToQuery(returnTo, params));
  const now = Date.now();
  const expiresAtMs = Number.isFinite(Date.parse(oauthState.expires_at)) ? Date.parse(oauthState.expires_at) : 0;
  if (expiresAtMs <= now) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_STATE_EXPIRED' });
  }
  if (oauthState.consumed_at) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_STATE_INVALID' });
  }

  const { data: consumeData, error: consumeError } = await db
    .from('youtube_oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', oauthState.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (consumeError || !consumeData?.id) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_STATE_INVALID' });
  }

  const providerError = String(req.query.error || '').trim();
  if (providerError) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_TOKEN_EXCHANGE_FAILED' });
  }

  const code = String(req.query.code || '').trim();
  if (!code) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_TOKEN_EXCHANGE_FAILED' });
  }

  try {
    const tokenSet = await exchangeYouTubeOAuthCode(youtubeOAuthConfig, code);
    const profile = await fetchYouTubeOAuthAccountProfile(tokenSet.accessToken);
    const accessTokenEncrypted = encryptToken(tokenSet.accessToken, tokenEncryptionKey);
    const refreshTokenEncrypted = tokenSet.refreshToken
      ? encryptToken(tokenSet.refreshToken, tokenEncryptionKey)
      : null;
    const tokenExpiresAt = tokenSet.expiresIn ? new Date(Date.now() + tokenSet.expiresIn * 1000).toISOString() : null;

    const { error: upsertError } = await db
      .from('user_youtube_connections')
      .upsert({
        user_id: oauthState.user_id,
        google_sub: tokenSet.googleSub || profile.googleSub || null,
        youtube_channel_id: profile.youtubeChannelId,
        youtube_channel_title: profile.youtubeChannelTitle,
        youtube_channel_url: profile.youtubeChannelUrl,
        youtube_channel_avatar_url: profile.youtubeChannelAvatarUrl,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: tokenExpiresAt,
        scope: tokenSet.scope,
        is_active: true,
        last_error: null,
      }, { onConflict: 'user_id' });
    if (upsertError) {
      return redirectWith({ yt_connect: 'error', yt_code: 'WRITE_FAILED' });
    }

    return redirectWith({ yt_connect: 'success' });
  } catch (error) {
    const mapped = mapYouTubeOAuthError(error);
    await db
      .from('user_youtube_connections')
      .upsert({
        user_id: oauthState.user_id,
        is_active: false,
        last_error: mapped.message.slice(0, 500),
      }, { onConflict: 'user_id' });

    return redirectWith({ yt_connect: 'error', yt_code: mapped.error_code });
  }
});

app.get('/api/youtube/subscriptions/preview', youtubePreviewLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data: connection, error: connectionError } = await db
    .from('user_youtube_connections')
    .select('id, user_id, google_sub, youtube_channel_id, youtube_channel_title, youtube_channel_url, youtube_channel_avatar_url, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope, is_active, last_import_at, last_error')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (connectionError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: connectionError.message, data: null });
  }
  if (!connection) {
    return res.status(404).json({ ok: false, error_code: 'YT_CONNECTION_NOT_FOUND', message: 'Connect YouTube first.', data: null });
  }

  try {
    const { accessToken } = await getUsableYouTubeAccessToken({
      db,
      connection: connection as UserYouTubeConnectionRow,
    });

    const preview = await fetchYouTubeUserSubscriptions({
      accessToken,
      maxTotal: youtubeImportMaxChannels,
    });
    const channelIds = preview.items.map((item) => item.channelId);

    const { data: existing, error: existingError } = channelIds.length === 0
      ? { data: [] as Array<{ source_channel_id: string; is_active: boolean }>, error: null }
      : await db
        .from('user_source_subscriptions')
        .select('source_channel_id, is_active')
        .eq('user_id', userId)
        .eq('source_type', 'youtube')
        .in('source_channel_id', channelIds);
    if (existingError) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: existingError.message, data: null });
    }

    const existingByChannelId = new Map(
      (existing || []).map((row) => [String(row.source_channel_id || '').trim(), row.is_active]),
    );

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube subscriptions preview',
      data: {
        results: preview.items.map((item) => ({
          channel_id: item.channelId,
          channel_title: item.channelTitle,
          channel_url: item.channelUrl,
          thumbnail_url: item.thumbnailUrl,
          already_active: existingByChannelId.get(item.channelId) === true,
          already_exists_inactive: existingByChannelId.get(item.channelId) === false,
        })),
        truncated: preview.truncated,
      },
    });
  } catch (error) {
    const mapped = mapYouTubeOAuthError(error);
    return res.status(mapped.status).json({
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      data: null,
    });
  }
});

app.post('/api/youtube/subscriptions/import', youtubeImportLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const parsed = YouTubeSubscriptionsImportSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid import payload.', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const { data: connection, error: connectionError } = await db
    .from('user_youtube_connections')
    .select('id, user_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (connectionError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: connectionError.message, data: null });
  }
  if (!connection) {
    return res.status(404).json({ ok: false, error_code: 'YT_CONNECTION_NOT_FOUND', message: 'Connect YouTube first.', data: null });
  }

  const channelIdRe = /^UC[a-zA-Z0-9_-]{20,}$/;
  const requestedMap = new Map<string, { channelId: string; channelUrl: string | null; channelTitle: string | null }>();
  for (const item of parsed.data.channels) {
    const channelId = String(item.channel_id || '').trim();
    if (!channelIdRe.test(channelId)) continue;
    const channelUrl = String(item.channel_url || '').trim() || `https://www.youtube.com/channel/${channelId}`;
    const channelTitle = String(item.channel_title || '').trim() || null;
    requestedMap.set(channelId, { channelId, channelUrl, channelTitle });
    if (requestedMap.size >= youtubeImportMaxChannels) break;
  }

  const requested = Array.from(requestedMap.values());
  if (requested.length === 0) {
    return res.status(400).json({ ok: false, error_code: 'YT_IMPORT_EMPTY_SELECTION', message: 'Select at least one channel to import.', data: null });
  }

  const channelIds = requested.map((row) => row.channelId);
  const { data: existingRows, error: existingError } = await db
    .from('user_source_subscriptions')
    .select('id, source_channel_id, source_page_id, is_active, auto_unlock_enabled')
    .eq('user_id', userId)
    .eq('source_type', 'youtube')
    .in('source_channel_id', channelIds);
  if (existingError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: existingError.message, data: null });
  }
  const existingByChannelId = new Map(
    (existingRows || []).map((row) => [String(row.source_channel_id || '').trim(), row]),
  );

  let assetMap = new Map<string, { avatarUrl: string | null; bannerUrl: string | null }>();
  if (youtubeDataApiKey) {
    try {
      assetMap = await fetchYouTubeChannelAssetMap({
        apiKey: youtubeDataApiKey,
        channelIds,
      });
    } catch (error) {
      console.log('[youtube_import_assets_lookup_failed]', JSON.stringify({
        user_id: userId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  let importedCount = 0;
  let reactivatedCount = 0;
  let alreadyActiveCount = 0;
  const failures: Array<{ channel_id: string; error_code: string; error: string }> = [];

  for (const row of requested) {
    const existing = existingByChannelId.get(row.channelId) || null;
    let sourcePage;
    try {
      const assets = assetMap.get(row.channelId);
      sourcePage = await ensureSourcePageFromYouTubeChannel(sourcePageDb, {
        channelId: row.channelId,
        channelUrl: row.channelUrl,
        title: row.channelTitle,
        avatarUrl: assets?.avatarUrl || null,
        bannerUrl: assets?.bannerUrl || null,
      });
    } catch (sourcePageError) {
      failures.push({
        channel_id: row.channelId,
        error_code: 'SOURCE_PAGE_SUBSCRIBE_FAILED',
        error: sourcePageError instanceof Error ? sourcePageError.message : 'Could not create source page.',
      });
      continue;
    }

    if (existing?.is_active) {
      if (!existing.source_page_id) {
        await db
          .from('user_source_subscriptions')
          .update({ source_page_id: sourcePage.id })
          .eq('id', existing.id)
          .eq('user_id', userId);
      }
      alreadyActiveCount += 1;
      continue;
    }

    const { data: upserted, error: upsertError } = await db
      .from('user_source_subscriptions')
      .upsert(
        {
          user_id: userId,
          source_type: 'youtube',
          source_channel_id: row.channelId,
          source_channel_url: row.channelUrl,
          source_channel_title: row.channelTitle,
          source_page_id: sourcePage.id,
          mode: 'auto',
          auto_unlock_enabled: existing?.auto_unlock_enabled ?? true,
          is_active: true,
          last_sync_error: null,
        },
        { onConflict: 'user_id,source_type,source_channel_id' },
      )
      .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
      .single();
    if (upsertError || !upserted) {
      failures.push({
        channel_id: row.channelId,
        error_code: 'WRITE_FAILED',
        error: upsertError?.message || 'Could not upsert subscription.',
      });
      continue;
    }

    try {
      await syncSingleSubscription(db, upserted, { trigger: 'youtube_import' });
    } catch (error) {
      await markSubscriptionSyncError(db, upserted.id, error);
    }

    if (!existing) importedCount += 1;
    else reactivatedCount += 1;

    try {
      const assets = assetMap.get(row.channelId);
      const noticeSource = await upsertSubscriptionNoticeSourceItem(db, {
        channelId: row.channelId,
        channelTitle: row.channelTitle,
        channelUrl: row.channelUrl,
        channelAvatarUrl: assets?.avatarUrl || null,
        channelBannerUrl: assets?.bannerUrl || null,
      });
      await insertFeedItem(db, {
        userId,
        sourceItemId: noticeSource.id,
        blueprintId: null,
        state: 'subscription_notice',
      });
    } catch (noticeError) {
      console.log('[youtube_import_notice_insert_failed]', JSON.stringify({
        user_id: userId,
        source_channel_id: row.channelId,
        error: noticeError instanceof Error ? noticeError.message : String(noticeError),
      }));
    }
  }

  const nowIso = new Date().toISOString();
  await db
    .from('user_youtube_connections')
    .update({
      last_import_at: nowIso,
      last_error: failures.length
        ? `Failed ${failures.length}/${requested.length} channels during import.`
        : null,
    })
    .eq('user_id', userId);

  const successfulImports = importedCount + reactivatedCount;
  if (successfulImports > 0) {
    await db
      .from('user_youtube_onboarding')
      .update({
        status: 'completed',
        completed_at: nowIso,
      })
      .eq('user_id', userId);
  }

  const failedCount = failures.length;
  return res.json({
    ok: true,
    error_code: failedCount > 0 ? 'YT_IMPORT_PARTIAL_FAILURE' : null,
    message: failedCount > 0 ? 'Import completed with partial failures.' : 'Import completed.',
    data: {
      requested_count: requested.length,
      imported_count: importedCount,
      reactivated_count: reactivatedCount,
      already_active_count: alreadyActiveCount,
      failed_count: failedCount,
      failures: failures.slice(0, 50),
    },
  });
});

app.delete('/api/youtube/connection', youtubeDisconnectLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data: connection, error: connectionError } = await db
    .from('user_youtube_connections')
    .select('id, access_token_encrypted, refresh_token_encrypted')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (connectionError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: connectionError.message, data: null });
  }
  if (!connection?.id) {
    return res.status(404).json({ ok: false, error_code: 'YT_CONNECTION_NOT_FOUND', message: 'No active YouTube connection found.', data: null });
  }

  try {
    const refreshToken = connection.refresh_token_encrypted
      ? decryptToken(connection.refresh_token_encrypted, tokenEncryptionKey)
      : null;
    const accessToken = connection.access_token_encrypted
      ? decryptToken(connection.access_token_encrypted, tokenEncryptionKey)
      : null;
    await revokeYouTubeToken(refreshToken || accessToken || '');
  } catch {
    // best effort revoke, continue unlink flow
  }

  const { error: updateError } = await db
    .from('user_youtube_connections')
    .update({
      is_active: false,
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      scope: null,
      last_error: null,
    })
    .eq('id', connection.id);
  if (updateError) {
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: updateError.message, data: null });
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'YouTube disconnected.',
    data: { disconnected: true },
  });
});

}
