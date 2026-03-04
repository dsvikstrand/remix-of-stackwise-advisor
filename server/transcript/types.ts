export type TranscriptProvider = 'yt_to_text' | 'youtube_timedtext';

export type TranscriptProviderErrorCode =
  | 'NO_CAPTIONS'
  | 'VIDEO_UNAVAILABLE'
  | 'ACCESS_DENIED'
  | 'TRANSCRIPT_FETCH_FAIL'
  | 'TRANSCRIPT_EMPTY'
  | 'RATE_LIMITED'
  | 'TIMEOUT';

export function isRetryableTranscriptProviderErrorCode(code: TranscriptProviderErrorCode | string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'TRANSCRIPT_FETCH_FAIL'
    || normalized === 'TIMEOUT'
    || normalized === 'RATE_LIMITED';
}

export function isTerminalTranscriptProviderErrorCode(code: TranscriptProviderErrorCode | string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'VIDEO_UNAVAILABLE'
    || normalized === 'ACCESS_DENIED';
}

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
};

export type TranscriptProviderAdapter = {
  id: TranscriptProvider;
  getTranscript: (videoId: string) => Promise<TranscriptResult>;
};

export class TranscriptProviderError extends Error {
  code: TranscriptProviderErrorCode;
  retryAfterSeconds: number | null;

  constructor(
    code: TranscriptProviderErrorCode,
    message: string,
    options?: { retryAfterSeconds?: number | null },
  ) {
    super(message);
    this.code = code;
    const retryAfterRaw = Number(options?.retryAfterSeconds);
    this.retryAfterSeconds = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
      ? Math.max(1, Math.ceil(retryAfterRaw))
      : null;
  }
}

export function normalizeTranscriptWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}
