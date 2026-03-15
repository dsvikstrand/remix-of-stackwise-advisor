import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTranscriptFromYouTubeTimedtext } from '../../server/transcript/providers/youtubeTimedtextProvider';
import { TranscriptProviderError } from '../../server/transcript/types';

const originalFetch = global.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

describe('transcript providers rate-limit mapping', () => {
  it('maps youtube_timedtext HTTP 429 to RATE_LIMITED and parses retry-after date', async () => {
    const retryAt = new Date(Date.now() + 4000).toUTCString();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('<transcript_list><track lang_code="en"/></transcript_list>', {
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 429,
        headers: { 'Retry-After': retryAt },
      }));
    global.fetch = mockFetch as unknown as typeof fetch;

    let caught: unknown = null;
    try {
      await getTranscriptFromYouTubeTimedtext('video123');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TranscriptProviderError);
    expect((caught as TranscriptProviderError).code).toBe('RATE_LIMITED');
    expect(((caught as TranscriptProviderError).retryAfterSeconds || 0) >= 1).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('maps youtube_timedtext metadata HTTP 403 to ACCESS_DENIED', async () => {
    global.fetch = vi.fn(async () => new Response(null, {
      status: 403,
    })) as unknown as typeof fetch;

    await expect(getTranscriptFromYouTubeTimedtext('video123')).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
      providerDebug: {
        provider: 'youtube_timedtext',
        stage: 'track_list',
        http_status: 403,
        provider_error_code: 'ACCESS_DENIED',
      },
    });
  });

  it('maps youtube_timedtext metadata HTTP 404 to VIDEO_UNAVAILABLE', async () => {
    global.fetch = vi.fn(async () => new Response(null, {
      status: 404,
    })) as unknown as typeof fetch;

    await expect(getTranscriptFromYouTubeTimedtext('video123')).rejects.toMatchObject({
      code: 'VIDEO_UNAVAILABLE',
      providerDebug: {
        provider: 'youtube_timedtext',
        stage: 'track_list',
        http_status: 404,
        provider_error_code: 'VIDEO_UNAVAILABLE',
      },
    });
  });

  it('returns normalized transcript text from json3 content', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('<transcript_list><track lang_code="en"/></transcript_list>', {
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        events: [
          { segs: [{ utf8: 'Hello' }] },
          { segs: [{ utf8: 'world' }] },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await getTranscriptFromYouTubeTimedtext('video123');

    expect(result).toMatchObject({
      text: 'Hello world',
      source: 'youtube_timedtext',
      confidence: null,
    });
  });
});
