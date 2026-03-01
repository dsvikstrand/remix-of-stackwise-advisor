import {
  TranscriptProviderError,
  normalizeTranscriptWhitespace,
  type TranscriptProviderAdapter,
  type TranscriptResult,
  type TranscriptSegment,
} from '../types';

function toSeconds(input: unknown) {
  const n = Number(input);
  return Number.isFinite(n) ? n : undefined;
}

function parseRetryAfterSeconds(value: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const asSeconds = Number(normalized);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.max(1, Math.ceil(asSeconds));
  }
  const asDateMs = Date.parse(normalized);
  if (!Number.isFinite(asDateMs)) return null;
  const deltaMs = asDateMs - Date.now();
  if (deltaMs <= 0) return null;
  return Math.max(1, Math.ceil(deltaMs / 1000));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new TranscriptProviderError('TIMEOUT', 'Transcript request timed out.'));
        }, ms);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function fetchOnce(videoId: string): Promise<TranscriptSegment[]> {
  const response = await fetch('https://yt-to-text.com/api/v1/Subtitles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-version': '1.0',
      'x-source': 'tubetranscript',
    },
    body: JSON.stringify({ video_id: videoId }),
  });

  if (response.status === 403 || response.status === 404) {
    throw new TranscriptProviderError('NO_CAPTIONS', 'Transcript unavailable for this video. Please try another video.');
  }
  if (response.status === 429) {
    throw new TranscriptProviderError(
      'RATE_LIMITED',
      'Transcript provider rate limited. Please retry shortly.',
      { retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')) },
    );
  }
  if (!response.ok) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', `Transcript provider returned HTTP ${response.status}.`);
  }

  const payload = await response.json().catch(() => null) as any;
  const raw = payload?.data?.transcripts;
  if (!Array.isArray(raw)) {
    throw new TranscriptProviderError('NO_CAPTIONS', 'Transcript unavailable for this video. Please try another video.');
  }

  const segments = raw
    .map((item: any) => ({
      text: typeof item?.t === 'string' ? normalizeTranscriptWhitespace(item.t) : '',
      startSec: toSeconds(item?.s),
      endSec: toSeconds(item?.e),
    }))
    .filter((segment: TranscriptSegment) => segment.text.length > 0);

  if (!segments.length) {
    throw new TranscriptProviderError('TRANSCRIPT_EMPTY', 'Transcript unavailable for this video. Please try another video.');
  }

  return segments;
}

export async function getTranscriptFromYtToText(videoId: string): Promise<TranscriptResult> {
  const call = async () => fetchOnce(videoId);

  const segments = await withTimeout(
    (async () => {
      try {
        return await call();
      } catch (error) {
        if (error instanceof TranscriptProviderError && error.code !== 'TRANSCRIPT_FETCH_FAIL') {
          throw error;
        }
        return call();
      }
    })(),
    25_000,
  );

  return {
    text: segments.map((segment) => segment.text).join(' '),
    source: 'yt_to_text_subtitles_v1',
    confidence: null,
    segments,
  };
}

export const ytToTextTranscriptProviderAdapter: TranscriptProviderAdapter = {
  id: 'yt_to_text',
  getTranscript: getTranscriptFromYtToText,
};
