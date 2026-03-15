import { afterEach, describe, expect, it, vi } from 'vitest';

describe('generation charge policy', () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    const costs = await import('../../server/services/openaiDailyCosts');
    costs.resetOpenAIDailyCostCacheForTests();
  });

  it('opens the free window when OpenAI daily spend is below budget', async () => {
    vi.stubEnv('OPENAI_DAILY_FREE_BUDGET_USD', '5');
    vi.stubEnv('OPENAI_API_KEY_ADMIN', 'admin-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{
        start_time: Math.floor(Date.UTC(2026, 2, 15) / 1000),
        end_time: Math.floor(Date.UTC(2026, 2, 16) / 1000),
        results: [{
          amount: { value: 1.25, currency: 'usd' },
        }],
      }],
    }), { status: 200 })));

    const { getBlueprintGenerationChargePolicy } = await import('../../server/services/generationChargePolicy');
    const result = await getBlueprintGenerationChargePolicy();

    expect(result).toMatchObject({
      mode: 'free_window_open',
      budgetUsd: 5,
      openaiDailyCostUsd: 1.25,
      source: 'openai_costs_api',
    });
  });

  it('switches to normal charging when spend meets the daily budget', async () => {
    vi.stubEnv('OPENAI_DAILY_FREE_BUDGET_USD', '5');
    vi.stubEnv('OPENAI_API_KEY_ADMIN', 'admin-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{
        results: [{
          amount: { value: 5, currency: 'usd' },
        }],
      }],
    }), { status: 200 })));

    const { getBlueprintGenerationChargePolicy } = await import('../../server/services/generationChargePolicy');
    const result = await getBlueprintGenerationChargePolicy();

    expect(result.mode).toBe('credit_charging_active');
    expect(result.openaiDailyCostUsd).toBe(5);
  });

  it('falls back to normal charging when the costs API is unavailable', async () => {
    vi.stubEnv('OPENAI_DAILY_FREE_BUDGET_USD', '5');
    vi.stubEnv('OPENAI_API_KEY_ADMIN', 'admin-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));

    const { getBlueprintGenerationChargePolicy } = await import('../../server/services/generationChargePolicy');
    const result = await getBlueprintGenerationChargePolicy();

    expect(result).toMatchObject({
      mode: 'fallback_charge_mode',
      budgetUsd: 5,
      openaiDailyCostUsd: null,
      source: 'fallback_charge_mode',
    });
  });
});
