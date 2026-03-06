import { describe, expect, it } from 'vitest';
import { refundReservation, reserveCredits, settleReservation } from '../../server/services/creditWallet';
import { createMockSupabase } from './helpers/mockSupabase';

describe('credit reservation lifecycle', () => {
  it('keeps hold/settle/refund idempotent by idempotency key', async () => {
    const nowIso = new Date().toISOString();
    const db = createMockSupabase({
      user_credit_wallets: [
        {
          user_id: 'user_1',
          balance: 3,
          capacity: 3,
          refill_rate_per_sec: 0,
          last_refill_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ],
      credit_ledger: [],
    }) as any;

    const holdA = await reserveCredits(db, {
      userId: 'user_1',
      amount: 1,
      idempotencyKey: 'hold_unlock_1',
      reasonCode: 'UNLOCK_HOLD',
      context: {
        unlock_id: 'unlock_1',
        metadata: {
          trace_id: 'ut_credit_1',
        },
      },
    });
    expect(holdA.ok).toBe(true);

    const holdB = await reserveCredits(db, {
      userId: 'user_1',
      amount: 1,
      idempotencyKey: 'hold_unlock_1',
      reasonCode: 'UNLOCK_HOLD',
      context: {
        unlock_id: 'unlock_1',
      },
    });
    expect(holdB.ok).toBe(true);
    if (holdA.ok && holdB.ok) {
      expect(holdA.ledger_id).toBe(holdB.ledger_id);
      expect(holdB.wallet.balance).toBeCloseTo(2, 2);
    }

    const settleA = await settleReservation(db, {
      userId: 'user_1',
      amount: 1,
      idempotencyKey: 'settle_unlock_1',
      reasonCode: 'UNLOCK_SETTLE',
      context: {
        unlock_id: 'unlock_1',
      },
    });
    const settleB = await settleReservation(db, {
      userId: 'user_1',
      amount: 1,
      idempotencyKey: 'settle_unlock_1',
      reasonCode: 'UNLOCK_SETTLE',
      context: {
        unlock_id: 'unlock_1',
      },
    });
    expect(settleA.ledger_id).toBe(settleB.ledger_id);

    const refundA = await refundReservation(db, {
      userId: 'user_1',
      amount: 1,
      idempotencyKey: 'refund_unlock_1',
      reasonCode: 'UNLOCK_REFUND',
      context: {
        unlock_id: 'unlock_1',
      },
    });
    const balanceAfterRefundA = Number((refundA.wallet as { balance: number }).balance || 0);
    expect(balanceAfterRefundA).toBeCloseTo(3, 2);

    const refundB = await refundReservation(db, {
      userId: 'user_1',
      amount: 1,
      idempotencyKey: 'refund_unlock_1',
      reasonCode: 'UNLOCK_REFUND',
      context: {
        unlock_id: 'unlock_1',
      },
    });
    const balanceAfterRefundB = Number((refundB.wallet as { balance: number }).balance || 0);
    expect(balanceAfterRefundB).toBeCloseTo(3, 2);

    const holdRows = db.state.credit_ledger.filter((row: any) => row.entry_type === 'hold');
    const settleRows = db.state.credit_ledger.filter((row: any) => row.entry_type === 'settle');
    const refundRows = db.state.credit_ledger.filter((row: any) => row.entry_type === 'refund');
    expect(holdRows).toHaveLength(1);
    expect(settleRows).toHaveLength(1);
    expect(refundRows).toHaveLength(1);
    expect(holdRows[0]?.metadata?.trace_id).toBe('ut_credit_1');
  });

  it('treats null entitlement overrides as plan defaults during wallet refresh', async () => {
    const staleIso = '2026-03-05T23:55:00.000Z';
    const db = createMockSupabase({
      user_credit_wallets: [
        {
          user_id: 'user_2',
          balance: 10,
          capacity: 10,
          refill_rate_per_sec: 0,
          last_refill_at: staleIso,
          created_at: staleIso,
          updated_at: staleIso,
        },
      ],
      credit_ledger: [],
    }, {
      rpcs: {
        get_generation_plan_for_user: () => ({
          data: [{ plan: 'free', daily_limit_override: null }],
          error: null,
        }),
      },
    }) as any;

    const hold = await reserveCredits(db, {
      userId: 'user_2',
      amount: 1,
      idempotencyKey: 'hold_user_2',
      reasonCode: 'SEARCH_VIDEO_GENERATE_HOLD',
      context: {
        metadata: {
          probe: true,
        },
      },
    });

    expect(hold.ok).toBe(true);
    if (hold.ok) {
      expect(hold.wallet.capacity).toBe(3);
      expect(hold.wallet.daily_grant).toBe(3);
      expect(hold.wallet.balance).toBe(2);
    }
  });

  it('bypasses wallet reservation for admin entitlement users', async () => {
    const nowIso = new Date().toISOString();
    const db = createMockSupabase({
      user_credit_wallets: [
        {
          user_id: 'admin_1',
          balance: 0,
          capacity: 20,
          refill_rate_per_sec: 0,
          last_refill_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ],
      credit_ledger: [],
    }, {
      rpcs: {
        get_generation_plan_for_user: () => ({
          data: [{ plan: 'admin', daily_limit_override: null }],
          error: null,
        }),
      },
    }) as any;

    const hold = await reserveCredits(db, {
      userId: 'admin_1',
      amount: 1,
      idempotencyKey: 'hold_admin_1',
      reasonCode: 'UNLOCK_HOLD',
      context: {
        unlock_id: 'unlock_admin_1',
      },
    });

    expect(hold.ok).toBe(true);
    if (hold.ok) {
      expect(hold.bypass).toBe(true);
      expect(hold.ledger_id).toBeNull();
      expect(hold.wallet.balance).toBe(0);
    }
    expect(db.state.credit_ledger).toHaveLength(0);
    expect(Number(db.state.user_credit_wallets[0]?.balance || 0)).toBe(0);
  });
});
