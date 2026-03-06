import {
  TranscriptProviderError,
  normalizeTranscriptWhitespace,
  type TranscriptProviderAdapter,
  type TranscriptProviderDebug,
  type TranscriptResult,
  type TranscriptSegment,
  type TranscriptTransportMetadata,
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
  parseText: () => Promise<string>;
};

type YtToTextRequestResult = {
  response: YtToTextHttpResponse;
  transport: TranscriptTransportMetadata;
};

type YtToTextFetchResult = {
  segments: TranscriptSegment[];
  transport: TranscriptTransportMetadata;
};

function mapYtToTextTerminalStatus(status: number) {
  if (status === 404 || status === 410) {
    return new TranscriptProviderError('VIDEO_UNAVAILABLE', 'This video is unavailable.');
  }
  if (status === 401 || status === 403) {
    return new TranscriptProviderError('ACCESS_DENIED', 'Transcript access is denied for this video.');
  }
  return null;
}

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

function buildProviderDebug(input: {
  status?: number | null;
  retryAfterSeconds?: number | null;
  responseExcerpt?: string | null;
  providerErrorCode?: string | null;
  stage?: string | null;
}): TranscriptProviderDebug {
  return {
    provider: 'yt_to_text',
    stage: input.stage || null,
    http_status: input.status ?? null,
    retry_after_seconds: input.retryAfterSeconds ?? null,
    provider_error_code: input.providerErrorCode ?? null,
    response_excerpt: input.responseExcerpt ?? null,
  };
}

async function requestViaFetch(videoId: string): Promise<YtToTextHttpResponse> {
  const response = await fetch('https://yt-to-text.com/api/v1/Subtitles', {
    method: 'POST',
    headers: buildYtToTextRequestHeaders(),
    body: buildYtToTextRequestBody(videoId),
  });
  let cachedText: string | null | undefined;

  const parseText = async () => {
    if (typeof cachedText === 'string') return cachedText;
    cachedText = await response.text().catch(() => '') || '';
    return cachedText;
  };

  return {
    status: response.status,
    ok: response.ok,
    getHeader: (name) => response.headers.get(name),
    parseJson: async () => {
      const text = await parseText();
      if (!text) return null;
      try {
        return JSON.parse(text) as YtToTextResponse;
      } catch {
        return null;
      }
    },
    parseText,
  };
}

function buildDirectTransportMetadata(): TranscriptTransportMetadata {
  return {
    provider: 'yt_to_text',
    proxy_enabled: false,
    proxy_mode: 'direct',
    proxy_selector: null,
    proxy_selected_index: null,
    proxy_host: null,
  };
}

async function requestViaFetchWithMetadata(videoId: string): Promise<YtToTextRequestResult> {
  const response = await requestViaFetch(videoId);
  return {
    response,
    transport: buildDirectTransportMetadata(),
  };
}

async function requestViaProxy(videoId: string): Promise<YtToTextRequestResult> {
  const proxyTools = await getYtToTextProxyRequestTools();
  if (!proxyTools) {
    return requestViaFetchWithMetadata(videoId);
  }

  try {
    const response = await proxyTools.request('https://yt-to-text.com/api/v1/Subtitles', {
      method: 'POST',
      headers: buildYtToTextRequestHeaders(),
      body: buildYtToTextRequestBody(videoId),
      dispatcher: proxyTools.dispatcher,
    });

    return {
      response: {
        status: response.statusCode,
        ok: response.statusCode >= 200 && response.statusCode < 300,
        getHeader: (name) => getHeaderValue(response.headers, name),
        parseJson: async () => response.body.json().catch(() => null) as Promise<YtToTextResponse | null>,
        parseText: async () => {
          if (typeof response.body.text === 'function') {
            return response.body.text().catch(() => '') as Promise<string>;
          }
          const parsed = await response.body.json().catch(() => null);
          return parsed ? JSON.stringify(parsed) : '';
        },
      },
      transport: proxyTools.transport,
    };
  } catch (error) {
    const message = error instanceof Error && error.message
      ? `Transcript provider proxy request failed: ${error.message}`
      : 'Transcript provider proxy request failed.';
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', message, {
      providerDebug: buildProviderDebug({
        stage: 'request',
        providerErrorCode: String((error as { code?: unknown } | null)?.code || '').trim() || null,
        responseExcerpt: error instanceof Error ? error.message : String(error),
      }),
    });
  }
}

async function fetchOnce(videoId: string): Promise<YtToTextFetchResult> {
  const { response, transport } = await requestViaProxy(videoId);
  const retryAfterSeconds = parseRetryAfterSeconds(response.getHeader('retry-after'));
  const responseText = !response.ok ? await response.parseText() : '';

  const terminalStatusError = mapYtToTextTerminalStatus(response.status);
  if (terminalStatusError) {
    terminalStatusError.providerDebug = buildProviderDebug({
      stage: 'subtitles',
      status: response.status,
      retryAfterSeconds,
      providerErrorCode: terminalStatusError.code,
      responseExcerpt: responseText,
    });
    throw terminalStatusError;
  }
  if (response.status === 429) {
    throw new TranscriptProviderError(
      'RATE_LIMITED',
      'Transcript provider rate limited. Please retry shortly.',
      {
        retryAfterSeconds,
        providerDebug: buildProviderDebug({
          stage: 'subtitles',
          status: response.status,
          retryAfterSeconds,
          providerErrorCode: 'RATE_LIMITED',
          responseExcerpt: responseText,
        }),
      },
    );
  }
  if (!response.ok) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', `Transcript provider returned HTTP ${response.status}.`, {
      providerDebug: buildProviderDebug({
        stage: 'subtitles',
        status: response.status,
        retryAfterSeconds,
        responseExcerpt: responseText,
      }),
    });
  }

  const payload = await response.parseJson();
  const raw = payload?.data?.transcripts;
  if (!Array.isArray(raw)) {
    throw new TranscriptProviderError('NO_CAPTIONS', 'Transcript unavailable for this video. Please try another video.', {
      providerDebug: buildProviderDebug({
        stage: 'subtitles',
        status: response.status,
        providerErrorCode: 'NO_CAPTIONS',
      }),
    });
  }

  const segments = raw
    .map((item) => ({
      text: typeof item?.t === 'string' ? normalizeTranscriptWhitespace(item.t) : '',
      startSec: toSeconds(item?.s),
      endSec: toSeconds(item?.e),
    }))
    .filter((segment: TranscriptSegment) => segment.text.length > 0);

  if (!segments.length) {
    throw new TranscriptProviderError('TRANSCRIPT_EMPTY', 'Transcript unavailable for this video. Please try another video.', {
      providerDebug: buildProviderDebug({
        stage: 'subtitles',
        status: response.status,
        providerErrorCode: 'TRANSCRIPT_EMPTY',
      }),
    });
  }

  return {
    segments,
    transport,
  };
}

export async function getTranscriptFromYtToText(videoId: string): Promise<TranscriptResult> {
  const call = async () => fetchOnce(videoId);

  const { segments, transport } = await withTimeout(
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
    transport,
  };
}

export const ytToTextTranscriptProviderAdapter: TranscriptProviderAdapter = {
  id: 'yt_to_text',
  getTranscript: getTranscriptFromYtToText,
};
