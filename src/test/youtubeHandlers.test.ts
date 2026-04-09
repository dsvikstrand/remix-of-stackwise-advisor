import { describe, expect, it, vi } from 'vitest';
import { registerYouTubeRouteHandlers } from '../../server/handlers/youtubeHandlers';
import { createMockSupabase } from './helpers/mockSupabase';

function createMockResponse() {
  const response = {
    locals: {
      user: { id: '00000000-0000-0000-0000-000000000001' },
      authToken: 'token',
    } as Record<string, unknown>,
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response;
}

function createMockApp() {
  const handlers: Record<string, any> = {};
  return {
    handlers,
    post(path: string, ...args: any[]) {
      handlers[`POST ${path}`] = args[args.length - 1];
      return this;
    },
    get(path: string, ...args: any[]) {
      handlers[`GET ${path}`] = args[args.length - 1];
      return this;
    },
    delete(path: string, ...args: any[]) {
      handlers[`DELETE ${path}`] = args[args.length - 1];
      return this;
    },
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const passThroughLimiter = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    yt2bpIpHourlyLimiter: passThroughLimiter,
    yt2bpAnonLimiter: passThroughLimiter,
    yt2bpAuthLimiter: passThroughLimiter,
    yt2bpEnabled: true,
    yt2bpCoreTimeoutMs: 120000,
    searchApiLimiter: passThroughLimiter,
    sourceVideoUnlockBurstLimiter: passThroughLimiter,
    sourceVideoUnlockSustainedLimiter: passThroughLimiter,
    sourceVideoListBurstLimiter: passThroughLimiter,
    sourceVideoListSustainedLimiter: passThroughLimiter,
    youtubeConnectStartLimiter: passThroughLimiter,
    youtubePreviewLimiter: passThroughLimiter,
    youtubeImportLimiter: passThroughLimiter,
    youtubeDisconnectLimiter: passThroughLimiter,
    youtubeDataApiKey: '',
    youtubeSearchCacheEnabled: false,
    youtubeSearchCacheTtlSeconds: 600,
    youtubeChannelSearchCacheTtlSeconds: 900,
    youtubeSearchStaleMaxSeconds: 86_400,
    youtubeSearchDegradeEnabled: false,
    youtubeGlobalLiveCallsPerMinute: 60,
    youtubeGlobalLiveCallsPerDay: 20000,
    youtubeGlobalCooldownSeconds: 600,
    searchGenerateMaxItems: 20,
    sourceUnlockGenerateMaxItems: 100,
    queueDepthHardLimit: 1000,
    queueDepthPerUserLimit: 50,
    queueWorkItemsHardLimit: 250,
    queueWorkItemsPerUserLimit: 40,
    workerConcurrency: 4,
    generationDurationCapEnabled: false,
    generationMaxVideoSeconds: 2700,
    generationBlockUnknownDuration: true,
    generationDurationLookupTimeoutMs: 8000,
    youtubeOAuthStateTtlSeconds: 600,
    youtubeImportMaxChannels: 2000,
    tokenEncryptionKey: 'x'.repeat(44),
    YouTubeToBlueprintRequestSchema: {
      safeParse: () => ({
        success: true,
        data: {
          video_url: 'https://www.youtube.com/watch?v=abc123def45',
          requested_tier: 'tier',
          generate_banner: false,
        },
      }),
    },
    SearchVideosGenerateSchema: { safeParse: () => ({ success: false }) },
    YouTubeConnectionStartSchema: { safeParse: () => ({ success: false }) },
    YouTubeSubscriptionsImportSchema: { safeParse: () => ({ success: false }) },
    getAdapterForUrl: () => ({
      validate: () => ({ ok: true, sourceNativeId: 'abc123def45' }),
    }),
    consumeCredit: vi.fn(async () => ({ ok: true })),
    consumeGenerationDailyCap: vi.fn(async () => ({})),
    getGenerationDailyCapStatus: vi.fn(async () => ({
      bypass: false,
      remaining: 5,
      limit: 5,
      used: 0,
      resetAt: '2026-03-06T00:00:00.000Z',
    })),
    getServiceSupabaseClient: () => ({}),
    getBlueprintAvailabilityForVideo: vi.fn(async () => ({
      status: 'available',
      videoId: '',
      message: null,
      retryAfterSeconds: 0,
      cooldownUntilIso: null,
      failureSource: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    })),
    withTimeout: async (promise: Promise<unknown>) => promise,
    runYouTubePipeline: vi.fn(async () => ({ ok: true })),
    mapPipelineError: () => null,
    clampYouTubeSearchLimit: (_value: unknown, fallback: number) => fallback,
    getAuthedSupabaseClient: () => ({}),
    searchYouTubeVideos: vi.fn(async () => ({ results: [], nextPageToken: null })),
    loadExistingSourceVideoStateForUser: vi.fn(async () => new Map()),
    YouTubeSearchError: class YouTubeSearchError extends Error {},
    youtubeSearchCacheService: null,
    youtubeQuotaGuardService: null,
    countQueueDepth: vi.fn(async () => 0),
    countQueueWorkItems: vi.fn(async () => 0),
    emitGenerationStartedNotification: vi.fn(async () => undefined),
    getGenerationNotificationLinkPath: () => '/wall',
    scheduleQueuedIngestionProcessing: vi.fn(() => undefined),
    enqueueIngestionJob: vi.fn(async () => ({ data: { id: 'job_1' }, error: null })),
    clampYouTubeChannelSearchLimit: (value: unknown, fallback: number) => {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.max(1, Math.min(3, Math.floor(numeric)));
    },
    searchYouTubeChannels: vi.fn(async () => ({ results: [], nextPageToken: null })),
    YouTubeChannelSearchError: class YouTubeChannelSearchError extends Error {},
    clampYouTubeSourceVideoLimit: (_value: unknown, fallback: number) => fallback,
    normalizeYouTubeSourceVideoKind: () => 'all',
    listYouTubeSourceVideos: vi.fn(async () => ({ items: [], nextPageToken: null })),
    YouTubeSourceVideosError: class YouTubeSourceVideosError extends Error {},
    ensureYouTubeOAuthConfig: () => null,
    normalizeReturnToUrl: () => null,
    buildDefaultReturnTo: () => '/subscriptions',
    randomBytes: () => ({ toString: () => 'state' }),
    hashOAuthState: () => 'hash',
    buildYouTubeOAuthUrl: () => 'https://example.com',
    youtubeOAuthConfig: null,
    appendReturnToQuery: (url: string) => url,
    exchangeYouTubeOAuthCode: vi.fn(async () => ({})),
    fetchYouTubeOAuthAccountProfile: vi.fn(async () => ({})),
    encryptToken: (value: string) => value,
    mapYouTubeOAuthError: () => null,
    getUsableYouTubeAccessToken: vi.fn(async () => null),
    fetchYouTubeUserSubscriptions: vi.fn(async () => ({ items: [] })),
    fetchYouTubeChannelAssetMap: vi.fn(async () => new Map()),
    ensureSourcePageFromYouTubeChannel: vi.fn(async () => ({})),
    syncSingleSubscription: vi.fn(async () => ({ processed: 0, inserted: 0, skipped: 0 })),
    markSubscriptionSyncError: vi.fn(async () => undefined),
    upsertSubscriptionNoticeSourceItem: vi.fn(async () => undefined),
    insertFeedItem: vi.fn(async () => undefined),
    upsertFeedItemWithBlueprint: vi.fn(async () => ({ id: 'feed_upserted', user_id: '00000000-0000-0000-0000-000000000001' })),
    upsertSourceItemFromVideo: vi.fn(async (_db, input: any) => ({
      id: `source_${String(input?.video?.videoId || 'x')}`,
      source_url: input?.video?.url || '',
      source_native_id: input?.video?.videoId || '',
    })),
    decryptToken: (value: string) => value,
    revokeYouTubeToken: vi.fn(async () => undefined),
    resolveGenerationTierAccess: () => ({ allowedTiers: ['tier'], defaultTier: 'tier', testModeEnabled: false }),
    resolveRequestedGenerationTier: () => 'tier',
    normalizeRequestedGenerationTier: (value: unknown) => value,
    resolveGenerationModelProfile: () => ({ model: 'o4-mini', fallbackModel: 'o4-mini', reasoningEffort: 'low' }),
    resolveVariantOrReady: vi.fn(async () => null),
    findVariantsByBlueprintId: vi.fn(async () => ({ sourceItemId: null, variants: [] })),
    requestManualBlueprintYouTubeCommentsRefresh: vi.fn(async () => ({
      ok: true,
      status: 'queued',
      cooldown_until: null,
      queue_depth: 0,
    })),
    listBlueprintYouTubeComments: vi.fn(async () => []),
    ...overrides,
  } as any;
}

function enqueueIntoMockDb(db: any, values: any) {
  return db.from('ingestion_jobs').insert(values).select('*').single();
}

describe('youtube handlers', () => {
  it('treats /api/youtube-search as single-video lookup and clears pagination', async () => {
    const app = createMockApp();
    const searchYouTubeVideos = vi.fn(async () => ({
      results: [{
        video_id: 'abc123def45',
        video_url: 'https://www.youtube.com/watch?v=abc123def45',
        title: 'Exact video',
        description: 'Best match',
        channel_id: 'channel_1',
        channel_title: 'Channel One',
        channel_url: 'https://www.youtube.com/channel/channel_1',
        thumbnail_url: null,
        published_at: '2026-03-15T12:00:00Z',
        duration_seconds: 240,
      }],
      nextPageToken: 'IGNORED_TOKEN',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      youtubeDataApiKey: 'test-key',
      searchYouTubeVideos,
    }));

    const handler = app.handlers['GET /api/youtube-search'];
    const req = {
      query: {
        q: 'https://www.youtube.com/watch?v=abc123def45',
        limit: '25',
        page_token: 'PAGE_2',
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(searchYouTubeVideos).toHaveBeenCalledWith({
      apiKey: 'test-key',
      query: 'https://www.youtube.com/watch?v=abc123def45',
      limit: 1,
      pageToken: undefined,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        results: [{
          video_id: 'abc123def45',
        }],
        next_page_token: null,
      },
    });
  });

  it('treats /api/youtube-channel-search as bounded creator lookup without api-key gating', async () => {
    const app = createMockApp();
    const searchYouTubeChannels = vi.fn(async () => ({
      results: [{
        channel_id: 'UC12345678901234567890',
        channel_title: 'Doctor Mike',
        channel_url: 'https://www.youtube.com/@DoctorMike',
        description: 'Health and medicine',
        thumbnail_url: null,
        published_at: null,
        subscriber_count: 13200000,
      }],
      nextPageToken: 'IGNORED_TOKEN',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      youtubeDataApiKey: '',
      searchYouTubeChannels,
    }));

    const handler = app.handlers['GET /api/youtube-channel-search'];
    const req = {
      query: {
        q: '@DoctorMike',
        limit: '25',
        page_token: 'PAGE_2',
        mode: 'handle',
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(searchYouTubeChannels).toHaveBeenCalledWith({
      apiKey: undefined,
      query: '@DoctorMike',
      limit: 3,
      pageToken: 'PAGE_2',
      mode: 'handle',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        results: [{
          channel_id: 'UC12345678901234567890',
        }],
        next_page_token: null,
      },
    });
  });

  it('maps credit service outage to 503 CREDITS_UNAVAILABLE on direct generate route', async () => {
    const app = createMockApp();
    registerYouTubeRouteHandlers(app as any, createDeps({
      consumeCredit: vi.fn(async () => ({
        ok: false,
        reason: 'service',
        errorCode: 'CREDITS_UNAVAILABLE',
      })),
    }));

    const handler = app.handlers['POST /api/youtube-to-blueprint'];
    const req = {
      body: {
        video_url: 'https://www.youtube.com/watch?v=abc123def45',
        generate_banner: false,
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'CREDITS_UNAVAILABLE',
    });
  });

  it('releases direct URL credit hold when generation fails before first model dispatch', async () => {
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 3,
        capacity: 3,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      runYouTubePipeline: vi.fn(async () => {
        throw new Error('TRANSCRIPT_FAILED');
      }),
      mapPipelineError: () => ({
        error_code: 'PROVIDER_FAIL',
        message: 'Provider failed',
      }),
    }));

    const handler = app.handlers['POST /api/youtube-to-blueprint'];
    const req = {
      body: {
        video_url: 'https://www.youtube.com/watch?v=abc123def45',
        generate_banner: false,
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(502);
    expect(serviceDb.state.user_credit_wallets[0].balance).toBe(3);
    expect(serviceDb.state.credit_ledger.map((row: any) => row.entry_type)).toEqual(['hold', 'refund']);
  });

  it('returns 422 for transcripts with insufficient spoken context on direct generate', async () => {
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 3,
        capacity: 3,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      runYouTubePipeline: vi.fn(async () => {
        throw new Error('TRANSCRIPT_INSUFFICIENT_CONTEXT');
      }),
      mapPipelineError: () => ({
        error_code: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
        message: "This video has very limited speech, so a blueprint can't be generated from it right now. If that seems incorrect, try again tomorrow.",
      }),
    }));

    const handler = app.handlers['POST /api/youtube-to-blueprint'];
    const req = {
      body: {
        video_url: 'https://www.youtube.com/watch?v=abc123def45',
        generate_banner: false,
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
    });
    expect(serviceDb.state.user_credit_wallets[0].balance).toBe(3);
    expect(serviceDb.state.credit_ledger.map((row: any) => row.entry_type)).toEqual(['hold', 'refund']);
  });

  it('settles direct URL credit on first model dispatch', async () => {
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 3,
        capacity: 3,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      runYouTubePipeline: vi.fn(async ({ onBeforeFirstModelDispatch }: any) => {
        await onBeforeFirstModelDispatch?.();
        return { ok: true, run_id: 'run_1' };
      }),
    }));

    const handler = app.handlers['POST /api/youtube-to-blueprint'];
    const req = {
      body: {
        video_url: 'https://www.youtube.com/watch?v=abc123def45',
        generate_banner: false,
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(serviceDb.state.user_credit_wallets[0].balance).toBe(2);
    expect(serviceDb.state.credit_ledger.map((row: any) => row.entry_type)).toEqual(['hold', 'settle']);
  });

  it('blocks direct generate for videos inside the 24h blueprint cooldown window', async () => {
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 3,
        capacity: 3,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    const runYouTubePipeline = vi.fn(async () => ({ ok: true, run_id: 'run_1' }));
    const getBlueprintAvailabilityForVideo = vi.fn(async () => ({
      status: 'cooldown_active',
      videoId: 'abc123def45',
      message: 'This video isn’t currently available for blueprint generation.',
      retryAfterSeconds: 3600,
      cooldownUntilIso: new Date(Date.now() + 3600_000).toISOString(),
      failureSource: 'generation_runs',
      lastErrorCode: 'TRANSCRIPT_UNAVAILABLE',
      lastErrorMessage: 'Temporary transcript job ended with status "failed".',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      getBlueprintAvailabilityForVideo,
      runYouTubePipeline,
    }));

    const handler = app.handlers['POST /api/youtube-to-blueprint'];
    const req = {
      body: {
        video_url: 'https://www.youtube.com/watch?v=abc123def45',
        generate_banner: false,
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'VIDEO_BLUEPRINT_UNAVAILABLE',
      message: 'This video isn’t currently available for blueprint generation.',
    });
    expect(getBlueprintAvailabilityForVideo).toHaveBeenCalledWith(serviceDb, 'abc123def45');
    expect(runYouTubePipeline).not.toHaveBeenCalled();
    expect(serviceDb.state.credit_ledger).toHaveLength(0);
  });

  it('queues only the affordable prefix for search generation and reports skipped counts', async () => {
    const authDb = createMockSupabase({
      ingestion_jobs: [],
    });
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 3,
        capacity: 3,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    const items = Array.from({ length: 5 }, (_, index) => ({
      video_id: `video_${index + 1}`,
      video_url: `https://youtube.com/watch?v=video_${index + 1}`,
      title: `Video ${index + 1}`,
      channel_id: 'channel_1',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      SearchVideosGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
      enqueueIngestionJob: enqueueIntoMockDb,
      loadExistingSourceVideoStateForUser: vi.fn(async () => new Map()),
      resolveVariantOrReady: vi.fn(async () => null),
    }));

    const handler = app.handlers['POST /api/search/videos/generate'];
    const req = { body: { items } } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        queued_count: 3,
        queue_work_items: 3,
        user_queue_work_items: 3,
        skipped_unaffordable_count: 2,
        skipped_existing_count: 0,
        in_progress_count: 0,
      },
    });
    expect(authDb.state.ingestion_jobs).toHaveLength(1);
    expect(authDb.state.ingestion_jobs[0].payload.items).toHaveLength(3);
    expect(serviceDb.state.credit_ledger.filter((row: any) => row.entry_type === 'hold')).toHaveLength(3);
  });

  it('keeps duplicate and in-progress buckets stable for mixed search generation results', async () => {
    const authDb = createMockSupabase({
      ingestion_jobs: [],
    });
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 5,
        capacity: 5,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    const items = [
      {
        video_id: 'video_dup',
        video_url: 'https://youtube.com/watch?v=video_dup',
        title: 'Duplicate Video',
        channel_id: 'channel_1',
      },
      {
        video_id: 'video_progress',
        video_url: 'https://youtube.com/watch?v=video_progress',
        title: 'Progress Video',
        channel_id: 'channel_1',
      },
      {
        video_id: 'video_new',
        video_url: 'https://youtube.com/watch?v=video_new',
        title: 'New Video',
        channel_id: 'channel_1',
      },
    ];
    registerYouTubeRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      SearchVideosGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
      enqueueIngestionJob: enqueueIntoMockDb,
      loadExistingSourceVideoStateForUser: vi.fn(async () => new Map([
        ['video_dup', {
          already_exists_for_user: true,
          existing_blueprint_id: 'bp_dup',
          existing_feed_item_id: 'feed_dup',
        }],
      ])),
      resolveVariantOrReady: vi.fn(async ({ sourceItemId }: { sourceItemId: string }) => {
        if (sourceItemId === 'source_video_progress') {
          return { state: 'in_progress' };
        }
        return null;
      }),
    }));

    const handler = app.handlers['POST /api/search/videos/generate'];
    const req = { body: { items } } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        queued_count: 1,
        skipped_existing_count: 1,
        in_progress_count: 1,
        skipped_unaffordable_count: 0,
      },
    });
    expect(authDb.state.ingestion_jobs).toHaveLength(1);
    expect(authDb.state.ingestion_jobs[0].payload.items).toHaveLength(1);
  });

  it('returns unavailable bucket for search generation cooldown-blocked videos', async () => {
    const authDb = createMockSupabase({
      ingestion_jobs: [],
    });
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 5,
        capacity: 5,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    const items = [{
      video_id: 'video_unavailable',
      video_url: 'https://youtube.com/watch?v=video_unavailable',
      title: 'Unavailable Video',
      channel_id: 'channel_1',
    }];
    const getBlueprintAvailabilityForVideo = vi.fn(async () => ({
      status: 'cooldown_active',
      videoId: 'video_unavailable',
      message: 'This video isn’t currently available for blueprint generation.',
      retryAfterSeconds: 3600,
      cooldownUntilIso: new Date(Date.now() + 3600_000).toISOString(),
      failureSource: 'generation_runs',
      lastErrorCode: 'TRANSCRIPT_UNAVAILABLE',
      lastErrorMessage: 'Temporary transcript job ended with status "failed".',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      getBlueprintAvailabilityForVideo,
      SearchVideosGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
      loadExistingSourceVideoStateForUser: vi.fn(async () => new Map()),
      resolveVariantOrReady: vi.fn(async () => null),
    }));

    const handler = app.handlers['POST /api/search/videos/generate'];
    const req = { body: { items } } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'VIDEO_BLUEPRINT_UNAVAILABLE',
      message: 'This video isn’t currently available for blueprint generation.',
      data: {
        unavailable_count: 1,
      },
    });
    expect(getBlueprintAvailabilityForVideo).toHaveBeenCalledWith(serviceDb, 'video_unavailable');
    expect(authDb.state.ingestion_jobs).toHaveLength(0);
    expect(serviceDb.state.credit_ledger).toHaveLength(0);
  });

  it('upgrades an existing locked feed row when search generation finds a ready blueprint', async () => {
    const authDb = createMockSupabase({
      ingestion_jobs: [],
    });
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 5,
        capacity: 5,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    const upsertFeedItemWithBlueprint = vi.fn(async () => ({ id: 'feed_upgraded', user_id: '00000000-0000-0000-0000-000000000001' }));
    const insertFeedItem = vi.fn(async () => undefined);
    const items = [{
      video_id: 'video_ready',
      video_url: 'https://youtube.com/watch?v=video_ready',
      title: 'Ready Video',
      channel_id: 'channel_1',
    }];
    registerYouTubeRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      SearchVideosGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
      enqueueIngestionJob: enqueueIntoMockDb,
      loadExistingSourceVideoStateForUser: vi.fn(async () => new Map()),
      resolveVariantOrReady: vi.fn(async ({ sourceItemId }: { sourceItemId: string }) => {
        if (sourceItemId === 'source_video_ready') {
          return { state: 'ready', blueprintId: 'bp_ready' };
        }
        return null;
      }),
      insertFeedItem,
      upsertFeedItemWithBlueprint,
    }));

    const handler = app.handlers['POST /api/search/videos/generate'];
    const req = { body: { items } } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        queued_count: 0,
        skipped_existing_count: 1,
        skipped_existing: [
          expect.objectContaining({
            video_id: 'video_ready',
            blueprint_id: 'bp_ready',
          }),
        ],
      },
    });
    expect(upsertFeedItemWithBlueprint).toHaveBeenCalledWith(authDb, {
      userId: '00000000-0000-0000-0000-000000000001',
      sourceItemId: 'source_video_ready',
      blueprintId: 'bp_ready',
      state: 'my_feed_published',
    });
    expect(insertFeedItem).not.toHaveBeenCalled();
    expect(authDb.state.ingestion_jobs).toHaveLength(0);
  });

  it('rejects search generate requests above the route cap', async () => {
    const app = createMockApp();
    const items = Array.from({ length: 21 }, (_, index) => ({
      video_id: `video_${index + 1}`,
      video_url: `https://youtube.com/watch?v=video_${index + 1}`,
      title: `Video ${index + 1}`,
      channel_id: 'channel_1',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      SearchVideosGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
    }));

    const handler = app.handlers['POST /api/search/videos/generate'];
    const req = { body: { items } } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'MAX_ITEMS_EXCEEDED',
    });
  });

  it('does not reject search generate when only the work-item budget would overflow', async () => {
    const authDb = createMockSupabase({
      ingestion_jobs: [],
    });
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 10,
        capacity: 10,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    });
    const app = createMockApp();
    const items = Array.from({ length: 2 }, (_, index) => ({
      video_id: `video_${index + 1}`,
      video_url: `https://youtube.com/watch?v=video_${index + 1}`,
      title: `Video ${index + 1}`,
      channel_id: 'channel_1',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      SearchVideosGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
      loadExistingSourceVideoStateForUser: vi.fn(async () => new Map()),
      resolveVariantOrReady: vi.fn(async () => null),
      countQueueDepth: vi.fn(async () => 1),
      countQueueWorkItems: vi.fn(async () => 39),
      queueWorkItemsPerUserLimit: 40,
    }));

    const handler = app.handlers['POST /api/search/videos/generate'];
    const req = { body: { items } } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        queue_work_items: 3,
        user_queue_work_items: 3,
      },
    });
    expect(serviceDb.state.credit_ledger.map((row: any) => row.entry_type)).toEqual(['hold', 'hold']);
  });

  it('returns cooldown error when manual YouTube comments refresh is on cooldown', async () => {
    const app = createMockApp();
    const serviceDb = createMockSupabase({
      blueprints: [{
        id: '00000000-0000-0000-0000-000000000999',
        creator_user_id: '00000000-0000-0000-0000-000000000001',
      }],
    });
    const requestManualBlueprintYouTubeCommentsRefresh = vi.fn(async () => ({
      ok: false as const,
      code: 'COMMENTS_REFRESH_COOLDOWN_ACTIVE' as const,
      retry_at: '2026-03-06T10:00:00.000Z',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      requestManualBlueprintYouTubeCommentsRefresh,
    }));

    const handler = app.handlers['POST /api/blueprints/:id/youtube-comments/refresh'];
    const req = {
      params: { id: '00000000-0000-0000-0000-000000000999' },
      body: {},
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(requestManualBlueprintYouTubeCommentsRefresh).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'COMMENTS_REFRESH_COOLDOWN_ACTIVE',
    });
  });

  it('lists blueprint YouTube comments through the backend reader', async () => {
    const app = createMockApp();
    const serviceDb = createMockSupabase({
      blueprints: [{
        id: '00000000-0000-0000-0000-000000000999',
        creator_user_id: '00000000-0000-0000-0000-000000000001',
        is_public: true,
      }],
    });
    const listBlueprintYouTubeComments = vi.fn(async () => ([
      {
        id: 'bp_comment_1',
        blueprint_id: '00000000-0000-0000-0000-000000000999',
        youtube_video_id: 'abc123def45',
        sort_mode: 'top' as const,
        source_comment_id: 'yt_comment_1',
        display_order: 0,
        author_name: 'Alice',
        author_avatar_url: 'https://example.com/a.png',
        content: 'Useful comment',
        published_at: '2026-04-09T08:00:00.000Z',
        like_count: 7,
      },
    ]));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      listBlueprintYouTubeComments,
    }));

    const handler = app.handlers['GET /api/blueprints/:id/youtube-comments'];
    const req = {
      params: { id: '00000000-0000-0000-0000-000000000999' },
      query: { sort_mode: 'top' },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(listBlueprintYouTubeComments).toHaveBeenCalledTimes(1);
    expect(listBlueprintYouTubeComments).toHaveBeenCalledWith({
      db: serviceDb,
      blueprintId: '00000000-0000-0000-0000-000000000999',
      sortMode: 'top',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            id: 'bp_comment_1',
            content: 'Useful comment',
          },
        ],
      },
    });
  });

  it('hides blueprint YouTube comments for private blueprints when the user is not the owner', async () => {
    const app = createMockApp();
    const serviceDb = createMockSupabase({
      blueprints: [{
        id: '00000000-0000-0000-0000-000000000999',
        creator_user_id: '00000000-0000-0000-0000-000000000777',
        is_public: false,
      }],
    });
    const listBlueprintYouTubeComments = vi.fn(async () => []);
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      listBlueprintYouTubeComments,
    }));

    const handler = app.handlers['GET /api/blueprints/:id/youtube-comments'];
    const req = {
      params: { id: '00000000-0000-0000-0000-000000000999' },
      query: { sort_mode: 'new' },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(listBlueprintYouTubeComments).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'NOT_FOUND',
    });
  });

  it('queues manual YouTube comments refresh request', async () => {
    const app = createMockApp();
    const serviceDb = createMockSupabase({
      blueprints: [{
        id: '00000000-0000-0000-0000-000000000999',
        creator_user_id: '00000000-0000-0000-0000-000000000001',
      }],
    });
    const requestManualBlueprintYouTubeCommentsRefresh = vi.fn(async () => ({
      ok: true as const,
      status: 'queued' as const,
      cooldown_until: '2026-03-06T10:00:00.000Z',
      queue_depth: 2,
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      requestManualBlueprintYouTubeCommentsRefresh,
    }));

    const handler = app.handlers['POST /api/blueprints/:id/youtube-comments/refresh'];
    const req = {
      params: { id: '00000000-0000-0000-0000-000000000999' },
      body: {},
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(requestManualBlueprintYouTubeCommentsRefresh).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      message: 'youtube refresh queued',
      data: {
        status: 'queued',
      },
    });
  });

  it('returns already pending for manual YouTube refresh when work is already queued', async () => {
    const app = createMockApp();
    const serviceDb = createMockSupabase({
      blueprints: [{
        id: '00000000-0000-0000-0000-000000000999',
        creator_user_id: '00000000-0000-0000-0000-000000000001',
      }],
    });
    const requestManualBlueprintYouTubeCommentsRefresh = vi.fn(async () => ({
      ok: true as const,
      status: 'already_pending' as const,
      cooldown_until: '2026-03-06T10:00:00.000Z',
      queue_depth: null,
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      requestManualBlueprintYouTubeCommentsRefresh,
    }));

    const handler = app.handlers['POST /api/blueprints/:id/youtube-comments/refresh'];
    const req = {
      params: { id: '00000000-0000-0000-0000-000000000999' },
      body: {},
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(requestManualBlueprintYouTubeCommentsRefresh).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      message: 'youtube refresh already pending',
      data: {
        status: 'already_pending',
      },
    });
  });

  it('hides manual YouTube comments refresh for non-owners', async () => {
    const app = createMockApp();
    const serviceDb = createMockSupabase({
      blueprints: [{
        id: '00000000-0000-0000-0000-000000000999',
        creator_user_id: '00000000-0000-0000-0000-000000000777',
      }],
    });
    const requestManualBlueprintYouTubeCommentsRefresh = vi.fn(async () => ({
      ok: true as const,
      status: 'queued' as const,
      cooldown_until: null,
      queue_depth: 0,
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      requestManualBlueprintYouTubeCommentsRefresh,
    }));

    const handler = app.handlers['POST /api/blueprints/:id/youtube-comments/refresh'];
    const req = {
      params: { id: '00000000-0000-0000-0000-000000000999' },
      body: {},
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(requestManualBlueprintYouTubeCommentsRefresh).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'NOT_FOUND',
    });
  });
});
