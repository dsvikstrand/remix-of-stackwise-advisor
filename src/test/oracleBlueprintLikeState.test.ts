import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleBlueprintLikeRows,
  deleteOracleBlueprintLikeRow,
  getOracleBlueprintLikeRow,
  listOracleLikedBlueprintIdsByUser,
  syncOracleBlueprintLikeRowsFromSupabase,
  upsertOracleBlueprintLikeRow,
} from '../../server/services/oracleBlueprintLikeState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-blueprint-like-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle blueprint like state', () => {
  it('stores, reads, lists, and deletes like rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      expect(await countOracleBlueprintLikeRows({ controlDb })).toBe(0);

      await upsertOracleBlueprintLikeRow({
        controlDb,
        row: {
          blueprint_id: 'bp_1',
          user_id: 'user_1',
          created_at: '2026-04-21T08:00:00.000Z',
          updated_at: '2026-04-21T08:00:00.000Z',
        },
      });

      const row = await getOracleBlueprintLikeRow({
        controlDb,
        blueprintId: 'bp_1',
        userId: 'user_1',
      });
      const likedIds = await listOracleLikedBlueprintIdsByUser({
        controlDb,
        userId: 'user_1',
      });

      expect(row).toMatchObject({
        blueprint_id: 'bp_1',
        user_id: 'user_1',
      });
      expect(likedIds).toEqual(['bp_1']);

      await deleteOracleBlueprintLikeRow({
        controlDb,
        blueprintId: 'bp_1',
        userId: 'user_1',
      });

      expect(await countOracleBlueprintLikeRows({ controlDb })).toBe(0);
      expect(await getOracleBlueprintLikeRow({
        controlDb,
        blueprintId: 'bp_1',
        userId: 'user_1',
      })).toBeNull();
    } finally {
      await controlDb.close();
    }
  });

  it('syncs like rows from Supabase', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      blueprint_likes: [
        {
          id: 'like_1',
          blueprint_id: 'bp_1',
          user_id: 'user_1',
          created_at: '2026-04-21T09:00:00.000Z',
        },
        {
          id: 'like_2',
          blueprint_id: 'bp_2',
          user_id: 'user_1',
          created_at: '2026-04-21T10:00:00.000Z',
        },
      ],
    }) as any;

    try {
      const result = await syncOracleBlueprintLikeRowsFromSupabase({
        controlDb,
        db,
        batchSize: 1,
      });

      expect(result.rowCount).toBe(2);
      expect(await listOracleLikedBlueprintIdsByUser({
        controlDb,
        userId: 'user_1',
      })).toEqual(['bp_2', 'bp_1']);
    } finally {
      await controlDb.close();
    }
  });
});
