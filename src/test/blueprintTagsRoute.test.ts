import { describe, expect, it } from 'vitest';
import { registerBlueprintTagReadRoutes } from '../../server/routes/blueprintTags';

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

function createResponse() {
  return {
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

describe('blueprint tag read routes', () => {
  it('returns blueprint tag rows by blueprint ids', async () => {
    const app = createMockApp();
    registerBlueprintTagReadRoutes(app as any, {
      getServiceSupabaseClient: () => ({}) as any,
      listBlueprintTagRows: async ({ blueprintIds }) => blueprintIds.map((blueprintId, index) => ({
        blueprint_id: blueprintId,
        tag_id: `tag_${index + 1}`,
        tag_slug: `slug-${index + 1}`,
      })),
      listBlueprintTagRowsByFilters: async () => [],
    });

    const res = createResponse();
    await app.handlers['GET /api/blueprint-tags']({
      query: {
        blueprint_ids: 'bp_1,bp_2',
      },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [
          { blueprint_id: 'bp_1', tag_id: 'tag_1', tag_slug: 'slug-1' },
          { blueprint_id: 'bp_2', tag_id: 'tag_2', tag_slug: 'slug-2' },
        ],
      },
    });
  });

  it('returns blueprint tag rows by tag filters', async () => {
    const app = createMockApp();
    registerBlueprintTagReadRoutes(app as any, {
      getServiceSupabaseClient: () => ({}) as any,
      listBlueprintTagRows: async () => [],
      listBlueprintTagRowsByFilters: async ({ tagIds, tagSlugs }) => [{
        blueprint_id: 'bp_match',
        tag_id: String(tagIds?.[0] || 'tag_x'),
        tag_slug: String(tagSlugs?.[0] || 'slug-x'),
      }],
    });

    const res = createResponse();
    await app.handlers['GET /api/blueprint-tags']({
      query: {
        tag_ids: 'tag_1',
        tag_slugs: 'focus',
      },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        items: [
          { blueprint_id: 'bp_match', tag_id: 'tag_1', tag_slug: 'focus' },
        ],
      },
    });
  });
});
