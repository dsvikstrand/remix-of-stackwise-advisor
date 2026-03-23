import { describe, expect, it, vi } from 'vitest';
import { createTranscriptFetchWithCacheBypass } from '../../server/services/transcriptFetchWithCacheBypass';

describe('createTranscriptFetchWithCacheBypass', () => {
  it('returns cached transcript without calling throttled fetch', async () => {
    const cachedTranscript = {
      text: 'cached transcript',
      source: 'youtube_timedtext',
      confidence: null,
      provider_trace: {
        attempted_providers: [],
        winning_provider: 'youtube_timedtext' as const,
        used_fallback: false,
        cache_hit: true,
        cache_provider: 'youtube_timedtext' as const,
      },
    };
    const fetchWithThrottle = vi.fn(async () => {
      throw new Error('should not run');
    });
    const onCacheHit = vi.fn();
    const getTranscript = createTranscriptFetchWithCacheBypass({
      getDb: () => ({ ok: true }),
      readCachedTranscript: vi.fn(async () => cachedTranscript),
      fetchWithThrottle,
      onCacheHit,
    });

    const result = await getTranscript('video123', { requestClass: 'background', reason: 'pipeline_transcript_fetch' });

    expect(result).toEqual(cachedTranscript);
    expect(fetchWithThrottle).not.toHaveBeenCalled();
    expect(onCacheHit).toHaveBeenCalledWith({
      videoId: 'video123',
      requestClass: 'background',
      reason: 'pipeline_transcript_fetch',
    });
  });

  it('falls back to throttled fetch when cache misses', async () => {
    const freshTranscript = {
      text: 'fresh transcript',
      source: 'youtube_timedtext',
      confidence: null,
    };
    const fetchWithThrottle = vi.fn(async () => freshTranscript);
    const getTranscript = createTranscriptFetchWithCacheBypass({
      getDb: () => ({ ok: true }),
      readCachedTranscript: vi.fn(async () => null),
      fetchWithThrottle,
    });

    const result = await getTranscript('video123', { requestClass: 'interactive', reason: 'manual_probe' });

    expect(result).toEqual(freshTranscript);
    expect(fetchWithThrottle).toHaveBeenCalledWith('video123', {
      requestClass: 'interactive',
      reason: 'manual_probe',
    });
  });

  it('fails open on cache-read errors and still uses throttled fetch', async () => {
    const freshTranscript = {
      text: 'fresh transcript',
      source: 'youtube_timedtext',
      confidence: null,
    };
    const fetchWithThrottle = vi.fn(async () => freshTranscript);
    const getTranscript = createTranscriptFetchWithCacheBypass({
      getDb: () => ({ ok: true }),
      readCachedTranscript: vi.fn(async () => {
        throw new Error('cache unavailable');
      }),
      fetchWithThrottle,
    });

    const result = await getTranscript('video123');

    expect(result).toEqual(freshTranscript);
    expect(fetchWithThrottle).toHaveBeenCalledWith('video123', {
      requestClass: 'background',
      reason: 'pipeline_transcript_fetch',
    });
  });
});
