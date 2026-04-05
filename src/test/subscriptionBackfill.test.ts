import { describe, expect, it, vi } from 'vitest';
import { backfillSubscribedCreatorForSparseForYou } from '../../server/services/subscriptionBackfill';
import { createMockSupabase } from './helpers/mockSupabase';

describe('subscription backfill service', () => {
  it('adds locked rows and upgrades ready blueprint rows when For You is sparse', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'feed_existing_locked',
          user_id: 'user_1',
          source_item_id: 'source_video_existing_locked',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          created_at: '2026-04-05T09:00:00.000Z',
          updated_at: '2026-04-05T09:00:00.000Z',
        },
      ],
    });
    const sourcePageDb = createMockSupabase({});
    const insertFeedItem = vi.fn(async (feedDb: any, input: any) => {
      await feedDb.from('user_feed_items').insert({
        user_id: input.userId,
        source_item_id: input.sourceItemId,
        blueprint_id: input.blueprintId,
        state: input.state,
        last_decision_code: null,
      }).select('id').single();
      return { id: `feed_${input.sourceItemId}` };
    });
    const upsertFeedItemWithBlueprint = vi.fn(async (feedDb: any, input: any) => {
      await feedDb.from('user_feed_items').upsert({
        user_id: input.userId,
        source_item_id: input.sourceItemId,
        blueprint_id: input.blueprintId,
        state: input.state,
        last_decision_code: null,
      }, { onConflict: 'user_id,source_item_id' }).select('id').single();
      return { id: `feed_${input.sourceItemId}` };
    });

    const result = await backfillSubscribedCreatorForSparseForYou({
      db,
      sourcePageDb,
      userId: 'user_1',
      sourcePageId: 'page_1',
      channelId: 'channel_1',
      channelTitle: 'Creator 1',
      youtubeDataApiKey: 'yt-key',
      listYouTubeSourceVideos: vi.fn(async () => ({
        results: [
          {
            video_id: 'video_ready',
            video_url: 'https://youtube.com/watch?v=video_ready',
            title: 'Ready Video',
            channel_id: 'channel_1',
            channel_title: 'Creator 1',
          },
          {
            video_id: 'video_locked',
            video_url: 'https://youtube.com/watch?v=video_locked',
            title: 'Locked Video',
            channel_id: 'channel_1',
            channel_title: 'Creator 1',
          },
          {
            video_id: 'video_existing_locked',
            video_url: 'https://youtube.com/watch?v=video_existing_locked',
            title: 'Existing Locked Video',
            channel_id: 'channel_1',
            channel_title: 'Creator 1',
          },
        ],
        nextPageToken: null,
      })),
      upsertSourceItemFromVideo: vi.fn(async (_db: any, input: any) => ({
        id: `source_${input.video.videoId}`,
      })),
      resolveVariantOrReady: vi.fn(async ({ sourceItemId }: { sourceItemId: string }) => {
        if (sourceItemId === 'source_video_ready') {
          return { state: 'ready', blueprintId: 'bp_ready' };
        }
        return null;
      }),
      insertFeedItem,
      upsertFeedItemWithBlueprint,
    });

    expect(result).toMatchObject({
      applied: true,
      reason: 'completed',
      candidateCount: 3,
      insertedReadyCount: 1,
      insertedLockedCount: 1,
      skippedExistingCount: 1,
    });
    expect(upsertFeedItemWithBlueprint).toHaveBeenCalledWith(db, expect.objectContaining({
      userId: 'user_1',
      sourceItemId: 'source_video_ready',
      blueprintId: 'bp_ready',
      state: 'my_feed_published',
    }));
    expect(insertFeedItem).toHaveBeenCalledWith(db, expect.objectContaining({
      userId: 'user_1',
      sourceItemId: 'source_video_locked',
      blueprintId: null,
      state: 'my_feed_unlockable',
    }));
  });

  it('does nothing when the user already has at least 20 visible For You cards', async () => {
    const db = createMockSupabase({
      user_feed_items: Array.from({ length: 20 }, (_, index) => ({
        id: `feed_${index + 1}`,
        user_id: 'user_1',
        source_item_id: `source_${index + 1}`,
        blueprint_id: null,
        state: 'my_feed_unlockable',
        created_at: '2026-04-05T09:00:00.000Z',
        updated_at: '2026-04-05T09:00:00.000Z',
      })),
    });
    const listYouTubeSourceVideos = vi.fn(async () => ({ results: [], nextPageToken: null }));

    const result = await backfillSubscribedCreatorForSparseForYou({
      db,
      sourcePageDb: createMockSupabase({}),
      userId: 'user_1',
      sourcePageId: 'page_1',
      channelId: 'channel_1',
      channelTitle: 'Creator 1',
      youtubeDataApiKey: 'yt-key',
      listYouTubeSourceVideos,
      upsertSourceItemFromVideo: vi.fn(),
      resolveVariantOrReady: vi.fn(async () => null),
      insertFeedItem: vi.fn(async () => null),
      upsertFeedItemWithBlueprint: vi.fn(async () => null),
    });

    expect(result).toMatchObject({
      applied: false,
      reason: 'threshold_met',
      forYouCountBefore: 20,
    });
    expect(listYouTubeSourceVideos).not.toHaveBeenCalled();
  });
});
