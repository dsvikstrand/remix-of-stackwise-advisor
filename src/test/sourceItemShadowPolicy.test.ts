import { describe, expect, it } from 'vitest';
import {
  mapSourceItemShadowUpdateValues,
  shouldLookupSupabaseSourceItemCurrent,
} from '../../server/services/sourceItemShadowPolicy';

describe('source item shadow policy', () => {
  it('skips Supabase current lookups when Oracle primary already governs source-item truth', () => {
    expect(shouldLookupSupabaseSourceItemCurrent({
      primaryEnabled: true,
      hasOracleCurrent: false,
    })).toBe(false);

    expect(shouldLookupSupabaseSourceItemCurrent({
      primaryEnabled: false,
      hasOracleCurrent: false,
    })).toBe(true);

    expect(shouldLookupSupabaseSourceItemCurrent({
      primaryEnabled: false,
      hasOracleCurrent: true,
    })).toBe(false);
  });

  it('builds update payloads without id or created_at fields', () => {
    const payload = mapSourceItemShadowUpdateValues({
      source_type: 'youtube',
      source_native_id: 'video_1',
      canonical_key: 'youtube:video_1',
      source_url: 'https://youtube.com/watch?v=video_1',
      title: 'Video 1',
      published_at: '2026-04-05T12:00:00.000Z',
      ingest_status: 'ready',
      source_channel_id: 'channel_1',
      source_channel_title: 'Channel 1',
      source_page_id: 'page_1',
      thumbnail_url: 'https://img.youtube.com/1.jpg',
      metadata: { provider: 'youtube_rss' },
      updated_at: '2026-04-05T12:10:00.000Z',
    });

    expect(payload).toEqual({
      source_type: 'youtube',
      source_native_id: 'video_1',
      canonical_key: 'youtube:video_1',
      source_url: 'https://youtube.com/watch?v=video_1',
      title: 'Video 1',
      published_at: '2026-04-05T12:00:00.000Z',
      ingest_status: 'ready',
      source_channel_id: 'channel_1',
      source_channel_title: 'Channel 1',
      source_page_id: 'page_1',
      thumbnail_url: 'https://img.youtube.com/1.jpg',
      metadata: { provider: 'youtube_rss' },
      updated_at: '2026-04-05T12:10:00.000Z',
    });
    expect('id' in payload).toBe(false);
    expect('created_at' in payload).toBe(false);
  });
});
