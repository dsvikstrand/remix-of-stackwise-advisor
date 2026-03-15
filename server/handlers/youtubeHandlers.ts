import type express from 'express';
import type {
  SearchVideoGenerateItem,
  SourcePageVideoExistingState,
  UserYouTubeConnectionRow,
  YouTubeRouteDeps,
} from '../contracts/api/youtube';
import { fetchYouTubeDurationMap, YouTubeDurationLookupError } from '../services/youtubeDuration';
import { splitByDurationPolicy, toDurationSeconds } from '../services/videoDurationPolicy';
import {
  MANUAL_GENERATION_CREDIT_COST,
  buildManualGenerationReservation,
  releaseManualGeneration,
  reserveManualGeneration,
  settleManualGeneration,
} from '../services/manualGenerationBilling';
import {
  buildManualGenerationResultBuckets,
  classifyManualGenerationCandidates,
  readQueueAdmissionCounts,
  reserveManualGenerationWorkPrefix,
  wouldExceedQueueAdmission,
} from '../services/generationPreflight';

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
    youtubeSearchCacheEnabled,
    youtubeSearchCacheTtlSeconds,
    youtubeChannelSearchCacheTtlSeconds,
    youtubeSearchStaleMaxSeconds,
    youtubeSearchDegradeEnabled,
    youtubeGlobalLiveCallsPerMinute,
    youtubeGlobalLiveCallsPerDay,
    youtubeGlobalCooldownSeconds,
    searchGenerateMaxItems,
    sourceUnlockGenerateMaxItems,
    generationDurationCapEnabled,
    generationMaxVideoSeconds,
    generationBlockUnknownDuration,
    generationDurationLookupTimeoutMs,
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
    consumeGenerationDailyCap,
    getGenerationDailyCapStatus,
    getServiceSupabaseClient,
    withTimeout,
    runYouTubePipeline,
    mapPipelineError,
    clampYouTubeSearchLimit,
    getAuthedSupabaseClient,
    searchYouTubeVideos,
    loadExistingSourceVideoStateForUser,
    YouTubeSearchError,
    youtubeSearchCacheService,
    youtubeQuotaGuardService,
    countQueueDepth,
    countQueueWorkItems,
    queueWorkItemsHardLimit,
    queueWorkItemsPerUserLimit,
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
    upsertSourceItemFromVideo,
    decryptToken,
    revokeYouTubeToken,
    resolveGenerationTierAccess,
    resolveRequestedGenerationTier,
    normalizeRequestedGenerationTier,
    resolveGenerationModelProfile,
    resolveVariantOrReady,
    findVariantsByBlueprintId,
    requestManualBlueprintYouTubeCommentsRefresh,
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
  const requestedTier = normalizeRequestedGenerationTier(parsed.data.requested_tier);
  const resolvedTier = 'tier' as const;
  const generationModelProfile = resolveGenerationModelProfile(resolvedTier);
  let resolvedDurationSeconds: number | null = null;
  if (generationDurationCapEnabled) {
    try {
      if (resolvedDurationSeconds == null) {
        const durationMap = await fetchYouTubeDurationMap({
          apiKey: youtubeDataApiKey,
          videoIds: [validatedUrl.sourceNativeId],
          timeoutMs: generationDurationLookupTimeoutMs,
          userAgent: 'bleuv1-youtube-direct-generate/1.0 (+https://api.bleup.app)',
        });
        resolvedDurationSeconds = durationMap.get(validatedUrl.sourceNativeId) ?? null;
      }
      const split = await splitByDurationPolicy({
        items: [{
          video_id: validatedUrl.sourceNativeId,
          title: validatedUrl.sourceNativeId,
          duration_seconds: resolvedDurationSeconds,
        }],
        config: {
          enabled: generationDurationCapEnabled,
          maxSeconds: generationMaxVideoSeconds,
          blockUnknown: generationBlockUnknownDuration,
        },
        getVideoId: (item) => item.video_id,
        getTitle: (item) => item.title,
        getDurationSeconds: (item) => toDurationSeconds(item.duration_seconds),
      });
      if (split.allowed.length === 0) {
        const blocked = split.blocked[0];
        if (blocked) {
          return res.status(422).json({
            ok: false,
            error_code: blocked.error_code,
            message: blocked.error_code === 'VIDEO_TOO_LONG'
              ? `Video exceeds max length of ${Math.floor(generationMaxVideoSeconds / 60)} minutes.`
              : 'Video length is unavailable for now. Please try another video.',
            max_duration_seconds: blocked.max_duration_seconds,
            video_duration_seconds: blocked.video_duration_seconds,
            video_id: blocked.video_id,
            run_id: runId,
          });
        }
      }
    } catch (error) {
      if (error instanceof YouTubeDurationLookupError) {
        if (error.code === 'RATE_LIMITED') {
          return res.status(429).json({
            ok: false,
            error_code: 'RATE_LIMITED',
            message: 'Too many requests right now. Please retry shortly.',
            run_id: runId,
          });
        }
        return res.status(502).json({
          ok: false,
          error_code: 'PROVIDER_FAIL',
          message: 'Video metadata provider is currently unavailable. Please try another video.',
          run_id: runId,
        });
      }
      throw error;
    }
  }
  const traceDb = getServiceSupabaseClient();
  if (!traceDb) {
    return res.status(500).json({
      ok: false,
      error_code: 'CONFIG_ERROR',
      message: 'Service role client not configured',
      run_id: runId,
    });
  }

  const manualReservation = userId
    ? buildManualGenerationReservation({
      scope: 'youtube_to_blueprint',
      userId,
      requestId: runId,
      videoId: validatedUrl.sourceNativeId,
      metadata: {
        source: 'youtube_to_blueprint_api',
        requested_tier: requestedTier || null,
      },
      amount: MANUAL_GENERATION_CREDIT_COST,
    })
    : null;
  let creditSettled = false;
  if (manualReservation) {
    let hold;
    try {
      hold = await reserveManualGeneration(traceDb, manualReservation);
    } catch (error) {
      return res.status(503).json({
        ok: false,
        error_code: 'CREDITS_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Credits backend unavailable.',
        run_id: runId,
      });
    }
    if (!hold.ok) {
      return res.status(429).json({
        ok: false,
        error_code: 'GENERATION_FAIL',
        message: 'Insufficient credits right now. Please wait for the next daily reset and try again.',
        run_id: runId,
      });
    }
  }
  try {
    const result = await withTimeout(
      runYouTubePipeline({
        runId,
        videoId: validatedUrl.sourceNativeId,
        videoUrl: parsed.data.video_url,
        durationSeconds: resolvedDurationSeconds,
        generateReview: false,
        generateBanner: parsed.data.generate_banner,
        authToken,
        generationTier: resolvedTier,
        generationModelProfile,
        requestClass: 'interactive',
        trace: {
          db: traceDb,
          userId: userId || null,
          sourceScope: 'youtube_to_blueprint_api',
          sourceTag: 'youtube_to_blueprint_api',
        },
        onBeforeFirstModelDispatch: manualReservation
          ? async () => {
            if (creditSettled) return;
            await settleManualGeneration(traceDb, manualReservation);
            creditSettled = true;
          }
          : undefined,
      }),
      yt2bpCoreTimeoutMs
    );
    if (manualReservation && !creditSettled) {
      await settleManualGeneration(traceDb, manualReservation);
      creditSettled = true;
    }
    return res.json({
      ...result,
      requested_tier: requestedTier || null,
      resolved_tier: resolvedTier,
      generation_tier: resolvedTier,
      variant_status: 'generated',
    });
  } catch (error) {
    if (manualReservation && !creditSettled) {
      try {
        await releaseManualGeneration(traceDb, manualReservation);
      } catch (releaseError) {
        console.log('[youtube_to_blueprint_credit_release_failed]', JSON.stringify({
          user_id: userId,
          video_id: validatedUrl.sourceNativeId,
          run_id: runId,
          error: releaseError instanceof Error ? releaseError.message : String(releaseError),
        }));
      }
    }
    const known = mapPipelineError(error);
    if (known) {
      res.locals.bucketErrorCode = known.error_code;
      const status =
        known.error_code === 'TIMEOUT' ? 504
          : known.error_code === 'INVALID_URL' ? 400
            : known.error_code === 'VIDEO_TOO_LONG' || known.error_code === 'VIDEO_DURATION_UNAVAILABLE' || known.error_code === 'VIDEO_DURATION_POLICY_BLOCKED' ? 422
            : known.error_code === 'NO_CAPTIONS' || known.error_code === 'TRANSCRIPT_EMPTY' ? 422
              : known.error_code === 'PROVIDER_FAIL' ? 502
                : known.error_code === 'PII_BLOCKED' || known.error_code === 'SAFETY_BLOCKED' ? 422
                  : known.error_code === 'RATE_LIMITED' ? 429
                    : known.error_code === 'TRANSCRIPT_TOO_LARGE' ? 422
                : 500;
      return res.status(status).json({
        ok: false,
        ...known,
        retry_after_seconds: known.error_code === 'RATE_LIMITED' ? known.retry_after_seconds : undefined,
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

app.get('/api/generation/tier-access', async (_req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }
  return res.json({
    ok: true,
    error_code: null,
    message: 'generation tier access',
    data: {
      allowed_tiers: ['tier'],
      default_tier: 'tier',
      test_mode_enabled: false,
      dual_generate_enabled: false,
    },
  });
});

app.get('/api/blueprints/:id/variants', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }
  const blueprintId = String(req.params.id || '').trim();
  if (!blueprintId) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Blueprint id required.', data: null });
  }

  try {
    const result = await findVariantsByBlueprintId(blueprintId);
    const variants = (result?.variants || []).map((variant: any) => ({
      tier: String(variant.generation_tier || '').trim(),
      blueprint_id: String(variant.blueprint_id || '').trim() || null,
      status: String(variant.status || '').trim() || 'available',
    }));
    return res.json({
      ok: true,
      error_code: null,
      message: 'blueprint variants',
      data: {
        source_item_id: result?.sourceItemId || null,
        variants,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not list blueprint variants.';
    return res.status(500).json({
      ok: false,
      error_code: 'READ_FAILED',
      message,
      data: null,
    });
  }
});

app.post('/api/blueprints/:id/youtube-comments/refresh', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }
  const blueprintId = String(req.params.id || '').trim();
  if (!blueprintId) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Blueprint id required.', data: null });
  }
  const db = getServiceSupabaseClient();
  if (!db) {
    return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });
  }

  try {
    const { data: blueprint, error: blueprintError } = await db
      .from('blueprints')
      .select('id, creator_user_id')
      .eq('id', blueprintId)
      .maybeSingle();
    if (blueprintError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: blueprintError.message,
        data: null,
      });
    }
    if (!blueprint || String(blueprint.creator_user_id || '').trim() !== userId) {
      return res.status(404).json({
        ok: false,
        error_code: 'NOT_FOUND',
        message: 'Blueprint not found.',
        data: null,
      });
    }

    const result = await requestManualBlueprintYouTubeCommentsRefresh({
      db,
      blueprintId,
      requestedByUserId: userId,
    });
    if (result.ok) {
      return res.status(202).json({
        ok: true,
        error_code: null,
        message: result.status === 'already_pending' ? 'comments refresh already pending' : 'comments refresh queued',
        data: {
          status: result.status,
          cooldown_until: result.cooldown_until,
          queue_depth: result.queue_depth,
        },
      });
    }

    if (result.code === 'COMMENTS_REFRESH_COOLDOWN_ACTIVE') {
      return res.status(429).json({
        ok: false,
        error_code: 'COMMENTS_REFRESH_COOLDOWN_ACTIVE',
        message: 'Please try again in a little while.',
        retry_at: result.retry_at,
        data: null,
      });
    }
    if (result.code === 'COMMENTS_REFRESH_QUEUE_GUARDED') {
      return res.status(429).json({
        ok: false,
        error_code: 'COMMENTS_REFRESH_QUEUE_GUARDED',
        message: 'Comments refresh queue is busy. Please retry shortly.',
        retry_after_seconds: result.retry_after_seconds,
        queue_depth: result.queue_depth,
        data: null,
      });
    }
    return res.status(404).json({
      ok: false,
      error_code: 'BLUEPRINT_YOUTUBE_REFRESH_NOT_AVAILABLE',
      message: 'No source comments available for this blueprint.',
      data: null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error_code: 'COMMENTS_REFRESH_FAILED',
      message: error instanceof Error ? error.message : 'Could not request comments refresh.',
      data: null,
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
  if (!query) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_QUERY',
      message: 'Enter a YouTube link, video id, or a specific title.',
      data: null,
    });
  }

  const limit = 1;
  const pageToken = '';
  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const serviceDb = getServiceSupabaseClient();

  const normalizeCachedPayload = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { results: [] as any[], nextPageToken: null as string | null };
    }
    const row = value as Record<string, unknown>;
    const results = Array.isArray(row.results) ? row.results : [];
    const nextPageTokenValue = row.nextPageToken;
    return {
      results,
      nextPageToken: typeof nextPageTokenValue === 'string' ? nextPageTokenValue : null,
    };
  };

  const attachExistingState = async (results: any[]) => {
    let existingByVideoId = new Map<string, SourcePageVideoExistingState>();
    try {
      existingByVideoId = await loadExistingSourceVideoStateForUser(
        db,
        userId,
        results.map((row) => String(row?.video_id || '').trim()).filter(Boolean),
      );
    } catch (existingError) {
      console.log('[youtube_search_existing_state_failed]', JSON.stringify({
        user_id: userId,
        error: existingError instanceof Error ? existingError.message : String(existingError),
      }));
    }
    return results.map((row) => {
      const videoId = String(row?.video_id || '').trim();
      const existing = existingByVideoId.get(videoId);
      return {
        ...row,
        already_exists_for_user: Boolean(existing?.already_exists_for_user),
        existing_blueprint_id: existing?.existing_blueprint_id || null,
        existing_feed_item_id: existing?.existing_feed_item_id || null,
      };
    });
  };

  let cacheHit: any = null;
  if (youtubeSearchCacheEnabled && serviceDb && youtubeSearchCacheService?.readCache) {
    try {
      cacheHit = await youtubeSearchCacheService.readCache({
        db: serviceDb,
        enabled: youtubeSearchCacheEnabled,
        kind: 'video_search',
        query,
        limit,
        pageToken: pageToken || null,
        staleMaxSeconds: youtubeSearchStaleMaxSeconds,
      });
    } catch (cacheError) {
      console.log('[youtube_search_cache_read_failed]', JSON.stringify({
        query,
        page_token: pageToken || null,
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      }));
    }
  }

  if (cacheHit?.source === 'fresh') {
    const cached = normalizeCachedPayload(cacheHit.response);
    const results = await attachExistingState(cached.results);
    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube video lookup complete',
      data: {
        results,
        next_page_token: null,
        cache: {
          source: 'fresh',
          age_seconds: cacheHit.ageSeconds ?? null,
        },
      },
    });
  }

  if (youtubeSearchDegradeEnabled && serviceDb && youtubeQuotaGuardService?.checkAndConsume) {
    try {
      const quotaDecision = await youtubeQuotaGuardService.checkAndConsume({
        db: serviceDb,
        maxPerMinute: youtubeGlobalLiveCallsPerMinute,
        maxPerDay: youtubeGlobalLiveCallsPerDay,
      });
      if (!quotaDecision.allowed) {
        if (cacheHit?.source === 'stale') {
          const cached = normalizeCachedPayload(cacheHit.response);
          const results = await attachExistingState(cached.results);
          return res.json({
            ok: true,
            error_code: null,
            message: 'youtube video lookup complete',
            data: {
              results,
              next_page_token: null,
              cache: {
                source: 'stale',
                age_seconds: cacheHit.ageSeconds ?? null,
              },
            },
          });
        }
        return res.status(429).json({
          ok: false,
          error_code: 'RATE_LIMITED',
          message: 'Video lookup is cooling down. Please retry shortly.',
          retry_after_seconds: quotaDecision.retryAfterSeconds ?? null,
          data: null,
        });
      }
    } catch (quotaError) {
      console.log('[youtube_search_quota_guard_failed]', JSON.stringify({
        query,
        page_token: pageToken || null,
        error: quotaError instanceof Error ? quotaError.message : String(quotaError),
      }));
    }
  }

  try {
    const result = await searchYouTubeVideos({
      apiKey: youtubeDataApiKey,
      query,
      limit,
      pageToken: pageToken || undefined,
    });
    const results = await attachExistingState(result.results);
    if (youtubeSearchCacheEnabled && serviceDb && youtubeSearchCacheService?.writeCache) {
      try {
        await youtubeSearchCacheService.writeCache({
          db: serviceDb,
          enabled: youtubeSearchCacheEnabled,
          kind: 'video_search',
          query,
          limit,
          pageToken: pageToken || null,
          response: {
            results: result.results,
            nextPageToken: result.nextPageToken || null,
          },
          ttlSeconds: youtubeSearchCacheTtlSeconds,
        });
      } catch (cacheWriteError) {
        console.log('[youtube_search_cache_write_failed]', JSON.stringify({
          query,
          page_token: pageToken || null,
          error: cacheWriteError instanceof Error ? cacheWriteError.message : String(cacheWriteError),
        }));
      }
    }

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube video lookup complete',
      data: {
        results,
        next_page_token: null,
        cache: {
          source: 'live',
          age_seconds: 0,
        },
      },
    });
  } catch (error) {
    if (error instanceof YouTubeSearchError && error.code === 'RATE_LIMITED' && serviceDb && youtubeQuotaGuardService?.markQuotaLimited) {
      try {
        await youtubeQuotaGuardService.markQuotaLimited({
          db: serviceDb,
          statusCode: 429,
          cooldownSeconds: youtubeGlobalCooldownSeconds,
        });
      } catch (quotaMarkError) {
        console.log('[youtube_search_quota_mark_failed]', JSON.stringify({
          query,
          page_token: pageToken || null,
          error: quotaMarkError instanceof Error ? quotaMarkError.message : String(quotaMarkError),
        }));
      }
    }

    if (cacheHit?.source === 'stale') {
      const cached = normalizeCachedPayload(cacheHit.response);
      const results = await attachExistingState(cached.results);
      return res.json({
        ok: true,
        error_code: null,
        message: 'youtube video lookup complete',
        data: {
          results,
          next_page_token: null,
          cache: {
            source: 'stale',
            age_seconds: cacheHit.ageSeconds ?? null,
          },
        },
      });
    }

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
        retry_after_seconds: error.code === 'RATE_LIMITED' ? youtubeGlobalCooldownSeconds : undefined,
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
    const requestedTier = normalizeRequestedGenerationTier(parsed.data.requested_tier);
    const resolvedTier = 'tier' as const;
    const dualGenerateEnabled = false;
    const dualGenerateTiers = ['tier'] as const;

    if (parsed.data.items.length > searchGenerateMaxItems) {
      return res.status(400).json({
        ok: false,
        error_code: 'MAX_ITEMS_EXCEEDED',
        message: `Select up to ${searchGenerateMaxItems} videos per generation run.`,
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
        duration_seconds: toDurationSeconds(item.duration_seconds),
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
    let allowedItems = dedupedItems;
    let durationBlocked: Array<{
      video_id: string;
      title: string;
      error_code: 'VIDEO_TOO_LONG' | 'VIDEO_DURATION_UNAVAILABLE';
      reason: 'too_long' | 'unknown';
      max_duration_seconds: number;
      video_duration_seconds: number | null;
    }> = [];
    if (generationDurationCapEnabled) {
      try {
        const durationMap = await fetchYouTubeDurationMap({
          apiKey: youtubeDataApiKey,
          videoIds: dedupedItems.filter((row) => row.duration_seconds == null).map((row) => row.video_id),
          timeoutMs: generationDurationLookupTimeoutMs,
          userAgent: 'bleuv1-search-generate/1.0 (+https://api.bleup.app)',
        });
        const normalizedWithDuration = dedupedItems.map((item) => ({
          ...item,
          duration_seconds: item.duration_seconds ?? durationMap.get(item.video_id) ?? null,
        }));
        const split = splitByDurationPolicy({
          items: normalizedWithDuration,
          config: {
            enabled: generationDurationCapEnabled,
            maxSeconds: generationMaxVideoSeconds,
            blockUnknown: generationBlockUnknownDuration,
          },
          getVideoId: (item) => item.video_id,
          getTitle: (item) => item.title,
          getDurationSeconds: (item) => item.duration_seconds ?? null,
        });
        allowedItems = split.allowed;
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

    if (allowedItems.length === 0 && durationBlocked.length > 0) {
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
    const skippedExisting: Array<{ video_id: string; title: string; blueprint_id: string | null }> = [];
    let existingByVideoId = new Map<string, SourcePageVideoExistingState>();
    try {
      existingByVideoId = await loadExistingSourceVideoStateForUser(
        db,
        userId,
        allowedItems.map((item) => item.video_id),
      );
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Could not resolve duplicate state.',
        data: null,
      });
    }

    const nonExistingItems = allowedItems.filter((item) => {
      const existing = existingByVideoId.get(item.video_id);
      if (!existing?.already_exists_for_user) return true;
      skippedExisting.push({
        video_id: item.video_id,
        title: item.title,
        blueprint_id: existing.existing_blueprint_id || null,
      });
      return false;
    });

    const {
      ready,
      inProgress,
      billable: billableItems,
    } = await classifyManualGenerationCandidates({
      items: nonExistingItems,
      generationTier: resolvedTier,
      getVideoId: (item) => item.video_id,
      getTitle: (item) => item.title,
      upsertSourceItem: async (item) => upsertSourceItemFromVideo(serviceDb, {
        video: {
          videoId: item.video_id,
          title: item.title,
          url: item.video_url,
          publishedAt: item.published_at || null,
          thumbnailUrl: item.thumbnail_url || null,
          durationSeconds: item.duration_seconds,
        },
        channelId: item.channel_id,
        channelTitle: item.channel_title || null,
        sourcePageId: null,
      }),
      resolveVariantOrReady: ({ sourceItemId, generationTier }) => resolveVariantOrReady({
        sourceItemId,
        generationTier,
      }),
      onReady: async ({ sourceItemId, blueprintId }) => {
        await insertFeedItem(db, {
          userId,
          sourceItemId,
          blueprintId,
          state: 'my_feed_published',
        });
      },
    });
    skippedExisting.push(...ready);

    const requestId = `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reservationInput = billableItems.map((item, index) => ({
      item,
      reservation: buildManualGenerationReservation({
        scope: 'search_video_generate',
        userId,
        requestId: `${requestId}:${index}`,
        videoId: item.video_id,
        sourceItemId: item.source_item_id,
        metadata: {
          source: 'youtube_search_generate',
          channel_id: item.channel_id,
        },
      }),
    }));
    let reservationResult;
    try {
      reservationResult = await reserveManualGenerationWorkPrefix({
        db: serviceDb,
        items: reservationInput,
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
        countQueueDepth,
        countQueueWorkItems,
      });
      queueDepth = queueCounts.queue_depth;
      userQueueDepth = queueCounts.user_queue_depth;
      queueWorkItems = queueCounts.queue_work_items;
      userQueueWorkItems = queueCounts.user_queue_work_items;
      const queueAdmission = wouldExceedQueueAdmission({
        counts: queueCounts,
        newWorkItems: queuedItems.length,
        queueDepthHardLimit,
        queueDepthPerUserLimit,
        queueWorkItemsHardLimit,
        queueWorkItemsPerUserLimit,
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
          estimated_start_seconds: 0,
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
        scope: 'search_video_generate',
        status: 'queued',
        requested_by_user_id: userId,
        payload: {
          user_id: userId,
          items: queuedItems,
          generation_tier: resolvedTier,
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

    await emitGenerationStartedNotification(serviceDb, {
      userId,
      jobId: job.id,
      scope: 'search_video_generate',
      queuedCount: queuedItems.length,
      itemTitle: queuedItems[0]?.title || null,
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
          queue_work_items: queueWorkItems + queuedItems.length,
          user_queue_work_items: userQueueWorkItems + queuedItems.length,
          estimated_start_seconds: Math.max(1, Math.ceil((queueDepth + 1) / Math.max(1, workerConcurrency)) * 4),
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
  const serviceDb = getServiceSupabaseClient();

  const normalizeCachedPayload = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { results: [] as any[], nextPageToken: null as string | null };
    }
    const row = value as Record<string, unknown>;
    const results = Array.isArray(row.results) ? row.results : [];
    const nextPageTokenValue = row.nextPageToken;
    return {
      results,
      nextPageToken: typeof nextPageTokenValue === 'string' ? nextPageTokenValue : null,
    };
  };

  let cacheHit: any = null;
  if (youtubeSearchCacheEnabled && serviceDb && youtubeSearchCacheService?.readCache) {
    try {
      cacheHit = await youtubeSearchCacheService.readCache({
        db: serviceDb,
        enabled: youtubeSearchCacheEnabled,
        kind: 'channel_search',
        query,
        limit,
        pageToken: pageToken || null,
        staleMaxSeconds: youtubeSearchStaleMaxSeconds,
      });
    } catch (cacheError) {
      console.log('[youtube_channel_search_cache_read_failed]', JSON.stringify({
        query,
        page_token: pageToken || null,
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      }));
    }
  }

  if (cacheHit?.source === 'fresh') {
    const cached = normalizeCachedPayload(cacheHit.response);
    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube channel search complete',
      data: {
        results: cached.results,
        next_page_token: cached.nextPageToken,
        cache: {
          source: 'fresh',
          age_seconds: cacheHit.ageSeconds ?? null,
        },
      },
    });
  }

  if (youtubeSearchDegradeEnabled && serviceDb && youtubeQuotaGuardService?.checkAndConsume) {
    try {
      const quotaDecision = await youtubeQuotaGuardService.checkAndConsume({
        db: serviceDb,
        maxPerMinute: youtubeGlobalLiveCallsPerMinute,
        maxPerDay: youtubeGlobalLiveCallsPerDay,
      });
      if (!quotaDecision.allowed) {
        if (cacheHit?.source === 'stale') {
          const cached = normalizeCachedPayload(cacheHit.response);
          return res.json({
            ok: true,
            error_code: null,
            message: 'youtube channel search complete',
            data: {
              results: cached.results,
              next_page_token: cached.nextPageToken,
              cache: {
                source: 'stale',
                age_seconds: cacheHit.ageSeconds ?? null,
              },
            },
          });
        }
        return res.status(429).json({
          ok: false,
          error_code: 'RATE_LIMITED',
          message: 'Search is cooling down. Please retry shortly.',
          retry_after_seconds: quotaDecision.retryAfterSeconds ?? null,
          data: null,
        });
      }
    } catch (quotaError) {
      console.log('[youtube_channel_search_quota_guard_failed]', JSON.stringify({
        query,
        page_token: pageToken || null,
        error: quotaError instanceof Error ? quotaError.message : String(quotaError),
      }));
    }
  }

  try {
    const result = await searchYouTubeChannels({
      apiKey: youtubeDataApiKey,
      query,
      limit,
      pageToken: pageToken || undefined,
    });
    if (youtubeSearchCacheEnabled && serviceDb && youtubeSearchCacheService?.writeCache) {
      try {
        await youtubeSearchCacheService.writeCache({
          db: serviceDb,
          enabled: youtubeSearchCacheEnabled,
          kind: 'channel_search',
          query,
          limit,
          pageToken: pageToken || null,
          response: {
            results: result.results,
            nextPageToken: result.nextPageToken || null,
          },
          ttlSeconds: youtubeChannelSearchCacheTtlSeconds,
        });
      } catch (cacheWriteError) {
        console.log('[youtube_channel_search_cache_write_failed]', JSON.stringify({
          query,
          page_token: pageToken || null,
          error: cacheWriteError instanceof Error ? cacheWriteError.message : String(cacheWriteError),
        }));
      }
    }

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube channel search complete',
      data: {
        results: result.results,
        next_page_token: result.nextPageToken,
        cache: {
          source: 'live',
          age_seconds: 0,
        },
      },
    });
  } catch (error) {
    if (error instanceof YouTubeChannelSearchError && error.code === 'RATE_LIMITED' && serviceDb && youtubeQuotaGuardService?.markQuotaLimited) {
      try {
        await youtubeQuotaGuardService.markQuotaLimited({
          db: serviceDb,
          statusCode: 429,
          cooldownSeconds: youtubeGlobalCooldownSeconds,
        });
      } catch (quotaMarkError) {
        console.log('[youtube_channel_search_quota_mark_failed]', JSON.stringify({
          query,
          page_token: pageToken || null,
          error: quotaMarkError instanceof Error ? quotaMarkError.message : String(quotaMarkError),
        }));
      }
    }

    if (cacheHit?.source === 'stale') {
      const cached = normalizeCachedPayload(cacheHit.response);
      return res.json({
        ok: true,
        error_code: null,
        message: 'youtube channel search complete',
        data: {
          results: cached.results,
          next_page_token: cached.nextPageToken,
          cache: {
            source: 'stale',
            age_seconds: cacheHit.ageSeconds ?? null,
          },
        },
      });
    }

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
        retry_after_seconds: error.code === 'RATE_LIMITED' ? youtubeGlobalCooldownSeconds : undefined,
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
