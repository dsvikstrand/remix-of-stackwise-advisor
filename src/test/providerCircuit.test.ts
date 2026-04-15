import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import { getOracleProviderCircuitRow, upsertOracleProviderCircuitRow } from '../../server/services/oracleProviderCircuitState';
import {
  configureProviderCircuitOracleWriteAdapter,
  recordProviderFailure,
  recordProviderSuccess,
} from '../../server/services/providerCircuit';

const tempDirs: string[] = [];
const originalProviderFailFastMode = process.env.PROVIDER_FAIL_FAST_MODE;

afterEach(() => {
  configureProviderCircuitOracleWriteAdapter(null);
  if (originalProviderFailFastMode == null) delete process.env.PROVIDER_FAIL_FAST_MODE;
  else process.env.PROVIDER_FAIL_FAST_MODE = originalProviderFailFastMode;
  vi.resetModules();
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-circuit-service-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

function createReadDb(row: Record<string, unknown> | null) {
  return {
    from(table: string) {
      expect(table).toBe('provider_circuit_state');
      return {
        select(columns: string) {
          expect(columns).toContain('provider_key');
          return {
            eq(field: string, value: string) {
              expect(field).toBe('provider_key');
              expect(typeof value).toBe('string');
              return {
                maybeSingle: async () => ({
                  data: row,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as any;
}

describe('providerCircuit write adapter', () => {
  it('writes failure transitions into Oracle-backed state', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    configureProviderCircuitOracleWriteAdapter({
      upsertRow: async (input) => upsertOracleProviderCircuitRow({
        controlDb,
        providerKey: input.providerKey,
        patch: input.patch,
        nowIso: input.nowIso,
      }),
    });

    try {
      await recordProviderFailure(
        createReadDb(null),
        'youtube_timedtext',
        'Temporary upstream failure',
      );

      const row = await getOracleProviderCircuitRow({
        controlDb,
        providerKey: 'youtube_timedtext',
      });

      expect(row).toMatchObject({
        provider_key: 'youtube_timedtext',
        state: 'closed',
        failure_count: 1,
        last_error: 'Temporary upstream failure',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('writes success reset transitions into Oracle-backed state', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    configureProviderCircuitOracleWriteAdapter({
      upsertRow: async (input) => upsertOracleProviderCircuitRow({
        controlDb,
        providerKey: input.providerKey,
        patch: input.patch,
        nowIso: input.nowIso,
      }),
    });

    const openRow = {
      provider_key: 'llm_generate_blueprint',
      state: 'open',
      opened_at: '2026-04-15T08:00:00.000Z',
      cooldown_until: '2026-04-15T08:00:01.000Z',
      failure_count: 5,
      last_error: 'Rate limited',
      created_at: '2026-04-15T08:00:00.000Z',
      updated_at: '2026-04-15T08:00:00.000Z',
    };

    try {
      await upsertOracleProviderCircuitRow({
        controlDb,
        providerKey: 'llm_generate_blueprint',
        patch: {
          state: 'open',
          opened_at: '2026-04-15T08:00:00.000Z',
          cooldown_until: '2026-04-15T08:01:00.000Z',
          failure_count: 5,
          last_error: 'Rate limited',
        },
        nowIso: '2026-04-15T08:00:00.000Z',
      });

      await recordProviderSuccess(
        createReadDb(openRow),
        'llm_generate_blueprint',
      );

      const row = await getOracleProviderCircuitRow({
        controlDb,
        providerKey: 'llm_generate_blueprint',
      });

      expect(row).toMatchObject({
        provider_key: 'llm_generate_blueprint',
        state: 'closed',
        opened_at: null,
        cooldown_until: null,
        failure_count: 0,
        last_error: null,
      });
    } finally {
      await controlDb.close();
    }
  });
});

describe('providerCircuit read adapter', () => {
  it('uses Oracle-backed reads for fail-fast availability checks', async () => {
    process.env.PROVIDER_FAIL_FAST_MODE = 'true';
    vi.resetModules();

    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    const providerCircuitModule = await import('../../server/services/providerCircuit');

    providerCircuitModule.configureProviderCircuitOracleWriteAdapter({
      getRow: async (input) => getOracleProviderCircuitRow({
        controlDb,
        providerKey: input.providerKey,
      }),
      upsertRow: async (input) => upsertOracleProviderCircuitRow({
        controlDb,
        providerKey: input.providerKey,
        patch: input.patch,
        nowIso: input.nowIso,
      }),
    });

    try {
      await upsertOracleProviderCircuitRow({
        controlDb,
        providerKey: 'youtube_timedtext',
        patch: {
          state: 'open',
          opened_at: '2026-04-15T08:00:00.000Z',
          cooldown_until: '2999-01-01T00:00:00.000Z',
          failure_count: 5,
          last_error: 'Provider degraded',
        },
        nowIso: '2026-04-15T08:00:00.000Z',
      });

      await expect(
        providerCircuitModule.assertProviderAvailable(null, 'youtube_timedtext'),
      ).rejects.toBeInstanceOf(providerCircuitModule.ProviderCircuitOpenError);

      const snapshot = await providerCircuitModule.getProviderCircuitSnapshot(null, 'youtube_timedtext');
      expect(snapshot).toMatchObject({
        provider_key: 'youtube_timedtext',
        state: 'open',
        failure_count: 5,
      });
    } finally {
      providerCircuitModule.configureProviderCircuitOracleWriteAdapter(null);
      await controlDb.close();
    }
  });
});
