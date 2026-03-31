import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readOracleControlPlaneConfig } from '../../server/services/oracleControlPlaneConfig';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) {
      fs.rmSync(next, { recursive: true, force: true });
    }
  }
});

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-control-plane-config-'));
  tempDirs.push(dir);
  return dir;
}

describe('oracle control-plane config', () => {
  it('defaults to disabled supabase mode and a local runtime sqlite path', () => {
    const cwd = createTempDir();

    expect(readOracleControlPlaneConfig({}, { cwd })).toEqual({
      enabled: false,
      subscriptionSchedulerMode: 'supabase',
      sqlitePath: path.resolve(cwd, '.runtime', 'control-plane.sqlite'),
      bootstrapBatch: 250,
      schedulerTickMs: 300_000,
    });
  });

  it('resolves enabled shadow mode and custom values', () => {
    const cwd = createTempDir();

    expect(readOracleControlPlaneConfig({
      ORACLE_CONTROL_PLANE_ENABLED: 'true',
      ORACLE_SUBSCRIPTION_SCHEDULER_MODE: 'shadow',
      ORACLE_CONTROL_PLANE_SQLITE_PATH: '/tmp/agentic-runtime/control-plane.sqlite',
      ORACLE_SUBSCRIPTION_BOOTSTRAP_BATCH: '123',
      ORACLE_SUBSCRIPTION_SCHEDULER_TICK_MS: '45000',
    }, { cwd })).toEqual({
      enabled: true,
      subscriptionSchedulerMode: 'shadow',
      sqlitePath: path.resolve(cwd, '/tmp/agentic-runtime/control-plane.sqlite'),
      bootstrapBatch: 123,
      schedulerTickMs: 45_000,
    });
  });

  it('falls back to supabase mode when the scheduler mode is unknown', () => {
    const cwd = createTempDir();

    expect(readOracleControlPlaneConfig({
      ORACLE_CONTROL_PLANE_ENABLED: 'true',
      ORACLE_SUBSCRIPTION_SCHEDULER_MODE: 'unknown',
    }, { cwd }).subscriptionSchedulerMode).toBe('supabase');
  });
});
