import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openOracleControlPlaneDb, type OracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  fetchYouTubeChannelStats,
  getCachedOutreachChannelStats,
} from '../../server/services/outreachChannelStats';

let controlDb: OracleControlPlaneDb | null = null;

afterEach(async () => {
  if (controlDb) {
    await controlDb.close();
    controlDb = null;
  }
});

function openTempControlDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outreach-channel-stats-'));
  controlDb = openOracleControlPlaneDb({
    sqlitePath: path.join(dir, 'control.sqlite'),
  });
  return controlDb;
}

describe('outreach channel stats', () => {
  it('fetches subscriber count from YouTube channel statistics', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [{
        snippet: { title: 'Creator' },
        statistics: { subscriberCount: '12345', hiddenSubscriberCount: false },
      }],
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(fetchYouTubeChannelStats({
      apiKey: 'key',
      sourceChannelId: 'UC_test',
      fetchImpl,
    })).resolves.toEqual({
      sourceChannelId: 'UC_test',
      channelTitle: 'Creator',
      subscriberCount: 12345,
      hiddenSubscriberCount: false,
    });
  });

  it('caches channel stats in Oracle control-plane sqlite', async () => {
    const db = openTempControlDb();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [{
        snippet: { title: 'Creator' },
        statistics: { subscriberCount: '12345', hiddenSubscriberCount: false },
      }],
    }), { status: 200 })) as unknown as typeof fetch;

    const first = await getCachedOutreachChannelStats({
      controlDb: db,
      apiKey: 'key',
      sourceChannelId: 'UC_test',
      ttlMs: 60_000,
      now: new Date('2026-05-22T08:00:00.000Z'),
      fetchImpl,
    });
    const second = await getCachedOutreachChannelStats({
      controlDb: db,
      apiKey: 'key',
      sourceChannelId: 'UC_test',
      ttlMs: 60_000,
      now: new Date('2026-05-22T08:00:30.000Z'),
      fetchImpl,
    });

    expect(first.cacheHit).toBe(false);
    expect(second).toMatchObject({
      cacheHit: true,
      subscriberCount: 12345,
      channelTitle: 'Creator',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
