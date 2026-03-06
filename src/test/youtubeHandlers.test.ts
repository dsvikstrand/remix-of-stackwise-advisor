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
    clampYouTubeChannelSearchLimit: (_value: unknown, fallback: number) => fallback,
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
    isDualGenerateEnabledForUser: () => false,
    getDualGenerateTiers: () => ['tier'],
    resolveGenerationModelProfile: () => ({ model: 'o4-mini', fallbackModel: 'o4-mini', reasoningEffort: 'low' }),
    resolveVariantOrReady: vi.fn(async () => null),
    findVariantsByBlueprintId: vi.fn(async () => ({ sourceItemId: null, variants: [] })),
    requestManualBlueprintYouTubeCommentsRefresh: vi.fn(async () => ({
      ok: true,
      status: 'queued',
      cooldown_until: null,
      queue_depth: 0,
    })),
    ...overrides,
  } as any;
}

describe('youtube handlers', () => {
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

  it('rejects search generate when work-item budget would overflow', async () => {
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

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'QUEUE_BACKPRESSURE',
      data: {
        queue_work_items: 39,
        user_queue_work_items: 39,
      },
    });
    expect(serviceDb.state.credit_ledger.map((row: any) => row.entry_type)).toEqual(['hold', 'hold', 'refund', 'refund']);
  });

  it('returns cooldown error when manual YouTube comments refresh is on cooldown', async () => {
    const app = createMockApp();
    const requestManualBlueprintYouTubeCommentsRefresh = vi.fn(async () => ({
      ok: false as const,
      code: 'COMMENTS_REFRESH_COOLDOWN_ACTIVE' as const,
      retry_at: '2026-03-06T10:00:00.000Z',
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
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

  it('queues manual YouTube comments refresh request', async () => {
    const app = createMockApp();
    const requestManualBlueprintYouTubeCommentsRefresh = vi.fn(async () => ({
      ok: true as const,
      status: 'queued' as const,
      cooldown_until: '2026-03-06T10:00:00.000Z',
      queue_depth: 2,
    }));
    registerYouTubeRouteHandlers(app as any, createDeps({
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
      data: {
        status: 'queued',
      },
    });
  });
});
