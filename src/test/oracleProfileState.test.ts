import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleProfileRows,
  getOracleProfileRow,
  syncOracleProfileRowFromSupabase,
  upsertOracleProfileRow,
} from '../../server/services/oracleProfileState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-profile-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle profile state', () => {
  it('stores and reads profile rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      expect(await countOracleProfileRows({ controlDb })).toBe(0);

      await upsertOracleProfileRow({
        controlDb,
        row: {
          user_id: 'user_1',
          display_name: 'Alice',
          is_public: true,
        },
        nowIso: '2026-04-19T09:00:00.000Z',
      });

      const row = await getOracleProfileRow({
        controlDb,
        userId: 'user_1',
      });

      expect(await countOracleProfileRows({ controlDb })).toBe(1);
      expect(row).toMatchObject({
        user_id: 'user_1',
        display_name: 'Alice',
        is_public: true,
      });
    } finally {
      await controlDb.close();
    }
  });

  it('syncs a single profile row from Supabase', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      profiles: [
        {
          id: 'profile_2',
          user_id: 'user_2',
          display_name: 'Bob',
          is_public: false,
          created_at: '2026-04-19T10:00:00.000Z',
          updated_at: '2026-04-19T10:00:00.000Z',
        },
      ],
    }) as any;

    try {
      const row = await syncOracleProfileRowFromSupabase({
        controlDb,
        db,
        userId: 'user_2',
      });

      expect(row).toMatchObject({
        id: 'profile_2',
        user_id: 'user_2',
        display_name: 'Bob',
        is_public: false,
      });
    } finally {
      await controlDb.close();
    }
  });
});
