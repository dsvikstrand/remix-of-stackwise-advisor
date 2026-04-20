import { describe, expect, it } from 'vitest';
import { registerBlueprintCommentRoutes } from '../../server/routes/blueprintComments';
import { createMockSupabase } from './helpers/mockSupabase';

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

function createResponse() {
  return {
    locals: {} as Record<string, unknown>,
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

describe('blueprint comment routes', () => {
  it('returns blueprint comments with profile data from the backend route', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      blueprints: [
        { id: 'bp_1', creator_user_id: 'owner_1', is_public: true, title: 'Blueprint One' },
      ],
      profiles: [
        { user_id: 'user_1', display_name: 'Alice', avatar_url: 'https://img/alice.png', is_public: true },
      ],
    }) as any;

    registerBlueprintCommentRoutes(app as any, {
      getServiceSupabaseClient: () => db,
      getBlueprintRow: async () => ({
        id: 'bp_1',
        creator_user_id: 'owner_1',
        title: 'Blueprint One',
        is_public: true,
      }),
      readBlueprintRows: async () => [{
        id: 'bp_1',
        title: 'Blueprint One',
        is_public: true,
      }],
      listBlueprintCommentRows: async () => [
        {
          id: 'comment_1',
          blueprint_id: 'bp_1',
          user_id: 'user_1',
          content: 'Great blueprint',
          likes_count: 4,
          created_at: '2026-04-19T10:00:00.000Z',
          updated_at: '2026-04-19T10:00:00.000Z',
        },
      ],
      createBlueprintCommentRow: async () => {
        throw new Error('not used');
      },
      listUserBlueprintCommentRows: async () => [],
    });

    const handler = app.handlers['GET /api/blueprints/:blueprintId/comments'];
    const res = createResponse();
    await handler({
      params: { blueprintId: 'bp_1' },
      query: { sort: 'new' },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        blueprint_id: 'bp_1',
        items: [
          {
            id: 'comment_1',
            content: 'Great blueprint',
            user_id: 'user_1',
            profile: {
              display_name: 'Alice',
              avatar_url: 'https://img/alice.png',
            },
          },
        ],
      },
    });
  });

  it('creates a blueprint comment for an authenticated user', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      blueprints: [
        { id: 'bp_1', creator_user_id: 'owner_1', is_public: true, title: 'Blueprint One' },
      ],
      profiles: [
        { user_id: 'user_2', display_name: 'Bob', avatar_url: null, is_public: true },
      ],
    }) as any;

    registerBlueprintCommentRoutes(app as any, {
      getServiceSupabaseClient: () => db,
      getBlueprintRow: async () => ({
        id: 'bp_1',
        creator_user_id: 'owner_1',
        title: 'Blueprint One',
        is_public: true,
      }),
      readBlueprintRows: async () => [{
        id: 'bp_1',
        title: 'Blueprint One',
        is_public: true,
      }],
      listBlueprintCommentRows: async () => [],
      createBlueprintCommentRow: async ({ blueprintId, userId, content }) => ({
        id: 'comment_2',
        blueprint_id: blueprintId,
        user_id: userId,
        content,
        likes_count: 0,
        created_at: '2026-04-19T11:00:00.000Z',
        updated_at: '2026-04-19T11:00:00.000Z',
      }),
      listUserBlueprintCommentRows: async () => [],
    });

    const handler = app.handlers['POST /api/blueprints/:blueprintId/comments'];
    const res = createResponse();
    res.locals.user = { id: 'user_2' };
    await handler({
      params: { blueprintId: 'bp_1' },
      body: { content: 'Nice work' },
    } as any, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        id: 'comment_2',
        blueprint_id: 'bp_1',
        user_id: 'user_2',
        content: 'Nice work',
        profile: {
          display_name: 'Bob',
          avatar_url: null,
        },
      },
    });
  });

  it('returns profile comments only for public profiles or owner view', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      profiles: [
        { user_id: 'user_1', is_public: false },
      ],
      blueprints: [
        { id: 'bp_1', title: 'Blueprint One', is_public: true },
      ],
    }) as any;

    registerBlueprintCommentRoutes(app as any, {
      getServiceSupabaseClient: () => db,
      getBlueprintRow: async () => null,
      readBlueprintRows: async () => [{
        id: 'bp_1',
        title: 'Blueprint One',
        is_public: true,
      }],
      listBlueprintCommentRows: async () => [],
      createBlueprintCommentRow: async () => {
        throw new Error('not used');
      },
      listUserBlueprintCommentRows: async () => [
        {
          id: 'comment_3',
          blueprint_id: 'bp_1',
          user_id: 'user_1',
          content: 'Private profile comment',
          likes_count: 0,
          created_at: '2026-04-19T12:00:00.000Z',
          updated_at: '2026-04-19T12:00:00.000Z',
        },
      ],
    });

    const handler = app.handlers['GET /api/profile/:userId/comments'];

    const forbiddenRes = createResponse();
    await handler({
      params: { userId: 'user_1' },
      query: {},
    } as any, forbiddenRes as any);
    expect(forbiddenRes.statusCode).toBe(403);

    const ownerRes = createResponse();
    ownerRes.locals.user = { id: 'user_1' };
    await handler({
      params: { userId: 'user_1' },
      query: {},
    } as any, ownerRes as any);

    expect(ownerRes.statusCode).toBe(200);
    expect(ownerRes.body).toMatchObject({
      ok: true,
      data: {
        profile_user_id: 'user_1',
        items: [
          {
            id: 'comment_3',
            blueprint_id: 'bp_1',
            blueprint_title: 'Blueprint One',
          },
        ],
      },
    });
  });
});
