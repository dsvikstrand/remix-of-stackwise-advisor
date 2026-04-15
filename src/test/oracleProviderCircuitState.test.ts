import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  getOracleProviderCircuitRow,
  upsertOracleProviderCircuitRow,
} from '../../server/services/oracleProviderCircuitState';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-provider-circuit-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle provider circuit state', () => {
  it('stores provider circuit rows keyed by provider', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleProviderCircuitRow({
        controlDb,
        providerKey: 'youtube_timedtext',
        patch: {
          state: 'open',
          opened_at: '2026-04-15T08:00:00.000Z',
          cooldown_until: '2026-04-15T08:01:00.000Z',
          failure_count: 5,
          last_error: 'Temporary upstream failure',
        },
        nowIso: '2026-04-15T08:00:00.000Z',
      });

      const row = await getOracleProviderCircuitRow({
        controlDb,
        providerKey: 'youtube_timedtext',
      });

      expect(row).toMatchObject({
        provider_key: 'youtube_timedtext',
        state: 'open',
        opened_at: '2026-04-15T08:00:00.000Z',
        cooldown_until: '2026-04-15T08:01:00.000Z',
        failure_count: 5,
        last_error: 'Temporary upstream failure',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('updates existing rows without resetting created_at', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleProviderCircuitRow({
        controlDb,
        providerKey: 'llm_generate_blueprint',
        patch: {
          state: 'open',
          opened_at: '2026-04-15T08:00:00.000Z',
          cooldown_until: '2026-04-15T08:01:00.000Z',
          failure_count: 5,
          last_error: 'First failure burst',
        },
        nowIso: '2026-04-15T08:00:00.000Z',
      });

      await upsertOracleProviderCircuitRow({
        controlDb,
        providerKey: 'llm_generate_blueprint',
        patch: {
          state: 'closed',
          opened_at: null,
          cooldown_until: null,
          failure_count: 0,
          last_error: null,
        },
        nowIso: '2026-04-15T08:05:00.000Z',
      });

      const row = await getOracleProviderCircuitRow({
        controlDb,
        providerKey: 'llm_generate_blueprint',
      });

      expect(row).toMatchObject({
        provider_key: 'llm_generate_blueprint',
        state: 'closed',
        failure_count: 0,
        created_at: '2026-04-15T08:00:00.000Z',
        updated_at: '2026-04-15T08:05:00.000Z',
      });
    } finally {
      await controlDb.close();
    }
  });
});
