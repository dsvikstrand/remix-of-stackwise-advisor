import { describe, expect, it, vi } from 'vitest';
import { createSourceSubscriptionSyncService } from '../../server/services/sourceSubscriptionSync';
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
});
