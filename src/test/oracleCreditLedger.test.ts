import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  getOracleCreditLedgerByIdempotencyKey,
  insertOracleCreditLedgerEntry,
  listOracleCreditLedgerRowsForUser,
} from '../../server/services/oracleCreditLedger';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-credit-ledger-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle credit ledger state', () => {
  it('stores and reads credit ledger rows by idempotency key', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await insertOracleCreditLedgerEntry({
        controlDb,
        row: {
          user_id: 'user_1',
          delta: -1,
          entry_type: 'hold',
          reason_code: 'UNLOCK_HOLD',
          idempotency_key: 'hold_user_1',
          unlock_id: 'unlock_1',
          metadata: {
            trace_id: 'ut_ledger_1',
          },
        },
      });

      const row = await getOracleCreditLedgerByIdempotencyKey({
        controlDb,
        idempotencyKey: 'hold_user_1',
      });

      expect(row).toMatchObject({
        user_id: 'user_1',
        delta: -1,
        entry_type: 'hold',
        reason_code: 'UNLOCK_HOLD',
        unlock_id: 'unlock_1',
        idempotency_key: 'hold_user_1',
      });
      expect(row?.metadata).toMatchObject({
        trace_id: 'ut_ledger_1',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('returns the existing row on duplicate idempotency keys', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const first = await insertOracleCreditLedgerEntry({
        controlDb,
        row: {
          user_id: 'user_2',
          delta: -1,
          entry_type: 'hold',
          reason_code: 'UNLOCK_HOLD',
          idempotency_key: 'hold_user_2',
          metadata: {
            attempt: 1,
          },
        },
      });

      const second = await insertOracleCreditLedgerEntry({
        controlDb,
        row: {
          user_id: 'user_2',
          delta: -1,
          entry_type: 'hold',
          reason_code: 'UNLOCK_HOLD',
          idempotency_key: 'hold_user_2',
          metadata: {
            attempt: 2,
          },
        },
      });

      expect(second.id).toBe(first.id);
      expect(second.metadata).toMatchObject({
        attempt: 1,
      });
    } finally {
      await controlDb.close();
    }
  });

  it('lists ledger rows for a user in reverse chronological order', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await insertOracleCreditLedgerEntry({
        controlDb,
        row: {
          user_id: 'user_3',
          delta: -1,
          entry_type: 'hold',
          reason_code: 'UNLOCK_HOLD',
          idempotency_key: 'hold_user_3',
          created_at: '2026-04-16T01:00:00.000Z',
          metadata: {},
        },
      });
      await insertOracleCreditLedgerEntry({
        controlDb,
        row: {
          user_id: 'user_3',
          delta: 0,
          entry_type: 'settle',
          reason_code: 'UNLOCK_SETTLE',
          idempotency_key: 'settle_user_3',
          created_at: '2026-04-16T01:01:00.000Z',
          metadata: {},
        },
      });

      const rows = await listOracleCreditLedgerRowsForUser({
        controlDb,
        userId: 'user_3',
      });

      expect(rows.map((row) => row.entry_type)).toEqual(['settle', 'hold']);
    } finally {
      await controlDb.close();
    }
  });
});
