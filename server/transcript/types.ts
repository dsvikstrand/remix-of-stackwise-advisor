export type TranscriptProvider = 'yt_to_text' | 'youtube_timedtext';

export type TranscriptProviderErrorCode =
  | 'NO_CAPTIONS'
  | 'TRANSCRIPT_FETCH_FAIL'
  | 'TRANSCRIPT_EMPTY'
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

  constructor(code: TranscriptProviderErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function normalizeTranscriptWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}
