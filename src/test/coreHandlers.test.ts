import { describe, expect, it } from 'vitest';
import {
  handleAnalyzeBlueprint,
  handleCredits,
} from '../../server/handlers/coreHandlers';
import type { CoreRouteDeps } from '../../server/contracts/api/core';

function createMockResponse() {
  const response = {
    locals: {
      user: { id: '00000000-0000-0000-0000-000000000001' },
      authToken: 'token',
    } as Record<string, unknown>,
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    write() {
      return true;
    },
    end() {
      return this;
    },
  };
  return response;
}

function createBaseDeps(overrides: Partial<CoreRouteDeps> = {}): CoreRouteDeps {
  return {
    creditsReadLimiter: ((_req, _res, next) => next()) as never,
    getCredits: async () => ({
      remaining: 8,
      limit: 10,
      resetAt: '2026-03-06T00:00:00.000Z',
      bypass: false,
      balance: 8,
      capacity: 10,
      refill_rate_per_sec: 1 / 360,
      seconds_to_full: 720,
      credits_backend_mode: 'db',
      credits_backend_ok: true,
      credits_backend_error: null,
    }),
    getServiceSupabaseClient: () => ({}),
    getGenerationDailyCapStatus: async () => ({
      enabled: true,
      plan: 'free',
      bypass: false,
      limit: 5,
      effectiveLimit: 5,
      used: 1,
      remaining: 4,
      usageDay: '2026-03-05',
      resetAt: '2026-03-06T00:00:00.000Z',
    }),
    blueprintReviewSchema: {
      safeParse: () => ({
        success: true,
        data: {
          title: 'Title',
          selectedItems: { basics: ['A'] },
        },
      }),
    },
    bannerRequestSchema: {
      safeParse: () => ({
        success: true,
        data: { title: 'Title' },
      }),
    },
    consumeCredit: async () => ({ ok: true }),
    createLLMClient: () => ({
      analyzeBlueprint: async () => 'ok',
      generateBanner: async () => ({ mimeType: 'image/png', buffer: Buffer.from('x') }),
    }),
    supabaseUrl: 'https://example.supabase.co',
    ...overrides,
  };
}

describe('core handlers', () => {
  it('returns additive credits backend fields in /api/credits response', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleCredits(req, res as never, createBaseDeps());

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      remaining: 8,
      credits_backend_mode: 'db',
      credits_backend_ok: true,
      credits_backend_error: null,
      generation_daily_limit: 5,
      generation_daily_used: 1,
      generation_daily_remaining: 4,
    });
  });

  it('returns 503 CREDITS_UNAVAILABLE when /api/credits backend is unavailable', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleCredits(req, res as never, createBaseDeps({
      getCredits: async () => {
        const error = new Error('service role missing') as Error & { code?: string };
        error.code = 'CREDITS_UNAVAILABLE';
        throw error;
      },
    }));

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      error_code: 'CREDITS_UNAVAILABLE',
      credits_backend_mode: 'unavailable',
      credits_backend_ok: false,
    });
  });

  it('returns 503 CREDITS_UNAVAILABLE for analyze endpoint when credit backend is unavailable', async () => {
    const req = {
      body: {
        title: 'Title',
        selectedItems: { basics: ['A'] },
      },
    } as never;
    const res = createMockResponse();

    await handleAnalyzeBlueprint(req, res as never, createBaseDeps({
      consumeCredit: async () => ({
        ok: false,
        reason: 'service',
        errorCode: 'CREDITS_UNAVAILABLE',
      }),
    }));

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      error_code: 'CREDITS_UNAVAILABLE',
    });
  });
});
