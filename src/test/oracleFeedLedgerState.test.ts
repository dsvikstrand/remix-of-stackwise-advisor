import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  getOracleFeedLedgerById,
  getOracleFeedLedgerByUserSourceItem,
  listOracleFeedLedgerRows,
  syncOracleFeedLedgerFromSupabase,
  upsertOracleFeedLedgerRows,
} from '../../server/services/oracleFeedLedgerState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-feed-ledger-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle feed ledger state', () => {
  it('upserts and lists durable feed rows locally', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleFeedLedgerRows({
        controlDb,
        rows: [
          {
            id: 'feed_1',
            user_id: 'user_1',
            source_item_id: 'source_1',
            blueprint_id: null,
            state: 'my_feed_unlockable',
            last_decision_code: null,
            created_at: '2026-04-02T09:00:00.000Z',
            updated_at: '2026-04-02T09:00:00.000Z',
          },
          {
            id: 'feed_2',
            user_id: 'user_1',
            source_item_id: 'source_2',
            blueprint_id: 'bp_2',
            state: 'my_feed_published',
            last_decision_code: null,
            created_at: '2026-04-02T09:05:00.000Z',
            updated_at: '2026-04-02T09:05:00.000Z',
          },
        ],
      });

      const byId = await getOracleFeedLedgerById({
        controlDb,
        feedItemId: 'feed_2',
        userId: 'user_1',
      });
      const byUserSource = await getOracleFeedLedgerByUserSourceItem({
        controlDb,
        userId: 'user_1',
        sourceItemId: 'source_1',
      });
      const rows = await listOracleFeedLedgerRows({
        controlDb,
        userId: 'user_1',
        limit: 10,
      });

      expect(byId).toMatchObject({
        id: 'feed_2',
        user_id: 'user_1',
        blueprint_id: 'bp_2',
        state: 'my_feed_published',
      });
      expect(byUserSource).toMatchObject({
        id: 'feed_1',
        user_id: 'user_1',
        source_item_id: 'source_1',
      });
      expect(rows.map((row) => row.id)).toEqual(['feed_2', 'feed_1']);
    } finally {
      await controlDb.close();
    }
  });

  it('bootstraps the durable feed ledger from Supabase rows across multiple pages', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      id: `feed_bootstrap_${index + 1}`,
      user_id: index % 2 === 0 ? 'user_a' : 'user_b',
      source_item_id: `source_${index + 1}`,
      blueprint_id: index % 3 === 0 ? `bp_${index + 1}` : null,
      state: index === 1004 ? 'my_feed_unlocking' : 'my_feed_published',
      last_decision_code: null,
      created_at: new Date(Date.UTC(2026, 3, 2, 9, 0, 0, index)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 3, 2, 9, 0, 0, index)).toISOString(),
    }));
    const db = createMockSupabase({
      user_feed_items: rows,
    }) as any;

    try {
      const result = await syncOracleFeedLedgerFromSupabase({
        controlDb,
        db,
        limit: 5000,
      });

      expect(result).toMatchObject({
        rowCount: 1005,
        activeCount: 1,
      });

      const tailRow = await getOracleFeedLedgerById({
        controlDb,
        feedItemId: 'feed_bootstrap_1005',
      });
      expect(tailRow).toMatchObject({
        id: 'feed_bootstrap_1005',
        source_item_id: 'source_1005',
        state: 'my_feed_unlocking',
      });
    } finally {
      await controlDb.close();
    }
  }, 15_000);
});
