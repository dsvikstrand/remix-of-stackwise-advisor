import { describe, expect, it, vi } from 'vitest';
import {
  handleListSourceSubscriptions,
  handleRefreshGenerate,
} from '../../server/handlers/sourceSubscriptionsHandlers';
import { createMockSupabase } from './helpers/mockSupabase';

function createResponse() {
  return {
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
}

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    getAuthedSupabaseClient: () => null,
    getServiceSupabaseClient: () => null,
    resolveYouTubeChannel: vi.fn(),
    youtubeDataApiKey: '',
    fetchYouTubeChannelAssetMap: vi.fn(async () => new Map()),
    runSourcePageAssetSweep: vi.fn(async () => null),
    ensureSourcePageFromYouTubeChannel: vi.fn(),
    syncSingleSubscription: vi.fn(),
    markSubscriptionSyncError: vi.fn(),
    upsertSubscriptionNoticeSourceItem: vi.fn(),
    insertFeedItem: vi.fn(async () => undefined),
    upsertSourceItemFromVideo: vi.fn(async (_db, input: any) => ({
      id: `source_${String(input?.video?.videoId || 'x')}`,
    })),
    buildSourcePagePath: () => '/s/youtube/x',
    cleanupSubscriptionNoticeForChannel: vi.fn(),
    refreshScanLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    refreshGenerateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    RefreshSubscriptionsScanSchema: { safeParse: () => ({ success: false }) },
    collectRefreshCandidatesForUser: vi.fn(),
    RefreshSubscriptionsGenerateSchema: { safeParse: () => ({ success: false }) },
    refreshGenerateMaxItems: 10,
    generationDurationCapEnabled: false,
    generationMaxVideoSeconds: 2700,
    generationBlockUnknownDuration: true,
    generationDurationLookupTimeoutMs: 8000,
    recoverStaleIngestionJobs: vi.fn(async () => []),
    getActiveManualRefreshJob: vi.fn(async () => null),
    countQueueDepth: vi.fn(async () => 0),
    countQueueWorkItems: vi.fn(async () => 0),
    queueDepthHardLimit: 1000,
    queueDepthPerUserLimit: 50,
    queueWorkItemsHardLimit: 250,
    queueWorkItemsPerUserLimit: 40,
    emitGenerationStartedNotification: vi.fn(async () => undefined),
    getGenerationNotificationLinkPath: () => '/feed',
    scheduleQueuedIngestionProcessing: vi.fn(() => undefined),
    resolveGenerationTierAccess: () => ({ allowedTiers: ['tier'], defaultTier: 'tier', testModeEnabled: false }),
    resolveRequestedGenerationTier: () => 'tier',
    normalizeRequestedGenerationTier: (value: unknown) => value,
    isDualGenerateEnabledForUser: () => false,
    getDualGenerateTiers: () => ['tier'],
    resolveVariantOrReady: vi.fn(async () => null),
    consumeCredit: vi.fn(async () => ({ ok: true })),
    getGenerationDailyCapStatus: vi.fn(async () => null),
    ...overrides,
  } as any;
}

describe('source subscription refresh generate handler', () => {
  it('reads subscription avatars from stored source page metadata without live YouTube fetches', async () => {
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_type: 'youtube',
        source_channel_id: 'channel_1',
        source_channel_url: 'https://youtube.com/channel/channel_1',
        source_channel_title: 'Channel 1',
        source_page_id: 'page_1',
        is_active: true,
        updated_at: '2026-03-06T10:00:00.000Z',
      }],
    });
    const serviceDb = createMockSupabase({
      source_pages: [{
        id: 'page_1',
        platform: 'youtube',
        external_id: 'channel_1',
        avatar_url: 'https://img.example.com/channel_1.jpg',
        banner_url: 'https://img.example.com/channel_1-banner.jpg',
      }],
    });
    const fetchYouTubeChannelAssetMap = vi.fn(async () => {
      throw new Error('should not be called');
    });
    const runSourcePageAssetSweep = vi.fn(async () => null);
    const req = {} as any;
    const res = createResponse();
    const deps = createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      fetchYouTubeChannelAssetMap,
      runSourcePageAssetSweep,
    });

    await handleListSourceSubscriptions(req, res as any, deps);

    expect(res.statusCode).toBe(200);
    expect(fetchYouTubeChannelAssetMap).not.toHaveBeenCalled();
    expect(runSourcePageAssetSweep).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      ok: true,
      data: [{
        id: 'sub_1',
        source_channel_avatar_url: 'https://img.example.com/channel_1.jpg',
        source_page_path: '/s/youtube/x',
      }],
    });
  });

  it('tolerates missing stored source page assets and schedules a bounded sweep', async () => {
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_type: 'youtube',
        source_channel_id: 'channel_1',
        source_channel_url: 'https://youtube.com/channel/channel_1',
        source_channel_title: 'Channel 1',
        source_page_id: 'page_1',
        is_active: true,
        updated_at: '2026-03-06T10:00:00.000Z',
      }],
    });
    const serviceDb = createMockSupabase({
      source_pages: [{
        id: 'page_1',
        platform: 'youtube',
        external_id: 'channel_1',
        avatar_url: null,
        banner_url: null,
      }],
    });
    const fetchYouTubeChannelAssetMap = vi.fn(async () => {
      throw new Error('should not be called');
    });
    const runSourcePageAssetSweep = vi.fn(async () => null);
    const req = {} as any;
    const res = createResponse();
    const deps = createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      fetchYouTubeChannelAssetMap,
      runSourcePageAssetSweep,
    });

    await handleListSourceSubscriptions(req, res as any, deps);

    expect(res.statusCode).toBe(200);
    expect(fetchYouTubeChannelAssetMap).not.toHaveBeenCalled();
    expect(runSourcePageAssetSweep).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({
      ok: true,
      data: [{
        id: 'sub_1',
        source_channel_avatar_url: null,
      }],
    });
  });

  it('queues only the affordable prefix and reports skipped_unaffordable_count', async () => {
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_channel_id: 'channel_1',
        is_active: true,
      }],
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
    const items = Array.from({ length: 5 }, (_, index) => ({
      subscription_id: 'sub_1',
      source_channel_id: 'channel_1',
      source_channel_title: 'Channel 1',
      source_channel_url: 'https://youtube.com/channel/channel_1',
      video_id: `video_${index + 1}`,
      video_url: `https://youtube.com/watch?v=video_${index + 1}`,
      title: `Video ${index + 1}`,
    }));

    const req = {
      body: { items },
    } as any;
    const res = createResponse();
    const deps = createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      RefreshSubscriptionsGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
    });

    await handleRefreshGenerate(req, res as any, deps);

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

  it('keeps skipped_existing and in_progress buckets stable for mixed manual refresh results', async () => {
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_channel_id: 'channel_1',
        is_active: true,
      }],
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
    const items = [
      {
        subscription_id: 'sub_1',
        source_channel_id: 'channel_1',
        source_channel_title: 'Channel 1',
        source_channel_url: 'https://youtube.com/channel/channel_1',
        video_id: 'video_ready',
        video_url: 'https://youtube.com/watch?v=video_ready',
        title: 'Ready Video',
      },
      {
        subscription_id: 'sub_1',
        source_channel_id: 'channel_1',
        source_channel_title: 'Channel 1',
        source_channel_url: 'https://youtube.com/channel/channel_1',
        video_id: 'video_progress',
        video_url: 'https://youtube.com/watch?v=video_progress',
        title: 'Progress Video',
      },
      {
        subscription_id: 'sub_1',
        source_channel_id: 'channel_1',
        source_channel_title: 'Channel 1',
        source_channel_url: 'https://youtube.com/channel/channel_1',
        video_id: 'video_new',
        video_url: 'https://youtube.com/watch?v=video_new',
        title: 'New Video',
      },
    ];

    const req = {
      body: { items },
    } as any;
    const res = createResponse();
    const deps = createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      RefreshSubscriptionsGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
      resolveVariantOrReady: vi.fn(async ({ sourceItemId }: { sourceItemId: string }) => {
        if (sourceItemId === 'source_video_ready') {
          return { state: 'ready', blueprintId: 'bp_ready' };
        }
        if (sourceItemId === 'source_video_progress') {
          return { state: 'in_progress' };
        }
        return null;
      }),
    });

    await handleRefreshGenerate(req, res as any, deps);

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

  it('rejects refresh generation when work-item budget would overflow', async () => {
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_channel_id: 'channel_1',
        is_active: true,
      }],
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
    const items = Array.from({ length: 2 }, (_, index) => ({
      subscription_id: 'sub_1',
      source_channel_id: 'channel_1',
      source_channel_title: 'Channel 1',
      source_channel_url: 'https://youtube.com/channel/channel_1',
      video_id: `video_${index + 1}`,
      video_url: `https://youtube.com/watch?v=video_${index + 1}`,
      title: `Video ${index + 1}`,
    }));

    const req = {
      body: { items },
    } as any;
    const res = createResponse();
    const deps = createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      RefreshSubscriptionsGenerateSchema: { safeParse: () => ({ success: true, data: { items } }) },
      countQueueDepth: vi.fn(async () => 1),
      countQueueWorkItems: vi.fn(async () => 39),
      queueWorkItemsPerUserLimit: 40,
    });

    await handleRefreshGenerate(req, res as any, deps);

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
});
