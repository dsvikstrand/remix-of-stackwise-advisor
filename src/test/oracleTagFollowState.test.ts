import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleTagFollowRows,
  deleteOracleTagFollowRow,
  listOracleFollowedTagSlugs,
  syncOracleTagFollowRowsFromSupabase,
  upsertOracleTagFollowRow,
} from '../../server/services/oracleTagFollowState';
import {
  getOracleTagRowById,
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-tag-follow-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle tag follow state', () => {
  it('stores follow rows and updates follower counts', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleTagRow({
        controlDb,
        row: {
          id: 'tag_1',
          slug: 'fitness-training',
          follower_count: 0,
          created_at: '2026-04-22T08:00:00.000Z',
        },
      });

      await upsertOracleTagFollowRow({
        controlDb,
        row: {
          tag_id: 'tag_1',
          tag_slug: 'fitness-training',
          user_id: 'user_1',
          created_at: '2026-04-22T08:01:00.000Z',
        },
      });

      expect(await countOracleTagFollowRows({ controlDb })).toBe(1);
      expect(await listOracleFollowedTagSlugs({
        controlDb,
        userId: 'user_1',
      })).toEqual(['fitness-training']);
      expect(await getOracleTagRowById({
        controlDb,
        tagId: 'tag_1',
      })).toMatchObject({
        follower_count: 1,
      });

      await deleteOracleTagFollowRow({
        controlDb,
        tagId: 'tag_1',
        userId: 'user_1',
      });

      expect(await countOracleTagFollowRows({ controlDb })).toBe(0);
      expect(await getOracleTagRowById({
        controlDb,
        tagId: 'tag_1',
      })).toMatchObject({
        follower_count: 0,
      });
    } finally {
      await controlDb.close();
    }
  });

  it('syncs follow rows from Supabase when tag rows already exist', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      tag_follows: [
        {
          id: 'follow_1',
          tag_id: 'tag_1',
          user_id: 'user_1',
          created_at: '2026-04-22T08:01:00.000Z',
          tags: { slug: 'fitness-training' },
        },
        {
          id: 'follow_2',
          tag_id: 'tag_2',
          user_id: 'user_1',
          created_at: '2026-04-22T08:02:00.000Z',
          tags: { slug: 'cooking-home-kitchen' },
        },
      ],
    }) as any;

    try {
      await upsertOracleTagRow({
        controlDb,
        row: {
          id: 'tag_1',
          slug: 'fitness-training',
          follower_count: 0,
          created_at: '2026-04-22T08:00:00.000Z',
        },
      });
      await upsertOracleTagRow({
        controlDb,
        row: {
          id: 'tag_2',
          slug: 'cooking-home-kitchen',
          follower_count: 0,
          created_at: '2026-04-22T08:00:00.000Z',
        },
      });

      const result = await syncOracleTagFollowRowsFromSupabase({
        controlDb,
        db,
        batchSize: 1,
      });

      expect(result.rowCount).toBe(2);
      expect(await listOracleFollowedTagSlugs({
        controlDb,
        userId: 'user_1',
      })).toEqual([
        'cooking-home-kitchen',
        'fitness-training',
      ]);
    } finally {
      await controlDb.close();
    }
  });
});
