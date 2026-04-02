import { describe, expect, it, vi } from 'vitest';
import {
  buildSubscriptionSyncErrorUpdate,
  buildSubscriptionSyncSuccessUpdate,
  createSourceSubscriptionSyncService,
  formatSubscriptionSyncErrorMessage,
  SUBSCRIPTION_SYNC_ERROR_WRITE_HEARTBEAT_MINUTES,
  summarizeSubscriptionSyncError,
} from '../../server/services/sourceSubscriptionSync';
import { createMockSupabase } from './helpers/mockSupabase';

describe('source subscription sync service', () => {
  it('uses the flat unlock cost without counting active subscribers', async () => {
    const db = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: 'user_1',
        source_channel_id: 'channel_1',
        source_page_id: 'page_1',
        last_seen_published_at: '2026-03-18T10:00:00.000Z',
        last_seen_video_id: 'video_old',
        last_sync_error: null,
      }],
      user_feed_items: [],
    }) as any;

    const computeUnlockCost = vi.fn(() => 1);
    const countActiveSubscribersForSourcePage = vi.fn(async () => 99);
    const ensureSourceItemUnlock = vi.fn(async () => ({ status: 'available' }));
    const insertFeedItem = vi.fn(async () => ({ id: 'ufi_1' }));

    const service = createSourceSubscriptionSyncService({
      fetchYouTubeFeed: vi.fn(async () => ({
        channelTitle: 'Channel 1',
        videos: [{
          videoId: 'video_new',
          url: 'https://youtube.com/watch?v=video_new',
          title: 'Video New',
          publishedAt: '2026-03-19T10:00:00.000Z',
          thumbnailUrl: null,
          durationSeconds: 120,
        }],
      })),
      isNewerThanCheckpoint: vi.fn(() => true),
      ingestionMaxPerSubscription: 20,
      youtubeDataApiKey: '',
      generationDurationCapEnabled: false,
      generationMaxVideoSeconds: 2700,
      generationBlockUnknownDuration: true,
      generationDurationLookupTimeoutMs: 8000,
      fetchYouTubeDurationMap: vi.fn(async () => new Map()),
      fetchYouTubeVideoStates: vi.fn(async () => new Map()),
      upsertSourceItemFromVideo: vi.fn(async () => ({
        id: 'source_1',
        source_page_id: 'page_1',
        source_channel_id: 'channel_1',
        source_channel_title: 'Channel 1',
      })),
      getExistingFeedItem: vi.fn(async () => null),
      ensureSourceItemUnlock,
      computeUnlockCost,
      attemptAutoUnlockForSourceItem: vi.fn(async () => ({
        queued: false,
        reason: 'NO_ELIGIBLE_USERS',
      })),
      getServiceSupabaseClient: () => null,
      enqueueSourceAutoUnlockRetryJob: vi.fn(async () => ({
        enqueued: false,
        job_id: null,
        next_run_at: null,
      })),
      getSourceItemUnlockBySourceItemId: vi.fn(async () => null),
      getTranscriptCooldownState: vi.fn(() => ({ active: false })),
      isConfirmedNoTranscriptUnlock: vi.fn(() => false),
      suppressUnlockableFeedRowsForSourceItem: vi.fn(async () => undefined),
      insertFeedItem,
      // Extra field on purpose: verify the hot count path is no longer used.
      ...( { countActiveSubscribersForSourcePage } as any ),
    } as any);

    const result = await service.syncSingleSubscription(
      db,
      {
        id: 'sub_1',
        user_id: 'user_1',
        mode: 'auto',
        source_channel_id: 'channel_1',
        source_page_id: 'page_1',
        last_seen_published_at: '2026-03-18T10:00:00.000Z',
        last_seen_video_id: 'video_old',
      },
      { trigger: 'service_cron' },
    );

    expect(countActiveSubscribersForSourcePage).not.toHaveBeenCalled();
    expect(computeUnlockCost).toHaveBeenCalledWith(1);
    expect(ensureSourceItemUnlock).toHaveBeenCalledWith(db, expect.objectContaining({
      sourceItemId: 'source_1',
      sourcePageId: 'page_1',
      estimatedCost: 1,
    }));
    expect(insertFeedItem).toHaveBeenCalledWith(db, expect.objectContaining({
      userId: 'user_1',
      sourceItemId: 'source_1',
      state: 'my_feed_unlockable',
    }));
    expect(result).toMatchObject({
      processed: 1,
      inserted: 1,
      skipped: 0,
      newestVideoId: 'video_new',
    });
  });

  it('skips the final subscription write when nothing meaningful changed and poll heartbeat is still fresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));

    try {
      const originalPolledAt = '2026-03-19T11:55:00.000Z';
      const originalUpdatedAt = '2026-03-19T11:00:00.000Z';
      const db = createMockSupabase({
        user_source_subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          source_page_id: 'page_1',
          last_polled_at: originalPolledAt,
          last_seen_published_at: '2026-03-19T10:00:00.000Z',
          last_seen_video_id: 'video_latest',
          last_sync_error: null,
          updated_at: originalUpdatedAt,
        }],
        user_feed_items: [],
      }) as any;

      const service = createSourceSubscriptionSyncService({
        fetchYouTubeFeed: vi.fn(async () => ({
          channelTitle: 'Channel 1',
          videos: [{
            videoId: 'video_latest',
            url: 'https://youtube.com/watch?v=video_latest',
            title: 'Video Latest',
            publishedAt: '2026-03-19T10:00:00.000Z',
            thumbnailUrl: null,
            durationSeconds: 120,
          }],
        })),
        isNewerThanCheckpoint: vi.fn(() => false),
        ingestionMaxPerSubscription: 20,
        youtubeDataApiKey: '',
        generationDurationCapEnabled: false,
        generationMaxVideoSeconds: 2700,
        generationBlockUnknownDuration: true,
        generationDurationLookupTimeoutMs: 8000,
        fetchYouTubeDurationMap: vi.fn(async () => new Map()),
        fetchYouTubeVideoStates: vi.fn(async () => new Map()),
        upsertSourceItemFromVideo: vi.fn(),
        getExistingFeedItem: vi.fn(),
        ensureSourceItemUnlock: vi.fn(),
        computeUnlockCost: vi.fn(() => 1),
        attemptAutoUnlockForSourceItem: vi.fn(),
        getServiceSupabaseClient: () => null,
        enqueueSourceAutoUnlockRetryJob: vi.fn(),
        getSourceItemUnlockBySourceItemId: vi.fn(),
        getTranscriptCooldownState: vi.fn(() => ({ active: false })),
        isConfirmedNoTranscriptUnlock: vi.fn(() => false),
        suppressUnlockableFeedRowsForSourceItem: vi.fn(),
        insertFeedItem: vi.fn(),
      } as any);

      const result = await service.syncSingleSubscription(
        db,
        {
          id: 'sub_1',
          user_id: 'user_1',
          mode: 'auto',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          source_page_id: 'page_1',
          last_polled_at: originalPolledAt,
          last_seen_published_at: '2026-03-19T10:00:00.000Z',
          last_seen_video_id: 'video_latest',
          last_sync_error: null,
        },
        { trigger: 'service_cron' },
      );

      expect(result).toMatchObject({
        processed: 0,
        inserted: 0,
        skipped: 0,
        newestVideoId: 'video_latest',
      });
      expect(db.state.user_source_subscriptions[0]).toMatchObject({
        last_polled_at: originalPolledAt,
        last_sync_error: null,
        updated_at: originalUpdatedAt,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still writes when a successful sync clears a stored error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));

    try {
      const originalPolledAt = '2026-03-19T11:55:00.000Z';
      const originalUpdatedAt = '2026-03-19T11:00:00.000Z';
      const db = createMockSupabase({
        user_source_subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          source_page_id: 'page_1',
          last_polled_at: originalPolledAt,
          last_seen_published_at: '2026-03-19T10:00:00.000Z',
          last_seen_video_id: 'video_latest',
          last_sync_error: 'SYNC_FAILED',
          updated_at: originalUpdatedAt,
        }],
        user_feed_items: [],
      }) as any;

      const service = createSourceSubscriptionSyncService({
        fetchYouTubeFeed: vi.fn(async () => ({
          channelTitle: 'Channel 1',
          videos: [{
            videoId: 'video_latest',
            url: 'https://youtube.com/watch?v=video_latest',
            title: 'Video Latest',
            publishedAt: '2026-03-19T10:00:00.000Z',
            thumbnailUrl: null,
            durationSeconds: 120,
          }],
        })),
        isNewerThanCheckpoint: vi.fn(() => false),
        ingestionMaxPerSubscription: 20,
        youtubeDataApiKey: '',
        generationDurationCapEnabled: false,
        generationMaxVideoSeconds: 2700,
        generationBlockUnknownDuration: true,
        generationDurationLookupTimeoutMs: 8000,
        fetchYouTubeDurationMap: vi.fn(async () => new Map()),
        fetchYouTubeVideoStates: vi.fn(async () => new Map()),
        upsertSourceItemFromVideo: vi.fn(),
        getExistingFeedItem: vi.fn(),
        ensureSourceItemUnlock: vi.fn(),
        computeUnlockCost: vi.fn(() => 1),
        attemptAutoUnlockForSourceItem: vi.fn(),
        getServiceSupabaseClient: () => null,
        enqueueSourceAutoUnlockRetryJob: vi.fn(),
        getSourceItemUnlockBySourceItemId: vi.fn(),
        getTranscriptCooldownState: vi.fn(() => ({ active: false })),
        isConfirmedNoTranscriptUnlock: vi.fn(() => false),
        suppressUnlockableFeedRowsForSourceItem: vi.fn(),
        insertFeedItem: vi.fn(),
      } as any);

      await service.syncSingleSubscription(
        db,
        {
          id: 'sub_1',
          user_id: 'user_1',
          mode: 'auto',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          source_page_id: 'page_1',
          last_polled_at: originalPolledAt,
          last_seen_published_at: '2026-03-19T10:00:00.000Z',
          last_seen_video_id: 'video_latest',
          last_sync_error: 'SYNC_FAILED',
        },
        { trigger: 'service_cron' },
      );

      expect(db.state.user_source_subscriptions[0]).toMatchObject({
        last_polled_at: '2026-03-19T12:00:00.000Z',
        last_sync_error: null,
      });
      expect(db.state.user_source_subscriptions[0].updated_at).not.toBe(originalUpdatedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not emit a success update when only the heartbeat is stale', () => {
    expect(buildSubscriptionSyncSuccessUpdate({
      subscription: {
        source_channel_title: 'Channel 1',
        last_polled_at: '2026-03-19T11:30:00.000Z',
        last_seen_published_at: '2026-03-19T10:00:00.000Z',
        last_seen_video_id: 'video_latest',
        last_sync_error: null,
      },
      channelTitle: 'Channel 1',
      newestPublishedAt: '2026-03-19T10:00:00.000Z',
      newestVideoId: 'video_latest',
      skippedUpcoming: false,
      nowIso: '2026-03-19T12:00:00.000Z',
    })).toBeNull();
  });

  it('skips the final subscription write when nothing meaningful changed and only the poll heartbeat is stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));

    try {
      const originalPolledAt = '2026-03-19T11:30:00.000Z';
      const originalUpdatedAt = '2026-03-19T11:00:00.000Z';
      const db = createMockSupabase({
        user_source_subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          source_page_id: 'page_1',
          last_polled_at: originalPolledAt,
          last_seen_published_at: '2026-03-19T10:00:00.000Z',
          last_seen_video_id: 'video_latest',
          last_sync_error: null,
          updated_at: originalUpdatedAt,
        }],
        user_feed_items: [],
      }) as any;

      const service = createSourceSubscriptionSyncService({
        fetchYouTubeFeed: vi.fn(async () => ({
          channelTitle: 'Channel 1',
          videos: [{
            videoId: 'video_latest',
            url: 'https://youtube.com/watch?v=video_latest',
            title: 'Video Latest',
            publishedAt: '2026-03-19T10:00:00.000Z',
            thumbnailUrl: null,
            durationSeconds: 120,
          }],
        })),
        isNewerThanCheckpoint: vi.fn(() => false),
        ingestionMaxPerSubscription: 20,
        youtubeDataApiKey: '',
        generationDurationCapEnabled: false,
        generationMaxVideoSeconds: 2700,
        generationBlockUnknownDuration: true,
        generationDurationLookupTimeoutMs: 8000,
        fetchYouTubeDurationMap: vi.fn(async () => new Map()),
        fetchYouTubeVideoStates: vi.fn(async () => new Map()),
        upsertSourceItemFromVideo: vi.fn(),
        getExistingFeedItem: vi.fn(),
        ensureSourceItemUnlock: vi.fn(),
        computeUnlockCost: vi.fn(() => 1),
        attemptAutoUnlockForSourceItem: vi.fn(),
        getServiceSupabaseClient: () => null,
        enqueueSourceAutoUnlockRetryJob: vi.fn(),
        getSourceItemUnlockBySourceItemId: vi.fn(),
        getTranscriptCooldownState: vi.fn(() => ({ active: false })),
        isConfirmedNoTranscriptUnlock: vi.fn(() => false),
        suppressUnlockableFeedRowsForSourceItem: vi.fn(),
        insertFeedItem: vi.fn(),
      } as any);

      const result = await service.syncSingleSubscription(
        db,
        {
          id: 'sub_1',
          user_id: 'user_1',
          mode: 'auto',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          source_page_id: 'page_1',
          last_polled_at: originalPolledAt,
          last_seen_published_at: '2026-03-19T10:00:00.000Z',
          last_seen_video_id: 'video_latest',
          last_sync_error: null,
        },
        { trigger: 'service_cron' },
      );

      expect(result).toMatchObject({
        processed: 0,
        inserted: 0,
        skipped: 0,
        newestVideoId: 'video_latest',
      });
      expect(db.state.user_source_subscriptions[0]).toMatchObject({
        last_polled_at: originalPolledAt,
        last_sync_error: null,
        updated_at: originalUpdatedAt,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('throttles repeated identical subscription error writes inside the heartbeat window', () => {
    const nowIso = '2026-03-19T12:00:00.000Z';
    const insideWindowIso = new Date(
      Date.parse(nowIso) - ((SUBSCRIPTION_SYNC_ERROR_WRITE_HEARTBEAT_MINUTES - 1) * 60_000),
    ).toISOString();
    const boundaryIso = new Date(
      Date.parse(nowIso) - (SUBSCRIPTION_SYNC_ERROR_WRITE_HEARTBEAT_MINUTES * 60_000),
    ).toISOString();

    expect(buildSubscriptionSyncErrorUpdate({
      subscription: {
        last_polled_at: '2026-03-19T11:55:00.000Z',
        last_sync_error: 'SYNC_FAILED',
      },
      errorMessage: 'SYNC_FAILED',
      nowIso,
    })).toBeNull();

    expect(buildSubscriptionSyncErrorUpdate({
      subscription: {
        last_polled_at: insideWindowIso,
        last_sync_error: 'SYNC_FAILED',
      },
      errorMessage: 'SYNC_FAILED',
      nowIso,
    })).toBeNull();

    expect(buildSubscriptionSyncErrorUpdate({
      subscription: {
        last_polled_at: boundaryIso,
        last_sync_error: 'SYNC_FAILED',
      },
      errorMessage: 'SYNC_FAILED',
      nowIso,
    })).toEqual({
      last_polled_at: nowIso,
      last_sync_error: 'SYNC_FAILED',
    });
  });

  it('formats object-shaped subscription errors into readable text', () => {
    expect(summarizeSubscriptionSyncError({
      message: 'SYNC_FAILED',
      code: '23505',
      details: 'duplicate key value violates unique constraint',
      hint: 'Retry with a different key',
    })).toEqual({
      message: 'SYNC_FAILED',
      code: '23505',
      details: 'duplicate key value violates unique constraint',
      hint: 'Retry with a different key',
    });

    expect(formatSubscriptionSyncErrorMessage({
      message: 'SYNC_FAILED',
      code: '23505',
      details: 'duplicate key value violates unique constraint',
      hint: 'Retry with a different key',
    })).toBe(
      '23505: SYNC_FAILED | details=duplicate key value violates unique constraint | hint=Retry with a different key',
    );
  });

  it('formats Error instances with structured fields into readable text', () => {
    const error = Object.assign(new Error('WRITE_FAILED'), {
      code: 'WRITE_FAILED',
      details: 'source_item_id=abc',
      hint: 'retry later',
    });

    expect(formatSubscriptionSyncErrorMessage(error)).toBe(
      'WRITE_FAILED: WRITE_FAILED | details=source_item_id=abc | hint=retry later',
    );
  });

  it('retries transient feed fetch failures before succeeding', async () => {
    vi.useFakeTimers();

    try {
      const db = createMockSupabase({
        user_source_subscriptions: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_channel_id: 'channel_1',
          source_channel_url: 'https://youtube.com/channel/channel_1',
          source_channel_title: 'Channel 1',
          source_page_id: 'page_1',
          last_seen_published_at: null,
          last_seen_video_id: null,
          last_sync_error: null,
        }],
        user_feed_items: [],
      }) as any;

      const fetchYouTubeFeed = vi
        .fn()
        .mockRejectedValueOnce(new Error('FEED_FETCH_FAILED:500'))
        .mockResolvedValueOnce({
          channelTitle: 'Channel 1',
          videos: [{
            videoId: 'video_new',
            url: 'https://youtube.com/watch?v=video_new',
            title: 'Video New',
            publishedAt: '2026-03-19T10:00:00.000Z',
            thumbnailUrl: null,
            durationSeconds: 120,
          }],
        });

      const service = createSourceSubscriptionSyncService({
        fetchYouTubeFeed,
        isNewerThanCheckpoint: vi.fn(() => false),
        ingestionMaxPerSubscription: 20,
        youtubeDataApiKey: '',
        generationDurationCapEnabled: false,
        generationMaxVideoSeconds: 2700,
        generationBlockUnknownDuration: true,
        generationDurationLookupTimeoutMs: 8000,
        fetchYouTubeDurationMap: vi.fn(async () => new Map()),
        fetchYouTubeVideoStates: vi.fn(async () => new Map()),
        upsertSourceItemFromVideo: vi.fn(),
        getExistingFeedItem: vi.fn(),
        ensureSourceItemUnlock: vi.fn(),
        computeUnlockCost: vi.fn(() => 1),
        attemptAutoUnlockForSourceItem: vi.fn(),
        getServiceSupabaseClient: () => null,
        enqueueSourceAutoUnlockRetryJob: vi.fn(),
        getSourceItemUnlockBySourceItemId: vi.fn(),
        getTranscriptCooldownState: vi.fn(() => ({ active: false })),
        isConfirmedNoTranscriptUnlock: vi.fn(() => false),
        suppressUnlockableFeedRowsForSourceItem: vi.fn(),
        insertFeedItem: vi.fn(),
      } as any);

      const promise = service.syncSingleSubscription(
        db,
        {
          id: 'sub_1',
          user_id: 'user_1',
          mode: 'auto',
          source_channel_id: 'channel_1',
          source_channel_url: 'https://youtube.com/channel/channel_1',
          source_channel_title: 'Channel 1',
          source_page_id: 'page_1',
          last_seen_published_at: null,
          last_seen_video_id: null,
        },
        { trigger: 'service_cron' },
      );

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetchYouTubeFeed).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({
        resultCode: 'bootstrap',
        newestVideoId: 'video_new',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a soft feed-not-found result for service cron instead of throwing', async () => {
    const db = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: 'user_1',
        source_channel_id: 'channel_1',
        source_channel_url: 'https://youtube.com/channel/channel_1',
        source_channel_title: 'Channel 1',
        source_page_id: 'page_1',
        last_polled_at: '2026-03-19T11:00:00.000Z',
        last_seen_published_at: '2026-03-19T10:00:00.000Z',
        last_seen_video_id: 'video_old',
        last_sync_error: null,
      }],
      user_feed_items: [],
    }) as any;

    const service = createSourceSubscriptionSyncService({
      fetchYouTubeFeed: vi.fn(async () => {
        throw new Error('FEED_FETCH_FAILED:404');
      }),
      isNewerThanCheckpoint: vi.fn(() => false),
      ingestionMaxPerSubscription: 20,
      youtubeDataApiKey: '',
      generationDurationCapEnabled: false,
      generationMaxVideoSeconds: 2700,
      generationBlockUnknownDuration: true,
      generationDurationLookupTimeoutMs: 8000,
      fetchYouTubeDurationMap: vi.fn(async () => new Map()),
      fetchYouTubeVideoStates: vi.fn(async () => new Map()),
      upsertSourceItemFromVideo: vi.fn(),
      getExistingFeedItem: vi.fn(),
      ensureSourceItemUnlock: vi.fn(),
      computeUnlockCost: vi.fn(() => 1),
      attemptAutoUnlockForSourceItem: vi.fn(),
      getServiceSupabaseClient: () => null,
      enqueueSourceAutoUnlockRetryJob: vi.fn(),
      getSourceItemUnlockBySourceItemId: vi.fn(),
      getTranscriptCooldownState: vi.fn(() => ({ active: false })),
      isConfirmedNoTranscriptUnlock: vi.fn(() => false),
      suppressUnlockableFeedRowsForSourceItem: vi.fn(),
      insertFeedItem: vi.fn(),
    } as any);

    const result = await service.syncSingleSubscription(
      db,
      {
        id: 'sub_1',
        user_id: 'user_1',
        mode: 'auto',
        source_channel_id: 'channel_1',
        source_channel_url: 'https://youtube.com/channel/channel_1',
        source_channel_title: 'Channel 1',
        source_page_id: 'page_1',
        last_polled_at: '2026-03-19T11:00:00.000Z',
        last_seen_published_at: '2026-03-19T10:00:00.000Z',
        last_seen_video_id: 'video_old',
        last_sync_error: null,
      },
      { trigger: 'service_cron' },
    );

    expect(result).toMatchObject({
      resultCode: 'feed_not_found',
      errorMessage: 'FEED_FETCH_FAILED:404',
    });
    expect(db.state.user_source_subscriptions[0]).toMatchObject({
      last_sync_error: 'FEED_FETCH_FAILED:404',
    });
  });

  it('re-resolves the channel and retries the feed when a stored channel id goes stale', async () => {
    const db = createMockSupabase({
      user_source_subscriptions: [{
        id: 'sub_1',
        user_id: 'user_1',
        source_type: 'youtube',
        source_channel_id: 'channel_old',
        source_channel_url: 'https://youtube.com/@channel-handle',
        source_channel_title: 'Old Channel',
        source_page_id: 'page_1',
        auto_unlock_enabled: true,
        is_active: true,
        last_seen_published_at: null,
        last_seen_video_id: null,
        last_sync_error: null,
        created_at: '2026-03-19T09:00:00.000Z',
        updated_at: '2026-03-19T09:00:00.000Z',
      }],
      user_feed_items: [],
    }) as any;

    const fetchYouTubeFeed = vi
      .fn()
      .mockRejectedValueOnce(new Error('FEED_FETCH_FAILED:404'))
      .mockResolvedValueOnce({
        channelTitle: 'Recovered Channel',
        videos: [{
          videoId: 'video_new',
          url: 'https://youtube.com/watch?v=video_new',
          title: 'Video New',
          publishedAt: '2026-03-19T10:00:00.000Z',
          thumbnailUrl: null,
          durationSeconds: 120,
        }],
      });

    const syncOracleProductSubscriptions = vi.fn(async () => undefined);
    const service = createSourceSubscriptionSyncService({
      fetchYouTubeFeed,
      isNewerThanCheckpoint: vi.fn(() => false),
      ingestionMaxPerSubscription: 20,
      youtubeDataApiKey: '',
      generationDurationCapEnabled: false,
      generationMaxVideoSeconds: 2700,
      generationBlockUnknownDuration: true,
      generationDurationLookupTimeoutMs: 8000,
      fetchYouTubeDurationMap: vi.fn(async () => new Map()),
      fetchYouTubeVideoStates: vi.fn(async () => new Map()),
      upsertSourceItemFromVideo: vi.fn(),
      getExistingFeedItem: vi.fn(),
      ensureSourceItemUnlock: vi.fn(),
      computeUnlockCost: vi.fn(() => 1),
      attemptAutoUnlockForSourceItem: vi.fn(),
      getServiceSupabaseClient: () => null,
      enqueueSourceAutoUnlockRetryJob: vi.fn(),
      getSourceItemUnlockBySourceItemId: vi.fn(),
      getTranscriptCooldownState: vi.fn(() => ({ active: false })),
      isConfirmedNoTranscriptUnlock: vi.fn(() => false),
      suppressUnlockableFeedRowsForSourceItem: vi.fn(),
      insertFeedItem: vi.fn(),
      resolveYouTubeChannel: vi.fn(async () => ({
        channelId: 'channel_new',
        channelUrl: 'https://youtube.com/channel/channel_new',
        channelTitle: 'Recovered Channel',
      })),
      syncOracleProductSubscriptions,
    } as any);

    const result = await service.syncSingleSubscription(
      db,
      {
        id: 'sub_1',
        user_id: 'user_1',
        mode: 'auto',
        source_type: 'youtube',
        source_channel_id: 'channel_old',
        source_channel_url: 'https://youtube.com/@channel-handle',
        source_channel_title: 'Old Channel',
        source_page_id: 'page_1',
        auto_unlock_enabled: true,
        is_active: true,
        last_seen_published_at: null,
        last_seen_video_id: null,
        last_sync_error: null,
        created_at: '2026-03-19T09:00:00.000Z',
        updated_at: '2026-03-19T09:00:00.000Z',
      },
      { trigger: 'user_sync' },
    );

    expect(fetchYouTubeFeed).toHaveBeenNthCalledWith(1, 'channel_old', 20);
    expect(fetchYouTubeFeed).toHaveBeenNthCalledWith(2, 'channel_new', 20);
    expect(db.state.user_source_subscriptions[0]).toMatchObject({
      source_channel_id: 'channel_new',
      source_channel_url: 'https://youtube.com/channel/channel_new',
      source_channel_title: 'Recovered Channel',
    });
    expect(syncOracleProductSubscriptions).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      resultCode: 'bootstrap',
      channelTitle: 'Recovered Channel',
    });
  });
});
