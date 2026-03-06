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
  'YT_TO_TEXT_PROXY_SELECT_BY_INDEX',
  'YT_TO_TEXT_PROXY_INDEX',
  'WEBSHARE_API_KEY',
  'WEBSHARE_PLAN_ID',
  'WEBSHARE_BASE_URL',
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
    expect((caught as TranscriptProviderError).providerDebug).toMatchObject({
      provider: 'yt_to_text',
      stage: 'subtitles',
      http_status: 429,
      retry_after_seconds: 12,
      provider_error_code: 'RATE_LIMITED',
    });
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

    const transcript = await getTranscriptFromYtToText('video123');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    const requestInit = mockRequest.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(requestInit?.dispatcher).toBeTruthy();
    expect(transcript.transport).toMatchObject({
      proxy_enabled: true,
      proxy_mode: 'webshare_explicit',
      proxy_selector: 'explicit',
      proxy_selected_index: null,
      proxy_host: '127.0.0.1',
    });
  });

  it('selects one fixed Webshare direct proxy by zero-based index when the selector flag is enabled', async () => {
    process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY = 'true';
    process.env.YT_TO_TEXT_PROXY_SELECT_BY_INDEX = 'true';
    process.env.YT_TO_TEXT_PROXY_INDEX = '1';
    process.env.WEBSHARE_API_KEY = 'api_key';
    process.env.WEBSHARE_PLAN_ID = 'plan_123';
    process.env.WEBSHARE_BASE_URL = 'https://proxy.webshare.io/api';

    const seenProxyConfigs: Array<{ uri?: string; token?: string }> = [];
    setYtToTextProxyAgentFactoryForTests(class {
      constructor(options: unknown) {
        seenProxyConfigs.push(options as { uri?: string; token?: string });
      }

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
              { t: 'Hello from index selection', s: 0, e: 1 },
            ],
          },
        }),
      },
    }));
    setYtToTextUndiciRequestForTests(mockRequest);

    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      results: [
        {
          proxy_address: '10.0.0.1',
          port: 6001,
          username: 'first_user',
          password: 'first_pass',
          valid: true,
        },
        {
          proxy_address: '10.0.0.2',
          port: 6002,
          username: 'second_user',
          password: 'second_pass',
          valid: true,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    global.fetch = mockFetch as unknown as typeof fetch;

    await getTranscriptFromYtToText('video123');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0]?.[0] || '')).toContain('/v2/proxy/list/?mode=direct&plan_id=plan_123');
    expect(seenProxyConfigs).toHaveLength(1);
    expect(seenProxyConfigs[0]?.uri).toBe('http://10.0.0.2:6002/');
    expect(typeof seenProxyConfigs[0]?.token).toBe('string');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('supports YT_TO_TEXT_PROXY_INDEX=rand by selecting one random proxy once and reusing it for the process', async () => {
    process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY = 'true';
    process.env.YT_TO_TEXT_PROXY_SELECT_BY_INDEX = 'true';
    process.env.YT_TO_TEXT_PROXY_INDEX = 'rand';
    process.env.WEBSHARE_API_KEY = 'api_key';
    process.env.WEBSHARE_PLAN_ID = 'plan_123';
    process.env.WEBSHARE_BASE_URL = 'https://proxy.webshare.io/api';

    vi.spyOn(Math, 'random').mockReturnValue(0.74);

    const seenProxyConfigs: Array<{ uri?: string; token?: string }> = [];
    setYtToTextProxyAgentFactoryForTests(class {
      constructor(options: unknown) {
        seenProxyConfigs.push(options as { uri?: string; token?: string });
      }

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
              { t: 'Hello from random selection', s: 0, e: 1 },
            ],
          },
        }),
      },
    }));
    setYtToTextUndiciRequestForTests(mockRequest);

    const mockFetch = vi.fn(async () => new Response(JSON.stringify({
      results: [
        {
          proxy_address: '10.0.0.1',
          port: 6001,
          username: 'first_user',
          password: 'first_pass',
          valid: true,
        },
        {
          proxy_address: '10.0.0.2',
          port: 6002,
          username: 'second_user',
          password: 'second_pass',
          valid: true,
        },
        {
          proxy_address: '10.0.0.3',
          port: 6003,
          username: 'third_user',
          password: 'third_pass',
          valid: true,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    global.fetch = mockFetch as unknown as typeof fetch;

    const firstTranscript = await getTranscriptFromYtToText('video123');
    const secondTranscript = await getTranscriptFromYtToText('video456');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(seenProxyConfigs).toHaveLength(1);
    expect(seenProxyConfigs[0]?.uri).toBe('http://10.0.0.3:6003/');
    expect(typeof seenProxyConfigs[0]?.token).toBe('string');
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(firstTranscript.transport).toMatchObject({
      proxy_enabled: true,
      proxy_mode: 'webshare_index',
      proxy_selector: 'rand',
      proxy_selected_index: 2,
      proxy_host: '10.0.0.3',
    });
    expect(secondTranscript.transport).toEqual(firstTranscript.transport);
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

    const transcript = await getTranscriptFromYtToText('video123');

    const requestInit = mockFetch.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(requestInit).toBeTruthy();
    expect(requestInit?.dispatcher).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(transcript.transport).toMatchObject({
      proxy_enabled: false,
      proxy_mode: 'direct',
      proxy_selector: null,
      proxy_selected_index: null,
      proxy_host: null,
    });
  });

  it('falls back to the explicit fixed proxy when the selected Webshare proxy index is out of range', async () => {
    process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY = 'true';
    process.env.YT_TO_TEXT_PROXY_SELECT_BY_INDEX = 'true';
    process.env.YT_TO_TEXT_PROXY_INDEX = '9';
    process.env.WEBSHARE_API_KEY = 'api_key';
    process.env.WEBSHARE_PLAN_ID = 'plan_123';
    process.env.WEBSHARE_PROXY_HOST = '127.0.0.1';
    process.env.WEBSHARE_PROXY_PORT = '8080';
    process.env.WEBSHARE_PROXY_USERNAME = 'user_name';
    process.env.WEBSHARE_PROXY_PASSWORD = 'pass_word';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const seenProxyConfigs: Array<{ uri?: string; token?: string }> = [];
    setYtToTextProxyAgentFactoryForTests(class {
      constructor(options: unknown) {
        seenProxyConfigs.push(options as { uri?: string; token?: string });
      }

      destroy() {
        return undefined;
      }
    });
    setYtToTextUndiciRequestForTests(async () => ({
      statusCode: 200,
      headers: {},
      body: {
        json: async () => ({
          data: {
            transcripts: [
              { t: 'Fallback worked', s: 0, e: 1 },
            ],
          },
        }),
      },
    }));

    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      results: [
        {
          proxy_address: '10.0.0.1',
          port: 6001,
          username: 'first_user',
          password: 'first_pass',
          valid: true,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

    await getTranscriptFromYtToText('video123');

    expect(seenProxyConfigs).toHaveLength(1);
    expect(seenProxyConfigs[0]?.uri).toBe('http://127.0.0.1:8080/');
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

  it('maps yt_to_text HTTP 404 to VIDEO_UNAVAILABLE', async () => {
    global.fetch = vi.fn(async () => new Response(null, {
      status: 404,
    })) as unknown as typeof fetch;

    await expect(getTranscriptFromYtToText('video123')).rejects.toMatchObject({
      code: 'VIDEO_UNAVAILABLE',
      providerDebug: {
        provider: 'yt_to_text',
        stage: 'subtitles',
        http_status: 404,
        provider_error_code: 'VIDEO_UNAVAILABLE',
      },
    });
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
});
