import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleUnlockLedgerActiveLinksForJobs,
  getOracleUnlockLedgerById,
  getOracleUnlockLedgerBySourceItemId,
  listOracleUnlockLedgerExpiredReservedRows,
  listOracleUnlockLedgerProcessingRows,
  listOracleUnlockLedgerRowsBySourceItemIds,
  syncOracleUnlockLedgerFromSupabase,
  upsertOracleUnlockLedgerRows,
} from '../../server/services/oracleUnlockLedgerState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-unlock-ledger-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle unlock ledger state', () => {
  it('upserts and serves durable unlock rows locally', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleUnlockLedgerRows({
        controlDb,
        rows: [
          {
            id: 'unlock_reserved',
            source_item_id: 'source_1',
            source_page_id: 'page_1',
            status: 'reserved',
            estimated_cost: 1,
            reserved_by_user_id: 'user_1',
            reservation_expires_at: '2026-04-02T08:10:00.000Z',
            job_id: 'job_1',
            created_at: '2026-04-02T08:00:00.000Z',
            updated_at: '2026-04-02T08:00:00.000Z',
          },
          {
            id: 'unlock_processing',
            source_item_id: 'source_2',
            source_page_id: 'page_2',
            status: 'processing',
            estimated_cost: 1,
            reserved_by_user_id: 'user_2',
            reservation_expires_at: '2026-04-02T08:20:00.000Z',
            job_id: 'job_2',
            created_at: '2026-04-02T08:05:00.000Z',
            updated_at: '2026-04-02T08:05:00.000Z',
          },
          {
            id: 'unlock_ready',
            source_item_id: 'source_3',
            source_page_id: 'page_3',
            status: 'ready',
            blueprint_id: 'bp_1',
            estimated_cost: 1,
            created_at: '2026-04-02T08:06:00.000Z',
            updated_at: '2026-04-02T08:06:00.000Z',
          },
        ],
      });

      const byId = await getOracleUnlockLedgerById({
        controlDb,
        unlockId: 'unlock_reserved',
      });
      const bySourceItemId = await getOracleUnlockLedgerBySourceItemId({
        controlDb,
        sourceItemId: 'source_2',
      });
      const rows = await listOracleUnlockLedgerRowsBySourceItemIds({
        controlDb,
        sourceItemIds: ['source_1', 'source_2', 'source_3'],
      });
      const processing = await listOracleUnlockLedgerProcessingRows({
        controlDb,
        limit: 10,
      });
      const activeLinks = await countOracleUnlockLedgerActiveLinksForJobs({
        controlDb,
        jobIds: ['job_1', 'job_2', 'job_3'],
      });

      expect(byId).toMatchObject({
        id: 'unlock_reserved',
        source_item_id: 'source_1',
        status: 'reserved',
      });
      expect(bySourceItemId).toMatchObject({
        id: 'unlock_processing',
        job_id: 'job_2',
      });
      expect(rows).toHaveLength(3);
      expect(processing).toEqual([
        expect.objectContaining({
          id: 'unlock_processing',
          source_item_id: 'source_2',
        }),
      ]);
      expect(activeLinks.get('job_1')).toBe(1);
      expect(activeLinks.get('job_2')).toBe(1);
      expect(activeLinks.has('job_3')).toBe(false);
    } finally {
      await controlDb.close();
    }
  });

  it('bootstraps the durable unlock ledger from Supabase rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      source_item_unlocks: [
        {
          id: 'unlock_bootstrap_expired',
          source_item_id: 'source_bootstrap_1',
          source_page_id: 'page_bootstrap_1',
          status: 'reserved',
          estimated_cost: 1,
          reserved_by_user_id: 'user_1',
          reservation_expires_at: '2026-04-02T07:00:00.000Z',
          job_id: 'job_bootstrap_1',
          updated_at: '2026-04-02T08:00:00.000Z',
          created_at: '2026-04-02T08:00:00.000Z',
        },
        {
          id: 'unlock_bootstrap_processing',
          source_item_id: 'source_bootstrap_2',
          source_page_id: 'page_bootstrap_2',
          status: 'processing',
          estimated_cost: 1,
          reserved_by_user_id: 'user_2',
          reservation_expires_at: '2026-04-02T09:00:00.000Z',
          job_id: 'job_bootstrap_2',
          updated_at: '2026-04-02T08:05:00.000Z',
          created_at: '2026-04-02T08:05:00.000Z',
        },
      ],
    }) as any;

    try {
      const result = await syncOracleUnlockLedgerFromSupabase({
        controlDb,
        db,
        limit: 1000,
      });

      expect(result).toMatchObject({
        rowCount: 2,
        activeCount: 2,
      });

      const expired = await listOracleUnlockLedgerExpiredReservedRows({
        controlDb,
        limit: 10,
        nowIso: '2026-04-02T08:30:00.000Z',
      });
      const processing = await listOracleUnlockLedgerProcessingRows({
        controlDb,
        limit: 10,
      });

      expect(expired).toEqual([
        expect.objectContaining({
          id: 'unlock_bootstrap_expired',
          source_item_id: 'source_bootstrap_1',
        }),
      ]);
      expect(processing).toEqual([
        expect.objectContaining({
          id: 'unlock_bootstrap_processing',
          source_item_id: 'source_bootstrap_2',
        }),
      ]);
    } finally {
      await controlDb.close();
    }
  });

  it('bootstraps across multiple Supabase pages when the limit exceeds 1000 rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      id: `unlock_page_${index + 1}`,
      source_item_id: `source_page_${index + 1}`,
      source_page_id: `page_${index + 1}`,
      status: index === 1004 ? 'processing' : 'available',
      estimated_cost: 1,
      reserved_by_user_id: index === 1004 ? 'user_page' : null,
      reservation_expires_at: index === 1004 ? '2026-04-02T09:00:00.000Z' : null,
      job_id: index === 1004 ? 'job_page' : null,
      updated_at: new Date(Date.UTC(2026, 3, 2, 8, 0, 0, index)).toISOString(),
      created_at: new Date(Date.UTC(2026, 3, 2, 8, 0, 0, index)).toISOString(),
    }));
    const db = createMockSupabase({
      source_item_unlocks: rows,
    }) as any;

    try {
      const result = await syncOracleUnlockLedgerFromSupabase({
        controlDb,
        db,
        limit: 5000,
      });

      expect(result).toMatchObject({
        rowCount: 1005,
        activeCount: 1,
      });

      const tailRow = await getOracleUnlockLedgerBySourceItemId({
        controlDb,
        sourceItemId: 'source_page_1005',
      });
      expect(tailRow).toMatchObject({
        id: 'unlock_page_1005',
        source_item_id: 'source_page_1005',
        status: 'processing',
        job_id: 'job_page',
      });
    } finally {
      await controlDb.close();
    }
  }, 45_000);
});
