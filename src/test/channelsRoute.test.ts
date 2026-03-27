import { describe, expect, it } from 'vitest';
import { registerChannelCandidateRoutes } from '../../server/routes/channels';
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

describe('channel feed route', () => {
  it('returns paged top channel feed items from the backend route', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      channel_candidates: [
        { user_feed_item_id: 'ufi_1', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-27T10:00:00.000Z' },
        { user_feed_item_id: 'ufi_2', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-27T09:00:00.000Z' },
        { user_feed_item_id: 'ufi_3', channel_slug: 'cooking-home-kitchen', status: 'published', created_at: '2026-03-27T08:00:00.000Z' },
      ],
      user_feed_items: [
        { id: 'ufi_1', blueprint_id: 'bp_1' },
        { id: 'ufi_2', blueprint_id: 'bp_2' },
        { id: 'ufi_3', blueprint_id: 'bp_3' },
      ],
      blueprints: [
        { id: 'bp_1', title: 'Blueprint One', preview_summary: 'One', likes_count: 3, created_at: '2026-03-27T10:00:00.000Z', is_public: true },
        { id: 'bp_2', title: 'Blueprint Two', preview_summary: 'Two', likes_count: 12, created_at: '2026-03-27T09:00:00.000Z', is_public: true },
        { id: 'bp_3', title: 'Other Blueprint', preview_summary: 'Three', likes_count: 99, created_at: '2026-03-27T08:00:00.000Z', is_public: true },
      ],
      blueprint_tags: [
        { blueprint_id: 'bp_1', tags: { slug: 'mobility' } },
        { blueprint_id: 'bp_2', tags: { slug: 'strength' } },
      ],
    }) as any;

    registerChannelCandidateRoutes(app as any, {
      rejectLegacyManualFlowIfDisabled: () => false,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      evaluateCandidateForChannel: () => ({
        aggregate: 'pass',
        candidateStatus: 'passed',
        feedState: 'channel_published',
        reasonCode: 'ALL_GATES_PASS',
        mode: 'test',
        decisions: [],
      }),
    });

    const handler = app.handlers['GET /api/channels/:channelSlug/feed'];
    const firstRes = createResponse();
    await handler({
      params: { channelSlug: 'fitness-training' },
      query: { tab: 'top', limit: '1', offset: '0' },
    } as any, firstRes as any);

    expect(firstRes.statusCode).toBe(200);
    expect(firstRes.body).toMatchObject({
      ok: true,
      data: {
        next_offset: 1,
        total_count: 2,
        items: [
          {
            id: 'bp_2',
            title: 'Blueprint Two',
            primaryChannelSlug: 'fitness-training',
            tags: ['strength'],
          },
        ],
      },
    });

    const secondRes = createResponse();
    await handler({
      params: { channelSlug: 'fitness-training' },
      query: { tab: 'top', limit: '1', offset: '1' },
    } as any, secondRes as any);

    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.body).toMatchObject({
      ok: true,
      data: {
        next_offset: null,
        total_count: 2,
        items: [
          {
            id: 'bp_1',
            title: 'Blueprint One',
            primaryChannelSlug: 'fitness-training',
            tags: ['mobility'],
          },
        ],
      },
    });
  });

  it('sorts recent feed items by blueprint created_at and filters non-public rows', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      channel_candidates: [
        { user_feed_item_id: 'ufi_1', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-27T10:00:00.000Z' },
        { user_feed_item_id: 'ufi_2', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-27T09:00:00.000Z' },
      ],
      user_feed_items: [
        { id: 'ufi_1', blueprint_id: 'bp_1' },
        { id: 'ufi_2', blueprint_id: 'bp_2' },
      ],
      blueprints: [
        { id: 'bp_1', title: 'Newest Public', preview_summary: 'One', likes_count: 1, created_at: '2026-03-27T11:00:00.000Z', is_public: true },
        { id: 'bp_2', title: 'Hidden', preview_summary: 'Two', likes_count: 100, created_at: '2026-03-27T12:00:00.000Z', is_public: false },
      ],
      blueprint_tags: [],
    }) as any;

    registerChannelCandidateRoutes(app as any, {
      rejectLegacyManualFlowIfDisabled: () => false,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      evaluateCandidateForChannel: () => ({
        aggregate: 'pass',
        candidateStatus: 'passed',
        feedState: 'channel_published',
        reasonCode: 'ALL_GATES_PASS',
        mode: 'test',
        decisions: [],
      }),
    });

    const handler = app.handlers['GET /api/channels/:channelSlug/feed'];
    const res = createResponse();
    await handler({
      params: { channelSlug: 'fitness-training' },
      query: { tab: 'recent', limit: '20', offset: '0' },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        total_count: 1,
        items: [
          {
            id: 'bp_1',
            title: 'Newest Public',
          },
        ],
      },
    });
  });
});
