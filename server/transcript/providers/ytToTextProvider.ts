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
