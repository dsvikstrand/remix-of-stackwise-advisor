import { describe, expect, it } from 'vitest';
import {
  buildYouTubeSearchCacheKey,
  classifySearchCacheFreshness,
  normalizeYouTubeSearchQuery,
} from '../../server/services/youtubeSearchCache';

describe('youtubeSearchCache service helpers', () => {
  it('normalizes query consistently', () => {
    expect(normalizeYouTubeSearchQuery('  Skincare   ROUTINE 2026  ')).toBe('skincare routine 2026');
  });

  it('builds deterministic cache keys', () => {
    const keyA = buildYouTubeSearchCacheKey({
      kind: 'video_search',
      query: '  TEST  Query ',
      limit: 10,
      pageToken: 'abc',
    });
    const keyB = buildYouTubeSearchCacheKey({
      kind: 'video_search',
      query: 'test query',
      limit: 10,
      pageToken: 'abc',
    });
    const keyC = buildYouTubeSearchCacheKey({
      kind: 'channel_search',
      query: 'test query',
      limit: 10,
      pageToken: 'abc',
    });
    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it('classifies freshness as fresh/stale/miss', () => {
    const now = Date.parse('2026-03-05T10:00:00.000Z');
    expect(
      classifySearchCacheFreshness({
        nowMs: now,
        fetchedAtRaw: '2026-03-05T09:59:00.000Z',
        expiresAtRaw: '2026-03-05T10:05:00.000Z',
        staleMaxSeconds: 3600,
      }).source,
    ).toBe('fresh');

    expect(
      classifySearchCacheFreshness({
        nowMs: now,
        fetchedAtRaw: '2026-03-05T09:50:00.000Z',
        expiresAtRaw: '2026-03-05T09:55:00.000Z',
        staleMaxSeconds: 3600,
      }).source,
    ).toBe('stale');

    expect(
      classifySearchCacheFreshness({
        nowMs: now,
        fetchedAtRaw: '2026-03-04T07:50:00.000Z',
        expiresAtRaw: '2026-03-04T08:00:00.000Z',
        staleMaxSeconds: 3600,
      }).source,
    ).toBe('miss');
  });
});
