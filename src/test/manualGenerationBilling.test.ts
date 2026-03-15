import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockSupabase } from './helpers/mockSupabase';

function makeWallet(userId: string, balance: number) {
  const nowIso = new Date().toISOString();
  return {
    user_id: userId,
    balance,
    capacity: 3,
    refill_rate_per_sec: 0,
    last_refill_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

describe('manual generation billing', () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    const costs = await import('../../server/services/openaiDailyCosts');
    costs.resetOpenAIDailyCostCacheForTests();
  });

  it('waives manual generation reservations while the OpenAI free window is open', async () => {
    vi.stubEnv('OPENAI_DAILY_FREE_BUDGET_USD', '5');
    vi.stubEnv('OPENAI_API_KEY_ADMIN', 'admin-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ results: [{ amount: { value: 1, currency: 'usd' } }] }],
    }), { status: 200 })));

    const {
      buildManualGenerationReservation,
      reserveManualGeneration,
      settleManualGeneration,
      releaseManualGeneration,
    } = await import('../../server/services/manualGenerationBilling');

    const db = createMockSupabase({
      user_credit_wallets: [makeWallet('user_1', 3)],
      credit_ledger: [],
    }) as any;

    const reservation = buildManualGenerationReservation({
      scope: 'search_video_generate',
      userId: 'user_1',
      requestId: 'req_1',
      videoId: 'vid_1',
    });

    const hold = await reserveManualGeneration(db, reservation);
    expect(hold.ok).toBe(true);
    expect(reservation.chargeMode).toBe('free_window_open');
    expect(db.state.credit_ledger).toHaveLength(0);
    expect(Number(db.state.user_credit_wallets[0]?.balance || 0)).toBe(3);

    await settleManualGeneration(db, reservation);
    await releaseManualGeneration(db, reservation);

    expect(db.state.credit_ledger).toHaveLength(0);
    expect(Number(db.state.user_credit_wallets[0]?.balance || 0)).toBe(3);
  });
});
