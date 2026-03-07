import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadProjectEnv,
  resetProjectEnvLoaderForTests,
  shouldLoadProjectEnv,
} from '../../server/loadEnv';

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bleu-load-env-'));
}

describe('loadEnv', () => {
  beforeEach(() => {
    resetProjectEnvLoaderForTests();
  });

  afterEach(() => {
    resetProjectEnvLoaderForTests();
    vi.unstubAllEnvs();
  });

  it('loads repo .env in local mode', () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, '.env'), 'SUPABASE_URL=https://example.supabase.co\nYOUTUBE_DATA_API_KEY=test-key\n');
    const env = {} as NodeJS.ProcessEnv;

    loadProjectEnv({ root, env });

    expect(env.SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.YOUTUBE_DATA_API_KEY).toBe('test-key');
  });

  it('never loads .env.production', () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, '.env.production'), 'SUPABASE_URL=https://wrong.supabase.co\n');
    const env = {} as NodeJS.ProcessEnv;

    loadProjectEnv({ root, env });

    expect(env.SUPABASE_URL).toBeUndefined();
  });

  it('does not overwrite existing env vars', () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, '.env'), 'SUPABASE_URL=https://from-file.supabase.co\n');
    const env = {
      SUPABASE_URL: 'https://already-set.supabase.co',
    } as NodeJS.ProcessEnv;

    loadProjectEnv({ root, env });

    expect(env.SUPABASE_URL).toBe('https://already-set.supabase.co');
  });

  it('skips project env loading under systemd', () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, '.env'), 'SUPABASE_URL=https://from-file.supabase.co\n');
    const env = {
      INVOCATION_ID: 'systemd-run-id',
    } as NodeJS.ProcessEnv;

    loadProjectEnv({ root, env });

    expect(env.SUPABASE_URL).toBeUndefined();
  });

  it('detects systemd runtime via INVOCATION_ID', () => {
    expect(shouldLoadProjectEnv({} as NodeJS.ProcessEnv)).toBe(true);
    expect(shouldLoadProjectEnv({ INVOCATION_ID: 'abc123' } as NodeJS.ProcessEnv)).toBe(false);
  });
});
