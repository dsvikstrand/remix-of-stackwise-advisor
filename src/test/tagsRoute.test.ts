import { describe, expect, it, vi } from 'vitest';
import { registerTagRoutes } from '../../server/routes/tags';

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

describe('tag routes', () => {
  it('returns tag directory rows with viewer follow state', async () => {
    const app = createMockApp();

    registerTagRoutes(app as any, {
      listTags: async () => [
        {
          id: 'tag_1',
          slug: 'fitness-training',
          follower_count: 5,
          created_at: '2026-04-22T08:00:00.000Z',
          is_following: true,
        },
      ],
      listTagsBySlugs: async () => [],
      listFollowedTags: async () => [],
      setTagFollowed: async () => null,
      clearTagFollows: async () => ({ removedCount: 0 }),
      createTag: async () => null,
    });

    const res = createResponse('viewer_1');
    await app.handlers['GET /api/tags']({
      query: { limit: '10' },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            id: 'tag_1',
            slug: 'fitness-training',
            follower_count: 5,
            is_following: true,
          },
        ],
      },
    });
  });

  it('creates and follows a tag through the backend owner', async () => {
    const app = createMockApp();
    const createTag = vi.fn(async ({ slug, userId, follow }) => ({
      id: 'tag_1',
      slug,
      follower_count: follow ? 1 : 0,
      created_at: '2026-04-22T08:00:00.000Z',
      is_following: Boolean(follow),
    }));

    registerTagRoutes(app as any, {
      listTags: async () => [],
      listTagsBySlugs: async () => [],
      listFollowedTags: async () => [],
      setTagFollowed: async () => null,
      clearTagFollows: async () => ({ removedCount: 0 }),
      createTag,
    });

    const res = createResponse('viewer_1');
    await app.handlers['POST /api/tags']({
      body: { slug: 'Fitness-Training' },
    } as any, res as any);

    expect(createTag).toHaveBeenCalledWith({
      slug: 'fitness-training',
      userId: 'viewer_1',
      follow: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        id: 'tag_1',
        slug: 'fitness-training',
        is_following: true,
      },
    });
  });

  it('follows, unfollows, and clears followed tags', async () => {
    const app = createMockApp();
    const setTagFollowed = vi.fn(async ({ tagId, followed }) => ({
      id: tagId,
      slug: followed ? 'fitness-training' : 'cooking-home-kitchen',
      follower_count: followed ? 5 : 4,
      created_at: '2026-04-22T08:00:00.000Z',
      is_following: followed,
    }));
    const clearTagFollows = vi.fn(async ({ tagIds }) => ({
      removedCount: tagIds.length,
    }));

    registerTagRoutes(app as any, {
      listTags: async () => [],
      listTagsBySlugs: async () => [],
      listFollowedTags: async () => [
        {
          id: 'tag_1',
          slug: 'fitness-training',
          created_at: '2026-04-22T08:00:00.000Z',
        },
      ],
      setTagFollowed,
      clearTagFollows,
      createTag: async () => null,
    });

    const followRes = createResponse('viewer_1');
    await app.handlers['POST /api/tags/:tagId/follow']({
      params: { tagId: 'tag_1' },
    } as any, followRes as any);

    const unfollowRes = createResponse('viewer_1');
    await app.handlers['DELETE /api/tags/:tagId/follow']({
      params: { tagId: 'tag_1' },
    } as any, unfollowRes as any);

    const clearRes = createResponse('viewer_1');
    await app.handlers['DELETE /api/tags/follows']({
      body: {
        tag_ids: ['tag_1', 'tag_2'],
      },
    } as any, clearRes as any);

    expect(setTagFollowed).toHaveBeenNthCalledWith(1, {
      tagId: 'tag_1',
      userId: 'viewer_1',
      followed: true,
    });
    expect(setTagFollowed).toHaveBeenNthCalledWith(2, {
      tagId: 'tag_1',
      userId: 'viewer_1',
      followed: false,
    });
    expect(clearTagFollows).toHaveBeenCalledWith({
      tagIds: ['tag_1', 'tag_2'],
      userId: 'viewer_1',
    });
    expect(followRes.statusCode).toBe(200);
    expect(unfollowRes.statusCode).toBe(200);
    expect(clearRes.statusCode).toBe(200);
  });
});
