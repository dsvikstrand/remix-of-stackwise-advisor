import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTranscriptFromVideoTranscriberTemp,
  resetVideoTranscriberTempProviderStateForTests,
  videoTranscriberTempTranscriptProviderAdapter,
} from '../../server/transcript/providers/videoTranscriberTempProvider';
import {
  resetTranscriptProxyDispatcher,
  setTranscriptProxyAgentFactoryForTests,
  setTranscriptUndiciRequestForTests,
} from '../../server/services/webshareProxy';
import { TranscriptProviderError } from '../../server/transcript/types';

const originalFetch = global.fetch;
const providerEnvKeys = [
  'VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS',
  'VIDEOTRANSCRIBER_TEMP_FORCE_NEW_SESSION',
  'TRANSCRIPT_USE_WEBSHARE_PROXY',
  'WEBSHARE_PROXY_URL',
  'WEBSHARE_PROXY_HOST',
  'WEBSHARE_PROXY_PORT',
  'WEBSHARE_PROXY_USERNAME',
  'WEBSHARE_PROXY_PASSWORD',
] as const;
const originalEnv = new Map(providerEnvKeys.map((key) => [key, process.env[key]]));

function buildRuntimeConfigHtml(key = 'test-transcript-key') {
  return `<html><script>window.__NUXT__={config:{transcriptKey:"${key}"}}</script></html>`;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function readCookieSession(init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const cookie = headers.get('Cookie') || '';
  return cookie.replace(/^anonymous_user_id=/, '');
}

function proxyJsonResponse(body: unknown, init?: { statusCode?: number; headers?: Record<string, string> }) {
  const jsonBody = JSON.stringify(body);
  return {
    statusCode: init?.statusCode ?? 200,
    headers: init?.headers || {},
    body: {
      json: async () => body,
      text: async () => jsonBody,
    },
  };
}

function proxyTextResponse(text: string, init?: { statusCode?: number; headers?: Record<string, string> }) {
  return {
    statusCode: init?.statusCode ?? 200,
    headers: init?.headers || {},
    body: {
      text: async () => text,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
  resetVideoTranscriberTempProviderStateForTests();
  for (const key of providerEnvKeys) {
    const value = originalEnv.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  return resetTranscriptProxyDispatcher();
});

describe('videotranscriber_temp provider', () => {
  it('returns a transcript from an inline record transcript payload', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return jsonResponse({
          code: 100000,
          data: { audio_id: 'record-123' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-123')) {
        return jsonResponse({
          code: 100000,
          data: {
            record_id: 'record-123',
            status: 'success',
            transcript: [
              { start: 0, end: 2, text: 'Hello' },
              { start: 2, end: 4, text: 'world' },
            ],
          },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const result = await getTranscriptFromVideoTranscriberTemp('video123');

    expect(result).toMatchObject({
      text: 'Hello world',
      source: 'videotranscriber_temp',
      confidence: null,
      transport: {
        provider: 'videotranscriber_temp',
        proxy_enabled: false,
        proxy_mode: 'direct',
      },
      provider_trace: {
        winning_provider: 'videotranscriber_temp',
        used_fallback: false,
        session_mode: 'shared',
        session_rotated: false,
        session_value: expect.stringMatching(/^sid_[0-9a-f]{12}$/),
        session_initial_value: expect.stringMatching(/^sid_[0-9a-f]{12}$/),
      },
    });
    expect(result.provider_trace?.session_value).toBe(result.provider_trace?.session_initial_value);
    expect(result.segments).toEqual([
      { text: 'Hello', startSec: 0, endSec: 2 },
      { text: 'world', startSec: 2, endSec: 4 },
    ]);
  });

  it('rotates anonymous session after queue-full and then succeeds', async () => {
    const startSessions: string[] = [];
    let startCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        startCalls += 1;
        startSessions.push(readCookieSession(init));
        if (startCalls === 1) {
          return jsonResponse({
            code: 164002,
            message: 'You have 5 tasks in processing. Please try again later.',
            data: null,
          });
        }
        return jsonResponse({
          code: 100000,
          data: { audio_id: 'record-rotate' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-rotate')) {
        return jsonResponse({
          code: 100000,
          data: {
            record_id: 'record-rotate',
            status: 'success',
            transcript: [{ start: 0, end: 1, text: 'Rotated session success' }],
          },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const result = await getTranscriptFromVideoTranscriberTemp('video123');

    expect(result.text).toBe('Rotated session success');
    expect(startSessions).toHaveLength(2);
    expect(startSessions[0]).not.toBe('');
    expect(startSessions[1]).not.toBe('');
    expect(startSessions[1]).not.toBe(startSessions[0]);
    expect(result.provider_trace).toMatchObject({
      winning_provider: 'videotranscriber_temp',
      session_mode: 'shared',
      session_rotated: true,
      session_value: expect.stringMatching(/^sid_[0-9a-f]{12}$/),
      session_initial_value: expect.stringMatching(/^sid_[0-9a-f]{12}$/),
    });
    expect(result.provider_trace?.session_value).not.toBe(result.provider_trace?.session_initial_value);
  });

  it('renews cached key and forces a new session once after upstream service failure', async () => {
    const runtimeConfigSessions: string[] = [];
    const runtimeConfigKeys: string[] = [];
    const startSessions: string[] = [];
    let startCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        const session = readCookieSession(init);
        runtimeConfigSessions.push(session);
        const nextKey = `renew-key-${runtimeConfigSessions.length}`;
        runtimeConfigKeys.push(nextKey);
        return new Response(buildRuntimeConfigHtml(nextKey), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        startCalls += 1;
        startSessions.push(readCookieSession(init));
        if (startCalls === 1) {
          return new Response('<html>gateway timeout</html>', { status: 504 });
        }
        return jsonResponse({
          code: 100000,
          data: { audio_id: 'record-renew-success' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-renew-success')) {
        return jsonResponse({
          code: 100000,
          data: {
            record_id: 'record-renew-success',
            status: 'success',
            transcript: [{ start: 0, end: 1, text: 'Renewed session success' }],
          },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const result = await getTranscriptFromVideoTranscriberTemp('video123');

    expect(result.text).toBe('Renewed session success');
    expect(runtimeConfigKeys).toEqual(['renew-key-1', 'renew-key-2']);
    expect(runtimeConfigSessions).toHaveLength(2);
    expect(startSessions).toHaveLength(2);
    expect(runtimeConfigSessions[1]).not.toBe(runtimeConfigSessions[0]);
    expect(startSessions[1]).not.toBe(startSessions[0]);
    expect(result.provider_trace).toMatchObject({
      winning_provider: 'videotranscriber_temp',
      session_mode: 'force_new',
      session_rotated: false,
      session_value: expect.stringMatching(/^sid_[0-9a-f]{12}$/),
      session_initial_value: expect.stringMatching(/^sid_[0-9a-f]{12}$/),
    });
    expect(result.provider_trace?.session_value).toBe(result.provider_trace?.session_initial_value);
  });

  it('does one renew attempt only on repeated upstream service failures', async () => {
    const runtimeConfigSessions: string[] = [];
    const startSessions: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        runtimeConfigSessions.push(readCookieSession(init));
        return new Response(buildRuntimeConfigHtml(`loop-key-${runtimeConfigSessions.length}`), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        startSessions.push(readCookieSession(init));
        return new Response('<html>gateway timeout</html>', { status: 504 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    await expect(getTranscriptFromVideoTranscriberTemp('video123')).rejects.toMatchObject({
      code: 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE',
      providerDebug: {
        provider: 'videotranscriber_temp',
        stage: 'start',
        http_status: 504,
        session_mode: 'force_new',
      },
    });

    expect(runtimeConfigSessions).toHaveLength(2);
    expect(startSessions).toHaveLength(2);
    expect(runtimeConfigSessions[1]).not.toBe(runtimeConfigSessions[0]);
    expect(startSessions[1]).not.toBe(startSessions[0]);
  });

  it('maps repeated queue-full responses to RATE_LIMITED', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return jsonResponse({
          code: 164002,
          message: 'You have 5 tasks in processing. Please try again later.',
          data: null,
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    await expect(getTranscriptFromVideoTranscriberTemp('video123')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      providerDebug: {
        provider: 'videotranscriber_temp',
        stage: 'start',
        provider_error_code: '164002',
        session_mode: 'shared',
        session_rotated: true,
        session_value: expect.stringMatching(/^sid_[0-9a-f]{12}$/),
        session_initial_value: expect.stringMatching(/^sid_[0-9a-f]{12}$/),
      },
    });
  });

  it('maps daily-limit responses to a specific temp-provider error', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return jsonResponse({
          code: 164005,
          message: 'You have reached the daily limit. Please try again tomorrow.',
          data: null,
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    await expect(getTranscriptFromVideoTranscriberTemp('video123')).rejects.toMatchObject({
      code: 'VIDEOTRANSCRIBER_DAILY_LIMIT',
      providerDebug: {
        provider: 'videotranscriber_temp',
        stage: 'start',
        provider_error_code: '164005',
      },
    });
  });

  it('falls back to get-transcript metadata when the record has no inline transcript', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return jsonResponse({
          code: 100000,
          data: { audio_id: 'record-fallback-meta' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-fallback-meta')) {
        return jsonResponse({
          code: 100000,
          data: {
            record_id: 'record-fallback-meta',
            status: 'success',
            transcript: [],
          },
        });
      }
      if (url.includes('/api/v1/transcriptions/get-transcript')) {
        return jsonResponse({
          code: 100000,
          data: { transcript_url: 'https://cdn.example.com/transcript-meta.json' },
        });
      }
      if (url === 'https://cdn.example.com/transcript-meta.json') {
        return new Response(JSON.stringify({
          transcript: [
            { start: 0, end: 1, text: 'From meta' },
            { start: 1, end: 2, text: 'fallback' },
          ],
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const result = await getTranscriptFromVideoTranscriberTemp('video123');
    expect(result.text).toBe('From meta fallback');
  });

  it('falls back to record transcript_url when present', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return jsonResponse({
          code: 100000,
          data: { audio_id: 'record-direct-url' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-direct-url')) {
        return jsonResponse({
          code: 100000,
          data: {
            record_id: 'record-direct-url',
            status: 'success',
            transcript: [],
            transcript_url: 'https://cdn.example.com/transcript.txt',
          },
        });
      }
      if (url === 'https://cdn.example.com/transcript.txt') {
        return new Response('Plain text transcript fallback', { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/get-transcript')) {
        return jsonResponse({
          code: 100001,
          message: 'missing',
          data: null,
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const result = await getTranscriptFromVideoTranscriberTemp('video123');
    expect(result.text).toBe('Plain text transcript fallback');
  });

  it('maps access-denied responses to ACCESS_DENIED', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return new Response(JSON.stringify({
          code: 403001,
          message: 'access denied',
          data: null,
        }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    await expect(getTranscriptFromVideoTranscriberTemp('video123')).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
      providerDebug: {
        provider: 'videotranscriber_temp',
        stage: 'url_info',
        http_status: 403,
      },
    });
  });

  it('maps unavailable responses to VIDEO_UNAVAILABLE', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return new Response(JSON.stringify({
          code: 404001,
          message: 'video unavailable',
          data: null,
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    await expect(getTranscriptFromVideoTranscriberTemp('video123')).rejects.toMatchObject({
      code: 'VIDEO_UNAVAILABLE',
      providerDebug: {
        provider: 'videotranscriber_temp',
        stage: 'url_info',
        http_status: 404,
      },
    });
  });

  it('maps empty transcript resolution to TRANSCRIPT_EMPTY', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return jsonResponse({
          code: 100000,
          data: { audio_id: 'record-empty' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-empty')) {
        return jsonResponse({
          code: 100000,
          data: {
            record_id: 'record-empty',
            status: 'success',
            transcript: [],
          },
        });
      }
      if (url.includes('/api/v1/transcriptions/get-transcript')) {
        return jsonResponse({
          code: 100001,
          message: 'missing',
          data: null,
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    await expect(getTranscriptFromVideoTranscriberTemp('video123')).rejects.toMatchObject({
      code: 'TRANSCRIPT_EMPTY',
      providerDebug: {
        provider: 'videotranscriber_temp',
        stage: 'transcript_resolution',
      },
    });
  });

  it('reuses one session by default across top-level requests and rotates when force-new-session is enabled', async () => {
    const requestSessions: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        requestSessions.push(readCookieSession(init));
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return jsonResponse({
          code: 100000,
          data: { audio_id: `record-${requestSessions.length}` },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=')) {
        return jsonResponse({
          code: 100000,
          data: {
            status: 'success',
            transcript: [{ start: 0, end: 1, text: 'ok' }],
          },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const firstShared = await getTranscriptFromVideoTranscriberTemp('video123');
    const secondShared = await getTranscriptFromVideoTranscriberTemp('video456');
    expect(requestSessions).toHaveLength(2);
    expect(requestSessions[0]).toBe(requestSessions[1]);
    expect(firstShared.provider_trace?.session_mode).toBe('shared');
    expect(secondShared.provider_trace?.session_mode).toBe('shared');
    expect(firstShared.provider_trace?.session_value).toBe(secondShared.provider_trace?.session_value);

    resetVideoTranscriberTempProviderStateForTests();
    requestSessions.length = 0;
    process.env.VIDEOTRANSCRIBER_TEMP_FORCE_NEW_SESSION = 'true';

    const firstForced = await getTranscriptFromVideoTranscriberTemp('video123');
    const secondForced = await getTranscriptFromVideoTranscriberTemp('video456');
    expect(requestSessions).toHaveLength(2);
    expect(requestSessions[0]).not.toBe(requestSessions[1]);
    expect(firstForced.provider_trace?.session_mode).toBe('force_new');
    expect(secondForced.provider_trace?.session_mode).toBe('force_new');
    expect(firstForced.provider_trace?.session_value).not.toBe(secondForced.provider_trace?.session_value);
  });

  it('reads the timeout override from env on the adapter', () => {
    delete process.env.VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS;
    expect(videoTranscriberTempTranscriptProviderAdapter.timeoutMs).toBe(180000);

    process.env.VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS = '999999';
    expect(videoTranscriberTempTranscriptProviderAdapter.timeoutMs).toBe(600000);

    process.env.VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS = '1000';
    expect(videoTranscriberTempTranscriptProviderAdapter.timeoutMs).toBe(30000);
  });

  it('uses the shared Webshare proxy path when enabled', async () => {
    process.env.TRANSCRIPT_USE_WEBSHARE_PROXY = 'true';
    process.env.WEBSHARE_PROXY_HOST = '127.0.0.1';
    process.env.WEBSHARE_PROXY_PORT = '8080';
    process.env.WEBSHARE_PROXY_USERNAME = 'user_name';
    process.env.WEBSHARE_PROXY_PASSWORD = 'pass_word';
    setTranscriptProxyAgentFactoryForTests(class {
      constructor(_options: unknown) {}

      destroy() {
        return undefined;
      }
    });
    const mockRequest = vi.fn(async (url: string) => {
      if (url === 'https://videotranscriber.ai') {
        return proxyTextResponse(buildRuntimeConfigHtml());
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return proxyJsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return proxyJsonResponse({
          code: 100000,
          data: { audio_id: 'record-proxied' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-proxied')) {
        return proxyJsonResponse({
          code: 100000,
          data: {
            record_id: 'record-proxied',
            status: 'success',
            transcript: [{ start: 0, end: 1, text: 'Proxy success' }],
          },
        });
      }
      throw new Error(`Unexpected proxy request ${url}`);
    });
    setTranscriptUndiciRequestForTests(mockRequest);
    const mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await getTranscriptFromVideoTranscriberTemp('video123');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledTimes(4);
    expect(result.transport).toMatchObject({
      provider: 'videotranscriber_temp',
      proxy_enabled: true,
      proxy_mode: 'webshare_explicit',
      proxy_selector: 'explicit',
      proxy_selected_index: null,
      proxy_host: '127.0.0.1',
    });
  });

  it('falls back to direct requests when shared proxy config is incomplete', async () => {
    process.env.TRANSCRIPT_USE_WEBSHARE_PROXY = 'true';
    delete process.env.WEBSHARE_PROXY_URL;
    delete process.env.WEBSHARE_PROXY_HOST;
    delete process.env.WEBSHARE_PROXY_PORT;
    delete process.env.WEBSHARE_PROXY_USERNAME;
    delete process.env.WEBSHARE_PROXY_PASSWORD;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return jsonResponse({
          code: 100000,
          data: { audio_id: 'record-direct-fallback' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-direct-fallback')) {
        return jsonResponse({
          code: 100000,
          data: {
            status: 'success',
            transcript: [{ start: 0, end: 1, text: 'Direct fallback ok' }],
          },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const result = await getTranscriptFromVideoTranscriberTemp('video123');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(result.transport).toMatchObject({
      provider: 'videotranscriber_temp',
      proxy_enabled: false,
      proxy_mode: 'direct',
      proxy_selector: null,
      proxy_selected_index: null,
      proxy_host: null,
    });
  });

  it('maps shared proxy transport failures to temp-provider upstream unavailable with stage debug', async () => {
    process.env.TRANSCRIPT_USE_WEBSHARE_PROXY = 'true';
    process.env.WEBSHARE_PROXY_HOST = '127.0.0.1';
    process.env.WEBSHARE_PROXY_PORT = '8080';
    process.env.WEBSHARE_PROXY_USERNAME = 'user_name';
    process.env.WEBSHARE_PROXY_PASSWORD = 'pass_word';
    setTranscriptProxyAgentFactoryForTests(class {
      constructor(_options: unknown) {}

      destroy() {
        return undefined;
      }
    });
    setTranscriptUndiciRequestForTests(async () => {
      throw new Error('proxy socket hang up');
    });
    global.fetch = vi.fn() as unknown as typeof fetch;

    await expect(getTranscriptFromVideoTranscriberTemp('video123')).rejects.toMatchObject({
      code: 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE',
      providerDebug: {
        provider: 'videotranscriber_temp',
        stage: 'runtime_config',
        provider_error_code: 'TRANSPORT_FAIL',
      },
    });
  });

  it('maps direct upstream 502 responses to temp-provider upstream unavailable', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://videotranscriber.ai') {
        return new Response(buildRuntimeConfigHtml(), { status: 200 });
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return jsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return new Response('<html><title>502 Bad Gateway</title></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    await expect(getTranscriptFromVideoTranscriberTemp('video123')).rejects.toMatchObject({
      code: 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE',
      providerDebug: {
        provider: 'videotranscriber_temp',
        stage: 'start',
        http_status: 502,
        provider_error_code: 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE',
      },
    });
  });

  it('uses the shared Webshare proxy path for transcript_url fallback', async () => {
    process.env.TRANSCRIPT_USE_WEBSHARE_PROXY = 'true';
    process.env.WEBSHARE_PROXY_HOST = '127.0.0.1';
    process.env.WEBSHARE_PROXY_PORT = '8080';
    process.env.WEBSHARE_PROXY_USERNAME = 'user_name';
    process.env.WEBSHARE_PROXY_PASSWORD = 'pass_word';
    setTranscriptProxyAgentFactoryForTests(class {
      constructor(_options: unknown) {}

      destroy() {
        return undefined;
      }
    });
    const mockRequest = vi.fn(async (url: string) => {
      if (url === 'https://videotranscriber.ai') {
        return proxyTextResponse(buildRuntimeConfigHtml());
      }
      if (url.includes('/api/v1/transcriptions/url-info')) {
        return proxyJsonResponse({
          code: 100000,
          data: { title: 'Demo title', audio_time: 494 },
        });
      }
      if (url.endsWith('/api/v1/transcriptions/start')) {
        return proxyJsonResponse({
          code: 100000,
          data: { audio_id: 'record-proxy-fallback' },
        });
      }
      if (url.includes('/api/v1/transcriptions?record_id=record-proxy-fallback')) {
        return proxyJsonResponse({
          code: 100000,
          data: {
            record_id: 'record-proxy-fallback',
            status: 'success',
            transcript: [],
            transcript_url: 'https://cdn.example.com/proxied-transcript.txt',
          },
        });
      }
      if (url.includes('/api/v1/transcriptions/get-transcript')) {
        return proxyJsonResponse({
          code: 100001,
          message: 'missing',
          data: null,
        });
      }
      if (url === 'https://cdn.example.com/proxied-transcript.txt') {
        return proxyTextResponse('Proxy transcript url fallback');
      }
      throw new Error(`Unexpected proxy request ${url}`);
    });
    setTranscriptUndiciRequestForTests(mockRequest);
    global.fetch = vi.fn() as unknown as typeof fetch;

    const result = await getTranscriptFromVideoTranscriberTemp('video123');

    expect(result.text).toBe('Proxy transcript url fallback');
    expect(result.transport).toMatchObject({
      provider: 'videotranscriber_temp',
      proxy_enabled: true,
    });
  });
});
