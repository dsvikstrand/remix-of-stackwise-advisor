import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleBlueprintTagRows,
  listOracleBlueprintTagRows,
  listOracleBlueprintTagSlugs,
  upsertOracleBlueprintTagRows,
} from '../../server/services/oracleBlueprintTagState';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-blueprint-tag-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle blueprint tag state', () => {
  it('stores and lists blueprint tag joins', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleBlueprintTagRows({
        controlDb,
        nowIso: '2026-04-10T08:00:00.000Z',
        rows: [
          { blueprint_id: 'bp_1', tag_id: 'tag_strength', tag_slug: 'strength' },
          { blueprint_id: 'bp_1', tag_id: 'tag_mobility', tag_slug: 'mobility' },
          { blueprint_id: 'bp_2', tag_id: 'tag_ai', tag_slug: 'ai' },
        ],
      });

      const rows = await listOracleBlueprintTagRows({
        controlDb,
        blueprintIds: ['bp_1', 'bp_2'],
      });
      const slugs = await listOracleBlueprintTagSlugs({
        controlDb,
        blueprintId: 'bp_1',
      });

      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({
        blueprint_id: 'bp_1',
        tag_slug: 'mobility',
      });
      expect(slugs).toEqual(['mobility', 'strength']);
    } finally {
      await controlDb.close();
    }
  });

  it('updates existing rows without duplicating them', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleBlueprintTagRows({
        controlDb,
        nowIso: '2026-04-10T08:00:00.000Z',
        rows: [
          { blueprint_id: 'bp_1', tag_id: 'tag_strength', tag_slug: 'strength' },
        ],
      });
      await upsertOracleBlueprintTagRows({
        controlDb,
        nowIso: '2026-04-10T09:00:00.000Z',
        rows: [
          { blueprint_id: 'bp_1', tag_id: 'tag_strength', tag_slug: 'strength' },
        ],
      });

      const rows = await listOracleBlueprintTagRows({
        controlDb,
        blueprintIds: ['bp_1'],
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.created_at).toBe('2026-04-10T08:00:00.000Z');
      expect(rows[0]?.updated_at).toBe('2026-04-10T09:00:00.000Z');
    } finally {
      await controlDb.close();
    }
  });

  it('counts existing blueprint tag rows for bootstrap gating', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      expect(await countOracleBlueprintTagRows({
        controlDb,
      })).toBe(0);

      await upsertOracleBlueprintTagRows({
        controlDb,
        nowIso: '2026-04-10T08:00:00.000Z',
        rows: [
          { blueprint_id: 'bp_1', tag_id: 'tag_strength', tag_slug: 'strength' },
          { blueprint_id: 'bp_1', tag_id: 'tag_mobility', tag_slug: 'mobility' },
        ],
      });

      expect(await countOracleBlueprintTagRows({
        controlDb,
      })).toBe(2);
    } finally {
      await controlDb.close();
    }
  });
});
