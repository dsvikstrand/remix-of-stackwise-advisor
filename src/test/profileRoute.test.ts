import { describe, expect, it } from 'vitest';
import { registerProfileRoutes } from '../../server/routes/profile';
import { createMockSupabase } from './helpers/mockSupabase';

function createResponse(viewerUserId = 'viewer_1') {
  return {
    locals: {
      user: { id: viewerUserId },
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
  };
}

describe('profile feed route', () => {
  it('returns creator rows plus generated blueprints for profile history', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      profiles: [
        {
          id: 'profile_1',
          user_id: 'user_1',
          is_public: true,
        },
      ],
      user_feed_items: [
        {
          id: 'feed_subscription',
          user_id: 'user_1',
          source_item_id: 'source_creator',
          blueprint_id: null,
          state: 'subscription_notice',
          last_decision_code: null,
          created_at: '2026-03-10T12:00:00.000Z',
        },
        {
          id: 'feed_generated_missing_blueprint',
          user_id: 'user_1',
          source_item_id: 'source_video',
          blueprint_id: null,
          state: 'channel_published',
          last_decision_code: null,
          created_at: '2026-03-10T11:00:00.000Z',
        },
        {
          id: 'feed_transient_source_only',
          user_id: 'user_1',
          source_item_id: 'source_transient',
          blueprint_id: null,
          state: 'my_feed_generating',
          last_decision_code: null,
          created_at: '2026-03-10T10:00:00.000Z',
        },
      ],
      source_items: [
        {
          id: 'source_creator',
          source_page_id: 'page_creator',
          source_channel_id: 'UC_creator',
          source_url: 'https://www.youtube.com/channel/UC_creator',
          title: 'You are now subscribing to Creator Alpha',
          source_channel_title: 'Creator Alpha',
          thumbnail_url: 'https://img.example.com/creator-thumb.jpg',
          metadata: {
            source_channel_avatar_url: 'https://img.example.com/creator-avatar.jpg',
          },
        },
        {
          id: 'source_video',
          source_page_id: 'page_creator',
          source_channel_id: 'UC_creator',
          source_url: 'https://www.youtube.com/watch?v=abc123',
          title: 'Video title',
          source_channel_title: 'Creator Alpha',
          thumbnail_url: 'https://img.example.com/video-thumb.jpg',
          metadata: {},
        },
        {
          id: 'source_transient',
          source_page_id: 'page_creator',
          source_channel_id: 'UC_creator',
          source_url: 'https://www.youtube.com/watch?v=def456',
          title: 'Transient video',
          source_channel_title: 'Creator Alpha',
          thumbnail_url: 'https://img.example.com/video-thumb-2.jpg',
          metadata: {},
        },
      ],
      source_pages: [
        {
          id: 'page_creator',
          platform: 'youtube',
          external_id: 'UC_creator',
          avatar_url: 'https://img.example.com/source-page-avatar.jpg',
        },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_video',
          status: 'ready',
          blueprint_id: 'bp_1',
          last_error_code: null,
          transcript_status: null,
        },
        {
          source_item_id: 'source_transient',
          status: 'processing',
          blueprint_id: null,
          last_error_code: null,
          transcript_status: null,
        },
      ],
      blueprints: [
        {
          id: 'bp_1',
          creator_user_id: 'user_1',
          title: 'Blueprint One',
          banner_url: 'https://img.example.com/banner.jpg',
          llm_review: 'Review body',
          mix_notes: 'Mix notes',
          is_public: true,
          sections_json: { summary: [] },
          steps: [{ text: 'Step 1' }],
        },
      ],
      blueprint_tags: [
        {
          blueprint_id: 'bp_1',
          tags: [{ slug: 'fitness' }],
        },
      ],
      channel_candidates: [
        {
          id: 'candidate_1',
          user_feed_item_id: 'feed_generated_missing_blueprint',
          channel_slug: 'fitness',
          status: 'published',
          created_at: '2026-03-10T11:05:00.000Z',
        },
      ],
    }) as any;

    registerProfileRoutes(app as any, {
      getServiceSupabaseClient: () => db,
      normalizeTranscriptTruthStatus: (value: unknown) => String(value || '').trim().toLowerCase(),
    });

    const handler = app.handlers['GET /api/profile/:userId/feed'];
    const req = {
      params: { userId: 'user_1' },
    } as any;
    const res = createResponse('user_1');

    await handler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        profile_user_id: 'user_1',
        is_owner_view: true,
      },
    });

    const payload = (res.body as { data: { items: Array<any> } }).data.items;
    expect(payload).toHaveLength(2);

    expect(payload[0]).toMatchObject({
      id: 'feed_subscription',
      state: 'subscription_notice',
      source: {
        sourceChannelTitle: 'Creator Alpha',
        sourcePagePath: '/s/youtube/UC_creator',
        sourceChannelAvatarUrl: 'https://img.example.com/creator-avatar.jpg',
      },
      blueprint: null,
    });

    expect(payload[1]).toMatchObject({
      id: 'feed_generated_missing_blueprint',
      state: 'channel_published',
      source: {
        sourceChannelTitle: 'Creator Alpha',
        sourcePagePath: '/s/youtube/UC_creator',
      },
      blueprint: {
        id: 'bp_1',
        title: 'Blueprint One',
        mixNotes: 'Mix notes',
        tags: ['fitness'],
      },
    });
  });
});
