import { describe, expect, it, vi } from 'vitest';
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

describe('blueprint read route', () => {
  it('lists public blueprints through the backend read owner', async () => {
    const app = createMockApp();
    const listBlueprintRows = vi.fn(async ({ titleQuery, sort, visibility, includeTotal }) => ({
      items: [{
        id: 'bp_list_1',
        inventory_id: null,
        creator_user_id: 'creator_1',
        title: `Result ${titleQuery}`,
        sections_json: null,
        mix_notes: null,
        review_prompt: null,
        banner_url: null,
        llm_review: null,
        preview_summary: null,
        is_public: true,
        likes_count: 5,
        source_blueprint_id: null,
        created_at: '2026-04-19T11:00:00.000Z',
        updated_at: '2026-04-19T11:00:00.000Z',
        creator_profile: null,
      }],
      total_count: includeTotal ? 12 : null,
    }));

    registerBlueprintReadRoutes(app as any, {
      getServiceSupabaseClient: () => null,
      getBlueprintRow: async () => null,
      listBlueprintRows,
      syncBlueprintReadState: async () => null,
    });

    const handler = app.handlers['GET /api/blueprints'];
    const res = createResponse();
    await handler({
      query: {
        q: 'health',
        sort: 'popular',
        visibility: 'public',
        include_total: 'true',
      },
    } as any, res as any);

    expect(listBlueprintRows).toHaveBeenCalledWith(expect.objectContaining({
      titleQuery: 'health',
      sort: 'popular',
      visibility: 'public',
      includeTotal: true,
    }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        total_count: 12,
        items: [{
          id: 'bp_list_1',
        }],
      },
    });
  });

  it('creates a blueprint through the backend write owner', async () => {
    const app = createMockApp();
    const createBlueprintRow = vi.fn(async ({ title, userId, tags }) => ({
      id: 'bp_created',
      inventory_id: null,
      creator_user_id: userId,
      title,
      selected_items: null,
      steps: null,
      sections_json: null,
      mix_notes: null,
      review_prompt: null,
      banner_url: null,
      llm_review: null,
      preview_summary: null,
      is_public: false,
      likes_count: 0,
      source_blueprint_id: null,
      created_at: '2026-04-19T11:00:00.000Z',
      updated_at: '2026-04-19T11:00:00.000Z',
      creator_profile: null,
      tags,
    }));

    registerBlueprintReadRoutes(app as any, {
      getServiceSupabaseClient: () => null,
      getBlueprintRow: async () => null,
      syncBlueprintReadState: async () => null,
      createBlueprintRow,
    });

    const handler = app.handlers['POST /api/blueprints'];
    const res = createResponse('creator_1');
    await handler({
      body: {
        title: 'New Blueprint',
        tags: ['Health', 'health', 'AI'],
        is_public: false,
      },
    } as any, res as any);

    expect(createBlueprintRow).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'creator_1',
      title: 'New Blueprint',
      tags: ['health', 'ai'],
    }));
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        id: 'bp_created',
        title: 'New Blueprint',
      },
    });
  });

  it('updates a blueprint through the backend write owner', async () => {
    const app = createMockApp();
    const updateBlueprintRow = vi.fn(async ({ blueprintId, title, userId, tags }) => ({
      id: blueprintId,
      inventory_id: null,
      creator_user_id: userId,
      title,
      selected_items: null,
      steps: null,
      sections_json: null,
      mix_notes: null,
      review_prompt: null,
      banner_url: null,
      llm_review: null,
      preview_summary: null,
      is_public: true,
      likes_count: 0,
      source_blueprint_id: null,
      created_at: '2026-04-19T11:00:00.000Z',
      updated_at: '2026-04-19T11:05:00.000Z',
      creator_profile: null,
      tags,
    }));

    registerBlueprintReadRoutes(app as any, {
      getServiceSupabaseClient: () => null,
      getBlueprintRow: async () => null,
      syncBlueprintReadState: async () => null,
      updateBlueprintRow,
    });

    const handler = app.handlers['PATCH /api/blueprints/:blueprintId'];
    const res = createResponse('creator_1');
    await handler({
      params: { blueprintId: 'bp_1' },
      body: {
        title: 'Updated Blueprint',
        tags: ['stocks'],
        is_public: true,
      },
    } as any, res as any);

    expect(updateBlueprintRow).toHaveBeenCalledWith(expect.objectContaining({
      blueprintId: 'bp_1',
      userId: 'creator_1',
      title: 'Updated Blueprint',
      tags: ['stocks'],
    }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        id: 'bp_1',
        title: 'Updated Blueprint',
      },
    });
  });

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
