import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  configureCreditWalletOracleAdapter,
  refundReservation,
  reserveCredits,
  settleReservation,
} from '../../server/services/creditWallet';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  compareAndSetOracleCreditWalletRow,
  getOracleCreditWalletRow,
  listOracleCreditWalletRowsByUserIds,
  upsertOracleCreditWalletRow,
} from '../../server/services/oracleCreditWallet';
import {
  getOracleCreditLedgerByIdempotencyKey,
  insertOracleCreditLedgerEntry,
  listOracleCreditLedgerRowsForUser,
} from '../../server/services/oracleCreditLedger';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  configureCreditWalletOracleAdapter(null);
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'credit-wallet-adapter-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

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

  it('moves wallet balance and ledger idempotency to Oracle together', async () => {
    const nowIso = '2026-04-16T00:00:00.000Z';
    const db = createMockSupabase({
      user_credit_wallets: [
        {
          user_id: 'user_oracle',
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

    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    configureCreditWalletOracleAdapter({
      async getWalletRow(userId) {
        return getOracleCreditWalletRow({ controlDb, userId });
      },
      async listWalletRowsByUserIds(userIds) {
        return listOracleCreditWalletRowsByUserIds({ controlDb, userIds });
      },
      async upsertWalletRow(row) {
        return upsertOracleCreditWalletRow({
          controlDb,
          row: {
            user_id: String(row.user_id),
            balance: Number(row.balance),
            capacity: Number(row.capacity),
            refill_rate_per_sec: Number(row.refill_rate_per_sec),
            last_refill_at: String(row.last_refill_at),
            created_at: String(row.created_at || row.last_refill_at),
            updated_at: String(row.updated_at || row.last_refill_at),
          },
        });
      },
      async compareAndSetWalletRow(input) {
        return compareAndSetOracleCreditWalletRow({
          controlDb,
          userId: input.userId,
          expectedBalance: input.expectedBalance,
          expectedLastRefillAt: input.expectedLastRefillAt,
          nextRow: {
            user_id: String(input.nextRow.user_id),
            balance: Number(input.nextRow.balance),
            capacity: Number(input.nextRow.capacity),
            refill_rate_per_sec: Number(input.nextRow.refill_rate_per_sec),
            last_refill_at: String(input.nextRow.last_refill_at),
            created_at: String(input.nextRow.created_at || input.nextRow.last_refill_at),
            updated_at: String(input.nextRow.updated_at || input.nextRow.last_refill_at),
          },
        });
      },
      async getLedgerByIdempotencyKey(idempotencyKey) {
        return getOracleCreditLedgerByIdempotencyKey({
          controlDb,
          idempotencyKey,
        });
      },
      async insertLedgerEntry(input) {
        return insertOracleCreditLedgerEntry({
          controlDb,
          row: {
            user_id: input.userId,
            delta: input.delta,
            entry_type: input.entryType,
            reason_code: input.reasonCode,
            source_item_id: input.context?.source_item_id || null,
            source_page_id: input.context?.source_page_id || null,
            unlock_id: input.context?.unlock_id || null,
            idempotency_key: input.idempotencyKey,
            metadata: input.context?.metadata || {},
          },
        });
      },
    });

    try {
      const hold = await reserveCredits(db, {
        userId: 'user_oracle',
        amount: 1,
        idempotencyKey: 'oracle_hold_1',
        reasonCode: 'UNLOCK_HOLD',
      });
      expect(hold.ok).toBe(true);

      await settleReservation(db, {
        userId: 'user_oracle',
        amount: 1,
        idempotencyKey: 'oracle_settle_1',
        reasonCode: 'UNLOCK_SETTLE',
      });

      const rowAfterHold = await getOracleCreditWalletRow({
        controlDb,
        userId: 'user_oracle',
      });
      const ledgerAfterHold = await listOracleCreditLedgerRowsForUser({
        controlDb,
        userId: 'user_oracle',
      });
      expect(rowAfterHold?.balance).toBe(2);
      expect(Number(db.state.user_credit_wallets[0]?.balance || 0)).toBe(3);
      expect(db.state.credit_ledger).toHaveLength(0);
      expect(ledgerAfterHold.map((row) => row.entry_type)).toEqual(['settle', 'hold']);

      const refund = await refundReservation(db, {
        userId: 'user_oracle',
        amount: 1,
        idempotencyKey: 'oracle_refund_1',
        reasonCode: 'UNLOCK_REFUND',
      });
      expect(Number(refund.wallet.balance || 0)).toBe(3);

      const rowAfterRefund = await getOracleCreditWalletRow({
        controlDb,
        userId: 'user_oracle',
      });
      const ledgerAfterRefund = await listOracleCreditLedgerRowsForUser({
        controlDb,
        userId: 'user_oracle',
      });
      expect(rowAfterRefund?.balance).toBe(3);
      expect(ledgerAfterRefund.map((row) => row.entry_type)).toEqual(['refund', 'settle', 'hold']);
    } finally {
      await controlDb.close();
    }
  });
});
