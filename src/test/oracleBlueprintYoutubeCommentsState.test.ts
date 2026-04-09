import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  listOracleBlueprintYoutubeComments,
  replaceOracleBlueprintYoutubeCommentsSnapshot,
} from '../../server/services/oracleBlueprintYoutubeCommentsState';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-blueprint-youtube-comments-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle blueprint YouTube comments state', () => {
  it('replaces and lists ordered comment snapshots', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const firstResult = await replaceOracleBlueprintYoutubeCommentsSnapshot({
        controlDb,
        blueprintId: 'bp_1',
        youtubeVideoId: 'abc123def45',
        sortMode: 'top',
        nowIso: '2026-04-09T10:00:00.000Z',
        comments: [
          {
            source_comment_id: 'comment_2',
            display_order: 1,
            author_name: 'Bob',
            author_avatar_url: null,
            content: 'Second comment',
            published_at: '2026-04-09T09:00:00.000Z',
            like_count: 2,
          },
          {
            source_comment_id: 'comment_1',
            display_order: 0,
            author_name: 'Alice',
            author_avatar_url: 'https://example.com/a.png',
            content: 'First comment',
            published_at: '2026-04-09T08:00:00.000Z',
            like_count: 7,
          },
        ],
      });

      const rows = await listOracleBlueprintYoutubeComments({
        controlDb,
        blueprintId: 'bp_1',
        sortMode: 'top',
      });

      expect(firstResult).toEqual({
        changed: true,
        skipped: false,
        previous_count: 0,
        next_count: 2,
      });
      expect(rows.map((row) => row.source_comment_id)).toEqual(['comment_1', 'comment_2']);
      expect(rows[0]).toMatchObject({
        blueprint_id: 'bp_1',
        youtube_video_id: 'abc123def45',
        sort_mode: 'top',
        content: 'First comment',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('skips rewriting when the snapshot is unchanged', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await replaceOracleBlueprintYoutubeCommentsSnapshot({
        controlDb,
        blueprintId: 'bp_1',
        youtubeVideoId: 'abc123def45',
        sortMode: 'new',
        nowIso: '2026-04-09T10:00:00.000Z',
        comments: [
          {
            source_comment_id: 'comment_1',
            display_order: 0,
            author_name: 'Alice',
            author_avatar_url: 'https://example.com/a.png',
            content: 'First comment',
            published_at: '2026-04-09T08:00:00.000Z',
            like_count: 7,
          },
        ],
      });

      const secondResult = await replaceOracleBlueprintYoutubeCommentsSnapshot({
        controlDb,
        blueprintId: 'bp_1',
        youtubeVideoId: 'abc123def45',
        sortMode: 'new',
        nowIso: '2026-04-09T11:00:00.000Z',
        comments: [
          {
            source_comment_id: 'comment_1',
            display_order: 0,
            author_name: 'Alice',
            author_avatar_url: 'https://example.com/a.png',
            content: 'First comment',
            published_at: '2026-04-09T08:00:00.000Z',
            like_count: 7,
          },
        ],
      });
      const rows = await listOracleBlueprintYoutubeComments({
        controlDb,
        blueprintId: 'bp_1',
        sortMode: 'new',
      });

      expect(secondResult).toEqual({
        changed: false,
        skipped: true,
        previous_count: 1,
        next_count: 1,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.updated_at).toBe('2026-04-09T10:00:00.000Z');
    } finally {
      await controlDb.close();
    }
  });
});
