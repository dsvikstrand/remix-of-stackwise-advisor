import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleBlueprintCommentRows,
  insertOracleBlueprintCommentRow,
  listOracleBlueprintCommentRows,
  listOracleBlueprintCommentRowsByUser,
} from '../../server/services/oracleBlueprintCommentState';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-blueprint-comment-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle blueprint comment state', () => {
  it('stores and sorts blueprint comments by top and new', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await insertOracleBlueprintCommentRow({
        controlDb,
        row: {
          id: 'comment_1',
          blueprint_id: 'bp_1',
          user_id: 'user_1',
          content: 'First',
          likes_count: 1,
          created_at: '2026-04-19T08:00:00.000Z',
          updated_at: '2026-04-19T08:00:00.000Z',
        },
      });
      await insertOracleBlueprintCommentRow({
        controlDb,
        row: {
          id: 'comment_2',
          blueprint_id: 'bp_1',
          user_id: 'user_2',
          content: 'Second',
          likes_count: 5,
          created_at: '2026-04-19T09:00:00.000Z',
          updated_at: '2026-04-19T09:00:00.000Z',
        },
      });

      const newest = await listOracleBlueprintCommentRows({
        controlDb,
        blueprintId: 'bp_1',
        sortMode: 'new',
      });
      const top = await listOracleBlueprintCommentRows({
        controlDb,
        blueprintId: 'bp_1',
        sortMode: 'top',
      });

      expect(newest.map((row) => row.id)).toEqual(['comment_2', 'comment_1']);
      expect(top.map((row) => row.id)).toEqual(['comment_2', 'comment_1']);
    } finally {
      await controlDb.close();
    }
  });

  it('lists comments by user and counts existing rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      expect(await countOracleBlueprintCommentRows({ controlDb })).toBe(0);

      await insertOracleBlueprintCommentRow({
        controlDb,
        row: {
          blueprint_id: 'bp_1',
          user_id: 'user_1',
          content: 'Hello',
        },
        nowIso: '2026-04-19T10:00:00.000Z',
      });
      await insertOracleBlueprintCommentRow({
        controlDb,
        row: {
          blueprint_id: 'bp_2',
          user_id: 'user_1',
          content: 'World',
        },
        nowIso: '2026-04-19T11:00:00.000Z',
      });

      const rows = await listOracleBlueprintCommentRowsByUser({
        controlDb,
        userId: 'user_1',
      });

      expect(await countOracleBlueprintCommentRows({ controlDb })).toBe(2);
      expect(rows.map((row) => row.content)).toEqual(['World', 'Hello']);
    } finally {
      await controlDb.close();
    }
  });
});
