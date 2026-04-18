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

function buildFeedRouteDeps(db: any) {
  return {
    listBlueprintTagRows: async ({ blueprintIds }: { blueprintIds: string[] }) => {
      const allowed = new Set(blueprintIds.map((value) => String(value || '').trim()).filter(Boolean));
      return (db.state.blueprint_tags || [])
        .filter((row: any) => allowed.has(String(row.blueprint_id || '').trim()))
        .map((row: any) => ({
          blueprint_id: String(row.blueprint_id || '').trim(),
          tag_id: String(row.tag_id || row.tags?.id || '').trim() || `tag:${String(row.tags?.slug || '').trim()}`,
          tag_slug: String(row.tag_slug || row.tags?.slug || '').trim(),
        }))
        .filter((row: any) => row.blueprint_id && row.tag_slug);
    },
    listBlueprintTagSlugs: async ({ blueprintId }: { blueprintId: string }) => {
      return (db.state.blueprint_tags || [])
        .filter((row: any) => String(row.blueprint_id || '').trim() === String(blueprintId || '').trim())
        .map((row: any) => String(row.tag_slug || row.tags?.slug || '').trim())
        .filter(Boolean);
    },
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
    listChannelCandidateRows: async (innerDb: any, input: {
      feedItemIds?: string[];
      candidateIds?: string[];
      channelSlug?: string | null;
      statuses?: string[];
      limit?: number;
    }) => {
      let query = innerDb
        .from('channel_candidates')
        .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at');
      if (input.feedItemIds?.length) {
        query = query.in('user_feed_item_id', input.feedItemIds);
      }
      if (input.candidateIds?.length) {
        query = query.in('id', input.candidateIds);
      }
      if (input.channelSlug) {
        query = query.eq('channel_slug', input.channelSlug);
      }
      if (input.statuses?.length === 1) {
        query = query.eq('status', input.statuses[0]);
      } else if (input.statuses?.length) {
        query = query.in('status', input.statuses);
      }
      query = query.order('created_at', { ascending: false });
      if (input.limit) {
        query = query.limit(input.limit);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    getChannelCandidateById: async (innerDb: any, input: { candidateId: string }) => {
      const { data, error } = await innerDb
        .from('channel_candidates')
        .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at')
        .eq('id', input.candidateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    upsertChannelCandidate: async (innerDb: any, input: {
      row: {
        id?: string;
        user_feed_item_id: string;
        channel_slug: string;
        submitted_by_user_id: string;
        status: string;
      };
    }) => {
      const { data, error } = await innerDb
        .from('channel_candidates')
        .upsert(input.row, { onConflict: 'user_feed_item_id,channel_slug' })
        .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at')
        .single();
      if (error) throw error;
      return data;
    },
    updateChannelCandidateStatus: async (innerDb: any, input: {
      candidateId: string;
      status: string;
    }) => {
      const { data, error } = await innerDb
        .from('channel_candidates')
        .update({ status: input.status })
        .eq('id', input.candidateId)
        .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    listChannelGateDecisions: async (innerDb: any, input: { candidateId: string }) => {
      const { data, error } = await innerDb
        .from('channel_gate_decisions')
        .select('id, candidate_id, gate_id, outcome, reason_code, score, policy_version, method_version, created_at')
        .eq('candidate_id', input.candidateId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    insertChannelGateDecisions: async (innerDb: any, input: {
      candidateId: string;
      decisions: Array<{
        gate_id: string;
        outcome: 'pass' | 'warn' | 'block';
        reason_code: string;
        score?: number | null;
        method_version?: string;
      }>;
    }) => {
      if (!input.decisions.length) return;
      const payload = input.decisions.map((decision) => ({
        candidate_id: input.candidateId,
        gate_id: decision.gate_id,
        outcome: decision.outcome,
        reason_code: decision.reason_code,
        score: decision.score ?? null,
        policy_version: 'bleuv1-gate-policy-v1.0',
        method_version: decision.method_version ?? 'gate-v1',
      }));
      const { error } = await innerDb
        .from('channel_gate_decisions')
        .insert(payload);
      if (error) throw error;
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
      ...buildFeedRouteDeps(db),
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
      ...buildFeedRouteDeps(db),
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

  it('uses the shared feed reader when published channel candidates reference Oracle-only feed rows', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      channel_candidates: [
        { user_feed_item_id: 'ufi_oracle', channel_slug: 'fitness-training', status: 'published', created_at: '2026-03-27T10:00:00.000Z' },
      ],
      user_feed_items: [],
      blueprints: [
        { id: 'bp_oracle', title: 'Oracle Blueprint', preview_summary: 'Oracle', likes_count: 7, created_at: '2026-03-27T11:00:00.000Z', is_public: true },
      ],
      blueprint_tags: [],
    }) as any;

    registerChannelCandidateRoutes(app as any, {
      rejectLegacyManualFlowIfDisabled: () => false,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      ...buildFeedRouteDeps(db),
      getFeedItemById: async () => ({
        id: 'ufi_oracle',
        user_id: 'user_1',
        source_item_id: 'source_oracle',
        blueprint_id: 'bp_oracle',
        state: 'channel_published',
        last_decision_code: null,
        created_at: '2026-03-27T10:00:00.000Z',
        updated_at: '2026-03-27T10:00:00.000Z',
      }),
      patchFeedItemById: async () => null,
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
        items: [
          expect.objectContaining({
            id: 'bp_oracle',
            title: 'Oracle Blueprint',
          }),
        ],
      },
    });
  });

  it('updates the feed row through the shared feed patch helper when submitting a candidate', async () => {
    const app = createMockApp();
    const db = createMockSupabase({
      user_feed_items: [
        {
          id: 'ufi_1',
          user_id: 'user_1',
          source_item_id: 'source_1',
          blueprint_id: 'bp_1',
          state: 'my_feed_published',
          last_decision_code: null,
          created_at: '2026-03-27T10:00:00.000Z',
          updated_at: '2026-03-27T10:00:00.000Z',
        },
      ],
      channel_candidates: [],
    }) as any;

    registerChannelCandidateRoutes(app as any, {
      rejectLegacyManualFlowIfDisabled: () => false,
      getAuthedSupabaseClient: () => db,
      getServiceSupabaseClient: () => db,
      ...buildFeedRouteDeps(db),
      evaluateCandidateForChannel: () => ({
        aggregate: 'pass',
        candidateStatus: 'passed',
        feedState: 'channel_published',
        reasonCode: 'ALL_GATES_PASS',
        mode: 'test',
        decisions: [],
      }),
    });

    const handler = app.handlers['POST /api/channel-candidates'];
    const res = createResponse();
    res.locals.user = { id: 'user_1' };
    res.locals.authToken = 'token_1';

    await handler({
      body: {
        user_feed_item_id: 'ufi_1',
        channel_slug: 'fitness-training',
      },
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(db.state.user_feed_items[0]).toMatchObject({
      id: 'ufi_1',
      state: 'candidate_submitted',
      blueprint_id: 'bp_1',
      last_decision_code: null,
    });
  });
});
