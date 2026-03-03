import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTranscriptFromYtToText } from '../../server/transcript/providers/ytToTextProvider';
import { getTranscriptFromYouTubeTimedtext } from '../../server/transcript/providers/youtubeTimedtextProvider';
import {
  resetYtToTextProxyDispatcher,
  setYtToTextProxyAgentFactoryForTests,
  setYtToTextUndiciRequestForTests,
} from '../../server/services/webshareProxy';
import { TranscriptProviderError } from '../../server/transcript/types';

const originalFetch = global.fetch;
const proxyEnvKeys = [
  'YT_TO_TEXT_USE_WEBSHARE_PROXY',
  'WEBSHARE_PROXY_URL',
  'WEBSHARE_PROXY_HOST',
  'WEBSHARE_PROXY_PORT',
  'WEBSHARE_PROXY_USERNAME',
  'WEBSHARE_PROXY_PASSWORD',
] as const;
const originalProxyEnv = new Map(proxyEnvKeys.map((key) => [key, process.env[key]]));

afterEach(async () => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
  for (const key of proxyEnvKeys) {
    const value = originalProxyEnv.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  await resetYtToTextProxyDispatcher();
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

  it('uses the lower-level undici request path for yt_to_text when the Webshare proxy toggle is enabled', async () => {
    process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY = 'true';
    process.env.WEBSHARE_PROXY_HOST = '127.0.0.1';
    process.env.WEBSHARE_PROXY_PORT = '8080';
    process.env.WEBSHARE_PROXY_USERNAME = 'user_name';
    process.env.WEBSHARE_PROXY_PASSWORD = 'pass_word';
    setYtToTextProxyAgentFactoryForTests(class {
      constructor(_options: unknown) {}

      destroy() {
        return undefined;
      }
    });
    const mockRequest = vi.fn(async () => ({
      statusCode: 200,
      headers: {},
      body: {
        json: async () => ({
          data: {
            transcripts: [
              { t: 'Hello world', s: 0, e: 1 },
            ],
          },
        }),
      },
    }));
    setYtToTextUndiciRequestForTests(mockRequest);

    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    await getTranscriptFromYtToText('video123');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    const requestInit = mockRequest.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(requestInit?.dispatcher).toBeTruthy();
  });

  it('maps proxied yt_to_text HTTP 429 to RATE_LIMITED with retry-after seconds', async () => {
    process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY = 'true';
    process.env.WEBSHARE_PROXY_HOST = '127.0.0.1';
    process.env.WEBSHARE_PROXY_PORT = '8080';
    process.env.WEBSHARE_PROXY_USERNAME = 'user_name';
    process.env.WEBSHARE_PROXY_PASSWORD = 'pass_word';
    setYtToTextProxyAgentFactoryForTests(class {
      constructor(_options: unknown) {}

      destroy() {
        return undefined;
      }
    });
    setYtToTextUndiciRequestForTests(async () => ({
      statusCode: 429,
      headers: { 'retry-after': '7' },
      body: {
        json: async () => null,
      },
    }));
    global.fetch = vi.fn() as unknown as typeof fetch;

    let caught: unknown = null;
    try {
      await getTranscriptFromYtToText('video123');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TranscriptProviderError);
    expect((caught as TranscriptProviderError).code).toBe('RATE_LIMITED');
    expect((caught as TranscriptProviderError).retryAfterSeconds).toBe(7);
  });

  it('falls back to a direct yt_to_text request when proxy toggle is enabled but config is incomplete', async () => {
    process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY = 'true';
    delete process.env.WEBSHARE_PROXY_URL;
    delete process.env.WEBSHARE_PROXY_HOST;
    delete process.env.WEBSHARE_PROXY_PORT;
    delete process.env.WEBSHARE_PROXY_USERNAME;
    delete process.env.WEBSHARE_PROXY_PASSWORD;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      data: {
        transcripts: [
          { t: 'Hello again', s: 0, e: 1 },
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    global.fetch = mockFetch as unknown as typeof fetch;

    await getTranscriptFromYtToText('video123');

    const requestInit = mockFetch.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(requestInit).toBeTruthy();
    expect(requestInit?.dispatcher).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
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
