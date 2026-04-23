import { describe, expect, it, vi } from 'vitest';
import { registerFeedRoutes } from '../../server/routes/feed';
import { createMockSupabase } from './helpers/mockSupabase';

function createResponse(viewerUserId = 'user_1') {
  return {
    locals: {
      user: viewerUserId ? { id: viewerUserId } : null,
      authToken: 'token_1',
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
  const handlers: Record<string, (req: unknown, res: unknown) => Promise<unknown>> = {};
  return {
    handlers,
    get(path: string, ...args: Array<(req: unknown, res: unknown) => Promise<unknown>>) {
      handlers[`GET ${path}`] = args[args.length - 1];
      return this;
    },
    post(path: string, ...args: Array<(req: unknown, res: unknown) => Promise<unknown>>) {
      handlers[`POST ${path}`] = args[args.length - 1];
      return this;
    },
  };
}

function buildFeedRouteDeps(db: any) {
  return {
    saveGeneratedYouTubeBlueprintToFeed: async (_innerDb: any, input: {
      blueprintId: string;
      state?: string | null;
    }) => ({
      sourceItem: {
        id: 'source_saved',
        canonical_key: 'youtube:abc12345678',
        thumbnail_url: 'https://img.example.com/saved.jpg',
      },
      feedItem: {
        id: 'feed_saved',
        blueprint_id: input.blueprintId,
        state: input.state || 'my_feed_published',
      },
      existing: false,
    }),
    getFeedItemById: async (innerDb: any, input: { feedItemId: string; userId?: string | null }) => {
      let query = innerDb
        .from('user_feed_items')
        .select('id, user_id, source_item_id, blueprint_id, state, last_decision_code, created_at, updated_at')
        .eq('id', input.feedItemId);
      if (input.userId) {
        query = query.eq('user_id', input.userId);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    patchFeedItemById: async (innerDb: any, input: {
      feedItemId: string;
      userId?: string | null;
      patch: Record<string, unknown>;
    }) => {
      let query = innerDb
        .from('user_feed_items')
        .update(input.patch)
        .eq('id', input.feedItemId);
      if (input.userId) {
        query = query.eq('user_id', input.userId);
      }
      const { data, error } = await query
        .select('id, user_id, source_item_id, blueprint_id, state, last_decision_code, created_at, updated_at')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    readSourceRows: async ({ db: innerDb, sourceIds }: { db: any; sourceIds: string[] }) => {
      if (!sourceIds.length) return [];
      const { data, error } = await innerDb
        .from('source_items')
        .select('id, source_channel_id, source_page_id, source_url, title, source_channel_title, thumbnail_url, metadata, source_native_id')
        .in('id', sourceIds);
      if (error) throw error;
      return data || [];
    },
  };
}

describe('my feed route', () => {
  it('returns hydrated items and hides transcript-unavailable source-only rows', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'feed_blueprint',
          user_id: 'user_1',
          source_item_id: 'source_ready',
          blueprint_id: 'bp_1',
          state: 'channel_published',
          last_decision_code: 'ALL_GATES_PASS',
          created_at: '2026-03-20T10:00:00.000Z',
        },
        {
          id: 'feed_locked',
          user_id: 'user_1',
          source_item_id: 'source_locked',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          last_decision_code: null,
          created_at: '2026-03-20T09:00:00.000Z',
        },
        {
          id: 'feed_hidden',
          user_id: 'user_1',
          source_item_id: 'source_hidden',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          last_decision_code: null,
          created_at: '2026-03-20T08:00:00.000Z',
        },
      ],
      source_items: [
        {
          id: 'source_ready',
          source_channel_id: 'UC_ready',
          source_page_id: 'page_ready',
          source_url: 'https://www.youtube.com/watch?v=ready123',
          title: 'Ready video',
          source_channel_title: 'Ready Creator',
          thumbnail_url: 'https://img.example.com/ready.jpg',
          metadata: {
            channel_banner_url: 'https://img.example.com/ready-banner.jpg',
            view_count: 1200,
            source_channel_avatar_url: 'https://img.example.com/ready-avatar.jpg',
          },
        },
        {
          id: 'source_locked',
          source_channel_id: 'UC_locked',
          source_page_id: 'page_locked',
          source_url: 'https://www.youtube.com/watch?v=locked123',
          title: 'Locked video',
          source_channel_title: 'Locked Creator',
          thumbnail_url: 'https://img.example.com/locked.jpg',
          metadata: {
            source_channel_avatar_url: 'https://img.example.com/locked-avatar.jpg',
          },
        },
        {
          id: 'source_hidden',
          source_channel_id: 'UC_hidden',
          source_page_id: 'page_hidden',
          source_url: 'https://www.youtube.com/watch?v=hidden123',
          title: 'Hidden video',
          source_channel_title: 'Hidden Creator',
          thumbnail_url: 'https://img.example.com/hidden.jpg',
          metadata: {},
        },
      ],
      blueprints: [
        {
          id: 'bp_1',
          creator_user_id: 'creator_1',
          title: 'Blueprint One',
          banner_url: 'https://img.example.com/banner.jpg',
          llm_review: 'Review text',
          preview_summary: 'Stored preview',
          is_public: true,
        },
      ],
      channel_candidates: [
        {
          id: 'candidate_1',
          user_feed_item_id: 'feed_blueprint',
          channel_slug: 'fitness',
          status: 'published',
          created_at: '2026-03-20T10:05:00.000Z',
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_ready',
          status: 'ready',
          estimated_cost: 1,
          blueprint_id: 'bp_1',
          last_error_code: null,
          transcript_status: null,
        },
        {
          source_item_id: 'source_locked',
          status: 'available',
          estimated_cost: 1,
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
        },
        {
          source_item_id: 'source_hidden',
          status: 'available',
          estimated_cost: 1,
          blueprint_id: null,
          last_error_code: 'TRANSCRIPT_UNAVAILABLE',
          transcript_status: null,
        },
      ],
      blueprint_tags: [
        { blueprint_id: 'bp_1', tags: { slug: 'fitness' } },
      ],
      tags: [
        { id: 'tag_1', slug: 'fitness' },
      ],
      source_pages: [
        {
          id: 'page_ready',
          platform: 'youtube',
          external_id: 'UC_ready',
          avatar_url: 'https://img.example.com/ready-avatar.jpg',
        },
        {
          id: 'page_locked',
          platform: 'youtube',
          external_id: 'UC_locked',
          avatar_url: 'https://img.example.com/locked-avatar.jpg',
        },
        {
          id: 'page_hidden',
          platform: 'youtube',
          external_id: 'UC_hidden',
          avatar_url: 'https://img.example.com/hidden-avatar.jpg',
        },
      ],
    }) as any;

    registerFeedRoutes(app as any, {
      autoChannelPipelineEnabled: true,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      ...buildFeedRouteDeps(db),
      createBlueprintFromVideo: async () => ({ blueprintId: 'bp_new', runId: null }),
      runAutoChannelForFeedItem: async () => null,
    });

    const handler = app.handlers['GET /api/my-feed'];
    const res = createResponse('user_1');
    await handler({} as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: expect.any(Array),
      },
    });

    const items = (res.body as { data: { items: MyFeedRouteItem[] } }).data.items;
    expect(items).toHaveLength(2);

    expect(items[0]).toMatchObject({
      id: 'feed_blueprint',
      state: 'channel_published',
      source: {
        sourcePagePath: '/s/youtube/UC_ready',
        sourceChannelAvatarUrl: 'https://img.example.com/ready-avatar.jpg',
        channelBannerUrl: 'https://img.example.com/ready-banner.jpg',
        viewCount: 1200,
      },
      blueprint: {
        id: 'bp_1',
        title: 'Blueprint One',
        previewSummary: 'Stored preview',
        tags: ['fitness'],
      },
      candidate: {
        id: 'candidate_1',
        channelSlug: 'fitness',
        status: 'published',
      },
    });

    expect(items[1]).toMatchObject({
      id: 'feed_locked',
      state: 'my_feed_unlockable',
      source: {
        sourcePagePath: '/s/youtube/UC_locked',
        unlockStatus: 'available',
        unlockInProgress: false,
      },
      blueprint: null,
      candidate: null,
    });

    expect(items.some((item) => item.id === 'feed_hidden')).toBe(false);
  });

  it('requires auth for the read endpoint', async () => {
    const app = createMockApp();
    registerFeedRoutes(app as any, {
      autoChannelPipelineEnabled: true,
      getAuthedSupabaseClient: () => null,
      getServiceSupabaseClient: () => null,
      ...buildFeedRouteDeps(createMockSupabase() as any),
      createBlueprintFromVideo: async () => ({ blueprintId: 'bp_new', runId: null }),
      runAutoChannelForFeedItem: async () => null,
    });

    const handler = app.handlers['GET /api/my-feed'];
    const res = createResponse('');
    await handler({} as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'AUTH_REQUIRED',
    });
  });

  it('uses injected Oracle-aware feed reads for the read endpoint', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      user_feed_items: [],
      source_items: [
        {
          id: 'source_oracle',
          source_channel_id: 'UC_oracle',
          source_page_id: 'page_oracle',
          source_url: 'https://www.youtube.com/watch?v=oracle123',
          title: 'Oracle video',
          source_channel_title: 'Oracle Creator',
          thumbnail_url: 'https://img.example.com/oracle.jpg',
          metadata: {},
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_oracle',
          status: 'available',
          estimated_cost: 1,
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
        },
      ],
      blueprints: [],
      channel_candidates: [],
      blueprint_tags: [],
      tags: [],
      source_pages: [
        {
          id: 'page_oracle',
          platform: 'youtube',
          external_id: 'UC_oracle',
          avatar_url: 'https://img.example.com/oracle-avatar.jpg',
        },
      ],
    }) as any;

    registerFeedRoutes(app as any, {
      autoChannelPipelineEnabled: true,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      readFeedRows: async () => [
        {
          id: 'feed_oracle',
          user_id: 'user_1',
          source_item_id: 'source_oracle',
          blueprint_id: null,
          state: 'my_feed_unlockable',
          last_decision_code: null,
          created_at: '2026-03-20T09:30:00.000Z',
          updated_at: '2026-03-20T09:30:00.000Z',
        },
      ],
      ...buildFeedRouteDeps(db),
      createBlueprintFromVideo: async () => ({ blueprintId: 'bp_new', runId: null }),
      runAutoChannelForFeedItem: async () => null,
    });

    const handler = app.handlers['GET /api/my-feed'];
    const res = createResponse('user_1');
    await handler({} as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [
          expect.objectContaining({
            id: 'feed_oracle',
            state: 'my_feed_unlockable',
          }),
        ],
      },
    });
  });

  it('skips a pending feed item through the shared feed patch helper path', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'feed_pending',
          user_id: 'user_1',
          source_item_id: 'source_1',
          blueprint_id: null,
          state: 'my_feed_pending_accept',
          last_decision_code: null,
          created_at: '2026-03-20T09:00:00.000Z',
          updated_at: '2026-03-20T09:00:00.000Z',
        },
      ],
    }) as any;

    registerFeedRoutes(app as any, {
      autoChannelPipelineEnabled: true,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      ...buildFeedRouteDeps(db),
      createBlueprintFromVideo: async () => ({ blueprintId: 'bp_new', runId: null }),
      runAutoChannelForFeedItem: async () => null,
    });

    const handler = app.handlers['POST /api/my-feed/items/:id/skip'];
    const res = createResponse('user_1');
    await handler({ params: { id: 'feed_pending' } } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        user_feed_item_id: 'feed_pending',
        state: 'my_feed_skipped',
      },
    });
    expect(db.state.user_feed_items[0]).toMatchObject({
      id: 'feed_pending',
      state: 'my_feed_skipped',
      last_decision_code: 'SKIPPED_BY_USER',
    });
  });

  it('serves source-item lookup through injected Oracle-aware feed/source readers', async () => {
    const app = createMockApp();
    const db = createMockSupabase({}) as any;
    const readPublicFeedRows = vi.fn(async () => [
      {
        id: 'feed_1',
        user_id: 'user_1',
        source_item_id: 'source_lookup',
        blueprint_id: 'bp_lookup',
        state: 'my_feed_published',
        created_at: '2026-03-20T10:00:00.000Z',
      },
    ]);
    const readSourceRows = vi.fn(async () => [
      {
        id: 'source_lookup',
        source_page_id: 'page_lookup',
        source_channel_id: 'UC_lookup',
        source_url: 'https://www.youtube.com/watch?v=lookup123',
        title: 'Lookup video',
        source_channel_title: 'Lookup creator',
        thumbnail_url: 'https://img.example.com/lookup.jpg',
        metadata: {},
        source_native_id: 'lookup123',
      },
    ]);

    registerFeedRoutes(app as any, {
      autoChannelPipelineEnabled: true,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      ...buildFeedRouteDeps(db),
      readPublicFeedRows,
      readSourceRows,
      createBlueprintFromVideo: async () => ({ blueprintId: 'bp_new', runId: null }),
      runAutoChannelForFeedItem: async () => null,
    });

    const handler = app.handlers['POST /api/source-items/lookup'];
    const res = createResponse('user_1');
    await handler({
      body: {
        blueprint_ids: ['bp_lookup'],
      },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(readPublicFeedRows).toHaveBeenCalledTimes(1);
    expect(readSourceRows).toHaveBeenCalledWith({
      db,
      sourceIds: ['source_lookup'],
    });
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            id: 'source_lookup',
          },
        ],
        source_item_id_by_blueprint_id: {
          bp_lookup: 'source_lookup',
        },
      },
    });
  });

  it('saves generated YouTube blueprints through the injected Oracle-aware server path', async () => {
    const app = createMockApp();
    const db = createMockSupabase({}) as any;
    const saveGeneratedYouTubeBlueprintToFeed = vi.fn(async () => ({
      sourceItem: {
        id: 'source_saved',
        canonical_key: 'youtube:abc12345678',
        thumbnail_url: 'https://img.example.com/saved.jpg',
      },
      feedItem: {
        id: 'feed_saved',
        blueprint_id: 'bp_saved',
        state: 'my_feed_published',
      },
      existing: false,
    }));

    registerFeedRoutes(app as any, {
      autoChannelPipelineEnabled: true,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      ...buildFeedRouteDeps(db),
      saveGeneratedYouTubeBlueprintToFeed,
      createBlueprintFromVideo: async () => ({ blueprintId: 'bp_new', runId: null }),
      runAutoChannelForFeedItem: async () => null,
    });

    const handler = app.handlers['POST /api/my-feed/youtube-save'];
    const res = createResponse('user_1');
    await handler({
      body: {
        video_url: 'https://www.youtube.com/watch?v=abc12345678',
        title: 'Saved blueprint',
        blueprint_id: 'bp_saved',
        source_channel_id: 'UC_saved',
        source_channel_title: 'Saved Creator',
        source_channel_url: 'https://youtube.com/@saved',
        metadata: {
          run_id: 'run_1',
        },
        state: 'my_feed_published',
      },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(saveGeneratedYouTubeBlueprintToFeed).toHaveBeenCalledWith(db, expect.objectContaining({
      userId: 'user_1',
      videoUrl: 'https://www.youtube.com/watch?v=abc12345678',
      title: 'Saved blueprint',
      blueprintId: 'bp_saved',
      sourceChannelId: 'UC_saved',
      sourceChannelTitle: 'Saved Creator',
      sourceChannelUrl: 'https://youtube.com/@saved',
      state: 'my_feed_published',
    }));
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        source_item: {
          id: 'source_saved',
        },
        feed_item: {
          id: 'feed_saved',
          blueprint_id: 'bp_saved',
          state: 'my_feed_published',
        },
        existing: false,
      },
    });
  });
});

type MyFeedRouteItem = {
  id: string;
  state: string;
  source: {
    sourcePagePath: string | null;
    sourceChannelAvatarUrl: string | null;
    channelBannerUrl: string | null;
    viewCount: number | null;
    unlockStatus: string | null;
    unlockInProgress: boolean;
  } | null;
  blueprint: {
    id: string;
    title: string;
    previewSummary: string;
    tags: string[];
  } | null;
  candidate: {
    id: string;
    channelSlug: string;
    status: string;
  } | null;
};
