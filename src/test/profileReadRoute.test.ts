import { describe, expect, it } from 'vitest';
import { registerProfileReadRoutes } from '../../server/routes/profileRead';

function createMockApp() {
  const handlers: Record<string, (req: unknown, res: unknown) => Promise<unknown>> = {};
  return {
    handlers,
    get(path: string, ...args: Array<(req: unknown, res: unknown) => Promise<unknown>>) {
      handlers[`GET ${path}`] = args[args.length - 1];
      return this;
    },
    patch(path: string, ...args: Array<(req: unknown, res: unknown) => Promise<unknown>>) {
      handlers[`PATCH ${path}`] = args[args.length - 1];
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

describe('profile read routes', () => {
  it('returns a public profile', async () => {
    const app = createMockApp();

    registerProfileReadRoutes(app as any, {
      getServiceSupabaseClient: () => null,
      getProfileRow: async () => ({
        id: 'profile_1',
        user_id: 'user_1',
        display_name: 'Alice',
        avatar_url: null,
        bio: null,
        is_public: true,
        follower_count: 3,
        following_count: 2,
        unlocked_blueprints_count: 5,
        created_at: '2026-04-19T10:00:00.000Z',
        updated_at: '2026-04-19T10:00:00.000Z',
      }),
      syncProfileRowFromSupabase: async () => null,
      updateOwnProfile: async () => null,
    });

    const handler = app.handlers['GET /api/profile/:userId'];
    const res = createResponse();
    await handler({
      params: { userId: 'user_1' },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        user_id: 'user_1',
        display_name: 'Alice',
      },
    });
  });

  it('updates the authenticated user profile', async () => {
    const app = createMockApp();

    registerProfileReadRoutes(app as any, {
      getServiceSupabaseClient: () => null,
      getProfileRow: async () => null,
      syncProfileRowFromSupabase: async () => null,
      updateOwnProfile: async ({ userId, updates }) => ({
        id: 'profile_2',
        user_id: userId,
        display_name: updates.display_name ?? null,
        avatar_url: updates.avatar_url ?? null,
        bio: updates.bio ?? null,
        is_public: updates.is_public ?? false,
        follower_count: 0,
        following_count: 0,
        unlocked_blueprints_count: 0,
        created_at: '2026-04-19T10:00:00.000Z',
        updated_at: '2026-04-19T10:05:00.000Z',
      }),
    });

    const handler = app.handlers['PATCH /api/profile/me'];
    const res = createResponse('user_2');
    await handler({
      body: {
        display_name: 'Bob',
        is_public: true,
      },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        user_id: 'user_2',
        display_name: 'Bob',
        is_public: true,
      },
    });
  });
});
