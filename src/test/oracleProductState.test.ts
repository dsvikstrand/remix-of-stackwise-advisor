import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleProductActiveSubscriptions,
  getOracleProductSubscriptionState,
  getOracleProductUnlockBySourceItemId,
  listOracleProductActiveSubscriptionsForUser,
  listOracleProductFeedRows,
  listOracleProductSourceItems,
  syncOracleProductStateFromSupabase,
  upsertOracleProductFeedRows,
  upsertOracleProductSourceItemRows,
  upsertOracleProductSubscriptionRows,
  upsertOracleProductUnlockRows,
} from '../../server/services/oracleProductState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-product-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle product state', () => {
  it('upserts and serves mirrored subscription/source/unlock/feed state', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleProductSubscriptionRows({
        controlDb,
        rows: [{
          id: 'sub_1',
          user_id: 'user_1',
          source_type: 'youtube',
          source_channel_id: 'channel_1',
          source_page_id: 'page_1',
          is_active: true,
          auto_unlock_enabled: true,
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        }],
      });
      await upsertOracleProductSourceItemRows({
        controlDb,
        rows: [{
          id: 'source_1',
          source_type: 'youtube',
          source_native_id: 'video_1',
          source_channel_id: 'channel_1',
          source_page_id: 'page_1',
          source_url: 'https://youtube.com/watch?v=video_1',
          title: 'Video 1',
          metadata: { source_channel_avatar_url: 'https://img.example.com/avatar.jpg' },
          created_at: '2026-04-01T10:05:00.000Z',
          updated_at: '2026-04-01T10:05:00.000Z',
        }],
      });
      await upsertOracleProductUnlockRows({
        controlDb,
        rows: [{
          id: 'unlock_1',
          source_item_id: 'source_1',
          source_page_id: 'page_1',
          status: 'ready',
          estimated_cost: 1,
          blueprint_id: 'bp_1',
          last_error_code: null,
          transcript_status: null,
          created_at: '2026-04-01T10:06:00.000Z',
          updated_at: '2026-04-01T10:06:00.000Z',
        }],
      });
      await upsertOracleProductFeedRows({
        controlDb,
        rows: [{
          id: 'feed_1',
          user_id: 'user_1',
          source_item_id: 'source_1',
          blueprint_id: 'bp_1',
          state: 'my_feed_published',
          last_decision_code: null,
          created_at: '2026-04-01T10:07:00.000Z',
          updated_at: '2026-04-01T10:07:00.000Z',
        }],
      });

      const subscriptionState = await getOracleProductSubscriptionState({
        controlDb,
        userId: 'user_1',
        sourcePageId: 'page_1',
      });
      const followerCount = await countOracleProductActiveSubscriptions({
        controlDb,
        sourcePageId: 'page_1',
      });
      const subscriptions = await listOracleProductActiveSubscriptionsForUser({
        controlDb,
        userId: 'user_1',
      });
      const sourceRows = await listOracleProductSourceItems({
        controlDb,
        ids: ['source_1'],
      });
      const sourceRowsByVideo = await listOracleProductSourceItems({
        controlDb,
        sourceNativeId: 'video_1',
      });
      const unlock = await getOracleProductUnlockBySourceItemId({
        controlDb,
        sourceItemId: 'source_1',
      });
      const feedRows = await listOracleProductFeedRows({
        controlDb,
        userId: 'user_1',
        limit: 10,
      });
      const publicFeedRows = await listOracleProductFeedRows({
        controlDb,
        blueprintIds: ['bp_1'],
        state: 'my_feed_published',
        limit: 10,
      });

      expect(subscriptionState).toMatchObject({
        id: 'sub_1',
        is_active: true,
      });
      expect(followerCount).toBe(1);
      expect(subscriptions).toEqual([
        {
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
        },
      ]);
      expect(sourceRows[0]).toMatchObject({
        id: 'source_1',
        source_native_id: 'video_1',
      });
      expect(sourceRowsByVideo[0]?.id).toBe('source_1');
      expect(unlock).toMatchObject({
        id: 'unlock_1',
        status: 'ready',
        blueprint_id: 'bp_1',
      });
      expect(feedRows[0]).toMatchObject({
        id: 'feed_1',
        state: 'my_feed_published',
      });
      expect(publicFeedRows[0]).toMatchObject({
        id: 'feed_1',
        blueprint_id: 'bp_1',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('bootstraps mirrored product state from Supabase rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      user_source_subscriptions: [
        {
          id: 'sub_active',
          user_id: 'user_1',
          source_type: 'youtube',
          source_channel_id: 'channel_1',
          source_page_id: 'page_1',
          is_active: true,
          updated_at: '2026-04-01T11:00:00.000Z',
          created_at: '2026-04-01T11:00:00.000Z',
        },
      ],
      source_items: [
        {
          id: 'source_bootstrap',
          source_type: 'youtube',
          source_native_id: 'video_bootstrap',
          source_channel_id: 'channel_1',
          source_page_id: 'page_1',
          source_url: 'https://youtube.com/watch?v=video_bootstrap',
          title: 'Bootstrap Video',
          updated_at: '2026-04-01T11:05:00.000Z',
          created_at: '2026-04-01T11:05:00.000Z',
        },
      ],
      source_item_unlocks: [
        {
          id: 'unlock_bootstrap',
          source_item_id: 'source_bootstrap',
          source_page_id: 'page_1',
          status: 'available',
          estimated_cost: 1,
          updated_at: '2026-04-01T11:06:00.000Z',
          created_at: '2026-04-01T11:06:00.000Z',
        },
      ],
      user_feed_items: [
        {
          id: 'feed_bootstrap',
          user_id: 'user_1',
          source_item_id: 'source_bootstrap',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          created_at: '2026-04-01T11:07:00.000Z',
          updated_at: '2026-04-01T11:07:00.000Z',
        },
      ],
    }) as any;

    try {
      const result = await syncOracleProductStateFromSupabase({
        controlDb,
        db,
        recentLimit: 500,
      });

      expect(result).toMatchObject({
        subscriptionCount: 1,
        sourceItemCount: 1,
        unlockCount: 1,
        feedCount: 1,
      });

      const mirroredFeedRows = await listOracleProductFeedRows({
        controlDb,
        userId: 'user_1',
        limit: 10,
      });
      expect(mirroredFeedRows[0]).toMatchObject({
        id: 'feed_bootstrap',
        state: 'my_feed_unlockable',
      });
    } finally {
      await controlDb.close();
    }
  });
});
