import {
  TranscriptProviderError,
  normalizeTranscriptWhitespace,
  type TranscriptProviderAdapter,
  type TranscriptResult,
  type TranscriptSegment,
} from '../types';
import { getYtToTextProxyRequestTools } from '../../services/webshareProxy';

type YtToTextTranscriptItem = {
  t?: unknown;
  s?: unknown;
  e?: unknown;
};

type YtToTextResponse = {
  data?: {
    transcripts?: YtToTextTranscriptItem[];
  };
};

type YtToTextHttpResponse = {
  status: number;
  ok: boolean;
  getHeader: (name: string) => string | null;
  parseJson: () => Promise<YtToTextResponse | null>;
};

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

function buildYtToTextRequestBody(videoId: string) {
  return JSON.stringify({ video_id: videoId });
}

function buildYtToTextRequestHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-app-version': '1.0',
    'x-source': 'tubetranscript',
  };
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
) {
  const value = headers[name.toLowerCase()];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value.join(', ');
  return null;
}

async function requestViaFetch(videoId: string): Promise<YtToTextHttpResponse> {
  const response = await fetch('https://yt-to-text.com/api/v1/Subtitles', {
    method: 'POST',
    headers: buildYtToTextRequestHeaders(),
    body: buildYtToTextRequestBody(videoId),
  });

  return {
    status: response.status,
    ok: response.ok,
    getHeader: (name) => response.headers.get(name),
    parseJson: async () => response.json().catch(() => null) as Promise<YtToTextResponse | null>,
  };
}

async function requestViaProxy(videoId: string): Promise<YtToTextHttpResponse> {
  const proxyTools = getYtToTextProxyRequestTools();
  if (!proxyTools) {
    return requestViaFetch(videoId);
  }

  try {
    const response = await proxyTools.request('https://yt-to-text.com/api/v1/Subtitles', {
      method: 'POST',
      headers: buildYtToTextRequestHeaders(),
      body: buildYtToTextRequestBody(videoId),
      dispatcher: proxyTools.dispatcher,
    });

    return {
      status: response.statusCode,
      ok: response.statusCode >= 200 && response.statusCode < 300,
      getHeader: (name) => getHeaderValue(response.headers, name),
      parseJson: async () => response.body.json().catch(() => null) as Promise<YtToTextResponse | null>,
    };
  } catch (error) {
    const message = error instanceof Error && error.message
      ? `Transcript provider proxy request failed: ${error.message}`
      : 'Transcript provider proxy request failed.';
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', message);
  }
}

async function fetchOnce(videoId: string): Promise<TranscriptSegment[]> {
  const response = await requestViaProxy(videoId);

  if (response.status === 403 || response.status === 404) {
    throw new TranscriptProviderError('NO_CAPTIONS', 'Transcript unavailable for this video. Please try another video.');
  }
  if (response.status === 429) {
    throw new TranscriptProviderError(
      'RATE_LIMITED',
      'Transcript provider rate limited. Please retry shortly.',
      { retryAfterSeconds: parseRetryAfterSeconds(response.getHeader('retry-after')) },
    );
  }
  if (!response.ok) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', `Transcript provider returned HTTP ${response.status}.`);
  }

  const payload = await response.parseJson();
  const raw = payload?.data?.transcripts;
  if (!Array.isArray(raw)) {
    throw new TranscriptProviderError('NO_CAPTIONS', 'Transcript unavailable for this video. Please try another video.');
  }

  const segments = raw
    .map((item) => ({
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
