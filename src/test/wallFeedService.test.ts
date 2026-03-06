import { describe, expect, it } from 'vitest';
import { listWallBlueprintFeed, listWallForYouFeed } from '../../server/services/wallFeed';
import { createMockSupabase } from './helpers/mockSupabase';

describe('wall feed service', () => {
  it('returns hydrated public wall cards with comments and like state', async () => {
    const db = createMockSupabase({
      blueprints: [
        {
          id: 'bp_1',
          creator_user_id: 'creator_1',
          title: 'Blueprint One',
          sections_json: null,
          steps: null,
          llm_review: 'Review 1',
          mix_notes: null,
          banner_url: null,
          likes_count: 4,
          created_at: '2026-03-06T10:00:00.000Z',
          is_public: true,
        },
        {
          id: 'bp_2',
          creator_user_id: 'creator_2',
          title: 'Blueprint Two',
          sections_json: null,
          steps: null,
          llm_review: 'Review 2',
          mix_notes: null,
          banner_url: null,
          likes_count: 1,
          created_at: '2026-03-06T09:00:00.000Z',
          is_public: true,
        },
      ],
      blueprint_tags: [
        { blueprint_id: 'bp_1', tag_id: 'tag_fit' },
        { blueprint_id: 'bp_2', tag_id: 'tag_cook' },
      ],
      tags: [
        { id: 'tag_fit', slug: 'fitness-training' },
        { id: 'tag_cook', slug: 'cooking-home-kitchen' },
      ],
      blueprint_likes: [
        { blueprint_id: 'bp_1', user_id: 'viewer_1' },
      ],
      profiles: [
        { user_id: 'creator_1', display_name: 'Creator 1', avatar_url: 'https://img/1.png' },
        { user_id: 'creator_2', display_name: 'Creator 2', avatar_url: 'https://img/2.png' },
      ],
      user_feed_items: [
        { id: 'ufi_1', blueprint_id: 'bp_1', source_item_id: 'source_1', created_at: '2026-03-06T10:01:00.000Z' },
        { id: 'ufi_2', blueprint_id: 'bp_2', source_item_id: 'source_2', created_at: '2026-03-06T09:01:00.000Z' },
      ],
      source_items: [
        {
          id: 'source_1',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          thumbnail_url: 'https://thumb/1.jpg',
          metadata: { view_count: 1200 },
        },
        {
          id: 'source_2',
          source_page_id: 'page_2',
          source_channel_id: 'channel_2',
          source_channel_title: 'Channel 2',
          thumbnail_url: 'https://thumb/2.jpg',
          metadata: { view_count: 2400 },
        },
      ],
      source_pages: [
        { id: 'page_1', external_id: 'channel_1', platform: 'youtube', avatar_url: 'https://avatar/1.jpg' },
        { id: 'page_2', external_id: 'channel_2', platform: 'youtube', avatar_url: 'https://avatar/2.jpg' },
      ],
      channel_candidates: [
        { user_feed_item_id: 'ufi_1', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-06T10:02:00.000Z' },
      ],
      blueprint_comments: [
        { blueprint_id: 'bp_1' },
        { blueprint_id: 'bp_1' },
        { blueprint_id: 'bp_2' },
      ],
    }) as any;

    const items = await listWallBlueprintFeed({
      db,
      scope: 'all',
      sort: 'latest',
      viewerUserId: 'viewer_1',
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'bp_1',
      user_liked: true,
      comments_count: 2,
      published_channel_slug: 'fitness-training',
      source_channel_title: 'Channel 1',
      source_channel_avatar_url: 'https://avatar/1.jpg',
      source_view_count: 1200,
    });
  });

  it('prioritizes followed-tag posts in your-channels scope and filters specific channel scopes', async () => {
    const db = createMockSupabase({
      blueprints: [
        {
          id: 'bp_1',
          creator_user_id: 'creator_1',
          title: 'Fitness Blueprint',
          sections_json: null,
          steps: null,
          llm_review: null,
          mix_notes: null,
          banner_url: null,
          likes_count: 0,
          created_at: '2026-03-06T10:00:00.000Z',
          is_public: true,
        },
        {
          id: 'bp_2',
          creator_user_id: 'creator_2',
          title: 'Cooking Blueprint',
          sections_json: null,
          steps: null,
          llm_review: null,
          mix_notes: null,
          banner_url: null,
          likes_count: 0,
          created_at: '2026-03-06T09:00:00.000Z',
          is_public: true,
        },
      ],
      blueprint_tags: [
        { blueprint_id: 'bp_1', tag_id: 'tag_fit' },
        { blueprint_id: 'bp_2', tag_id: 'tag_cook' },
      ],
      tags: [
        { id: 'tag_fit', slug: 'fitness-training' },
        { id: 'tag_cook', slug: 'cooking-home-kitchen' },
      ],
      profiles: [
        { user_id: 'creator_1', display_name: 'Creator 1', avatar_url: null },
        { user_id: 'creator_2', display_name: 'Creator 2', avatar_url: null },
      ],
      user_feed_items: [],
      tag_follows: [
        { user_id: 'viewer_1', tag_id: 'tag_fit' },
      ],
    }) as any;

    const joined = await listWallBlueprintFeed({
      db,
      scope: 'your-channels',
      sort: 'latest',
      viewerUserId: 'viewer_1',
    });
    expect(joined.map((item) => item.id)).toEqual(['bp_1', 'bp_2']);

    const scoped = await listWallBlueprintFeed({
      db,
      scope: 'fitness-training',
      sort: 'latest',
      viewerUserId: 'viewer_1',
    });
    expect(scoped.map((item) => item.id)).toEqual(['bp_1']);
  });

  it('applies trending cutoff and sort ordering', async () => {
    const now = new Date();
    const recentHigh = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const recentLow = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const oldHigh = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const db = createMockSupabase({
      blueprints: [
        { id: 'bp_high_recent', creator_user_id: 'creator_1', title: 'High', sections_json: null, steps: null, llm_review: null, mix_notes: null, banner_url: null, likes_count: 10, created_at: recentHigh, is_public: true },
        { id: 'bp_low_recent', creator_user_id: 'creator_2', title: 'Low', sections_json: null, steps: null, llm_review: null, mix_notes: null, banner_url: null, likes_count: 2, created_at: recentLow, is_public: true },
        { id: 'bp_old', creator_user_id: 'creator_3', title: 'Old', sections_json: null, steps: null, llm_review: null, mix_notes: null, banner_url: null, likes_count: 99, created_at: oldHigh, is_public: true },
      ],
      profiles: [
        { user_id: 'creator_1', display_name: 'Creator 1', avatar_url: null },
        { user_id: 'creator_2', display_name: 'Creator 2', avatar_url: null },
        { user_id: 'creator_3', display_name: 'Creator 3', avatar_url: null },
      ],
      user_feed_items: [],
    }) as any;

    const items = await listWallBlueprintFeed({
      db,
      scope: 'all',
      sort: 'trending',
      viewerUserId: null,
    });

    expect(items.map((item) => item.id)).toEqual(['bp_high_recent', 'bp_low_recent']);
  });

  it('returns bounded for-you items with hydrated locked and blueprint rows', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'ufi_blueprint',
          user_id: 'viewer_1',
          source_item_id: 'source_blueprint',
          blueprint_id: 'bp_1',
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-06T10:00:00.000Z',
        },
        {
          id: 'ufi_locked',
          user_id: 'viewer_1',
          source_item_id: 'source_locked',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          last_decision_code: null,
          created_at: '2026-03-06T09:00:00.000Z',
        },
      ],
      source_items: [
        {
          id: 'source_blueprint',
          source_channel_id: 'channel_1',
          source_page_id: 'page_1',
          source_url: 'https://youtube.com/watch?v=one',
          title: 'Video One',
          source_channel_title: 'Channel 1',
          thumbnail_url: 'https://thumb/1.jpg',
          metadata: { view_count: 100 },
        },
        {
          id: 'source_locked',
          source_channel_id: 'channel_1',
          source_page_id: 'page_1',
          source_url: 'https://youtube.com/watch?v=two',
          title: 'Video Two',
          source_channel_title: 'Channel 1',
          thumbnail_url: 'https://thumb/2.jpg',
          metadata: { view_count: 200 },
        },
      ],
      blueprints: [
        {
          id: 'bp_1',
          creator_user_id: 'creator_1',
          title: 'Blueprint One',
          banner_url: 'https://banner/1.jpg',
          sections_json: { tags: ['fitness-training'] },
          llm_review: 'Review',
          mix_notes: 'Notes',
          is_public: true,
          steps: [],
          likes_count: 7,
        },
      ],
      channel_candidates: [
        {
          id: 'candidate_1',
          user_feed_item_id: 'ufi_blueprint',
          channel_slug: 'fitness-training',
          status: 'published',
          created_at: '2026-03-06T10:01:00.000Z',
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_locked',
          status: 'available',
          estimated_cost: 1,
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
        },
      ],
      blueprint_likes: [
        { blueprint_id: 'bp_1', user_id: 'viewer_1' },
      ],
      blueprint_comments: [
        { blueprint_id: 'bp_1' },
        { blueprint_id: 'bp_1' },
      ],
      user_source_subscriptions: [
        { user_id: 'viewer_1', source_page_id: 'page_1', source_channel_id: 'channel_1', is_active: true },
      ],
      source_pages: [
        { id: 'page_1', external_id: 'channel_1', platform: 'youtube', avatar_url: 'https://avatar/1.jpg' },
      ],
    }) as any;

    const items = await listWallForYouFeed({
      db,
      userId: 'viewer_1',
      normalizeTranscriptTruthStatus: () => '',
      limit: 2,
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: 'blueprint',
      blueprintId: 'bp_1',
      likesCount: 7,
      userLiked: true,
      commentsCount: 2,
      publishedChannelSlug: 'fitness-training',
    });
    expect(items[1]).toMatchObject({
      kind: 'locked',
      sourceItemId: 'source_locked',
      unlockCost: 1,
      sourceChannelAvatarUrl: 'https://avatar/1.jpg',
    });
  });

  it('respects the bounded limit for the for-you feed', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        { id: 'ufi_1', user_id: 'viewer_1', source_item_id: 'source_1', blueprint_id: null, state: 'my_feed_unlockable', last_decision_code: null, created_at: '2026-03-06T10:00:00.000Z' },
        { id: 'ufi_2', user_id: 'viewer_1', source_item_id: 'source_2', blueprint_id: null, state: 'my_feed_unlockable', last_decision_code: null, created_at: '2026-03-06T09:00:00.000Z' },
      ],
      source_items: [
        { id: 'source_1', source_channel_id: 'channel_1', source_page_id: 'page_1', source_url: 'https://youtube.com/watch?v=one', title: 'One', source_channel_title: 'Channel 1', thumbnail_url: null, metadata: null },
        { id: 'source_2', source_channel_id: 'channel_1', source_page_id: 'page_1', source_url: 'https://youtube.com/watch?v=two', title: 'Two', source_channel_title: 'Channel 1', thumbnail_url: null, metadata: null },
      ],
      source_item_unlocks: [
        { source_item_id: 'source_1', status: 'available', estimated_cost: 1, blueprint_id: null, last_error_code: null, transcript_status: null },
        { source_item_id: 'source_2', status: 'available', estimated_cost: 1, blueprint_id: null, last_error_code: null, transcript_status: null },
      ],
      user_source_subscriptions: [
        { user_id: 'viewer_1', source_page_id: 'page_1', source_channel_id: 'channel_1', is_active: true },
      ],
      source_pages: [
        { id: 'page_1', external_id: 'channel_1', platform: 'youtube', avatar_url: null },
      ],
    }) as any;

    const items = await listWallForYouFeed({
      db,
      userId: 'viewer_1',
      normalizeTranscriptTruthStatus: () => '',
      limit: 1,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'locked',
      sourceItemId: 'source_1',
    });
  });
});
