import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleTagRows,
  getOracleTagRowBySlug,
  listOracleTagRows,
  syncOracleTagRowsFromSupabase,
  upsertOracleTagRow,
} from '../../server/services/oracleTagState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-tag-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle tag state', () => {
  it('stores and lists tag rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      expect(await countOracleTagRows({ controlDb })).toBe(0);

      await upsertOracleTagRow({
        controlDb,
        row: {
          id: 'tag_1',
          slug: 'fitness-training',
          follower_count: 4,
          created_at: '2026-04-22T08:00:00.000Z',
        },
      });

      await upsertOracleTagRow({
        controlDb,
        row: {
          id: 'tag_2',
          slug: 'cooking-home-kitchen',
          follower_count: 1,
          created_at: '2026-04-22T08:01:00.000Z',
        },
      });

      const bySlug = await getOracleTagRowBySlug({
        controlDb,
        slug: 'fitness-training',
      });
      const rows = await listOracleTagRows({
        controlDb,
      });

      expect(bySlug).toMatchObject({
        id: 'tag_1',
        slug: 'fitness-training',
        follower_count: 4,
      });
      expect(rows.map((row) => row.slug)).toEqual([
        'fitness-training',
        'cooking-home-kitchen',
      ]);
    } finally {
      await controlDb.close();
    }
  });

  it('syncs tag rows from Supabase', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      tags: [
        {
          id: 'tag_1',
          slug: 'fitness-training',
          follower_count: 5,
          created_at: '2026-04-22T08:00:00.000Z',
        },
        {
          id: 'tag_2',
          slug: 'cooking-home-kitchen',
          follower_count: 2,
          created_at: '2026-04-22T08:05:00.000Z',
        },
      ],
    }) as any;

    try {
      const result = await syncOracleTagRowsFromSupabase({
        controlDb,
        db,
        batchSize: 1,
      });

      expect(result.rowCount).toBe(2);
      expect(await countOracleTagRows({ controlDb })).toBe(2);
      expect((await listOracleTagRows({ controlDb })).map((row) => row.slug)).toEqual([
        'fitness-training',
        'cooking-home-kitchen',
      ]);
    } finally {
      await controlDb.close();
    }
  });
});
