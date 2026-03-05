import { describe, expect, it, vi } from 'vitest';
import { registerYouTubeRouteHandlers } from '../../server/handlers/youtubeHandlers';

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
    sourceUnlockGenerateMaxItems: 100,
    queueDepthHardLimit: 1000,
    queueDepthPerUserLimit: 50,
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
});
