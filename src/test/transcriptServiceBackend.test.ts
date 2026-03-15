import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildTranscriptProviderRetryKey,
  createTranscriptService,
  resolveTranscriptOperationTimeoutMs,
  resolveTranscriptProvider,
} from '../../server/transcript/transcriptService';
import { resetTranscriptProviderCooldownsForTests } from '../../server/services/transcriptProviderCooldown';
import {
  listTranscriptProvidersForFallback,
  registerTranscriptProviders,
} from '../../server/transcript/providerRegistry';
import {
  TranscriptProviderError,
  type TranscriptProviderAdapter,
} from '../../server/transcript/types';

async function runImmediateRetryLoop<T>(
  options: {
    maxAttempts: number;
    isRetryable?: (error: unknown) => boolean;
  },
  task: (attempt: number) => Promise<T>,
) {
  let attempt = 1;
  while (true) {
    try {
      return await task(attempt);
    } catch (error) {
      if (attempt >= options.maxAttempts || !(options.isRetryable?.(error) ?? false)) {
        throw error;
      }
      attempt += 1;
    }
  }
}

function buildService(providers: TranscriptProviderAdapter[], overrides: Partial<Parameters<typeof createTranscriptService>[0]> = {}) {
  return createTranscriptService({
    resolveProvider: () => 'videotranscriber_temp',
    getProviderById: (providerId) => providers.find((row) => row.id === providerId) || null,
    listProvidersForProbe: () => providers,
    listProvidersForFallback: () => providers,
    providerRetryDefaults: {
      transcriptAttempts: 2,
      transcriptTimeoutMs: 1000,
    },
    timeoutMs: 1000,
    ...overrides,
  });
}

const originalTranscriptProvider = process.env.TRANSCRIPT_PROVIDER;

afterEach(() => {
  vi.restoreAllMocks();
  registerTranscriptProviders();
  resetTranscriptProviderCooldownsForTests();
  if (originalTranscriptProvider == null) delete process.env.TRANSCRIPT_PROVIDER;
  else process.env.TRANSCRIPT_PROVIDER = originalTranscriptProvider;
  delete process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_COOLDOWN_SECONDS;
});

describe('transcript service modularity (backend)', () => {
  it('resolves primary provider from TRANSCRIPT_PROVIDER', () => {
    delete process.env.TRANSCRIPT_PROVIDER;
    expect(resolveTranscriptProvider()).toBe('youtube_timedtext');

    process.env.TRANSCRIPT_PROVIDER = 'youtube_timedtext';
    expect(resolveTranscriptProvider()).toBe('youtube_timedtext');

    process.env.TRANSCRIPT_PROVIDER = 'videotranscriber_temp';
    expect(resolveTranscriptProvider()).toBe('videotranscriber_temp');

    process.env.TRANSCRIPT_PROVIDER = 'unsupported_provider';
    expect(resolveTranscriptProvider()).toBe('youtube_timedtext');
  });

  it('expands transcript operation timeout to match the selected provider timeout', () => {
    process.env.TRANSCRIPT_PROVIDER = 'videotranscriber_temp';
    registerTranscriptProviders([
      {
        id: 'youtube_timedtext',
        getTranscript: async () => ({ text: 'tt', source: 'youtube_timedtext', confidence: null }),
      },
      {
        id: 'videotranscriber_temp',
        timeoutMs: 180000,
        getTranscript: async () => ({ text: 'vt', source: 'videotranscriber_temp', confidence: null }),
      },
    ]);

    expect(resolveTranscriptOperationTimeoutMs(25000)).toBe(180000);
    expect(resolveTranscriptOperationTimeoutMs(200000)).toBe(200000);
  });

  it('keeps probe matrix semantics for mixed success and failure outcomes', async () => {
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => ({
          text: 'ok',
          source: 'videotranscriber_temp',
          confidence: null,
        }),
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          throw new TranscriptProviderError('NO_CAPTIONS', 'No captions');
        },
      },
    ];

    const result = await buildService(providers).probeTranscriptProviders('video123');
    expect(result.providers).toEqual([
      { provider: 'videotranscriber_temp', ok: true, error_code: null, provider_debug: null },
      { provider: 'youtube_timedtext', ok: false, error_code: 'NO_CAPTIONS', provider_debug: null },
    ]);
    expect(result.any_success).toBe(true);
    expect(result.all_no_captions).toBe(false);
  });

  it('marks all_no_captions when every provider returns NO_CAPTIONS', async () => {
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          throw new TranscriptProviderError('NO_CAPTIONS', 'No captions');
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          throw new TranscriptProviderError('NO_CAPTIONS', 'No captions');
        },
      },
    ];

    const result = await buildService(providers).probeTranscriptProviders('video123');
    expect(result.providers).toEqual([
      { provider: 'videotranscriber_temp', ok: false, error_code: 'NO_CAPTIONS', provider_debug: null },
      { provider: 'youtube_timedtext', ok: false, error_code: 'NO_CAPTIONS', provider_debug: null },
    ]);
    expect(result.any_success).toBe(false);
    expect(result.all_no_captions).toBe(true);
  });

  it('normalizes unknown provider errors as TRANSCRIPT_FETCH_FAIL', async () => {
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          throw new Error('Unexpected parse failure');
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          throw new TranscriptProviderError('NO_CAPTIONS', 'No captions');
        },
      },
    ];

    const result = await buildService(providers).probeTranscriptProviders('video123');
    expect(result.providers).toEqual([
      { provider: 'videotranscriber_temp', ok: false, error_code: 'TRANSCRIPT_FETCH_FAIL', provider_debug: null },
      { provider: 'youtube_timedtext', ok: false, error_code: 'NO_CAPTIONS', provider_debug: null },
    ]);
    expect(result.any_success).toBe(false);
    expect(result.all_no_captions).toBe(false);
  });

  it('preserves sanitized provider debug metadata in probe results', async () => {
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          throw new TranscriptProviderError('ACCESS_DENIED', 'Access denied', {
            providerDebug: {
              provider: 'youtube_timedtext',
              stage: 'track_content',
              http_status: 403,
              retry_after_seconds: 12,
              provider_error_code: 'ACCESS_DENIED',
              response_excerpt: '<html>denied denied denied</html>',
            },
          });
        },
      },
    ];

    const result = await buildService(providers, {
      resolveProvider: () => 'youtube_timedtext',
    }).probeTranscriptProviders('video123');

    expect(result.providers).toEqual([
      {
        provider: 'youtube_timedtext',
        ok: false,
        error_code: 'ACCESS_DENIED',
        provider_debug: {
          provider: 'youtube_timedtext',
          stage: 'track_content',
          http_status: 403,
          retry_after_seconds: 12,
          provider_error_code: 'ACCESS_DENIED',
          response_excerpt: '<html>denied denied denied</html>',
        },
      },
    ]);
  });

  it('honors provider-specific timeout overrides', async () => {
    vi.useFakeTimers();
    try {
      const providers: TranscriptProviderAdapter[] = [
        {
          id: 'videotranscriber_temp',
          timeoutMs: 1000,
          getTranscript: async () => new Promise(() => undefined),
        },
      ];

      const pending = buildService(providers, {
        listProvidersForProbe: () => providers,
      }).getTranscriptForVideoWithProvider('video123', 'videotranscriber_temp');

      const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(1001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('orders fallback providers with the configured primary first', () => {
    registerTranscriptProviders([
      {
        id: 'youtube_timedtext',
        getTranscript: async () => ({ text: 'tt', source: 'youtube_timedtext', confidence: null }),
      },
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => ({ text: 'vt', source: 'videotranscriber_temp', confidence: null }),
      },
    ]);

    expect(listTranscriptProvidersForFallback('youtube_timedtext').map((provider) => provider.id)).toEqual([
      'youtube_timedtext',
      'videotranscriber_temp',
    ]);
  });

  it('defaults fallback provider order to youtube_timedtext before videotranscriber_temp', () => {
    registerTranscriptProviders([
      {
        id: 'youtube_timedtext',
        getTranscript: async () => ({ text: 'tt', source: 'youtube_timedtext', confidence: null }),
      },
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => ({ text: 'vt', source: 'videotranscriber_temp', confidence: null }),
      },
    ]);

    expect(listTranscriptProvidersForFallback().map((provider) => provider.id)).toEqual([
      'youtube_timedtext',
      'videotranscriber_temp',
    ]);
  });

  it.each([
    ['NO_CAPTIONS'],
    ['TRANSCRIPT_EMPTY'],
  ] as const)('falls through to videotranscriber_temp after youtube_timedtext %s', async (errorCode) => {
    const calls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          throw new TranscriptProviderError(errorCode, `timedtext failure: ${errorCode}`);
        },
      },
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          calls.push('videotranscriber_temp');
          return {
            text: 'temp fallback transcript',
            source: 'videotranscriber_temp',
            confidence: null,
          };
        },
      },
    ];

    const result = await buildService(providers, {
      resolveProvider: () => 'youtube_timedtext',
      providerRetryDefaults: {
        transcriptAttempts: 1,
        transcriptTimeoutMs: 1000,
      },
    }).getTranscriptForVideo('video123', { enableFallback: true });

    expect(calls).toEqual(['youtube_timedtext', 'videotranscriber_temp']);
    expect(result.provider_trace).toEqual({
      attempted_providers: [
        {
          provider: 'youtube_timedtext',
          ok: false,
          error_code: errorCode,
          provider_debug: null,
        },
        {
          provider: 'videotranscriber_temp',
          ok: true,
          error_code: null,
          provider_debug: null,
        },
      ],
      winning_provider: 'videotranscriber_temp',
      used_fallback: true,
    });
  });

  it('starts a timedtext cooldown on RATE_LIMITED and skips timedtext during that window', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-15T16:00:00.000Z'));
      process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_COOLDOWN_SECONDS = '600';

      const calls: string[] = [];
      const providers: TranscriptProviderAdapter[] = [
        {
          id: 'youtube_timedtext',
          getTranscript: async () => {
            calls.push('youtube_timedtext');
            throw new TranscriptProviderError('RATE_LIMITED', 'timedtext rate limited', {
              providerDebug: {
                provider: 'youtube_timedtext',
                stage: 'track_list',
                http_status: 429,
              },
            });
          },
        },
        {
          id: 'videotranscriber_temp',
          getTranscript: async () => {
            calls.push('videotranscriber_temp');
            return {
              text: 'temp fallback transcript',
              source: 'videotranscriber_temp',
              confidence: null,
            };
          },
        },
      ];

      const service = buildService(providers, {
        resolveProvider: () => 'youtube_timedtext',
        providerRetryDefaults: {
          transcriptAttempts: 1,
          transcriptTimeoutMs: 1000,
        },
      });

      const first = await service.getTranscriptForVideo('video123', { enableFallback: true });
      const second = await service.getTranscriptForVideo('video456', { enableFallback: true });

      expect(first.source).toBe('videotranscriber_temp');
      expect(second.source).toBe('videotranscriber_temp');
      expect(calls).toEqual([
        'youtube_timedtext',
        'videotranscriber_temp',
        'videotranscriber_temp',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start a timedtext cooldown on RATE_LIMITED when the timedtext request used Webshare', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-15T16:00:00.000Z'));
      process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_COOLDOWN_SECONDS = '600';

      const calls: string[] = [];
      const providers: TranscriptProviderAdapter[] = [
        {
          id: 'youtube_timedtext',
          getTranscript: async () => {
            calls.push('youtube_timedtext');
            throw new TranscriptProviderError('RATE_LIMITED', 'timedtext rate limited', {
              providerDebug: {
                provider: 'youtube_timedtext',
                stage: 'track_list',
                http_status: 429,
                proxy_enabled: true,
                proxy_mode: 'webshare_explicit',
                proxy_host: 'p.webshare.io',
              },
            });
          },
        },
        {
          id: 'videotranscriber_temp',
          getTranscript: async () => {
            calls.push('videotranscriber_temp');
            return {
              text: 'temp fallback transcript',
              source: 'videotranscriber_temp',
              confidence: null,
            };
          },
        },
      ];

      const service = buildService(providers, {
        resolveProvider: () => 'youtube_timedtext',
        providerRetryDefaults: {
          transcriptAttempts: 1,
          transcriptTimeoutMs: 1000,
        },
      });

      const first = await service.getTranscriptForVideo('video123', { enableFallback: true });
      const second = await service.getTranscriptForVideo('video456', { enableFallback: true });

      expect(first.source).toBe('videotranscriber_temp');
      expect(second.source).toBe('videotranscriber_temp');
      expect(calls).toEqual([
        'youtube_timedtext',
        'videotranscriber_temp',
        'youtube_timedtext',
        'videotranscriber_temp',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores youtube_timedtext-first behavior after the cooldown expires', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-03-15T16:00:00.000Z'));
      process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_COOLDOWN_SECONDS = '60';

      const calls: string[] = [];
      let timedtextAttempts = 0;
      const providers: TranscriptProviderAdapter[] = [
        {
          id: 'youtube_timedtext',
          getTranscript: async () => {
            calls.push('youtube_timedtext');
            timedtextAttempts += 1;
            if (timedtextAttempts === 1) {
              throw new TranscriptProviderError('RATE_LIMITED', 'timedtext rate limited', {
                providerDebug: {
                  provider: 'youtube_timedtext',
                  stage: 'track_list',
                  http_status: 429,
                },
              });
            }
            return {
              text: 'timedtext recovered transcript',
              source: 'youtube_timedtext',
              confidence: null,
            };
          },
        },
        {
          id: 'videotranscriber_temp',
          getTranscript: async () => {
            calls.push('videotranscriber_temp');
            return {
              text: 'temp fallback transcript',
              source: 'videotranscriber_temp',
              confidence: null,
            };
          },
        },
      ];

      const service = buildService(providers, {
        resolveProvider: () => 'youtube_timedtext',
        providerRetryDefaults: {
          transcriptAttempts: 1,
          transcriptTimeoutMs: 1000,
        },
      });

      const first = await service.getTranscriptForVideo('video123', { enableFallback: true });
      vi.advanceTimersByTime(61_000);
      const second = await service.getTranscriptForVideo('video456', { enableFallback: true });

      expect(first.source).toBe('videotranscriber_temp');
      expect(second.source).toBe('youtube_timedtext');
      expect(calls).toEqual([
        'youtube_timedtext',
        'videotranscriber_temp',
        'youtube_timedtext',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['VIDEO_UNAVAILABLE'],
    ['ACCESS_DENIED'],
  ] as const)('stops fallback immediately on youtube_timedtext %s', async (errorCode) => {
    const calls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          throw new TranscriptProviderError(errorCode, `timedtext failure: ${errorCode}`);
        },
      },
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          calls.push('videotranscriber_temp');
          return {
            text: 'should not happen',
            source: 'videotranscriber_temp',
            confidence: null,
          };
        },
      },
    ];

    await expect(
      buildService(providers, {
        resolveProvider: () => 'youtube_timedtext',
        providerRetryDefaults: {
          transcriptAttempts: 1,
          transcriptTimeoutMs: 1000,
        },
      }).getTranscriptForVideo('video123', { enableFallback: true }),
    ).rejects.toMatchObject({ code: errorCode });

    expect(calls).toEqual(['youtube_timedtext']);
  });

  it.each([
    ['VIDEOTRANSCRIBER_DAILY_LIMIT'],
    ['VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE'],
    ['RATE_LIMITED'],
  ] as const)('falls through to youtube_timedtext after %s', async (errorCode) => {
    const calls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          calls.push('videotranscriber_temp');
          throw new TranscriptProviderError(errorCode, `temp failure: ${errorCode}`);
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          return {
            text: 'fallback transcript',
            source: 'youtube_timedtext',
            confidence: null,
          };
        },
      },
    ];

    const result = await buildService(providers, {
      providerRetryDefaults: {
        transcriptAttempts: 1,
        transcriptTimeoutMs: 1000,
      },
    }).getTranscriptForVideo('video123', { enableFallback: true });

    expect(calls).toEqual(['videotranscriber_temp', 'youtube_timedtext']);
    expect(result.provider_trace).toEqual({
      attempted_providers: [
        {
          provider: 'videotranscriber_temp',
          ok: false,
          error_code: errorCode,
          provider_debug: null,
        },
        {
          provider: 'youtube_timedtext',
          ok: true,
          error_code: null,
          provider_debug: null,
        },
      ],
      winning_provider: 'youtube_timedtext',
      used_fallback: true,
    });
  });

  it.each([
    ['NO_CAPTIONS'],
    ['VIDEO_UNAVAILABLE'],
    ['ACCESS_DENIED'],
    ['TRANSCRIPT_EMPTY'],
  ] as const)('stops fallback immediately on %s', async (errorCode) => {
    const calls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          calls.push('videotranscriber_temp');
          throw new TranscriptProviderError(errorCode, `terminal failure: ${errorCode}`);
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          return {
            text: 'should not happen',
            source: 'youtube_timedtext',
            confidence: null,
          };
        },
      },
    ];

    await expect(
      buildService(providers, {
        providerRetryDefaults: {
          transcriptAttempts: 1,
          transcriptTimeoutMs: 1000,
        },
      }).getTranscriptForVideo('video123', { enableFallback: true }),
    ).rejects.toMatchObject({ code: errorCode });

    expect(calls).toEqual(['videotranscriber_temp']);
  });

  it('preserves provider session trace metadata when wrapping successful transcripts', async () => {
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => ({
          text: 'temp transcript',
          source: 'videotranscriber_temp',
          confidence: null,
          provider_trace: {
            attempted_providers: [],
            winning_provider: 'videotranscriber_temp',
            used_fallback: false,
            session_value: 'sid_final123456',
            session_initial_value: 'sid_initial9876',
            session_mode: 'shared',
            session_rotated: true,
          },
        }),
      },
    ];

    const result = await buildService(providers, {
      providerRetryDefaults: {
        transcriptAttempts: 1,
        transcriptTimeoutMs: 1000,
      },
    }).getTranscriptForVideo('video123');

    expect(result.provider_trace).toEqual({
      attempted_providers: [
        {
          provider: 'videotranscriber_temp',
          ok: true,
          error_code: null,
          provider_debug: null,
        },
      ],
      winning_provider: 'videotranscriber_temp',
      used_fallback: false,
      session_value: 'sid_final123456',
      session_initial_value: 'sid_initial9876',
      session_mode: 'shared',
      session_rotated: true,
    });
  });

  it('uses provider-specific resilience keys for interactive fallback attempts', async () => {
    const providerKeys: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          throw new TranscriptProviderError('VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE', 'temp unavailable');
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => ({
          text: 'fallback transcript',
          source: 'youtube_timedtext',
          confidence: null,
        }),
      },
    ];

    await buildService(providers, {
      providerRetryDefaults: {
        transcriptAttempts: 2,
        transcriptTimeoutMs: 1000,
      },
      runWithProviderRetry: async (options, task) => {
        providerKeys.push(options.providerKey);
        return task(1);
      },
    }).getTranscriptForVideo('video123', { enableFallback: true, db: { id: 'db' } });

    expect(providerKeys).toEqual([
      buildTranscriptProviderRetryKey('videotranscriber_temp'),
      buildTranscriptProviderRetryKey('youtube_timedtext'),
    ]);
    expect(providerKeys).not.toContain('transcript');
  });

  it('uses only the selected provider resilience key for background fetches', async () => {
    const providerKeys: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => ({
          text: 'vt transcript',
          source: 'videotranscriber_temp',
          confidence: null,
        }),
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => ({
          text: 'tt transcript',
          source: 'youtube_timedtext',
          confidence: null,
        }),
      },
    ];

    const result = await buildService(providers, {
      resolveProvider: () => 'youtube_timedtext',
      runWithProviderRetry: async (options, task) => {
        providerKeys.push(options.providerKey);
        return task(1);
      },
    }).getTranscriptForVideo('video123', { db: { id: 'db' } });

    expect(result.text).toBe('tt transcript');
    expect(providerKeys).toEqual([
      buildTranscriptProviderRetryKey('youtube_timedtext'),
    ]);
  });

  it('returns cached transcripts without calling upstream providers', async () => {
    const providerCalls: string[] = [];
    const writeCalls: string[] = [];
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
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          providerCalls.push('videotranscriber_temp');
          return { text: 'vt', source: 'videotranscriber_temp', confidence: null };
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          providerCalls.push('youtube_timedtext');
          return { text: 'tt', source: 'youtube_timedtext', confidence: null };
        },
      },
    ];

    const result = await buildService(providers, {
      readCachedTranscript: async () => cachedTranscript,
      writeCachedTranscript: async (_db, videoId) => {
        writeCalls.push(videoId);
      },
    }).getTranscriptForVideo('video123', { enableFallback: true, db: { id: 'db' } });

    expect(result).toBe(cachedTranscript);
    expect(providerCalls).toEqual([]);
    expect(writeCalls).toEqual([]);
  });

  it('writes successful transcripts to cache and reuses them on the second request', async () => {
    const cache = new Map<string, { text: string; source: string; confidence: null; provider_trace?: unknown }>();
    const providerCalls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          providerCalls.push('videotranscriber_temp');
          return {
            text: 'fresh transcript',
            source: 'videotranscriber_temp',
            confidence: null,
          };
        },
      },
    ];

    const service = buildService(providers, {
      runWithProviderRetry: async (_options, task) => task(1),
      readCachedTranscript: async (_db, videoId) => cache.get(videoId) || null,
      writeCachedTranscript: async (_db, videoId, transcript) => {
        cache.set(videoId, transcript);
      },
    });

    const first = await service.getTranscriptForVideo('video123', { db: { id: 'db' } });
    const second = await service.getTranscriptForVideo('video123', { db: { id: 'db' } });

    expect(first.text).toBe('fresh transcript');
    expect(second.text).toBe('fresh transcript');
    expect(providerCalls).toEqual(['videotranscriber_temp']);
  });

  it('caches the fallback winner instead of an earlier failed provider', async () => {
    let cachedTranscript: any = null;
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          throw new TranscriptProviderError('VIDEOTRANSCRIBER_DAILY_LIMIT', 'daily limit');
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => ({
          text: 'fallback transcript',
          source: 'youtube_timedtext',
          confidence: null,
        }),
      },
    ];

    const result = await buildService(providers, {
      providerRetryDefaults: {
        transcriptAttempts: 1,
        transcriptTimeoutMs: 1000,
      },
      runWithProviderRetry: async (_options, task) => task(1),
      readCachedTranscript: async () => null,
      writeCachedTranscript: async (_db, _videoId, transcript) => {
        cachedTranscript = transcript;
      },
    }).getTranscriptForVideo('video123', { enableFallback: true, db: { id: 'db' } });

    expect(result.text).toBe('fallback transcript');
    expect(cachedTranscript?.source).toBe('youtube_timedtext');
    expect(cachedTranscript?.provider_trace?.winning_provider).toBe('youtube_timedtext');
  });

  it('does not write cache entries for failed transcript fetches', async () => {
    const writeCalls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          throw new TranscriptProviderError('VIDEO_UNAVAILABLE', 'Video unavailable');
        },
      },
    ];

    await expect(
      buildService(providers, {
        runWithProviderRetry: async (_options, task) => task(1),
        readCachedTranscript: async () => null,
        writeCachedTranscript: async (_db, videoId) => {
          writeCalls.push(videoId);
        },
      }).getTranscriptForVideo('video123', { db: { id: 'db' } }),
    ).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });

    expect(writeCalls).toEqual([]);
  });

  it('does not write cache entries for empty successful transcripts', async () => {
    const writeCalls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'youtube_timedtext',
        getTranscript: async () => ({
          text: '   ',
          source: 'youtube_timedtext',
          confidence: null,
        }),
      },
    ];

    const result = await buildService(providers, {
      resolveProvider: () => 'youtube_timedtext',
      runWithProviderRetry: async (_options, task) => task(1),
      readCachedTranscript: async () => null,
      writeCachedTranscript: async (_db, videoId) => {
        writeCalls.push(videoId);
      },
    }).getTranscriptForVideo('video123', { db: { id: 'db' } });

    expect(result.text).toBe('   ');
    expect(writeCalls).toEqual([]);
  });

  it('does not outer-retry temp RATE_LIMITED errors that already exhausted start-stage retries', async () => {
    const calls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          calls.push('videotranscriber_temp');
          throw new TranscriptProviderError('RATE_LIMITED', 'queue busy', {
            providerDebug: {
              provider: 'videotranscriber_temp',
              stage: 'start',
              provider_error_code: '164002',
            },
          });
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          return {
            text: 'fallback transcript',
            source: 'youtube_timedtext',
            confidence: null,
          };
        },
      },
    ];

    const result = await buildService(providers, {
      providerRetryDefaults: {
        transcriptAttempts: 3,
        transcriptTimeoutMs: 1000,
      },
      runWithProviderRetry: async (options, task) => runImmediateRetryLoop(options, task),
    }).getTranscriptForVideo('video123', { enableFallback: true });

    expect(result.text).toBe('fallback transcript');
    expect(calls).toEqual(['videotranscriber_temp', 'youtube_timedtext']);
  });

  it('retries temp upstream-unavailable errors at early stages before fallback', async () => {
    const calls: string[] = [];
    let tempAttempts = 0;
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          calls.push('videotranscriber_temp');
          tempAttempts += 1;
          if (tempAttempts < 2) {
            throw new TranscriptProviderError('VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE', 'upstream unavailable', {
              providerDebug: {
                provider: 'videotranscriber_temp',
                stage: 'start',
                http_status: 502,
              },
            });
          }
          return {
            text: 'temp transcript',
            source: 'videotranscriber_temp',
            confidence: null,
          };
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          return {
            text: 'fallback transcript',
            source: 'youtube_timedtext',
            confidence: null,
          };
        },
      },
    ];

    const result = await buildService(providers, {
      providerRetryDefaults: {
        transcriptAttempts: 3,
        transcriptTimeoutMs: 1000,
      },
      runWithProviderRetry: async (options, task) => runImmediateRetryLoop(options, task),
    }).getTranscriptForVideo('video123', { enableFallback: true });

    expect(result.text).toBe('temp transcript');
    expect(calls).toEqual(['videotranscriber_temp', 'videotranscriber_temp']);
  });

  it('falls through after temp poll timeouts instead of rerunning the same provider', async () => {
    const calls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          calls.push('videotranscriber_temp');
          throw new TranscriptProviderError('TIMEOUT', 'poll timed out', {
            providerDebug: {
              provider: 'videotranscriber_temp',
              stage: 'poll',
              provider_error_code: 'TIMEOUT',
            },
          });
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          return {
            text: 'fallback transcript',
            source: 'youtube_timedtext',
            confidence: null,
          };
        },
      },
    ];

    const result = await buildService(providers, {
      providerRetryDefaults: {
        transcriptAttempts: 3,
        transcriptTimeoutMs: 1000,
      },
      runWithProviderRetry: async (options, task) => runImmediateRetryLoop(options, task),
    }).getTranscriptForVideo('video123', { enableFallback: true });

    expect(result.text).toBe('fallback transcript');
    expect(calls).toEqual(['videotranscriber_temp', 'youtube_timedtext']);
  });

  it('falls through on temp transcript-resolution empty results without same-provider retry', async () => {
    const calls: string[] = [];
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'videotranscriber_temp',
        getTranscript: async () => {
          calls.push('videotranscriber_temp');
          throw new TranscriptProviderError('TRANSCRIPT_EMPTY', 'empty transcript', {
            providerDebug: {
              provider: 'videotranscriber_temp',
              stage: 'transcript_resolution',
              provider_error_code: 'TRANSCRIPT_EMPTY',
            },
          });
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          return {
            text: 'fallback transcript',
            source: 'youtube_timedtext',
            confidence: null,
          };
        },
      },
    ];

    const result = await buildService(providers, {
      providerRetryDefaults: {
        transcriptAttempts: 3,
        transcriptTimeoutMs: 1000,
      },
      runWithProviderRetry: async (options, task) => runImmediateRetryLoop(options, task),
    }).getTranscriptForVideo('video123', { enableFallback: true });

    expect(result.text).toBe('fallback transcript');
    expect(calls).toEqual(['videotranscriber_temp', 'youtube_timedtext']);
  });

  it('keeps bounded same-provider retries for non-temp timeout errors', async () => {
    const calls: string[] = [];
    let attempts = 0;
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          calls.push('youtube_timedtext');
          attempts += 1;
          if (attempts < 2) {
            throw new TranscriptProviderError('TIMEOUT', 'timedtext timeout');
          }
          return {
            text: 'timedtext transcript',
            source: 'youtube_timedtext',
            confidence: null,
          };
        },
      },
    ];

    const result = await buildService(providers, {
      resolveProvider: () => 'youtube_timedtext',
      providerRetryDefaults: {
        transcriptAttempts: 3,
        transcriptTimeoutMs: 1000,
      },
      runWithProviderRetry: async (options, task) => runImmediateRetryLoop(options, task),
    }).getTranscriptForVideo('video123');

    expect(result.text).toBe('timedtext transcript');
    expect(calls).toEqual(['youtube_timedtext', 'youtube_timedtext']);
  });
});
