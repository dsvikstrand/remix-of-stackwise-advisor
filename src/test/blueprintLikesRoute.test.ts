import { describe, expect, it, vi } from 'vitest';
import { registerBlueprintLikeRoutes } from '../../server/routes/blueprintLikes';

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
    delete(path: string, ...args: Array<(req: unknown, res: unknown) => Promise<unknown>>) {
      handlers[`DELETE ${path}`] = args[args.length - 1];
      return this;
    },
  };
}

function createResponse(viewerUserId?: string) {
  return {
    locals: viewerUserId ? { user: { id: viewerUserId } } : {},
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

describe('blueprint like routes', () => {
  it('returns per-blueprint like state for the viewer', async () => {
    const app = createMockApp();

    registerBlueprintLikeRoutes(app as any, {
      getBlueprintRow: async () => ({
        id: 'bp_1',
        creator_user_id: 'owner_1',
        title: 'Blueprint One',
        is_public: true,
        likes_count: 4,
      }),
      getBlueprintLikeState: async () => ({
        blueprint_id: 'bp_1',
        user_liked: true,
        likes_count: 4,
      }),
      setBlueprintLiked: async () => null,
      listBlueprintLikeStates: async () => [],
      listLikedBlueprintIds: async () => [],
    });

    const handler = app.handlers['GET /api/blueprints/:blueprintId/like-state'];
    const res = createResponse('viewer_1');
    await handler({
      params: { blueprintId: 'bp_1' },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        blueprint_id: 'bp_1',
        user_liked: true,
        likes_count: 4,
      },
    });
  });

  it('likes and unlikes through the backend owner', async () => {
    const app = createMockApp();
    const setBlueprintLiked = vi.fn(async ({ blueprintId, userId, liked }) => ({
      blueprint_id: blueprintId,
      user_liked: liked,
      likes_count: liked ? 5 : 4,
    }));

    registerBlueprintLikeRoutes(app as any, {
      getBlueprintRow: async () => ({
        id: 'bp_1',
        creator_user_id: 'owner_1',
        title: 'Blueprint One',
        is_public: true,
        likes_count: 4,
      }),
      getBlueprintLikeState: async () => null,
      setBlueprintLiked,
      listBlueprintLikeStates: async () => [],
      listLikedBlueprintIds: async () => [],
    });

    const likeHandler = app.handlers['POST /api/blueprints/:blueprintId/like'];
    const likeRes = createResponse('viewer_1');
    await likeHandler({
      params: { blueprintId: 'bp_1' },
    } as any, likeRes as any);

    const unlikeHandler = app.handlers['DELETE /api/blueprints/:blueprintId/like'];
    const unlikeRes = createResponse('viewer_1');
    await unlikeHandler({
      params: { blueprintId: 'bp_1' },
    } as any, unlikeRes as any);

    expect(setBlueprintLiked).toHaveBeenNthCalledWith(1, {
      blueprintId: 'bp_1',
      userId: 'viewer_1',
      liked: true,
    });
    expect(setBlueprintLiked).toHaveBeenNthCalledWith(2, {
      blueprintId: 'bp_1',
      userId: 'viewer_1',
      liked: false,
    });
    expect(likeRes.statusCode).toBe(200);
    expect(unlikeRes.statusCode).toBe(200);
  });

  it('returns batch like states and liked ids for the authenticated user', async () => {
    const app = createMockApp();

    registerBlueprintLikeRoutes(app as any, {
      getBlueprintRow: async () => null,
      getBlueprintLikeState: async () => null,
      setBlueprintLiked: async () => null,
      listBlueprintLikeStates: async ({ blueprintIds, userId }) => (
        blueprintIds.map((blueprintId) => ({
          blueprint_id: blueprintId,
          user_liked: Boolean(userId) && blueprintId === 'bp_2',
        }))
      ),
      listLikedBlueprintIds: async () => ['bp_2', 'bp_4'],
    });

    const batchHandler = app.handlers['POST /api/blueprint-likes/state'];
    const batchRes = createResponse('viewer_1');
    await batchHandler({
      body: {
        blueprint_ids: ['bp_1', 'bp_2'],
      },
    } as any, batchRes as any);

    const likedIdsHandler = app.handlers['GET /api/me/blueprint-likes'];
    const likedIdsRes = createResponse('viewer_1');
    await likedIdsHandler({
      query: { limit: '10' },
    } as any, likedIdsRes as any);

    expect(batchRes.statusCode).toBe(200);
    expect(batchRes.body).toMatchObject({
      ok: true,
      data: {
        items: [
          { blueprint_id: 'bp_1', user_liked: false },
          { blueprint_id: 'bp_2', user_liked: true },
        ],
      },
    });
    expect(likedIdsRes.statusCode).toBe(200);
    expect(likedIdsRes.body).toMatchObject({
      ok: true,
      data: {
        blueprint_ids: ['bp_2', 'bp_4'],
      },
    });
  });
});
