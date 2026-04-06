import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  getOracleSourceItemLedgerByCanonicalKey,
  getOracleSourceItemLedgerById,
  listOracleSourceItemLedgerRows,
  syncOracleSourceItemLedgerFromSupabase,
  upsertOracleSourceItemLedgerRows,
} from '../../server/services/oracleSourceItemLedgerState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-source-item-ledger-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle source item ledger state', () => {
  it('upserts and lists durable source-item rows locally', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleSourceItemLedgerRows({
        controlDb,
        rows: [
          {
            id: 'source_1',
            source_type: 'youtube',
            source_native_id: 'video_1',
            canonical_key: 'youtube:video_1',
            source_url: 'https://youtube.com/watch?v=video_1',
            title: 'Video 1',
            ingest_status: 'ready',
            source_channel_id: 'channel_1',
            source_channel_title: 'Channel 1',
            thumbnail_url: 'https://img.example.com/1.jpg',
            metadata: { provider: 'youtube_rss', duration_seconds: 120 },
            created_at: '2026-04-02T12:00:00.000Z',
            updated_at: '2026-04-02T12:00:00.000Z',
          },
          {
            id: 'source_2',
            source_type: 'subscription_notice',
            source_native_id: 'channel_2',
            canonical_key: 'subscription:youtube:channel_2',
            source_url: 'https://youtube.com/channel/channel_2',
            title: 'Notice',
            ingest_status: 'ready',
            source_channel_id: 'channel_2',
            source_channel_title: 'Channel 2',
            thumbnail_url: 'https://img.example.com/2.jpg',
            metadata: { notice_kind: 'subscription_created' },
            created_at: '2026-04-02T12:05:00.000Z',
            updated_at: '2026-04-02T12:05:00.000Z',
          },
        ],
      });

      const byId = await getOracleSourceItemLedgerById({
        controlDb,
        sourceItemId: 'source_1',
      });
      const byCanonical = await getOracleSourceItemLedgerByCanonicalKey({
        controlDb,
        canonicalKey: 'subscription:youtube:channel_2',
      });
      const rows = await listOracleSourceItemLedgerRows({
        controlDb,
        ids: ['source_1', 'source_2'],
        limit: 10,
      });

      expect(byId).toMatchObject({
        id: 'source_1',
        canonical_key: 'youtube:video_1',
        source_native_id: 'video_1',
      });
      expect(byCanonical).toMatchObject({
        id: 'source_2',
        source_type: 'subscription_notice',
        source_channel_id: 'channel_2',
      });
      expect(rows.map((row) => row.id)).toEqual(['source_2', 'source_1']);
    } finally {
      await controlDb.close();
    }
  });

  it('bootstraps the durable source-item ledger from Supabase rows across multiple pages', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      id: `source_bootstrap_${index + 1}`,
      source_type: 'youtube',
      source_native_id: `video_${index + 1}`,
      canonical_key: `youtube:video_${index + 1}`,
      source_url: `https://youtube.com/watch?v=video_${index + 1}`,
      title: `Video ${index + 1}`,
      published_at: new Date(Date.UTC(2026, 3, 2, 12, 0, 0, index)).toISOString(),
      ingest_status: index === 1004 ? 'processing' : 'ready',
      source_channel_id: `channel_${(index % 7) + 1}`,
      source_channel_title: `Channel ${(index % 7) + 1}`,
      source_page_id: index % 2 === 0 ? `page_${(index % 9) + 1}` : null,
      thumbnail_url: `https://img.example.com/${index + 1}.jpg`,
      metadata: {
        provider: 'youtube_rss',
        duration_seconds: 60 + index,
      },
      created_at: new Date(Date.UTC(2026, 3, 2, 12, 0, 0, index)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 3, 2, 12, 0, 0, index)).toISOString(),
    }));
    const db = createMockSupabase({
      source_items: rows,
    }) as any;

    try {
      const result = await syncOracleSourceItemLedgerFromSupabase({
        controlDb,
        db,
        limit: 5000,
      });

      expect(result).toMatchObject({
        rowCount: 1005,
      });

      const tailRow = await getOracleSourceItemLedgerByCanonicalKey({
        controlDb,
        canonicalKey: 'youtube:video_1005',
      });
      expect(tailRow).toMatchObject({
        id: 'source_bootstrap_1005',
        source_native_id: 'video_1005',
        ingest_status: 'processing',
      });
    } finally {
      await controlDb.close();
    }
  }, 45_000);

  it('tolerates malformed metadata_json in stored Oracle source-item rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await controlDb.db
        .insertInto('source_item_ledger_state')
        .values({
          id: 'source_bad_meta',
          source_type: 'youtube',
          source_native_id: 'video_bad_meta',
          canonical_key: 'youtube:video_bad_meta',
          source_url: 'https://youtube.com/watch?v=video_bad_meta',
          title: 'Bad Metadata Video',
          published_at: '2026-04-02T12:30:00.000Z',
          ingest_status: 'ready',
          source_channel_id: 'channel_bad',
          source_channel_title: 'Channel Bad',
          source_page_id: 'page_bad',
          thumbnail_url: 'https://img.example.com/bad.jpg',
          metadata_json: '{"broken":',
          created_at: '2026-04-02T12:30:00.000Z',
          updated_at: '2026-04-02T12:30:00.000Z',
        })
        .execute();

      const byId = await getOracleSourceItemLedgerById({
        controlDb,
        sourceItemId: 'source_bad_meta',
      });
      const rows = await listOracleSourceItemLedgerRows({
        controlDb,
        ids: ['source_bad_meta'],
      });

      expect(byId).toMatchObject({
        id: 'source_bad_meta',
        metadata: null,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'source_bad_meta',
        metadata: null,
      });
    } finally {
      await controlDb.close();
    }
  });
});
