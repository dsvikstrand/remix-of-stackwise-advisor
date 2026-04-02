import { describe, expect, it, vi } from 'vitest';
import {
  handleListSourceSubscriptions,
  handlePreviewPublicYouTubeSubscriptions,
  handleRefreshGenerate,
} from '../../server/handlers/sourceSubscriptionsHandlers';
import {
  YouTubeChannelLookupError,
  YouTubePublicSubscriptionsError,
} from '../../server/services/youtubeSubscriptions';
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
    resolvePublicYouTubeChannel: vi.fn(),
    youtubeDataApiKey: '',
    fetchPublicYouTubeSubscriptions: vi.fn(async () => ({ items: [], nextPageToken: null, hasMore: false })),
    fetchYouTubeChannelAssetMap: vi.fn(async () => new Map()),
    runSourcePageAssetSweep: vi.fn(async () => null),
    ensureSourcePageFromYouTubeChannel: vi.fn(),
    upsertSourceSubscription: vi.fn(async (_db, input: any) => ({
      current: null,
      row: {
        id: 'sub_new',
        user_id: input.userId,
        source_type: input.sourceType,
        source_channel_id: input.sourceChannelId,
        source_channel_url: input.sourceChannelUrl || null,
        source_channel_title: input.sourceChannelTitle || null,
        source_page_id: input.sourcePageId || null,
        mode: input.mode || 'auto',
        auto_unlock_enabled: input.autoUnlockEnabled ?? true,
        is_active: input.isActive ?? true,
        last_polled_at: null,
        last_seen_published_at: null,
        last_seen_video_id: null,
        last_sync_error: input.lastSyncError ?? null,
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
      },
    })),
    listSourceSubscriptionsForUser: vi.fn(async (db: any, userId: string) => {
      const { data, error } = await db
        .from('user_source_subscriptions')
        .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }),
    getSourceSubscriptionById: vi.fn(async () => null),
    patchSourceSubscriptionById: vi.fn(async () => null),
    deactivateSourceSubscriptionById: vi.fn(async () => null),
    syncSingleSubscription: vi.fn(),
    markSubscriptionSyncError: vi.fn(),
    upsertSubscriptionNoticeSourceItem: vi.fn(),
    insertFeedItem: vi.fn(async () => undefined),
    upsertSourceItemFromVideo: vi.fn(async (_db, input: any) => ({
      id: `source_${String(input?.video?.videoId || 'x')}`,
    })),
    buildSourcePagePath: () => '/s/youtube/x',
    cleanupSubscriptionNoticeForChannel: vi.fn(),
    publicYouTubePreviewLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
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
    enqueueIngestionJob: vi.fn(async () => ({ data: { id: 'job_1' }, error: null })),
    finalizeIngestionJob: vi.fn(async () => ({ id: 'job_1' })),
    resolveGenerationTierAccess: () => ({ allowedTiers: ['tier'], defaultTier: 'tier', testModeEnabled: false }),
    resolveRequestedGenerationTier: () => 'tier',
    normalizeRequestedGenerationTier: (value: unknown) => value,
    resolveVariantOrReady: vi.fn(async () => null),
    consumeCredit: vi.fn(async () => ({ ok: true })),
    getGenerationDailyCapStatus: vi.fn(async () => null),
    ...overrides,
  } as any;
}

function enqueueIntoMockDb(db: any, values: any) {
  return db.from('ingestion_jobs').insert(values).select('*').single();
}

describe('source subscription refresh generate handler', () => {
  it('previews public YouTube subscriptions with existing subscription state', async () => {
    const authDb = createMockSupabase({
      user_source_subscriptions: [
        {
          source_channel_id: 'creator_active',
          is_active: true,
          user_id: '00000000-0000-0000-0000-000000000001',
          source_type: 'youtube',
        },
        {
          source_channel_id: 'creator_inactive',
          is_active: false,
          user_id: '00000000-0000-0000-0000-000000000001',
          source_type: 'youtube',
        },
      ],
    });
    const req = {
      body: { channel_input: '@example', page_token: 'cursor-1', page_size: 25 },
    } as any;
    const res = createResponse();
    const deps = createDeps({
      youtubeDataApiKey: 'yt-key',
      getAuthedSupabaseClient: () => authDb,
      resolvePublicYouTubeChannel: vi.fn(async () => ({
        channelId: 'source_channel',
        channelTitle: 'Source Channel',
        channelUrl: 'https://www.youtube.com/channel/source_channel',
      })),
      fetchPublicYouTubeSubscriptions: vi.fn(async (input) => {
        expect(input).toMatchObject({
          apiKey: 'yt-key',
          channelId: 'source_channel',
          pageToken: 'cursor-1',
          pageSize: 25,
        });
        return {
        items: [
          {
            channelId: 'creator_active',
            channelTitle: 'Creator Active',
            channelUrl: 'https://www.youtube.com/channel/creator_active',
            thumbnailUrl: 'https://img.example.com/a.jpg',
          },
          {
            channelId: 'creator_inactive',
            channelTitle: 'Creator Inactive',
            channelUrl: 'https://www.youtube.com/channel/creator_inactive',
            thumbnailUrl: null,
          },
          {
            channelId: 'creator_new',
            channelTitle: 'Creator New',
            channelUrl: 'https://www.youtube.com/channel/creator_new',
            thumbnailUrl: null,
          },
        ],
        nextPageToken: 'next-page',
        hasMore: true,
      };
      }),
    });

    await handlePreviewPublicYouTubeSubscriptions(req, res as any, deps);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        source_channel_id: 'source_channel',
        source_channel_title: 'Source Channel',
        source_channel_url: 'https://www.youtube.com/channel/source_channel',
        creators_total: 3,
        next_page_token: 'next-page',
        has_more: true,
        creators: [
          {
            channel_id: 'creator_active',
            already_active: true,
            already_exists_inactive: false,
          },
          {
            channel_id: 'creator_inactive',
            already_active: false,
            already_exists_inactive: true,
          },
          {
            channel_id: 'creator_new',
            already_active: false,
            already_exists_inactive: false,
          },
        ],
      },
    });
  });

  it('maps private public subscription previews to a structured 403 error', async () => {
    const authDb = createMockSupabase({});
    const req = {
      body: { channel_input: '@private' },
    } as any;
    const res = createResponse();
    const deps = createDeps({
      youtubeDataApiKey: 'yt-key',
      getAuthedSupabaseClient: () => authDb,
      resolvePublicYouTubeChannel: vi.fn(async () => ({
        channelId: 'source_channel',
        channelTitle: 'Private Source',
        channelUrl: 'https://www.youtube.com/channel/source_channel',
      })),
      fetchPublicYouTubeSubscriptions: vi.fn(async () => {
        throw new YouTubePublicSubscriptionsError(
          'PUBLIC_SUBSCRIPTIONS_PRIVATE',
          'The channel subscriptions are private or inaccessible.',
        );
      }),
    });

    await handlePreviewPublicYouTubeSubscriptions(req, res as any, deps);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'PUBLIC_SUBSCRIPTIONS_PRIVATE',
    });
  });

  it('maps official channel lookup misses to a structured 404 error', async () => {
    const authDb = createMockSupabase({});
    const req = {
      body: { channel_input: '@missing' },
    } as any;
    const res = createResponse();
    const deps = createDeps({
      youtubeDataApiKey: 'yt-key',
      getAuthedSupabaseClient: () => authDb,
      resolvePublicYouTubeChannel: vi.fn(async () => {
        throw new YouTubeChannelLookupError('CHANNEL_NOT_FOUND', 'Could not find that YouTube channel.');
      }),
    });

    await handlePreviewPublicYouTubeSubscriptions(req, res as any, deps);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'PUBLIC_IMPORT_CHANNEL_NOT_FOUND',
    });
  });

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

  it('tolerates missing stored source page assets without scheduling an opportunistic sweep', async () => {
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
    expect(runSourcePageAssetSweep).not.toHaveBeenCalled();
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
      enqueueIngestionJob: enqueueIntoMockDb,
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
      enqueueIngestionJob: enqueueIntoMockDb,
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

  it('does not reject refresh generation when only the work-item budget would overflow', async () => {
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
});
