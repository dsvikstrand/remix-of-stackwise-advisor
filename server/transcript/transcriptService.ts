import {
  getTranscriptProvider,
  listTranscriptProvidersForFallback,
  listTranscriptProvidersForProbe,
} from './providerRegistry';
import {
  getProviderRetryDefaults,
  runWithProviderRetry,
} from '../services/providerResilience';
import {
  readCachedTranscript,
  writeCachedTranscript,
} from './transcriptCache';
import {
  getTranscriptProviderDebug,
  isFallbackableTranscriptProviderErrorCode,
  isRetryableTranscriptProviderErrorCode,
  TranscriptProviderError,
  type TranscriptProvider,
  type TranscriptProviderAdapter,
  type TranscriptProviderAttempt,
  type TranscriptProviderErrorCode,
  type TranscriptProviderDebug,
  type TranscriptResult,
} from './types';

type DbClient = any;

type TranscriptRetryDefaults = Pick<ReturnType<typeof getProviderRetryDefaults>, 'transcriptAttempts' | 'transcriptTimeoutMs'>;

export type TranscriptProbeProviderResult = {
  provider: TranscriptProvider;
  ok: boolean;
  error_code: TranscriptProviderErrorCode | null;
  provider_debug?: TranscriptProviderDebug | null;
};

export type TranscriptProbeResult = {
  all_no_captions: boolean;
  any_success: boolean;
  providers: TranscriptProbeProviderResult[];
};

export type TranscriptServiceDeps = {
  timeoutMs: number;
  resolveProvider: () => TranscriptProvider;
  getProviderById: (providerId: TranscriptProvider) => TranscriptProviderAdapter | null;
  listProvidersForProbe: () => TranscriptProviderAdapter[];
  listProvidersForFallback: (primaryProvider?: TranscriptProvider | null) => TranscriptProviderAdapter[];
  runWithProviderRetry: typeof runWithProviderRetry;
  providerRetryDefaults: TranscriptRetryDefaults;
  readCachedTranscript: typeof readCachedTranscript;
  writeCachedTranscript: typeof writeCachedTranscript;
};

export type GetTranscriptForVideoOptions = {
  enableFallback?: boolean;
  db?: DbClient | null;
};

const DEFAULT_TRANSCRIPT_TIMEOUT_MS = 25_000;
const TRANSCRIPT_RETRY_BASE_DELAY_MS = 250;
const TRANSCRIPT_RETRY_JITTER_MS = 150;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new TranscriptProviderError('TIMEOUT', 'Transcript request timed out.')),
        ms,
      );
    }),
  ]);
}

export function resolveTranscriptProvider(): TranscriptProvider {
  const raw = String(process.env.TRANSCRIPT_PROVIDER || 'youtube_timedtext').toLowerCase();
  if (raw === 'videotranscriber_temp') return 'videotranscriber_temp';
  if (raw === 'youtube_timedtext') return 'youtube_timedtext';
  return 'youtube_timedtext';
}

export function resolveTranscriptOperationTimeoutMs(defaultTimeoutMs: number) {
  const fallbackTimeoutMs = Math.max(1000, Math.floor(Number(defaultTimeoutMs) || DEFAULT_TRANSCRIPT_TIMEOUT_MS));
  const provider = resolveTranscriptProvider();
  const adapter = getTranscriptProvider(provider);
  const providerTimeoutMs = Number(adapter?.timeoutMs);
  if (!Number.isFinite(providerTimeoutMs)) return fallbackTimeoutMs;
  return Math.max(fallbackTimeoutMs, Math.floor(providerTimeoutMs));
}

export function normalizeTranscriptProviderErrorCode(error: unknown): TranscriptProviderErrorCode {
  if (error instanceof TranscriptProviderError) return error.code;
  return 'TRANSCRIPT_FETCH_FAIL';
}

export function buildTranscriptProviderRetryKey(provider: TranscriptProvider) {
  return `transcript:${provider}`;
}

export function listTranscriptProviderRetryKeys() {
  return listTranscriptProvidersForFallback().map((provider) => buildTranscriptProviderRetryKey(provider.id));
}

function normalizeTranscriptProviderStage(error: unknown) {
  return String(getTranscriptProviderDebug(error)?.stage || '').trim().toLowerCase();
}

function isVideoTranscriberEarlyRetryStage(stage: string) {
  return stage === 'runtime_config'
    || stage === 'url_info'
    || stage === 'start';
}

function isVideoTranscriberLateFallbackStage(stage: string) {
  return stage === 'poll'
    || stage === 'transcript_resolution';
}

function shouldFallbackTranscriptProviderAttempt(provider: TranscriptProvider, error: unknown) {
  const code = normalizeTranscriptProviderErrorCode(error);
  if (provider === 'youtube_timedtext') {
    if (code === 'NO_CAPTIONS' || code === 'TRANSCRIPT_EMPTY') {
      return true;
    }
  }
  if (provider === 'videotranscriber_temp') {
    const stage = normalizeTranscriptProviderStage(error);
    if (code === 'TRANSCRIPT_EMPTY' && stage === 'transcript_resolution') {
      return true;
    }
  }
  return isFallbackableTranscriptProviderErrorCode(code);
}

function shouldRetryTranscriptProviderAttempt(provider: TranscriptProvider, error: unknown) {
  const code = normalizeTranscriptProviderErrorCode(error);
  if (provider !== 'videotranscriber_temp') {
    return isRetryableTranscriptProviderErrorCode(code);
  }

  const stage = normalizeTranscriptProviderStage(error);
  if (code === 'VIDEOTRANSCRIBER_DAILY_LIMIT') return false;

  if (code === 'RATE_LIMITED') {
    if (stage === 'start') return false;
    return isRetryableTranscriptProviderErrorCode(code);
  }

  if (code === 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE') {
    if (isVideoTranscriberEarlyRetryStage(stage)) return true;
    if (isVideoTranscriberLateFallbackStage(stage)) return false;
    return isRetryableTranscriptProviderErrorCode(code);
  }

  if (code === 'TIMEOUT') {
    if (stage === 'poll') return false;
    return isRetryableTranscriptProviderErrorCode(code);
  }

  if (code === 'TRANSCRIPT_EMPTY') return false;

  if (code === 'TRANSCRIPT_FETCH_FAIL') {
    if (isVideoTranscriberLateFallbackStage(stage)) return false;
    return isRetryableTranscriptProviderErrorCode(code);
  }

  return isRetryableTranscriptProviderErrorCode(code);
}

export function createTranscriptService(partialDeps: Partial<TranscriptServiceDeps> = {}) {
  const deps: TranscriptServiceDeps = {
    timeoutMs: partialDeps.timeoutMs ?? DEFAULT_TRANSCRIPT_TIMEOUT_MS,
    resolveProvider: partialDeps.resolveProvider ?? resolveTranscriptProvider,
    getProviderById: partialDeps.getProviderById ?? getTranscriptProvider,
    listProvidersForProbe: partialDeps.listProvidersForProbe ?? listTranscriptProvidersForProbe,
    listProvidersForFallback: partialDeps.listProvidersForFallback ?? listTranscriptProvidersForFallback,
    runWithProviderRetry: partialDeps.runWithProviderRetry ?? runWithProviderRetry,
    providerRetryDefaults: partialDeps.providerRetryDefaults ?? getProviderRetryDefaults(),
    readCachedTranscript: partialDeps.readCachedTranscript ?? readCachedTranscript,
    writeCachedTranscript: partialDeps.writeCachedTranscript ?? writeCachedTranscript,
  };

  function withProviderTrace(
    transcript: TranscriptResult,
    input: {
      attempts: TranscriptProviderAttempt[];
      winningProvider: TranscriptProvider;
    },
  ): TranscriptResult {
    return {
      ...transcript,
      provider_trace: {
        ...(transcript.provider_trace || {}),
        attempted_providers: input.attempts,
        winning_provider: input.winningProvider,
        used_fallback: input.attempts.length > 1,
      },
    };
  }

  async function getTranscriptForVideoWithProvider(
    videoId: string,
    provider: TranscriptProvider,
  ): Promise<TranscriptResult> {
    const providerAdapter = getProviderAdapter(provider);
    const timeoutMs = getProviderTimeoutMs(providerAdapter);
    return withTimeout(providerAdapter.getTranscript(videoId), timeoutMs);
  }

  function getProviderAdapter(provider: TranscriptProvider) {
    const providerAdapter = deps.getProviderById(provider);
    if (!providerAdapter) {
      throw new TranscriptProviderError(
        'TRANSCRIPT_FETCH_FAIL',
        `Transcript provider "${provider}" is not registered.`,
      );
    }
    return providerAdapter;
  }

  function getProviderTimeoutMs(providerAdapter: TranscriptProviderAdapter) {
    return Number.isFinite(Number(providerAdapter.timeoutMs))
      ? Math.max(1000, Math.floor(Number(providerAdapter.timeoutMs)))
      : deps.timeoutMs;
  }

  async function getTranscriptForVideoWithProviderResilience(
    videoId: string,
    provider: TranscriptProvider,
    options?: { db?: DbClient | null },
  ): Promise<TranscriptResult> {
    const providerAdapter = getProviderAdapter(provider);
    const timeoutMs = Math.max(
      deps.providerRetryDefaults.transcriptTimeoutMs,
      getProviderTimeoutMs(providerAdapter),
    );
    return deps.runWithProviderRetry(
      {
        providerKey: buildTranscriptProviderRetryKey(provider),
        db: options?.db || null,
        maxAttempts: deps.providerRetryDefaults.transcriptAttempts,
        timeoutMs,
        baseDelayMs: TRANSCRIPT_RETRY_BASE_DELAY_MS,
        jitterMs: TRANSCRIPT_RETRY_JITTER_MS,
        isRetryable: (error) => shouldRetryTranscriptProviderAttempt(provider, error),
        timeoutErrorFactory: () => new TranscriptProviderError('TIMEOUT', 'Transcript request timed out.'),
      },
      async () => providerAdapter.getTranscript(videoId),
    );
  }

  async function getTranscriptForVideoWithFallback(
    videoId: string,
    primaryProvider?: TranscriptProvider | null,
    options?: { db?: DbClient | null },
  ): Promise<TranscriptResult> {
    const orderedProviders = deps.listProvidersForFallback(primaryProvider);
    const attempts: TranscriptProviderAttempt[] = [];
    let lastError: unknown = null;

    for (const provider of orderedProviders) {
      try {
        const transcript = await getTranscriptForVideoWithProviderResilience(videoId, provider.id, {
          db: options?.db || null,
        });
        attempts.push({
          provider: provider.id,
          ok: true,
          error_code: null,
          provider_debug: null,
        });
        return withProviderTrace(transcript, {
          attempts,
          winningProvider: provider.id,
        });
      } catch (error) {
        const errorCode = normalizeTranscriptProviderErrorCode(error);
        attempts.push({
          provider: provider.id,
          ok: false,
          error_code: errorCode,
          provider_debug: getTranscriptProviderDebug(error),
        });
        lastError = error;
        if (!shouldFallbackTranscriptProviderAttempt(provider.id, error)) break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Transcript provider fallback failed.');
  }

  async function getTranscriptForVideo(
    videoId: string,
    options?: GetTranscriptForVideoOptions,
  ): Promise<TranscriptResult> {
    if (options?.db) {
      try {
        const cachedTranscript = await deps.readCachedTranscript(options.db, videoId);
        if (cachedTranscript) return cachedTranscript;
      } catch {
        // Fail open on cache read errors; transcript fetch should still proceed.
      }
    }

    const provider = deps.resolveProvider();
    const transcript = options?.enableFallback
      ? await getTranscriptForVideoWithFallback(videoId, provider, {
        db: options?.db || null,
      })
      : withProviderTrace(
        await getTranscriptForVideoWithProviderResilience(videoId, provider, {
          db: options?.db || null,
        }),
        {
          attempts: [{
            provider,
            ok: true,
            error_code: null,
            provider_debug: null,
          }],
          winningProvider: provider,
        },
      );

    if (options?.db && String(transcript.text || '').trim()) {
      try {
        await deps.writeCachedTranscript(options.db, videoId, transcript);
      } catch {
        // Fail open on cache write errors; transcript fetch should still succeed.
      }
    }

    return transcript;
  }

  async function probeTranscriptProviders(videoId: string): Promise<TranscriptProbeResult> {
    const providers: TranscriptProbeProviderResult[] = [];
    for (const provider of deps.listProvidersForProbe()) {
      try {
        await getTranscriptForVideoWithProvider(videoId, provider.id);
        providers.push({
          provider: provider.id,
          ok: true,
          error_code: null,
          provider_debug: null,
        });
      } catch (error) {
        providers.push({
          provider: provider.id,
          ok: false,
          error_code: normalizeTranscriptProviderErrorCode(error),
          provider_debug: getTranscriptProviderDebug(error),
        });
      }
    }

    const allNoCaptions =
      providers.length > 0
      && providers.every((row) => row.ok === false && row.error_code === 'NO_CAPTIONS');
    const anySuccess = providers.some((row) => row.ok);

    return {
      all_no_captions: allNoCaptions,
      any_success: anySuccess,
      providers,
    };
  }

  return {
    getTranscriptForVideoWithProvider,
    getTranscriptForVideoWithFallback,
    getTranscriptForVideo,
    probeTranscriptProviders,
  };
}

const transcriptService = createTranscriptService();

export const {
  getTranscriptForVideoWithProvider,
  getTranscriptForVideoWithFallback,
  getTranscriptForVideo,
  probeTranscriptProviders,
} = transcriptService;
