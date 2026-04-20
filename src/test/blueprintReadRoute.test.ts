import { describe, expect, it } from 'vitest';
import { registerBlueprintReadRoutes } from '../../server/routes/blueprintRead';

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

describe('blueprint read route', () => {
  it('returns a public blueprint detail payload', async () => {
    const app = createMockApp();

    registerBlueprintReadRoutes(app as any, {
      getServiceSupabaseClient: () => null,
      getBlueprintRow: async () => ({
        id: 'bp_1',
        inventory_id: null,
        creator_user_id: 'creator_1',
        title: 'Blueprint One',
        sections_json: { schema_version: 'blueprint_sections_v1', summary: [] },
        mix_notes: null,
        review_prompt: null,
        banner_url: null,
        llm_review: null,
        preview_summary: null,
        is_public: true,
        likes_count: 4,
        source_blueprint_id: null,
        created_at: '2026-04-19T11:00:00.000Z',
        updated_at: '2026-04-19T11:00:00.000Z',
        creator_profile: {
          display_name: 'Creator One',
          avatar_url: 'https://img/creator.png',
        },
      }),
      syncBlueprintReadState: async () => null,
    });

    const handler = app.handlers['GET /api/blueprints/:blueprintId'];
    const res = createResponse();
    await handler({
      params: { blueprintId: 'bp_1' },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        id: 'bp_1',
        title: 'Blueprint One',
        creator_profile: {
          display_name: 'Creator One',
        },
      },
    });
  });

  it('rejects sync requests from non-owners', async () => {
    const app = createMockApp();

    registerBlueprintReadRoutes(app as any, {
      getServiceSupabaseClient: () => null,
      getBlueprintRow: async () => null,
      syncBlueprintReadState: async () => {
        throw new Error('Only the blueprint owner can sync blueprint state.');
      },
    });

    const handler = app.handlers['POST /api/blueprints/:blueprintId/sync-state'];
    const res = createResponse('user_2');
    await handler({
      params: { blueprintId: 'bp_1' },
    } as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'SYNC_FAILED',
    });
  });
});
