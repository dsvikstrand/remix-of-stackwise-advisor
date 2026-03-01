import { TranscriptProviderError } from '../transcript/types';
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
};

function defaultIsRetryable(error: unknown) {
  if (error instanceof CodexExecError) {
    return error.code === 'RATE_LIMITED' || error.code === 'TIMEOUT' || error.code === 'PROCESS_FAIL';
  }
  if (error instanceof TranscriptProviderError) {
    return error.code === 'TRANSCRIPT_FETCH_FAIL' || error.code === 'TIMEOUT' || error.code === 'RATE_LIMITED';
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('rate limit')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('temporarily')) return true;
    if (message.includes('econnreset') || message.includes('etimedout')) return true;
  }
  return false;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Provider operation timeout (${timeoutMs}ms)`));
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
      const result = await withTimeout(task(attempt), timeoutMs);
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
