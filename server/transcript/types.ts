export type TranscriptProvider = 'yt_to_text' | 'youtube_timedtext';

export type TranscriptProviderErrorCode =
  | 'NO_CAPTIONS'
  | 'TRANSCRIPT_FETCH_FAIL'
  | 'TRANSCRIPT_EMPTY'
  | 'RATE_LIMITED'
  | 'TIMEOUT';

export type TranscriptSegment = {
  text: string;
  startSec?: number;
  endSec?: number;
};

export type TranscriptResult = {
  text: string;
  source: string;
  confidence: number | null;
  segments?: TranscriptSegment[];
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
