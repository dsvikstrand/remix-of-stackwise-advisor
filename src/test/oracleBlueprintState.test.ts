import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleBlueprintRows,
  getOracleBlueprintRow,
  syncOracleBlueprintRowFromSupabase,
  upsertOracleBlueprintRow,
} from '../../server/services/oracleBlueprintState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-blueprint-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle blueprint state', () => {
  it('stores and reads blueprint detail rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      expect(await countOracleBlueprintRows({ controlDb })).toBe(0);

      await upsertOracleBlueprintRow({
        controlDb,
        row: {
          id: 'bp_1',
          creator_user_id: 'user_1',
          title: 'Blueprint One',
          sections_json: { schema_version: 'blueprint_sections_v1', summary: [] },
          is_public: true,
          likes_count: 7,
        },
        nowIso: '2026-04-19T09:00:00.000Z',
      });

      const row = await getOracleBlueprintRow({
        controlDb,
        blueprintId: 'bp_1',
      });

      expect(await countOracleBlueprintRows({ controlDb })).toBe(1);
      expect(row).toMatchObject({
        id: 'bp_1',
        creator_user_id: 'user_1',
        title: 'Blueprint One',
        is_public: true,
        likes_count: 7,
      });
    } finally {
      await controlDb.close();
    }
  });

  it('syncs a single blueprint row from Supabase', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      blueprints: [
        {
          id: 'bp_2',
          creator_user_id: 'user_2',
          title: 'Synced Blueprint',
          sections_json: { schema_version: 'blueprint_sections_v1', summary: [] },
          is_public: true,
          likes_count: 3,
          created_at: '2026-04-19T10:00:00.000Z',
          updated_at: '2026-04-19T10:00:00.000Z',
        },
      ],
    }) as any;

    try {
      const row = await syncOracleBlueprintRowFromSupabase({
        controlDb,
        db,
        blueprintId: 'bp_2',
      });

      expect(row).toMatchObject({
        id: 'bp_2',
        title: 'Synced Blueprint',
        creator_user_id: 'user_2',
      });
    } finally {
      await controlDb.close();
    }
  });
});
