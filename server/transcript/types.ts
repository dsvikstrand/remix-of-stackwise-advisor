export type TranscriptProvider = 'youtube_timedtext' | 'videotranscriber_temp';

export type TranscriptProviderDebug = {
  provider: TranscriptProvider;
  stage?: string | null;
  http_status?: number | null;
  retry_after_seconds?: number | null;
  provider_error_code?: string | null;
  response_excerpt?: string | null;
};

export type TranscriptProviderErrorCode =
  | 'NO_CAPTIONS'
  | 'VIDEO_UNAVAILABLE'
  | 'ACCESS_DENIED'
  | 'TRANSCRIPT_FETCH_FAIL'
  | 'TRANSCRIPT_EMPTY'
  | 'RATE_LIMITED'
  | 'VIDEOTRANSCRIBER_DAILY_LIMIT'
  | 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE'
  | 'TIMEOUT';

export function isRetryableTranscriptProviderErrorCode(code: TranscriptProviderErrorCode | string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'TRANSCRIPT_FETCH_FAIL'
    || normalized === 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE'
    || normalized === 'TIMEOUT'
    || normalized === 'RATE_LIMITED';
}

export function isFallbackableTranscriptProviderErrorCode(code: TranscriptProviderErrorCode | string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'TRANSCRIPT_FETCH_FAIL'
    || normalized === 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE'
    || normalized === 'VIDEOTRANSCRIBER_DAILY_LIMIT'
    || normalized === 'TIMEOUT'
    || normalized === 'RATE_LIMITED';
}

export function isTerminalTranscriptProviderErrorCode(code: TranscriptProviderErrorCode | string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'VIDEO_UNAVAILABLE'
    || normalized === 'ACCESS_DENIED';
}

export type TranscriptProviderAttempt = {
  provider: TranscriptProvider;
  ok: boolean;
  error_code: TranscriptProviderErrorCode | null;
  provider_debug?: TranscriptProviderDebug | null;
};

export type TranscriptProviderTrace = {
  attempted_providers: TranscriptProviderAttempt[];
  winning_provider: TranscriptProvider;
  used_fallback: boolean;
  cache_hit?: boolean;
  cache_provider?: TranscriptProvider | null;
};

export type TranscriptSegment = {
  text: string;
  startSec?: number;
  endSec?: number;
};

export type TranscriptTransportMetadata = {
  provider: TranscriptProvider;
  proxy_enabled: boolean;
  proxy_mode: 'direct' | 'webshare_explicit' | 'webshare_index';
  proxy_selector: string | null;
  proxy_selected_index: number | null;
  proxy_host: string | null;
};

export type TranscriptResult = {
  text: string;
  source: string;
  confidence: number | null;
  segments?: TranscriptSegment[];
  transport?: TranscriptTransportMetadata | null;
  provider_trace?: TranscriptProviderTrace | null;
};

export type TranscriptProviderAdapter = {
  id: TranscriptProvider;
  timeoutMs?: number;
  getTranscript: (videoId: string) => Promise<TranscriptResult>;
};

export class TranscriptProviderError extends Error {
  code: TranscriptProviderErrorCode;
  retryAfterSeconds: number | null;
  providerDebug: TranscriptProviderDebug | null;

  constructor(
    code: TranscriptProviderErrorCode,
    message: string,
    options?: {
      retryAfterSeconds?: number | null;
      providerDebug?: TranscriptProviderDebug | null;
    },
  ) {
    super(message);
    this.code = code;
    const retryAfterRaw = Number(options?.retryAfterSeconds);
    this.retryAfterSeconds = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
      ? Math.max(1, Math.ceil(retryAfterRaw))
      : null;
    this.providerDebug = sanitizeTranscriptProviderDebug(options?.providerDebug || null);
  }
}

export function normalizeTranscriptWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function sanitizeExcerpt(value: unknown, maxChars = 300) {
  const normalized = normalizeTranscriptWhitespace(String(value || ''));
  if (!normalized) return null;
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}...`
    : normalized;
}

export function sanitizeTranscriptProviderDebug(input: TranscriptProviderDebug | null | undefined) {
  if (!input) return null;
  if (
    input.provider !== 'youtube_timedtext'
    && input.provider !== 'videotranscriber_temp'
  ) return null;
  const httpStatus = Number(input.http_status);
  const retryAfterSeconds = Number(input.retry_after_seconds);
  return {
    provider: input.provider,
    stage: String(input.stage || '').trim() || null,
    http_status: Number.isFinite(httpStatus) ? httpStatus : null,
    retry_after_seconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.max(1, Math.ceil(retryAfterSeconds))
      : null,
    provider_error_code: String(input.provider_error_code || '').trim() || null,
    response_excerpt: sanitizeExcerpt(input.response_excerpt),
  } satisfies TranscriptProviderDebug;
}

export function getTranscriptProviderDebug(error: unknown) {
  if (error instanceof TranscriptProviderError) {
    return sanitizeTranscriptProviderDebug(error.providerDebug);
  }
  return null;
}
