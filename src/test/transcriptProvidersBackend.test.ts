import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTranscriptFromYouTubeTimedtext } from '../../server/transcript/providers/youtubeTimedtextProvider';
import { TranscriptProviderError } from '../../server/transcript/types';
import * as webshareProxy from '../../server/services/webshareProxy';

const originalFetch = global.fetch;
const originalRetryAttempts = process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_ATTEMPTS;
const originalRetryBaseDelayMs = process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_BASE_DELAY_MS;

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
  if (originalRetryAttempts == null) delete process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_ATTEMPTS;
  else process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_ATTEMPTS = originalRetryAttempts;
  if (originalRetryBaseDelayMs == null) delete process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_BASE_DELAY_MS;
  else process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_BASE_DELAY_MS = originalRetryBaseDelayMs;
});

describe('transcript providers rate-limit mapping', () => {
  it('maps youtube_timedtext HTTP 429 to RATE_LIMITED and parses retry-after date', async () => {
    process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_ATTEMPTS = '1';
    process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_BASE_DELAY_MS = '0';

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

  it('retries transient 429 failures before succeeding', async () => {
    process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_ATTEMPTS = '3';
    process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_BASE_DELAY_MS = '0';

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 429 }))
      .mockResolvedValueOnce(new Response('<transcript_list><track lang_code="en"/></transcript_list>', {
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        events: [{ segs: [{ utf8: 'Recovered' }] }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await getTranscriptFromYouTubeTimedtext('video123');

    expect(result.text).toBe('Recovered');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries transport failures before succeeding', async () => {
    process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_ATTEMPTS = '3';
    process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_BASE_DELAY_MS = '0';

    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(new Response('<transcript_list><track lang_code="en"/></transcript_list>', {
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        events: [{ segs: [{ utf8: 'Recovered transport' }] }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await getTranscriptFromYouTubeTimedtext('video123');

    expect(result.text).toBe('Recovered transport');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent metadata failures', async () => {
    process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_ATTEMPTS = '3';
    process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_BASE_DELAY_MS = '0';

    const mockFetch = vi.fn(async () => new Response(null, {
      status: 403,
    }));
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(getTranscriptFromYouTubeTimedtext('video123')).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses Webshare transport for timedtext when proxy tools are available', async () => {
    const proxyRequest = vi.fn()
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'text/xml' },
        body: {
          text: async () => '<transcript_list><track lang_code="en"/></transcript_list>',
        },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: {
          text: async () => JSON.stringify({
            events: [{ segs: [{ utf8: 'Proxy transcript' }] }],
          }),
        },
      });
    vi.spyOn(webshareProxy, 'getWebshareProxyRequestTools').mockResolvedValue({
      dispatcher: {},
      request: proxyRequest,
      transport: {
        provider: 'youtube_timedtext',
        proxy_enabled: true,
        proxy_mode: 'webshare_explicit',
        proxy_selector: 'explicit',
        proxy_selected_index: null,
        proxy_host: 'p.webshare.io',
      },
    });
    global.fetch = vi.fn(() => {
      throw new Error('direct fetch should not be used');
    }) as unknown as typeof fetch;

    const result = await getTranscriptFromYouTubeTimedtext('video123');

    expect(result).toMatchObject({
      text: 'Proxy transcript',
      source: 'youtube_timedtext',
      transport: {
        proxy_enabled: true,
        proxy_mode: 'webshare_explicit',
        proxy_host: 'p.webshare.io',
      },
    });
    expect(proxyRequest).toHaveBeenCalledTimes(2);
  });
});
