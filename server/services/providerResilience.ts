import { TranscriptProviderError, isRetryableTranscriptProviderErrorCode } from '../transcript/types';
import { CodexExecError } from '../llm/codexExec';
import {
  assertProviderAvailable,
  recordProviderFailure,
  recordProviderSuccess,
} from './providerCircuit';

type DbClient = any;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export type ProviderRetryOptions = {
  providerKey: string;
  db?: DbClient | null;
  timeoutMs: number;
  maxAttempts: number;
  baseDelayMs?: number;
  jitterMs?: number;
  isRetryable?: (error: unknown) => boolean;
  timeoutErrorFactory?: (timeoutMs: number) => unknown;
};

export type ProviderRetryDefaults = {
  transcriptAttempts: number;
  transcriptTimeoutMs: number;
  llmAttempts: number;
  llmTimeoutMs: number;
};

function defaultIsRetryable(error: unknown) {
  const status = Number((error as { status?: unknown })?.status || (error as { response?: { status?: unknown } } | null)?.response?.status || 0);
  if (status === 429 || status === 408 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  const code = String((error as { code?: unknown })?.code || '').trim().toLowerCase();
  if (
    code === 'rate_limited'
    || code === 'rate_limit_exceeded'
    || code === 'too_many_requests'
    || code === 'timeout'
    || code === 'server_error'
    || code === 'service_unavailable'
  ) {
    return true;
  }

  if (error instanceof CodexExecError) {
    return error.code === 'RATE_LIMITED' || error.code === 'TIMEOUT' || error.code === 'PROCESS_FAIL';
  }
  if (error instanceof TranscriptProviderError) {
    return isRetryableTranscriptProviderErrorCode(error.code);
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('rate limit')) return true;
    if (message.includes('too many requests')) return true;
    if (message.includes('try again later')) return true;
    if (message.includes('capacity')) return true;
    if (message.includes('overloaded')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('temporarily')) return true;
    if (message.includes('fetch failed')) return true;
    if (message.includes('networkerror') || message.includes('network error')) return true;
    if (message.includes('econnreset') || message.includes('etimedout')) return true;
  }
  return false;
}

function normalizeProviderTimeoutError(error: unknown, timeoutMs: number) {
  if (error instanceof Error) return error;
  return new Error(String(error || `Provider operation timeout (${timeoutMs}ms)`));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutErrorFactory?: (timeoutMs: number) => unknown,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(normalizeProviderTimeoutError(
            timeoutErrorFactory ? timeoutErrorFactory(timeoutMs) : null,
            timeoutMs,
          ));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runWithProviderRetry<T>(
  options: ProviderRetryOptions,
  task: (attempt: number) => Promise<T>,
) {
  const maxAttempts = clampInt(options.maxAttempts, 2, 1, 6);
  const timeoutMs = clampInt(options.timeoutMs, 25_000, 1000, 180_000);
  const baseDelayMs = clampInt(options.baseDelayMs, 250, 50, 10_000);
  const jitterMs = clampInt(options.jitterMs, 200, 0, 5000);
  const isRetryable = options.isRetryable || defaultIsRetryable;

  await assertProviderAvailable(options.db || null, options.providerKey);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await withTimeout(task(attempt), timeoutMs, options.timeoutErrorFactory);
      await recordProviderSuccess(options.db || null, options.providerKey);
      return result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      await recordProviderFailure(options.db || null, options.providerKey, message);

      const shouldRetry = attempt < maxAttempts && isRetryable(error);
      if (!shouldRetry) break;

      const backoff = baseDelayMs * attempt;
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
      await sleep(backoff + jitter);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Provider call failed'));
}

export function getProviderRetryDefaults() {
  return {
    transcriptAttempts: clampInt(process.env.TRANSCRIPT_MAX_ATTEMPTS, 2, 1, 4),
    transcriptTimeoutMs: clampInt(process.env.TRANSCRIPT_TIMEOUT_MS, 25_000, 1000, 90_000),
    llmAttempts: clampInt(process.env.LLM_MAX_ATTEMPTS, 2, 1, 4),
    llmTimeoutMs: clampInt(process.env.LLM_TIMEOUT_MS, 60_000, 1000, 180_000),
  };
}

export function resolveProviderRetryDefaultsForRequestClass(
  requestClass: 'interactive' | 'background',
  baseDefaults: ProviderRetryDefaults,
): ProviderRetryDefaults {
  if (requestClass !== 'interactive') {
    return {
      transcriptAttempts: clampInt(baseDefaults.transcriptAttempts, 2, 1, 4),
      transcriptTimeoutMs: clampInt(baseDefaults.transcriptTimeoutMs, 25_000, 1000, 90_000),
      llmAttempts: clampInt(baseDefaults.llmAttempts, 2, 1, 4),
      llmTimeoutMs: clampInt(baseDefaults.llmTimeoutMs, 60_000, 1000, 180_000),
    };
  }

  const transcriptAttempts = Math.min(
    clampInt(baseDefaults.transcriptAttempts, 2, 1, 4),
    clampInt(
      process.env.INTERACTIVE_TRANSCRIPT_MAX_ATTEMPTS,
      Math.min(clampInt(baseDefaults.transcriptAttempts, 2, 1, 4), 1),
      1,
      4,
    ),
  );
  const transcriptTimeoutMs = Math.min(
    clampInt(baseDefaults.transcriptTimeoutMs, 25_000, 1000, 90_000),
    clampInt(
      process.env.INTERACTIVE_TRANSCRIPT_TIMEOUT_MS,
      Math.min(clampInt(baseDefaults.transcriptTimeoutMs, 25_000, 1000, 90_000), 15_000),
      1000,
      90_000,
    ),
  );
  const llmAttempts = Math.min(
    clampInt(baseDefaults.llmAttempts, 2, 1, 4),
    clampInt(
      process.env.INTERACTIVE_LLM_MAX_ATTEMPTS,
      Math.min(clampInt(baseDefaults.llmAttempts, 2, 1, 4), 1),
      1,
      4,
    ),
  );
  const llmTimeoutMs = Math.min(
    clampInt(baseDefaults.llmTimeoutMs, 60_000, 1000, 180_000),
    clampInt(
      process.env.INTERACTIVE_LLM_TIMEOUT_MS,
      Math.min(clampInt(baseDefaults.llmTimeoutMs, 60_000, 1000, 180_000), 45_000),
      1000,
      180_000,
    ),
  );

  return {
    transcriptAttempts,
    transcriptTimeoutMs,
    llmAttempts,
    llmTimeoutMs,
  };
}
