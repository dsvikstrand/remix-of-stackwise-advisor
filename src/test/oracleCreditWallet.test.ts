import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  compareAndSetOracleCreditWalletRow,
  getOracleCreditWalletRow,
  listOracleCreditWalletRowsByUserIds,
  upsertOracleCreditWalletRow,
} from '../../server/services/oracleCreditWallet';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-credit-wallet-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle credit wallet state', () => {
  it('stores wallet rows keyed by user', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleCreditWalletRow({
        controlDb,
        row: {
          user_id: 'user_1',
          balance: 2,
          capacity: 3,
          refill_rate_per_sec: 0,
          last_refill_at: '2026-04-16T00:00:00.000Z',
          created_at: '2026-04-16T00:00:00.000Z',
          updated_at: '2026-04-16T00:00:00.000Z',
        },
      });

      const row = await getOracleCreditWalletRow({
        controlDb,
        userId: 'user_1',
      });

      expect(row).toMatchObject({
        user_id: 'user_1',
        balance: 2,
        capacity: 3,
        refill_rate_per_sec: 0,
        last_refill_at: '2026-04-16T00:00:00.000Z',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('supports compare-and-set updates for wallet balances', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleCreditWalletRow({
        controlDb,
        row: {
          user_id: 'user_2',
          balance: 3,
          capacity: 3,
          refill_rate_per_sec: 0,
          last_refill_at: '2026-04-16T00:00:00.000Z',
          created_at: '2026-04-16T00:00:00.000Z',
          updated_at: '2026-04-16T00:00:00.000Z',
        },
      });

      const updated = await compareAndSetOracleCreditWalletRow({
        controlDb,
        userId: 'user_2',
        expectedBalance: 3,
        expectedLastRefillAt: '2026-04-16T00:00:00.000Z',
        nextRow: {
          user_id: 'user_2',
          balance: 2,
          capacity: 3,
          refill_rate_per_sec: 0,
          last_refill_at: '2026-04-16T00:05:00.000Z',
          created_at: '2026-04-16T00:00:00.000Z',
          updated_at: '2026-04-16T00:05:00.000Z',
        },
      });

      expect(updated?.balance).toBe(2);

      const conflict = await compareAndSetOracleCreditWalletRow({
        controlDb,
        userId: 'user_2',
        expectedBalance: 3,
        expectedLastRefillAt: '2026-04-16T00:00:00.000Z',
        nextRow: {
          user_id: 'user_2',
          balance: 1,
          capacity: 3,
          refill_rate_per_sec: 0,
          last_refill_at: '2026-04-16T00:06:00.000Z',
          created_at: '2026-04-16T00:00:00.000Z',
          updated_at: '2026-04-16T00:06:00.000Z',
        },
      });

      expect(conflict).toBeNull();
    } finally {
      await controlDb.close();
    }
  });

  it('lists wallet rows for multiple users', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleCreditWalletRow({
        controlDb,
        row: {
          user_id: 'user_a',
          balance: 1,
          capacity: 3,
          refill_rate_per_sec: 0,
          last_refill_at: '2026-04-16T00:00:00.000Z',
          created_at: '2026-04-16T00:00:00.000Z',
          updated_at: '2026-04-16T00:00:00.000Z',
        },
      });
      await upsertOracleCreditWalletRow({
        controlDb,
        row: {
          user_id: 'user_b',
          balance: 2,
          capacity: 3,
          refill_rate_per_sec: 0,
          last_refill_at: '2026-04-16T00:00:00.000Z',
          created_at: '2026-04-16T00:00:00.000Z',
          updated_at: '2026-04-16T00:00:00.000Z',
        },
      });

      const rows = await listOracleCreditWalletRowsByUserIds({
        controlDb,
        userIds: ['user_a', 'user_b', 'missing'],
      });

      expect(rows.map((row) => row.user_id).sort()).toEqual(['user_a', 'user_b']);
    } finally {
      await controlDb.close();
    }
  });
});
