import { describe, expect, it } from 'vitest';
import { listWallBlueprintFeed, listWallForYouFeed } from '../../server/services/wallFeed';
import { createMockSupabase } from './helpers/mockSupabase';

function listBlueprintTagRowsFromState(db: any, blueprintIds: string[]) {
  const allowed = new Set(blueprintIds.map((value) => String(value || '').trim()).filter(Boolean));
  return (db.state.blueprint_tags || [])
    .filter((row: any) => allowed.has(String(row.blueprint_id || '').trim()))
    .map((row: any) => ({
      blueprint_id: String(row.blueprint_id || '').trim(),
      tag_id: String(row.tag_id || row.tags?.id || '').trim() || `tag:${String(row.tags?.slug || '').trim()}`,
      tag_slug: String(row.tag_slug || row.tags?.slug || '').trim(),
    }))
    .filter((row: any) => row.blueprint_id && row.tag_slug);
}

describe('wall feed service', () => {
  it('returns hydrated public wall cards with like state', async () => {
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
        { blueprint_id: 'bp_1', tags: { id: 'tag_fit', slug: 'fitness-training' } },
        { blueprint_id: 'bp_2', tags: { id: 'tag_cook', slug: 'cooking-home-kitchen' } },
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
          metadata: { view_count: 1200, source_channel_avatar_url: 'https://avatar/1.jpg' },
        },
        {
          id: 'source_2',
          source_page_id: 'page_2',
          source_channel_id: 'channel_2',
          source_channel_title: 'Channel 2',
          thumbnail_url: 'https://thumb/2.jpg',
          metadata: { view_count: 2400, source_channel_avatar_url: 'https://avatar/2.jpg' },
        },
      ],
      source_pages: [
        { id: 'page_1', external_id: 'channel_1', platform: 'youtube', avatar_url: 'https://avatar/1.jpg' },
        { id: 'page_2', external_id: 'channel_2', platform: 'youtube', avatar_url: 'https://avatar/2.jpg' },
      ],
      channel_candidates: [
        { user_feed_item_id: 'ufi_1', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-06T10:02:00.000Z' },
        { user_feed_item_id: 'ufi_2', channel_slug: 'cooking-home-kitchen', status: 'published', created_at: '2026-03-06T09:02:00.000Z' },
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
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'bp_1',
      user_liked: true,
      comments_count: 0,
      published_channel_slug: 'fitness-training',
      source_channel_title: 'Channel 1',
      source_channel_avatar_url: 'https://avatar/1.jpg',
      source_view_count: 1200,
    });
  });

  it('supports Oracle-first public feed and source readers for wall cards', async () => {
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
      ],
      blueprint_tags: [
        { blueprint_id: 'bp_1', tags: { id: 'tag_fit', slug: 'fitness-training' } },
      ],
      blueprint_likes: [
        { blueprint_id: 'bp_1', user_id: 'viewer_1' },
      ],
      channel_candidates: [
        { user_feed_item_id: 'ufi_1', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-06T10:02:00.000Z' },
      ],
      user_feed_items: [],
      source_items: [],
    }) as any;

    const items = await listWallBlueprintFeed({
      db,
      scope: 'all',
      sort: 'latest',
      viewerUserId: 'viewer_1',
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
      readPublicFeedRows: async () => ([
        {
          id: 'ufi_1',
          blueprint_id: 'bp_1',
          source_item_id: 'source_1',
          created_at: '2026-03-06T10:01:00.000Z',
        },
      ]),
      readSourceRows: async () => ([
        {
          id: 'source_1',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          thumbnail_url: 'https://thumb/1.jpg',
          metadata: { view_count: 1200, source_channel_avatar_url: 'https://avatar/1.jpg' },
        },
      ]),
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'bp_1',
      published_channel_slug: 'fitness-training',
      source_channel_title: 'Channel 1',
      source_thumbnail_url: 'https://thumb/1.jpg',
      source_channel_avatar_url: 'https://avatar/1.jpg',
    });
  });

  it('orders mixed For You cards by effective wall timestamp instead of generated-first bias', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'ufi_blueprint',
          user_id: 'viewer_1',
          source_item_id: 'source_1',
          blueprint_id: 'bp_1',
          state: 'my_feed_published',
          generated_at_on_wall: '2026-04-06T10:00:00.000Z',
          created_at: '2026-04-06T08:00:00.000Z',
        },
        {
          id: 'ufi_locked',
          user_id: 'viewer_1',
          source_item_id: 'source_2',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          generated_at_on_wall: null,
          created_at: '2026-04-06T11:00:00.000Z',
        },
      ],
      blueprints: [
        {
          id: 'bp_1',
          creator_user_id: 'creator_1',
          title: 'Generated Blueprint',
          preview_summary: 'Preview summary',
          banner_url: null,
          likes_count: 0,
        },
      ],
      blueprint_tags: [],
      blueprint_likes: [],
      source_items: [
        {
          id: 'source_1',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          title: 'Source One',
          source_url: 'https://youtube.com/watch?v=1',
          thumbnail_url: 'https://thumb/1.jpg',
          metadata: { view_count: 10, source_channel_avatar_url: 'https://avatar/1.jpg' },
        },
        {
          id: 'source_2',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          title: 'Locked Source',
          source_url: 'https://youtube.com/watch?v=2',
          thumbnail_url: 'https://thumb/2.jpg',
          metadata: { view_count: 11, source_channel_avatar_url: 'https://avatar/1.jpg' },
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_2',
          status: 'available',
          estimated_cost: 1,
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
        },
      ],
      user_source_subscriptions: [
        {
          user_id: 'viewer_1',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          is_active: true,
        },
      ],
      channel_candidates: [],
    }) as any;

    const items = await listWallForYouFeed({
      db,
      userId: 'viewer_1',
      normalizeTranscriptTruthStatus: () => 'ready',
      limit: 10,
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(items.map((item) => ({ kind: item.kind, id: item.feedItemId, createdAt: item.createdAt }))).toEqual([
      {
        kind: 'locked',
        id: 'ufi_locked',
        createdAt: '2026-04-06T11:00:00.000Z',
      },
      {
        kind: 'blueprint',
        id: 'ufi_blueprint',
        createdAt: '2026-04-06T10:00:00.000Z',
      },
    ]);
  });

  it('still resurfaces a newly promoted generated blueprint above older locked cards', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'ufi_blueprint',
          user_id: 'viewer_1',
          source_item_id: 'source_1',
          blueprint_id: 'bp_1',
          state: 'my_feed_published',
          generated_at_on_wall: '2026-04-06T12:00:00.000Z',
          created_at: '2026-04-06T08:00:00.000Z',
        },
        {
          id: 'ufi_locked',
          user_id: 'viewer_1',
          source_item_id: 'source_2',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          generated_at_on_wall: null,
          created_at: '2026-04-06T07:00:00.000Z',
        },
      ],
      blueprints: [
        {
          id: 'bp_1',
          creator_user_id: 'creator_1',
          title: 'Generated Blueprint',
          preview_summary: 'Preview summary',
          banner_url: null,
          likes_count: 0,
        },
      ],
      blueprint_tags: [],
      blueprint_likes: [],
      source_items: [
        {
          id: 'source_1',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          title: 'Source One',
          source_url: 'https://youtube.com/watch?v=1',
          thumbnail_url: 'https://thumb/1.jpg',
          metadata: { view_count: 10, source_channel_avatar_url: 'https://avatar/1.jpg' },
        },
        {
          id: 'source_2',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          title: 'Older Locked Source',
          source_url: 'https://youtube.com/watch?v=2',
          thumbnail_url: 'https://thumb/2.jpg',
          metadata: { view_count: 11, source_channel_avatar_url: 'https://avatar/1.jpg' },
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_2',
          status: 'available',
          estimated_cost: 1,
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
        },
      ],
      user_source_subscriptions: [
        {
          user_id: 'viewer_1',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          is_active: true,
        },
      ],
      channel_candidates: [],
    }) as any;

    const items = await listWallForYouFeed({
      db,
      userId: 'viewer_1',
      normalizeTranscriptTruthStatus: () => 'ready',
      limit: 10,
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(items.map((item) => item.feedItemId)).toEqual(['ufi_blueprint', 'ufi_locked']);
  });

  it('treats expired locked-card holds as unlockable instead of in progress', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'ufi_locked',
          user_id: 'viewer_1',
          source_item_id: 'source_2',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          generated_at_on_wall: null,
          created_at: '2026-04-06T11:00:00.000Z',
        },
      ],
      blueprints: [],
      blueprint_tags: [],
      blueprint_likes: [],
      source_items: [
        {
          id: 'source_2',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          source_channel_title: 'Channel 1',
          title: 'Locked Source',
          source_url: 'https://youtube.com/watch?v=2',
          thumbnail_url: 'https://thumb/2.jpg',
          metadata: { view_count: 11, source_channel_avatar_url: 'https://avatar/1.jpg' },
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_2',
          status: 'reserved',
          estimated_cost: 1,
          reservation_expires_at: '2026-04-06T10:00:00.000Z',
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
        },
      ],
      user_source_subscriptions: [
        {
          user_id: 'viewer_1',
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
          is_active: true,
        },
      ],
      channel_candidates: [],
    }) as any;

    const items = await listWallForYouFeed({
      db,
      userId: 'viewer_1',
      normalizeTranscriptTruthStatus: () => 'ready',
      limit: 10,
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'locked',
      feedItemId: 'ufi_locked',
      unlockInProgress: false,
    });
  });

  it('filters joined lane and channel scopes by published channel slug only', async () => {
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
        {
          id: 'bp_3',
          creator_user_id: 'creator_3',
          title: 'Unpublished Blueprint',
          sections_json: null,
          steps: null,
          llm_review: null,
          mix_notes: null,
          banner_url: null,
          likes_count: 0,
          created_at: '2026-03-06T08:00:00.000Z',
          is_public: true,
        },
      ],
      blueprint_tags: [
        { blueprint_id: 'bp_1', tags: { id: 'tag_fit', slug: 'fitness-training' } },
        { blueprint_id: 'bp_2', tags: { id: 'tag_cook', slug: 'cooking-home-kitchen' } },
        { blueprint_id: 'bp_3', tags: { id: 'tag_fit', slug: 'fitness-training' } },
      ],
      tags: [
        { id: 'tag_fit', slug: 'fitness-training' },
        { id: 'tag_cook', slug: 'cooking-home-kitchen' },
      ],
      profiles: [
        { user_id: 'creator_1', display_name: 'Creator 1', avatar_url: null },
        { user_id: 'creator_2', display_name: 'Creator 2', avatar_url: null },
        { user_id: 'creator_3', display_name: 'Creator 3', avatar_url: null },
      ],
      user_feed_items: [
        { id: 'ufi_1', blueprint_id: 'bp_1', source_item_id: 'source_1', created_at: '2026-03-06T10:01:00.000Z' },
        { id: 'ufi_2', blueprint_id: 'bp_2', source_item_id: 'source_2', created_at: '2026-03-06T09:01:00.000Z' },
        { id: 'ufi_3', blueprint_id: 'bp_3', source_item_id: 'source_3', created_at: '2026-03-06T08:01:00.000Z' },
      ],
      source_items: [
        { id: 'source_1', source_page_id: 'page_1', source_channel_id: 'channel_1', source_channel_title: 'Channel 1', thumbnail_url: null, metadata: null },
        { id: 'source_2', source_page_id: 'page_2', source_channel_id: 'channel_2', source_channel_title: 'Channel 2', thumbnail_url: null, metadata: null },
        { id: 'source_3', source_page_id: 'page_3', source_channel_id: 'channel_3', source_channel_title: 'Channel 3', thumbnail_url: null, metadata: null },
      ],
      source_pages: [
        { id: 'page_1', external_id: 'channel_1', platform: 'youtube', avatar_url: null },
        { id: 'page_2', external_id: 'channel_2', platform: 'youtube', avatar_url: null },
        { id: 'page_3', external_id: 'channel_3', platform: 'youtube', avatar_url: null },
      ],
      channel_candidates: [
        { user_feed_item_id: 'ufi_1', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-06T10:02:00.000Z' },
        { user_feed_item_id: 'ufi_2', channel_slug: 'cooking-home-kitchen', status: 'published', created_at: '2026-03-06T09:02:00.000Z' },
      ],
      tag_follows: [
        { user_id: 'viewer_1', tag_id: 'tag_fit' },
      ],
    }) as any;

    const joined = await listWallBlueprintFeed({
      db,
      scope: 'joined',
      sort: 'latest',
      viewerUserId: 'viewer_1',
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });
    expect(joined.map((item) => item.id)).toEqual(['bp_1']);

    const scoped = await listWallBlueprintFeed({
      db,
      scope: 'fitness-training',
      sort: 'latest',
      viewerUserId: 'viewer_1',
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });
    expect(scoped.map((item) => item.id)).toEqual(['bp_1']);

    const all = await listWallBlueprintFeed({
      db,
      scope: 'all',
      sort: 'latest',
      viewerUserId: 'viewer_1',
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });
    expect(all.map((item) => item.id)).toEqual(['bp_1', 'bp_2']);

    const alias = await listWallBlueprintFeed({
      db,
      scope: 'your-channels',
      sort: 'latest',
      viewerUserId: 'viewer_1',
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });
    expect(alias.map((item) => item.id)).toEqual(['bp_1']);
  });

  it('returns an empty joined feed when the user has not joined any channels', async () => {
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
      ],
      profiles: [
        { user_id: 'creator_1', display_name: 'Creator 1', avatar_url: null },
      ],
      user_feed_items: [
        { id: 'ufi_1', blueprint_id: 'bp_1', source_item_id: 'source_1', created_at: '2026-03-06T10:01:00.000Z' },
      ],
      source_items: [
        { id: 'source_1', source_page_id: 'page_1', source_channel_id: 'channel_1', source_channel_title: 'Channel 1', thumbnail_url: null, metadata: null },
      ],
      source_pages: [
        { id: 'page_1', external_id: 'channel_1', platform: 'youtube', avatar_url: null },
      ],
      channel_candidates: [
        { user_feed_item_id: 'ufi_1', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-06T10:02:00.000Z' },
      ],
      tag_follows: [],
    }) as any;

    const joined = await listWallBlueprintFeed({
      db,
      scope: 'joined',
      sort: 'latest',
      viewerUserId: 'viewer_1',
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(joined).toEqual([]);
  });

  it('batches tag lookups so joined and channel scopes do not fail on large tag sets', async () => {
    const tagRows = Array.from({ length: 81 }, (_, index) => ({
      id: `tag_${index + 1}`,
      slug: index === 0 ? 'fitness-training' : `extra-tag-${index + 1}`,
    }));
    const blueprints = Array.from({ length: 81 }, (_, index) => ({
      id: `bp_${index + 1}`,
      creator_user_id: `creator_${index + 1}`,
      title: `Blueprint ${index + 1}`,
      sections_json: null,
      steps: null,
      llm_review: null,
      mix_notes: null,
      banner_url: null,
      likes_count: 0,
      created_at: `2026-03-06T${String((index % 10) + 10).padStart(2, '0')}:00:00.000Z`,
      is_public: true,
    }));
    const baseDb = createMockSupabase({
      blueprints,
      blueprint_tags: blueprints.map((blueprint, index) => ({
        blueprint_id: blueprint.id,
        tags: { id: tagRows[index].id, slug: tagRows[index].slug },
      })),
      tags: tagRows,
      profiles: blueprints.map((blueprint, index) => ({
        user_id: blueprint.creator_user_id,
        display_name: `Creator ${index + 1}`,
        avatar_url: null,
      })),
      user_feed_items: blueprints.map((blueprint, index) => ({
        id: `ufi_${index + 1}`,
        blueprint_id: blueprint.id,
        source_item_id: `source_${index + 1}`,
        created_at: blueprint.created_at,
      })),
      source_items: blueprints.map((_, index) => ({
        id: `source_${index + 1}`,
        source_page_id: `page_${index + 1}`,
        source_channel_id: `channel_${index + 1}`,
        source_channel_title: `Channel ${index + 1}`,
        thumbnail_url: null,
        metadata: { source_channel_avatar_url: 'https://avatar/1.jpg' },
      })),
      source_pages: blueprints.map((_, index) => ({
        id: `page_${index + 1}`,
        external_id: `channel_${index + 1}`,
        platform: 'youtube',
        avatar_url: null,
      })),
      channel_candidates: blueprints.map((_, index) => ({
        user_feed_item_id: `ufi_${index + 1}`,
        channel_slug: index === 0 ? 'fitness-training' : 'ai-tools-automation',
        status: 'published',
        created_at: `2026-03-06T${String((index % 10) + 10).padStart(2, '0')}:05:00.000Z`,
      })),
      tag_follows: [
        { user_id: 'viewer_1', tag_id: 'tag_1' },
      ],
    }) as any;

    const db = {
      from(table: string) {
        const builder = baseDb.from(table);
        if (table === 'tags') {
          const originalIn = builder.in.bind(builder);
          builder.in = (field: string, values: unknown[]) => {
            if (Array.isArray(values) && values.length > 80) {
              throw new Error('tag lookup overflow');
            }
            return originalIn(field, values);
          };
        }
        return builder;
      },
    } as any;

    const joined = await listWallBlueprintFeed({
      db,
      scope: 'joined',
      sort: 'latest',
      viewerUserId: 'viewer_1',
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(baseDb, blueprintIds)),
    });
    expect(joined.map((item) => item.id)).toEqual(['bp_1']);

    const scoped = await listWallBlueprintFeed({
      db,
      scope: 'fitness-training',
      sort: 'latest',
      viewerUserId: 'viewer_1',
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(baseDb, blueprintIds)),
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
      user_feed_items: [
        { id: 'ufi_trending_1', blueprint_id: 'bp_high_recent', source_item_id: 'source_1', created_at: recentHigh },
        { id: 'ufi_trending_2', blueprint_id: 'bp_low_recent', source_item_id: 'source_2', created_at: recentLow },
      ],
      source_items: [
        { id: 'source_1', source_page_id: 'page_1', source_channel_id: 'channel_1', source_channel_title: 'Channel 1', thumbnail_url: null, metadata: null },
        { id: 'source_2', source_page_id: 'page_2', source_channel_id: 'channel_2', source_channel_title: 'Channel 2', thumbnail_url: null, metadata: null },
      ],
      source_pages: [
        { id: 'page_1', external_id: 'channel_1', platform: 'youtube', avatar_url: null },
        { id: 'page_2', external_id: 'channel_2', platform: 'youtube', avatar_url: null },
      ],
      channel_candidates: [
        { user_feed_item_id: 'ufi_trending_1', channel_slug: 'fitness-training', status: 'published', created_at: recentHigh },
        { user_feed_item_id: 'ufi_trending_2', channel_slug: 'cooking-home-kitchen', status: 'published', created_at: recentLow },
      ],
    }) as any;

    const items = await listWallBlueprintFeed({
      db,
      scope: 'all',
      sort: 'trending',
      viewerUserId: null,
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
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
          metadata: { view_count: 100, source_channel_avatar_url: 'https://avatar/1.jpg' },
        },
        {
          id: 'source_locked',
          source_channel_id: 'channel_1',
          source_page_id: 'page_1',
          source_url: 'https://youtube.com/watch?v=two',
          title: 'Video Two',
          source_channel_title: 'Channel 1',
          thumbnail_url: 'https://thumb/2.jpg',
          metadata: { view_count: 200, source_channel_avatar_url: 'https://avatar/1.jpg' },
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
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: 'blueprint',
      blueprintId: 'bp_1',
      likesCount: 7,
      userLiked: true,
      commentsCount: 0,
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
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'locked',
      sourceItemId: 'source_1',
    });
  });

  it('hides locked rows during transcript insufficient-context cooldowns', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'ufi_locked',
          user_id: 'viewer_1',
          source_item_id: 'source_short',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          last_decision_code: null,
          created_at: '2026-03-06T10:00:00.000Z',
        },
      ],
      source_items: [
        {
          id: 'source_short',
          source_channel_id: 'channel_1',
          source_page_id: 'page_1',
          source_url: 'https://youtube.com/watch?v=short',
          title: 'Short Video',
          source_channel_title: 'Channel 1',
          thumbnail_url: null,
          metadata: null,
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_short',
          status: 'available',
          estimated_cost: 1,
          blueprint_id: null,
          last_error_code: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
          transcript_status: null,
        },
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
      limit: 10,
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(items).toHaveLength(0);
  });

  it('includes personally unlocked blueprint rows from non-subscribed sources but not future locked rows from that source', async () => {
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'ufi_personal_blueprint',
          user_id: 'viewer_1',
          source_item_id: 'source_manual_blueprint',
          blueprint_id: 'bp_manual',
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-06T10:00:00.000Z',
        },
        {
          id: 'ufi_future_locked',
          user_id: 'viewer_1',
          source_item_id: 'source_future_locked',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          last_decision_code: null,
          created_at: '2026-03-06T09:00:00.000Z',
        },
      ],
      source_items: [
        {
          id: 'source_manual_blueprint',
          source_channel_id: 'channel_outside',
          source_page_id: 'page_outside',
          source_url: 'https://youtube.com/watch?v=manual',
          title: 'Manual Unlock',
          source_channel_title: 'Outside Channel',
          thumbnail_url: 'https://thumb/manual.jpg',
          metadata: null,
        },
        {
          id: 'source_future_locked',
          source_channel_id: 'channel_outside',
          source_page_id: 'page_outside',
          source_url: 'https://youtube.com/watch?v=future',
          title: 'Future Upload',
          source_channel_title: 'Outside Channel',
          thumbnail_url: 'https://thumb/future.jpg',
          metadata: null,
        },
      ],
      blueprints: [
        {
          id: 'bp_manual',
          creator_user_id: 'another_user',
          title: 'Shared Blueprint',
          banner_url: 'https://banner/manual.jpg',
          sections_json: { tags: ['ai-tools-automation'] },
          llm_review: 'Review',
          mix_notes: null,
          is_public: true,
          steps: [],
          likes_count: 0,
        },
      ],
      channel_candidates: [
        {
          id: 'candidate_manual',
          user_feed_item_id: 'ufi_personal_blueprint',
          channel_slug: 'ai-tools-automation',
          status: 'published',
          created_at: '2026-03-06T10:01:00.000Z',
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_future_locked',
          status: 'available',
          estimated_cost: 1,
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
        },
      ],
      blueprint_likes: [],
      blueprint_comments: [],
      user_source_subscriptions: [],
      source_pages: [
        { id: 'page_outside', external_id: 'channel_outside', platform: 'youtube', avatar_url: 'https://avatar/outside.jpg' },
      ],
    }) as any;

    const items = await listWallForYouFeed({
      db,
      userId: 'viewer_1',
      normalizeTranscriptTruthStatus: () => '',
      limit: 10,
      listBlueprintTagRows: ({ blueprintIds }) => Promise.resolve(listBlueprintTagRowsFromState(db, blueprintIds)),
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'blueprint',
      blueprintId: 'bp_manual',
      sourceItemId: 'source_manual_blueprint',
      sourceChannelTitle: 'Outside Channel',
    });
  });
});
