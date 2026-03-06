import { describe, expect, it } from 'vitest';
import {
  computeAutoUnlockFundedShares,
  releaseAutoUnlockIntent,
  reserveAutoUnlockIntent,
  settleAutoUnlockIntent,
} from '../../server/services/autoUnlockBilling';
import { createMockSupabase } from './helpers/mockSupabase';

function makeWallet(userId: string, balance: number) {
  const nowIso = new Date().toISOString();
  return {
    user_id: userId,
    balance,
    capacity: 20,
    refill_rate_per_sec: 0,
    last_refill_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

describe('auto unlock billing', () => {
  it('computes deterministic equal shares for 10 funded users', () => {
    const result = computeAutoUnlockFundedShares(
      Array.from({ length: 10 }, (_, index) => ({
        userId: `user_${index + 1}`,
        balance: 1,
      })),
    );
    expect(result.snapshotCount).toBe(10);
    expect(result.fundedCount).toBe(10);
    expect(result.participants.every((row) => row.shareCents === 10)).toBe(true);
  });

  it('assigns the leftover cent by stable user id order', () => {
    const result = computeAutoUnlockFundedShares([
      { userId: 'user_c', balance: 1 },
      { userId: 'user_a', balance: 1 },
      { userId: 'user_b', balance: 1 },
    ]);
    expect(result.participants).toEqual([
      { userId: 'user_a', shareCents: 34, sortOrder: 1 },
      { userId: 'user_b', shareCents: 33, sortOrder: 2 },
      { userId: 'user_c', shareCents: 33, sortOrder: 3 },
    ]);
  });

  it('recomputes the funded subset until stable', () => {
    const result = computeAutoUnlockFundedShares([
      { userId: 'user_a', balance: 1.0 },
      { userId: 'user_b', balance: 0.2 },
      { userId: 'user_c', balance: 0.2 },
    ]);
    expect(result.fundedCount).toBe(1);
    expect(result.participants).toEqual([
      { userId: 'user_a', shareCents: 100, sortOrder: 1 },
    ]);
  });

  it('returns an empty funded set when no one can afford the recomputed share', () => {
    const result = computeAutoUnlockFundedShares([
      { userId: 'user_a', balance: 0.2 },
      { userId: 'user_b', balance: 0.2 },
      { userId: 'user_c', balance: 0.2 },
    ]);
    expect(result.fundedCount).toBe(0);
    expect(result.participants).toEqual([]);
  });

  it('reserves and releases shared auto charges in the fallback path', async () => {
    const db = createMockSupabase({
      user_credit_wallets: [
        makeWallet('user_a', 1),
        makeWallet('user_b', 1),
        makeWallet('user_c', 1),
      ],
      credit_ledger: [],
      source_auto_unlock_intents: [],
      source_auto_unlock_participants: [],
    }) as any;

    const reserved = await reserveAutoUnlockIntent(db, {
      sourceItemId: 'source_1',
      sourcePageId: 'page_1',
      unlockId: 'unlock_1',
      sourceChannelId: 'channel_1',
      eligibleUserIds: ['user_c', 'user_a', 'user_b'],
      trigger: 'service_cron',
      videoId: 'video_1',
    });

    expect(reserved.state).toBe('reserved');
    expect(reserved.intent?.intent_owner_user_id).toBe('user_a');
    expect(reserved.participants.map((row) => row.share_cents)).toEqual([34, 33, 33]);
    expect(db.state.credit_ledger.filter((row: any) => row.reason_code === 'AUTO_UNLOCK_HOLD')).toHaveLength(3);

    const released = await releaseAutoUnlockIntent(db, {
      intentId: reserved.intent!.id,
      reasonCode: 'AUTO_UNLOCK_ALREADY_READY',
    });
    expect(released.intent?.status).toBe('released');
    expect(db.state.credit_ledger.filter((row: any) => row.reason_code === 'AUTO_UNLOCK_RELEASE')).toHaveLength(3);
    expect(Number(db.state.user_credit_wallets.find((row: any) => row.user_id === 'user_a')?.balance || 0)).toBeCloseTo(1, 2);
    expect(Number(db.state.user_credit_wallets.find((row: any) => row.user_id === 'user_b')?.balance || 0)).toBeCloseTo(1, 2);
    expect(Number(db.state.user_credit_wallets.find((row: any) => row.user_id === 'user_c')?.balance || 0)).toBeCloseTo(1, 2);
  });

  it('settles shared auto charges exactly once', async () => {
    const db = createMockSupabase({
      user_credit_wallets: [
        makeWallet('user_a', 1),
        makeWallet('user_b', 1),
      ],
      credit_ledger: [],
      source_auto_unlock_intents: [],
      source_auto_unlock_participants: [],
    }) as any;

    const reserved = await reserveAutoUnlockIntent(db, {
      sourceItemId: 'source_2',
      sourcePageId: 'page_2',
      unlockId: 'unlock_2',
      sourceChannelId: 'channel_2',
      eligibleUserIds: ['user_b', 'user_a'],
      trigger: 'service_cron',
      videoId: 'video_2',
    });
    expect(reserved.state).toBe('reserved');

    const settledA = await settleAutoUnlockIntent(db, {
      intentId: reserved.intent!.id,
      blueprintId: 'bp_1',
      jobId: 'job_1',
      traceId: 'trace_1',
    });
    const settledB = await settleAutoUnlockIntent(db, {
      intentId: reserved.intent!.id,
      blueprintId: 'bp_1',
      jobId: 'job_1',
      traceId: 'trace_1',
    });

    expect(settledA.intent?.status).toBe('settled');
    expect(settledB.settledCount).toBe(0);
    expect(db.state.credit_ledger.filter((row: any) => row.reason_code === 'AUTO_UNLOCK_SETTLE')).toHaveLength(2);
  });
});
