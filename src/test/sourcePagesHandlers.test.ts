import { describe, expect, it, vi } from 'vitest';
import { registerSourcePagesRouteHandlers } from '../../server/handlers/sourcePagesHandlers';
import { createMockSupabase } from './helpers/mockSupabase';
import {
  attachReservationLedger,
  ensureSourceItemUnlock,
  failUnlock,
  reserveUnlock,
} from '../../server/services/sourceUnlocks';
import { refundReservation, reserveCredits } from '../../server/services/creditWallet';

function createMockResponse() {
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
  const sourcePage = {
    id: 'page_1',
    platform: 'youtube',
    external_id: 'channel_1',
    title: 'Channel 1',
    avatar_url: null,
    banner_url: null,
  };

  return {
    clampInt: (_value: unknown, fallback: number) => fallback,
    getAuthedSupabaseClient: () => null,
    getServiceSupabaseClient: () => null,
    buildSourcePagePath: () => '/s/youtube/channel_1',
    normalizeSourcePagePlatform: () => 'youtube',
    getSourcePageByPlatformExternalId: vi.fn(async () => sourcePage),
    runSourcePageAssetSweep: vi.fn(async () => null),
    needsSourcePageAssetHydration: () => false,
    hydrateSourcePageAssetsForRow: vi.fn(async () => sourcePage),
    youtubeDataApiKey: '',
    getUserSubscriptionStateForSourcePage: vi.fn(async () => null),
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
    listBlueprintTagRows: vi.fn(async () => []),
    readPublicFeedRows: undefined,
    readSourceRows: undefined,
    sourceVideoListBurstLimiter: passThroughLimiter,
    sourceVideoListSustainedLimiter: passThroughLimiter,
    sourceVideoUnlockBurstLimiter: passThroughLimiter,
    sourceVideoUnlockSustainedLimiter: passThroughLimiter,
    clampYouTubeSourceVideoLimit: (_value: unknown, fallback: number) => fallback,
    normalizeYouTubeSourceVideoKind: () => 'full',
    runUnlockSweeps: vi.fn(async () => undefined),
    listYouTubeSourceVideos: vi.fn(async () => ({ results: [], nextPageToken: null })),
    YouTubeSourceVideosError: class YouTubeSourceVideosError extends Error {},
    loadExistingSourceVideoStateForUser: vi.fn(async () => new Map()),
    countActiveSubscribersForSourcePage: vi.fn(async () => 0),
    computeUnlockCost: vi.fn(async () => 1),
    getSourceItemUnlocksBySourceItemIds: vi.fn(async () => []),
    toUnlockSnapshot: vi.fn(() => ({
      unlock_status: 'available',
      unlock_cost: 1,
    })),
    isConfirmedNoTranscriptUnlock: vi.fn(() => false),
    createUnlockTraceId: () => 'trace_1',
    SourcePageVideosGenerateSchema: { safeParse: (value: any) => ({ success: true, data: value }) },
    sourceUnlockGenerateMaxItems: 20,
    generationDurationCapEnabled: false,
    generationMaxVideoSeconds: 2700,
    generationBlockUnknownDuration: true,
    generationDurationLookupTimeoutMs: 8000,
    logUnlockEvent: vi.fn(() => undefined),
    normalizeSourcePageVideoGenerateItem: vi.fn((item: any) => item),
    upsertSourceItemFromVideo: vi.fn(async (_db, input: any) => ({
      id: `source_${String(input?.video?.videoId || 'x')}`,
    })),
    ensureSourceItemUnlock,
    getTranscriptCooldownState: vi.fn(() => ({ active: false, retryAfterSeconds: 0 })),
    reserveUnlock,
    sourceUnlockReservationSeconds: 300,
    reserveCredits,
    refundReservation,
    buildUnlockLedgerIdempotencyKey: vi.fn(({ unlockId, userId, action }: any) => `${unlockId}:${userId}:${action}`),
    failUnlock,
    attachReservationLedger,
    markUnlockProcessing: vi.fn(async () => null),
    countQueueDepth: vi.fn(async () => 0),
    countQueueWorkItems: vi.fn(async () => 0),
    unlockIntakeEnabled: true,
    queueDepthHardLimit: 1000,
    queueDepthPerUserLimit: 50,
    queueWorkItemsHardLimit: 250,
    queueWorkItemsPerUserLimit: 40,
    workerConcurrency: 4,
    emitGenerationStartedNotification: vi.fn(async () => undefined),
    getGenerationNotificationLinkPath: () => '/s/youtube/channel_1',
    scheduleQueuedIngestionProcessing: vi.fn(() => undefined),
    enqueueIngestionJob: vi.fn(async () => ({ data: { id: 'job_1' }, error: null })),
    settleReservation: vi.fn(async () => undefined),
    completeUnlock: vi.fn(async () => undefined),
    runYouTubePipeline: vi.fn(async () => undefined),
    getFailureTransition: vi.fn(() => null),
    sourceTranscriptMaxAttempts: 3,
    resolveYouTubeChannel: vi.fn(async () => ({
      channelId: 'channel_1',
      channelTitle: 'Channel 1',
      channelUrl: 'https://youtube.com/channel/channel_1',
    })),
    fetchYouTubeChannelAssetMap: vi.fn(async () => new Map()),
    ensureSourcePageFromYouTubeChannel: vi.fn(async () => sourcePage),
    upsertSourceSubscription: vi.fn(async (_db, input: any) => ({
      current: null,
      row: {
        id: 'sub_1',
        user_id: input.userId,
        source_type: input.sourceType,
        source_channel_id: input.sourceChannelId,
        source_channel_url: input.sourceChannelUrl || null,
        source_channel_title: input.sourceChannelTitle || null,
        source_page_id: input.sourcePageId || null,
        mode: input.mode || 'auto',
        auto_unlock_enabled: input.autoUnlockEnabled ?? false,
        is_active: input.isActive ?? true,
        last_polled_at: null,
        last_seen_published_at: null,
        last_seen_video_id: null,
        last_sync_error: input.lastSyncError ?? null,
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
      },
    })),
    deactivateSourceSubscriptionByChannel: vi.fn(async () => null),
    syncSingleSubscription: vi.fn(async () => ({ processed: 0, inserted: 0, skipped: 0 })),
    markSubscriptionSyncError: vi.fn(async () => undefined),
    upsertSubscriptionNoticeSourceItem: vi.fn(async () => ({ id: 'notice_1' })),
    insertFeedItem: vi.fn(async () => undefined),
    cleanupSubscriptionNoticeForChannel: vi.fn(async () => undefined),
    resolveGenerationTierAccess: () => ({ allowedTiers: ['tier'], defaultTier: 'tier', testModeEnabled: false }),
    resolveRequestedGenerationTier: () => 'tier',
    normalizeRequestedGenerationTier: (value: unknown) => value,
    resolveVariantOrReady: vi.fn(async () => null),
    ...overrides,
  } as any;
}

describe('source page handlers', () => {
  it('denies video library access for unsubscribed users', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({
      user_source_subscriptions: [],
    }) as any;
    const listYouTubeSourceVideos = vi.fn(async () => ({ results: [], nextPageToken: null }));

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => authDb,
      listYouTubeSourceVideos,
    }));

    const handler = app.handlers['GET /api/source-pages/:platform/:externalId/videos'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      query: {},
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'SOURCE_PAGE_SUBSCRIPTION_REQUIRED',
    });
    expect(listYouTubeSourceVideos).not.toHaveBeenCalled();
  });

  it('defaults source-page subscriptions to manual auto-unlock off', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({}) as any;
    const serviceDb = createMockSupabase({}) as any;
    const deps = createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
    });

    registerSourcePagesRouteHandlers(app as any, deps);

    const handler = app.handlers['POST /api/source-pages/:platform/:externalId/subscribe'];
    const req = {
      params: { platform: 'youtube', externalId: '@channel_1' },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(deps.upsertSourceSubscription).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect((res.body as any)?.data?.subscription?.auto_unlock_enabled).toBe(false);
  });

  it('shows in-progress unlock state in the source page video list when a variant is already running', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({}) as any;
    const serviceDb = createMockSupabase({}) as any;

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      getUserSubscriptionStateForSourcePage: vi.fn(async () => ({
        subscribed: true,
        subscription_id: 'sub_1',
      })),
      listYouTubeSourceVideos: vi.fn(async () => ({
        results: [{
          video_id: 'video_progress',
          video_url: 'https://youtube.com/watch?v=video_progress',
          title: 'Progress Video',
          description: null,
          thumbnail_url: 'https://thumb/progress.jpg',
          published_at: '2026-04-02T13:00:00.000Z',
          duration_seconds: 123,
          channel_id: 'channel_1',
          channel_title: 'Channel 1',
        }],
        nextPageToken: null,
      })),
      loadExistingSourceVideoStateForUser: vi.fn(async () => new Map([
        ['video_progress', {
          source_item_id: 'source_video_progress',
          already_exists_for_user: false,
          existing_blueprint_id: null,
          existing_feed_item_id: null,
        }],
      ])),
      getSourceItemUnlocksBySourceItemIds: vi.fn(async () => []),
      toUnlockSnapshot: vi.fn(() => ({
        unlock_status: 'available',
        unlock_cost: 1,
        unlock_in_progress: false,
        ready_blueprint_id: null,
        unlock_id: null,
      })),
      resolveVariantOrReady: vi.fn(async ({ sourceItemId }: { sourceItemId: string }) => {
        if (sourceItemId === 'source_video_progress') return { state: 'in_progress' };
        return null;
      }),
    }));

    const handler = app.handlers['GET /api/source-pages/:platform/:externalId/videos'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      query: {},
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [{
          video_id: 'video_progress',
          unlock_status: 'processing',
          unlock_in_progress: true,
        }],
      },
    });
  });

  it('does not mislabel needs-generation variants as processing in the source page video list', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({}) as any;
    const serviceDb = createMockSupabase({}) as any;

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      getUserSubscriptionStateForSourcePage: vi.fn(async () => ({
        subscribed: true,
        subscription_id: 'sub_1',
      })),
      listYouTubeSourceVideos: vi.fn(async () => ({
        results: [{
          video_id: 'video_needs_generation',
          video_url: 'https://youtube.com/watch?v=video_needs_generation',
          title: 'Needs Generation Video',
          description: null,
          thumbnail_url: 'https://thumb/needs-generation.jpg',
          published_at: '2026-04-02T13:00:00.000Z',
          duration_seconds: 123,
          channel_id: 'channel_1',
          channel_title: 'Channel 1',
        }],
        nextPageToken: null,
      })),
      loadExistingSourceVideoStateForUser: vi.fn(async () => new Map([
        ['video_needs_generation', {
          source_item_id: 'source_video_needs_generation',
          already_exists_for_user: false,
          existing_blueprint_id: null,
          existing_feed_item_id: null,
        }],
      ])),
      getSourceItemUnlocksBySourceItemIds: vi.fn(async () => []),
      toUnlockSnapshot: vi.fn(() => ({
        unlock_status: 'available',
        unlock_cost: 1,
        unlock_in_progress: false,
        ready_blueprint_id: null,
        unlock_id: null,
      })),
      resolveVariantOrReady: vi.fn(async ({ sourceItemId }: { sourceItemId: string }) => {
        if (sourceItemId === 'source_video_needs_generation') {
          return { state: 'needs_generation', variant: null };
        }
        return null;
      }),
    }));

    const handler = app.handlers['GET /api/source-pages/:platform/:externalId/videos'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      query: {},
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [{
          video_id: 'video_needs_generation',
          unlock_status: 'available',
          unlock_in_progress: false,
        }],
      },
    });
  });

  it('supports Oracle-first public feed and source readers for source page blueprints', async () => {
    const app = createMockApp();
    const serviceDb = createMockSupabase({
      blueprints: [{
        id: 'bp_1',
        title: 'Blueprint One',
        llm_review: 'Review 1',
        banner_url: 'https://banner/1.jpg',
        sections_json: null,
        steps: null,
        is_public: true,
      }],
      blueprint_tags: [{
        blueprint_id: 'bp_1',
        tag_id: 'tag_fit',
      }],
      tags: [{
        id: 'tag_fit',
        slug: 'fitness-training',
      }],
      channel_candidates: [{
        user_feed_item_id: 'ufi_1',
        channel_slug: 'fitness-training',
        status: 'published',
        created_at: '2026-03-06T10:02:00.000Z',
      }],
      user_feed_items: [],
      source_items: [],
    }) as any;

    const readPublicFeedRows = vi.fn(async ({ blueprintIds }: { blueprintIds?: string[] }) => {
      if (Array.isArray(blueprintIds) && blueprintIds.length > 0) {
        return [{
          id: 'ufi_1',
          blueprint_id: 'bp_1',
          source_item_id: 'source_1',
          created_at: '2026-03-06T10:01:00.000Z',
        }];
      }
      return [{
        id: 'ufi_1',
        blueprint_id: 'bp_1',
        source_item_id: 'source_1',
        created_at: '2026-03-06T10:01:00.000Z',
      }];
    });
    const readSourceRows = vi.fn(async () => ([
      {
        id: 'source_1',
        source_page_id: 'page_1',
        source_channel_id: 'channel_1',
        source_url: 'https://youtube.com/watch?v=video_1',
        thumbnail_url: 'https://thumb/1.jpg',
      },
    ]));

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getServiceSupabaseClient: () => serviceDb,
      listBlueprintTagRows: vi.fn(async ({ blueprintIds }: { blueprintIds: string[] }) => {
        const tagDefs = new Map(
          (serviceDb.state.tags || []).map((row: any) => [String(row.id || '').trim(), String(row.slug || '').trim()]),
        );
        return (serviceDb.state.blueprint_tags || [])
          .filter((row: any) => blueprintIds.includes(String(row.blueprint_id || '').trim()))
          .map((row: any) => ({
            blueprint_id: String(row.blueprint_id || '').trim(),
            tag_id: String(row.tag_id || '').trim(),
            tag_slug: tagDefs.get(String(row.tag_id || '').trim()) || '',
          }))
          .filter((row: any) => row.blueprint_id && row.tag_id && row.tag_slug);
      }),
      readPublicFeedRows,
      readSourceRows,
    }));

    const handler = app.handlers['GET /api/source-pages/:platform/:externalId/blueprints'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      query: {},
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [{
          blueprint_id: 'bp_1',
          source_item_id: 'source_1',
          published_channel_slug: 'fitness-training',
          source_thumbnail_url: 'https://thumb/1.jpg',
        }],
      },
    });
    expect(readPublicFeedRows).toHaveBeenCalled();
    expect(readSourceRows).toHaveBeenCalled();
  });

  it('denies unlock generation for unsubscribed users', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({
      user_source_subscriptions: [],
    }) as any;
    const reserveCreditsSpy = vi.fn(reserveCredits);

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => authDb,
      reserveCredits: reserveCreditsSpy,
    }));

    const handler = app.handlers['POST /api/source-pages/:platform/:externalId/videos/unlock'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      body: {
        items: [{
          video_id: 'video_1',
          video_url: 'https://youtube.com/watch?v=video_1',
          title: 'Video 1',
        }],
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'SOURCE_PAGE_SUBSCRIPTION_REQUIRED',
    });
    expect(reserveCreditsSpy).not.toHaveBeenCalled();
  });

  it('keeps reserved unlock holds when only the work-item budget would overflow', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_type: 'youtube',
        source_channel_id: 'channel_1',
        source_page_id: 'page_1',
        is_active: true,
      }],
      ingestion_jobs: [],
    }) as any;
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 1,
        capacity: 1,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
      credit_ledger: [],
      source_item_unlocks: [],
    }) as any;

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      getUserSubscriptionStateForSourcePage: vi.fn(async () => ({
        subscribed: true,
        subscription_id: 'sub_1',
      })),
      logUnlockEvent: vi.fn(() => undefined),
      reserveCredits: vi.fn(async (db: any, input: any) => {
        const wallet = db.state.user_credit_wallets[0];
        wallet.balance = Number(wallet.balance) - Number(input.amount);
        db.state.credit_ledger.push({
          id: 'ledger_hold_1',
          user_id: input.userId,
          entry_type: 'hold',
          reason_code: input.reasonCode,
          delta: -Number(input.amount),
        });
        return {
          ok: true,
          ledger_id: 'ledger_hold_1',
          reserved_amount: Number(input.amount),
          wallet: { balance: wallet.balance },
        };
      }),
      refundReservation: vi.fn(async (db: any, input: any) => {
        const wallet = db.state.user_credit_wallets[0];
        wallet.balance = Number(wallet.balance) + Number(input.amount);
        db.state.credit_ledger.push({
          id: 'ledger_refund_1',
          user_id: input.userId,
          entry_type: 'refund',
          reason_code: input.reasonCode,
          delta: Number(input.amount),
        });
        return {
          ok: true,
          ledger_id: 'ledger_refund_1',
          wallet: { balance: wallet.balance },
        };
      }),
      ensureSourceItemUnlock: vi.fn(async (db: any) => {
        const existing = db.state.source_item_unlocks.find((row: any) => row.id === 'unlock_1');
        if (existing) return existing;
        const row = {
          id: 'unlock_1',
          source_item_id: 'source_video_1',
          source_page_id: 'page_1',
          status: 'available',
          estimated_cost: 1,
          reserved_by_user_id: null,
          reservation_expires_at: null,
          reserved_ledger_id: null,
          blueprint_id: null,
          job_id: null,
          last_error_code: null,
          last_error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.state.source_item_unlocks.push(row);
        return row;
      }),
      reserveUnlock: vi.fn(async () => ({
        ok: true,
        state: 'reserved',
        reservedNow: true,
        unlock: {
          id: 'unlock_1',
          source_item_id: 'source_video_1',
          source_page_id: 'page_1',
          status: 'reserved',
          estimated_cost: 1,
          reserved_by_user_id: '00000000-0000-0000-0000-000000000001',
          reservation_expires_at: new Date(Date.now() + 300_000).toISOString(),
          reserved_ledger_id: null,
          blueprint_id: null,
          job_id: null,
          last_error_code: null,
          last_error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      })),
      attachReservationLedger: vi.fn(async (db: any, input: any) => {
        const row = db.state.source_item_unlocks.find((entry: any) => entry.id === 'unlock_1');
        row.status = 'reserved';
        row.estimated_cost = input.amount;
        row.reserved_by_user_id = input.userId;
        row.reservation_expires_at = new Date(Date.now() + 300_000).toISOString();
        row.reserved_ledger_id = input.ledgerId;
        row.updated_at = new Date().toISOString();
        return row;
      }),
      countQueueDepth: vi.fn(async () => 1),
      countQueueWorkItems: vi.fn(async () => 40),
      queueWorkItemsPerUserLimit: 40,
    }));

    const handler = app.handlers['POST /api/source-pages/:platform/:externalId/videos/unlock'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      body: {
        items: [{
          video_id: 'video_1',
          video_url: 'https://youtube.com/watch?v=video_1',
          title: 'Video 1',
        }],
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        queue_work_items: 2,
        user_queue_work_items: 2,
      },
    });
    expect(serviceDb.state.credit_ledger.map((row: any) => row.entry_type)).toEqual(['hold']);
    expect(Number(serviceDb.state.user_credit_wallets[0].balance)).toBe(0);
  });

  it('returns stable duplicate and in-progress no-charge buckets', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_type: 'youtube',
        source_channel_id: 'channel_1',
        source_page_id: 'page_1',
        is_active: true,
      }],
    }) as any;
    const serviceDb = createMockSupabase({
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 3,
        capacity: 3,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    }) as any;

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      getUserSubscriptionStateForSourcePage: vi.fn(async () => ({
        subscribed: true,
        subscription_id: 'sub_1',
      })),
      loadExistingSourceVideoStateForUser: vi.fn(async () => new Map([
        ['video_dup', {
          already_exists_for_user: true,
          existing_blueprint_id: 'bp_1',
          existing_feed_item_id: 'feed_1',
        }],
      ])),
      resolveVariantOrReady: vi.fn(async ({ sourceItemId }: { sourceItemId: string }) => {
        if (sourceItemId === 'source_video_progress') {
          return { state: 'in_progress' };
        }
        return null;
      }),
    }));

    const handler = app.handlers['POST /api/source-pages/:platform/:externalId/videos/unlock'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      body: {
        items: [
          {
            video_id: 'video_dup',
            video_url: 'https://youtube.com/watch?v=video_dup',
            title: 'Duplicate Video',
          },
          {
            video_id: 'video_progress',
            video_url: 'https://youtube.com/watch?v=video_progress',
            title: 'Progress Video',
          },
        ],
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        queued_count: 0,
        skipped_existing_count: 1,
        in_progress_count: 1,
      },
    });
    expect(serviceDb.state.credit_ledger).toHaveLength(0);
  });

  it('does not misreport unlock prepare failures as in-progress', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_type: 'youtube',
        source_channel_id: 'channel_1',
        source_page_id: 'page_1',
        is_active: true,
      }],
    }) as any;
    const serviceDb = createMockSupabase({}) as any;

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      getUserSubscriptionStateForSourcePage: vi.fn(async () => ({
        subscribed: true,
        subscription_id: 'sub_1',
      })),
      reserveUnlock: vi.fn(async () => {
        throw {
          code: 'RESERVE_FAILED',
          message: 'reserve exploded',
        };
      }),
    }));

    const handler = app.handlers['POST /api/source-pages/:platform/:externalId/videos/unlock'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      body: {
        items: [{
          video_id: 'video_fail',
          video_url: 'https://youtube.com/watch?v=video_fail',
          title: 'Broken Video',
        }],
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_FAILED',
      data: {
        prepare_failed_count: 1,
        prepare_failed: [{
          video_id: 'video_fail',
          title: 'Broken Video',
        }],
      },
    });
  });

  it('rejects impossible in-progress unlock states', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_type: 'youtube',
        source_channel_id: 'channel_1',
        source_page_id: 'page_1',
        is_active: true,
      }],
    }) as any;
    const serviceDb = createMockSupabase({}) as any;

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      getUserSubscriptionStateForSourcePage: vi.fn(async () => ({
        subscribed: true,
        subscription_id: 'sub_1',
      })),
      reserveUnlock: vi.fn(async (db: any, input: any) => ({
        ok: true,
        state: 'in_progress',
        reservedNow: false,
        unlock: {
          ...input.unlock,
          status: 'available',
        },
      })),
    }));

    const handler = app.handlers['POST /api/source-pages/:platform/:externalId/videos/unlock'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      body: {
        items: [{
          video_id: 'video_weird',
          video_url: 'https://youtube.com/watch?v=video_weird',
          title: 'Weird Video',
        }],
      },
    } as any;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_FAILED',
      data: {
        prepare_failed_count: 1,
        prepare_failed: [{
          video_id: 'video_weird',
          title: 'Weird Video',
        }],
      },
    });
  });

  it('blocks source page unlock generation for videos inside the 24h blueprint cooldown window', async () => {
    const app = createMockApp();
    const authDb = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: '00000000-0000-0000-0000-000000000001',
        source_type: 'youtube',
        source_channel_id: 'channel_1',
        source_page_id: 'page_1',
        is_active: true,
      }],
    }) as any;
    const serviceDb = createMockSupabase({
      source_items: [{
        id: 'source_video_blocked',
        source_native_id: 'video_blocked',
        source_url: 'https://youtube.com/watch?v=video_blocked',
        title: 'Blocked Video',
        source_page_id: 'page_1',
        source_channel_id: 'channel_1',
        source_channel_title: 'Channel 1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
      source_item_unlocks: [{
        id: 'unlock_blocked',
        source_item_id: 'source_video_blocked',
        source_page_id: 'page_1',
        status: 'available',
        estimated_cost: 1,
        reserved_by_user_id: null,
        reservation_expires_at: null,
        reserved_ledger_id: null,
        blueprint_id: null,
        job_id: null,
        last_error_code: 'TRANSCRIPT_UNAVAILABLE',
        last_error_message: 'Temporary transcript job ended with status "failed".',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
      user_credit_wallets: [{
        user_id: '00000000-0000-0000-0000-000000000001',
        balance: 3,
        capacity: 3,
        refill_rate_per_sec: 0,
        last_refill_at: new Date().toISOString(),
      }],
    }) as any;
    const getBlueprintAvailabilityForVideo = vi.fn(async () => ({
      status: 'cooldown_active',
      videoId: 'video_blocked',
      message: 'This video isn’t currently available for blueprint generation.',
      retryAfterSeconds: 3600,
      cooldownUntilIso: new Date(Date.now() + 3600_000).toISOString(),
      failureSource: 'source_item_unlocks',
      lastErrorCode: 'TRANSCRIPT_UNAVAILABLE',
      lastErrorMessage: 'Temporary transcript job ended with status "failed".',
    }));

    registerSourcePagesRouteHandlers(app as any, createDeps({
      getAuthedSupabaseClient: () => authDb,
      getServiceSupabaseClient: () => serviceDb,
      getUserSubscriptionStateForSourcePage: vi.fn(async () => ({
        subscribed: true,
        subscription_id: 'sub_1',
      })),
      getBlueprintAvailabilityForVideo,
      upsertSourceItemFromVideo: vi.fn(async () => ({
        id: 'source_video_blocked',
      })),
    }));

    const handler = app.handlers['POST /api/source-pages/:platform/:externalId/videos/unlock'];
    const req = {
      params: { platform: 'youtube', externalId: 'channel_1' },
      body: {
        items: [{
          video_id: 'video_blocked',
          video_url: 'https://youtube.com/watch?v=video_blocked',
          title: 'Blocked Video',
        }],
      },
    } as any;
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
    expect(getBlueprintAvailabilityForVideo).toHaveBeenCalledWith(serviceDb, 'video_blocked');
    expect(serviceDb.state.credit_ledger).toHaveLength(0);
  });
});
