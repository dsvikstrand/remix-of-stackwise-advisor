import { describe, expect, it } from 'vitest';
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
