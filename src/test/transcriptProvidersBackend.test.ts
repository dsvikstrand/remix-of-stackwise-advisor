import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTranscriptFromYtToText } from '../../server/transcript/providers/ytToTextProvider';
import { getTranscriptFromYouTubeTimedtext } from '../../server/transcript/providers/youtubeTimedtextProvider';
import { TranscriptProviderError } from '../../server/transcript/types';

const originalFetch = global.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

describe('transcript providers rate-limit mapping', () => {
  it('maps yt_to_text HTTP 429 to RATE_LIMITED with retry-after seconds', async () => {
    global.fetch = vi.fn(async () => new Response(null, {
      status: 429,
      headers: { 'Retry-After': '12' },
    })) as unknown as typeof fetch;

    let caught: unknown = null;
    try {
      await getTranscriptFromYtToText('video123');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TranscriptProviderError);
    expect((caught as TranscriptProviderError).code).toBe('RATE_LIMITED');
    expect((caught as TranscriptProviderError).retryAfterSeconds).toBe(12);
  });

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
});

