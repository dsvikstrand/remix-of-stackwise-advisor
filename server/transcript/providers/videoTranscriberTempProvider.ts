import { createHmac, randomUUID } from 'node:crypto';
import {
  TranscriptProviderError,
  normalizeTranscriptWhitespace,
  type TranscriptProviderErrorCode,
  type TranscriptProviderAdapter,
  type TranscriptProviderDebug,
  type TranscriptResult,
  type TranscriptSegment,
  type TranscriptTransportMetadata,
} from '../types';
import { getWebshareProxyRequestTools } from '../../services/webshareProxy';

const BASE_URL = 'https://videotranscriber.ai';
const DEFAULT_TIMEOUT_MS = 180_000;
const MIN_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 600_000;
const START_MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 3000;
const CLIENT_LANG_CODE = 'en';
const TRANSCRIPT_TYPES = ['Transcript'] as const;

type VideoTranscriberEnvelope<T> = {
  code?: number;
  message?: unknown;
  data?: T | null;
};

type VideoTranscriberUrlInfo = {
  title?: unknown;
  audio_time?: unknown;
};

type VideoTranscriberStartData = {
  audio_id?: unknown;
  record_id?: unknown;
  id?: unknown;
};

type VideoTranscriberRecordTranscriptSegment = {
  start?: unknown;
  end?: unknown;
  text?: unknown;
  summary?: unknown;
};

type VideoTranscriberRecord = {
  record_id?: unknown;
  status?: unknown;
  title?: unknown;
  transcript?: VideoTranscriberRecordTranscriptSegment[];
  transcript_url?: unknown;
};

type VideoTranscriberTranscriptMeta = {
  transcript_url?: unknown;
};

type JsonFetchResult<T> = {
  status: number;
  text: string;
  headers: Headers;
  body: VideoTranscriberEnvelope<T> | null;
};

type VideoTranscriberRequestContext = {
  transport: TranscriptTransportMetadata;
  proxyTools: Awaited<ReturnType<typeof getWebshareProxyRequestTools>>;
};

let cachedTranscriptKey: string | null = null;
let sharedAnonymousUserId: string | null = null;

function clampInt(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function isTruthyEnv(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on';
}

function shouldForceNewSession() {
  return isTruthyEnv(process.env.VIDEOTRANSCRIBER_TEMP_FORCE_NEW_SESSION);
}

function readVideoTranscriberTempTimeoutMs() {
  return clampInt(process.env.VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
}

function buildProviderDebug(input: {
  stage: string;
  status?: number | null;
  retryAfterSeconds?: number | null;
  providerErrorCode?: string | null;
  responseExcerpt?: string | null;
}): TranscriptProviderDebug {
  return {
    provider: 'videotranscriber_temp',
    stage: input.stage,
    http_status: input.status ?? null,
    retry_after_seconds: input.retryAfterSeconds ?? null,
    provider_error_code: input.providerErrorCode ?? null,
    response_excerpt: input.responseExcerpt ?? null,
  };
}

function buildDirectTransportMetadata(): TranscriptTransportMetadata {
  return {
    provider: 'videotranscriber_temp',
    proxy_enabled: false,
    proxy_mode: 'direct',
    proxy_selector: null,
    proxy_selected_index: null,
    proxy_host: null,
  };
}

function createAnonymousUserId() {
  return randomUUID();
}

function getAnonymousUserIdForRequest() {
  if (shouldForceNewSession()) return createAnonymousUserId();
  if (!sharedAnonymousUserId) sharedAnonymousUserId = createAnonymousUserId();
  return sharedAnonymousUserId;
}

function rotateAnonymousUserId() {
  const next = createAnonymousUserId();
  if (!shouldForceNewSession()) {
    sharedAnonymousUserId = next;
  }
  return next;
}

function buildVideoUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function buildRequestHeaders(sessionId: string, initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders || {});
  headers.set('Cookie', `anonymous_user_id=${encodeURIComponent(sessionId)}`);
  return headers;
}

function headersToRecord(headers: Headers) {
  return Object.fromEntries(headers.entries());
}

function headersFromRecord(headers: Record<string, string | string[] | undefined>) {
  const normalized = new Headers();
  for (const [key, value] of Object.entries(headers || {})) {
    if (typeof value === 'string') {
      normalized.set(key, value);
      continue;
    }
    if (Array.isArray(value)) {
      normalized.set(key, value.join(', '));
    }
  }
  return normalized;
}

function normalizeApiMessage(value: unknown) {
  return normalizeTranscriptWhitespace(String(value || ''));
}

function isDailyLimitFailure(providerErrorCode: string, normalizedExcerpt: string) {
  return providerErrorCode === '164005' || normalizedExcerpt.includes('daily limit');
}

function isUpstreamUnavailableFailure(
  status: number | null | undefined,
  providerErrorCode: string,
  normalizedExcerpt: string,
) {
  return status === 502
    || status === 503
    || status === 504
    || providerErrorCode.startsWith('UND_ERR_')
    || normalizedExcerpt.includes('proxy response')
    || normalizedExcerpt.includes('http tunneling')
    || normalizedExcerpt.includes('bad gateway')
    || normalizedExcerpt.includes('cloudflare')
    || normalizedExcerpt.includes('socket hang up')
    || normalizedExcerpt.includes('fetch failed')
    || normalizedExcerpt.includes('econnreset')
    || normalizedExcerpt.includes('etimedout');
}

function classifyVideoTranscriberFailure(input: {
  status?: number | null;
  providerErrorCode?: string | null;
  responseExcerpt?: string | null;
  fallbackMessage: string;
}): {
  code: TranscriptProviderErrorCode;
  message: string;
} {
  const status = Number.isFinite(Number(input.status)) ? Number(input.status) : null;
  const providerErrorCode = normalizeTranscriptWhitespace(String(input.providerErrorCode || ''));
  const responseExcerpt = normalizeApiMessage(input.responseExcerpt);
  const normalizedExcerpt = responseExcerpt.toLowerCase();

  if (status === 401 || status === 403 || normalizedExcerpt.includes('access denied')) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Transcript access is denied for this video.',
    };
  }

  if (
    status === 404
    || status === 410
    || normalizedExcerpt.includes('not found')
    || normalizedExcerpt.includes('unavailable')
  ) {
    return {
      code: 'VIDEO_UNAVAILABLE',
      message: 'This video is unavailable.',
    };
  }

  if (isDailyLimitFailure(providerErrorCode, normalizedExcerpt)) {
    return {
      code: 'VIDEOTRANSCRIBER_DAILY_LIMIT',
      message: 'Temporary transcript provider daily limit reached. Please retry later.',
    };
  }

  if (isUpstreamUnavailableFailure(status, providerErrorCode, normalizedExcerpt)) {
    return {
      code: 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE',
      message: 'Temporary transcript provider upstream is unavailable. Please retry shortly.',
    };
  }

  return {
    code: 'TRANSCRIPT_FETCH_FAIL',
    message: input.fallbackMessage,
  };
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

function parseTimestampToSeconds(input: unknown) {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const normalized = String(input || '').trim();
  if (!normalized) return undefined;
  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber)) return asNumber;
  const parts = normalized.split(':').map((part) => Number(part));
  if (!parts.every((part) => Number.isFinite(part) && part >= 0)) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return (parts[0] * 60 * 60) + (parts[1] * 60) + parts[2];
  return undefined;
}

function signPayload(payload: Record<string, unknown>, key: string) {
  const base = Object.keys(payload)
    .sort()
    .filter((item) => payload[item] !== undefined)
    .map((item) => {
      const value = payload[item];
      if (Array.isArray(value)) {
        return `${item}=[${value.map((entry) => `'${entry}'`).join(', ')}]`;
      }
      return `${item}=${value == null ? '' : value}`;
    })
    .join('&');
  return createHmac('sha256', key).update(base).digest('hex');
}

function responseExcerptFromResult(result: JsonFetchResult<unknown>) {
  return normalizeApiMessage(result.body?.message || result.text);
}

function buildRequestTransportError(
  stage: string,
  fallbackMessage: string,
  error: unknown,
) {
  const errorCode = String((error as { code?: unknown } | null)?.code || '').trim() || 'TRANSPORT_FAIL';
  const responseExcerpt = error instanceof Error ? error.message : String(error);
  const classified = classifyVideoTranscriberFailure({
    providerErrorCode: errorCode,
    responseExcerpt,
    fallbackMessage,
  });
  return new TranscriptProviderError(classified.code, classified.message, {
    providerDebug: buildProviderDebug({
      stage,
      providerErrorCode: errorCode,
      responseExcerpt,
    }),
  });
}

async function createRequestContext(): Promise<VideoTranscriberRequestContext> {
  const proxyTools = await getWebshareProxyRequestTools('videotranscriber_temp');
  return {
    proxyTools,
    transport: proxyTools?.transport || buildDirectTransportMetadata(),
  };
}

async function readProxyResponseText(body: { json?: () => Promise<unknown>; text?: () => Promise<string> }) {
  if (typeof body.text === 'function') {
    return await body.text().catch(() => '') || '';
  }
  if (typeof body.json === 'function') {
    const parsed = await body.json().catch(() => null);
    return parsed == null ? '' : JSON.stringify(parsed);
  }
  return '';
}

async function fetchRawResult(
  url: string,
  init: RequestInit,
  sessionId: string,
  requestContext: VideoTranscriberRequestContext,
  stage: string,
  failureMessage: string,
) {
  const headers = buildRequestHeaders(sessionId, init.headers);
  if (!requestContext.proxyTools) {
    try {
      const response = await fetch(url, {
        ...init,
        headers,
      });
      const text = await response.text();
      return {
        status: response.status,
        text,
        headers: response.headers,
      };
    } catch (error) {
      throw buildRequestTransportError(stage, failureMessage, error);
    }
  }

  try {
    const response = await requestContext.proxyTools.request(url, {
      method: String(init.method || 'GET').toUpperCase(),
      headers: headersToRecord(headers),
      body: typeof init.body === 'string' ? init.body : undefined,
      dispatcher: requestContext.proxyTools.dispatcher,
    });
    return {
      status: response.statusCode,
      text: await readProxyResponseText(response.body),
      headers: headersFromRecord(response.headers),
    };
  } catch (error) {
    throw buildRequestTransportError(stage, failureMessage, error);
  }
}

function throwMappedProviderError(
  code: TranscriptProviderErrorCode,
  message: string,
  stage: string,
  result: JsonFetchResult<unknown>,
) {
  throw new TranscriptProviderError(code, message, {
    retryAfterSeconds: parseRetryAfterSeconds(result.headers.get('retry-after')),
    providerDebug: buildProviderDebug({
      stage,
      status: result.status,
      retryAfterSeconds: parseRetryAfterSeconds(result.headers.get('retry-after')),
      providerErrorCode: String(result.body?.code || '').trim() || code,
      responseExcerpt: responseExcerptFromResult(result),
    }),
  });
}

function throwApiFailure(stage: string, result: JsonFetchResult<unknown>, fallbackMessage: string) {
  const classified = classifyVideoTranscriberFailure({
    status: result.status,
    providerErrorCode: String(result.body?.code || '').trim() || null,
    responseExcerpt: responseExcerptFromResult(result),
    fallbackMessage,
  });
  throwMappedProviderError(classified.code, classified.message, stage, result);
}

async function fetchJsonResult<T>(
  url: string,
  init: RequestInit,
  sessionId: string,
  requestContext: VideoTranscriberRequestContext,
  stage: string,
  failureMessage: string,
): Promise<JsonFetchResult<T>> {
  const response = await fetchRawResult(url, init, sessionId, requestContext, stage, failureMessage);
  const text = response.text;
  let body: VideoTranscriberEnvelope<T> | null = null;
  try {
    body = text ? JSON.parse(text) as VideoTranscriberEnvelope<T> : null;
  } catch {
    body = null;
  }
  return {
    status: response.status,
    text,
    headers: response.headers,
    body,
  };
}

async function fetchTextResultWithContext(
  url: string,
  sessionId: string,
  requestContext: VideoTranscriberRequestContext,
  stage: string,
  failureMessage: string,
) {
  return fetchRawResult(url, { method: 'GET' }, sessionId, requestContext, stage, failureMessage);
}

async function getTranscriptKey(sessionId: string, requestContext: VideoTranscriberRequestContext) {
  if (cachedTranscriptKey) return cachedTranscriptKey;
  const response = await fetchTextResultWithContext(
    BASE_URL,
    sessionId,
    requestContext,
    'runtime_config',
    'Could not load temporary transcript provider config.',
  );
  const html = response.text;
  if (response.status < 200 || response.status >= 300) {
    const classified = classifyVideoTranscriberFailure({
      status: response.status,
      responseExcerpt: normalizeApiMessage(html),
      fallbackMessage: 'Could not load temporary transcript provider config.',
    });
    throw new TranscriptProviderError(classified.code, classified.message, {
      providerDebug: buildProviderDebug({
        stage: 'runtime_config',
        status: response.status,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
        responseExcerpt: normalizeApiMessage(html),
      }),
    });
  }
  const transcriptKey = html.match(/transcriptKey:"([^"]+)"/)?.[1]?.trim() || '';
  if (!transcriptKey) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Could not resolve temporary transcript provider signing key.', {
      providerDebug: buildProviderDebug({
        stage: 'runtime_config',
        status: response.status,
        responseExcerpt: normalizeApiMessage(html),
      }),
    });
  }
  cachedTranscriptKey = transcriptKey;
  return transcriptKey;
}

async function getUrlInfo(videoUrl: string, sessionId: string, requestContext: VideoTranscriberRequestContext) {
  const endpoint = new URL('/api/v1/transcriptions/url-info', BASE_URL);
  endpoint.searchParams.set('url', videoUrl);
  endpoint.searchParams.set('type', '3');

  const result = await fetchJsonResult<VideoTranscriberUrlInfo>(
    endpoint.toString(),
    { method: 'GET' },
    sessionId,
    requestContext,
    'url_info',
    'Could not load transcript metadata.',
  );
  if (result.status === 401 || result.status === 403 || result.status === 404 || result.status === 410) {
    throwApiFailure('url_info', result, 'Could not load transcript metadata.');
  }
  if (result.body?.code !== 100000 || !result.body?.data) {
    throwApiFailure('url_info', result, 'Could not load transcript metadata.');
  }
  return result.body.data;
}

async function startTranscription(
  videoUrl: string,
  info: VideoTranscriberUrlInfo,
  transcriptKey: string,
  sessionId: string,
  requestContext: VideoTranscriberRequestContext,
) {
  const payload = {
    path: videoUrl,
    type: 3,
    lang_code: 'auto',
    diarization: false,
    accuracy: 'medium',
    referrer_url: '/',
    audio_time: Number(info.audio_time) || 0,
    file_name: String(info.title || `youtube_${Date.now()}`),
    client_lang_code: CLIENT_LANG_CODE,
    t: Math.floor(Date.now() / 1000),
  };
  const sign = signPayload(payload, transcriptKey);
  return fetchJsonResult<VideoTranscriberStartData>(
    `${BASE_URL}/api/v1/transcriptions/start`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, sign }),
    },
    sessionId,
    requestContext,
    'start',
    'Could not start temporary transcript job.',
  );
}

function extractRecordId(result: JsonFetchResult<VideoTranscriberStartData>) {
  return normalizeTranscriptWhitespace(
    String(
      result.body?.data?.audio_id
      || result.body?.data?.record_id
      || result.body?.data?.id
      || '',
    ),
  );
}

async function startTranscriptionWithRetry(
  videoUrl: string,
  info: VideoTranscriberUrlInfo,
  transcriptKey: string,
  initialSessionId: string,
  requestContext: VideoTranscriberRequestContext,
) {
  let sessionId = initialSessionId;
  for (let attempt = 1; attempt <= START_MAX_ATTEMPTS; attempt += 1) {
    const result = await startTranscription(videoUrl, info, transcriptKey, sessionId, requestContext);
    if (result.status === 401 || result.status === 403 || result.status === 404 || result.status === 410) {
      throwApiFailure('start', result, 'Could not start temporary transcript job.');
    }

    if (result.body?.code === 100000) {
      const recordId = extractRecordId(result);
      if (!recordId) {
        throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Temporary transcript provider returned success without a record id.', {
          providerDebug: buildProviderDebug({
            stage: 'start',
            status: result.status,
            providerErrorCode: 'MISSING_RECORD_ID',
            responseExcerpt: responseExcerptFromResult(result),
          }),
        });
      }
      return { recordId, sessionId };
    }

    if (result.body?.code === 164002) {
      if (attempt < START_MAX_ATTEMPTS) {
        sessionId = rotateAnonymousUserId();
        continue;
      }
      throw new TranscriptProviderError('RATE_LIMITED', 'Temporary transcript provider queue is busy. Please retry shortly.', {
        retryAfterSeconds: parseRetryAfterSeconds(result.headers.get('retry-after')),
        providerDebug: buildProviderDebug({
          stage: 'start',
          status: result.status,
          retryAfterSeconds: parseRetryAfterSeconds(result.headers.get('retry-after')),
          providerErrorCode: '164002',
          responseExcerpt: responseExcerptFromResult(result),
        }),
      });
    }

    throwApiFailure('start', result, 'Could not start temporary transcript job.');
  }

  throw new TranscriptProviderError('RATE_LIMITED', 'Temporary transcript provider queue is busy. Please retry shortly.');
}

async function getRecord(recordId: string, sessionId: string, requestContext: VideoTranscriberRequestContext) {
  const endpoint = new URL('/api/v1/transcriptions', BASE_URL);
  endpoint.searchParams.set('record_id', recordId);
  return fetchJsonResult<VideoTranscriberRecord>(
    endpoint.toString(),
    { method: 'GET' },
    sessionId,
    requestContext,
    'poll',
    'Could not read temporary transcript job.',
  );
}

async function pollRecordUntilDone(
  recordId: string,
  sessionId: string,
  timeoutMs: number,
  requestContext: VideoTranscriberRequestContext,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await getRecord(recordId, sessionId, requestContext);
    if (result.status === 401 || result.status === 403) {
      throwApiFailure('poll', result, 'Could not read temporary transcript job.');
    }

    if (result.body?.code === 100000 && result.body.data) {
      const status = normalizeTranscriptWhitespace(String(result.body.data.status || '')).toLowerCase();
      if (status === 'success') {
        return result.body.data;
      }
      if (status === 'failed' || status === 'error') {
        throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', `Temporary transcript job ended with status "${status}".`, {
          providerDebug: buildProviderDebug({
            stage: 'poll',
            status: result.status,
            providerErrorCode: status.toUpperCase(),
            responseExcerpt: responseExcerptFromResult(result),
          }),
        });
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new TranscriptProviderError('TIMEOUT', `Temporary transcript provider timed out after ${timeoutMs}ms.`, {
    providerDebug: buildProviderDebug({
      stage: 'poll',
      providerErrorCode: 'TIMEOUT',
    }),
  });
}

function normalizeSegments(list: VideoTranscriberRecordTranscriptSegment[] | unknown) {
  if (!Array.isArray(list)) return [] as TranscriptSegment[];
  return list
    .map((item) => ({
      text: normalizeTranscriptWhitespace(String(item?.text || item?.summary || '')),
      startSec: parseTimestampToSeconds(item?.start),
      endSec: parseTimestampToSeconds(item?.end),
    }))
    .filter((segment) => segment.text.length > 0);
}

function extractSegmentsFromTranscriptPayload(payload: unknown): TranscriptSegment[] {
  if (Array.isArray(payload)) {
    return normalizeSegments(payload);
  }
  if (payload && typeof payload === 'object') {
    const transcript = (payload as { transcript?: unknown }).transcript;
    if (Array.isArray(transcript)) {
      return normalizeSegments(transcript);
    }
    const transcripts = (payload as { transcripts?: Record<string, unknown> }).transcripts;
    if (transcripts && typeof transcripts === 'object') {
      for (const transcriptValue of Object.values(transcripts)) {
        if (!transcriptValue || typeof transcriptValue !== 'object') continue;
        const defaultSegments = normalizeSegments((transcriptValue as { default?: unknown }).default);
        if (defaultSegments.length > 0) return defaultSegments;
        const autoSegments = normalizeSegments((transcriptValue as { auto?: unknown }).auto);
        if (autoSegments.length > 0) return autoSegments;
      }
    }
    const defaultSegments = normalizeSegments((payload as { default?: unknown }).default);
    if (defaultSegments.length > 0) return defaultSegments;
  }
  return [];
}

async function getTranscriptMeta(
  recordId: string,
  lang: string,
  transcriptType: string,
  sessionId: string,
  requestContext: VideoTranscriberRequestContext,
) {
  const endpoint = new URL('/api/v1/transcriptions/get-transcript', BASE_URL);
  endpoint.searchParams.set('record_id', recordId);
  endpoint.searchParams.set('lang', lang);
  endpoint.searchParams.set('transcript_type', transcriptType);
  return fetchJsonResult<VideoTranscriberTranscriptMeta>(
    endpoint.toString(),
    { method: 'GET' },
    sessionId,
    requestContext,
    'get_transcript',
    'Could not resolve transcript metadata.',
  );
}

async function fetchSegmentsFromTranscriptUrl(
  transcriptUrl: string,
  sessionId: string,
  requestContext: VideoTranscriberRequestContext,
) {
  const result = await fetchTextResultWithContext(
    transcriptUrl,
    sessionId,
    requestContext,
    'transcript_url',
    'Could not fetch transcript payload.',
  );
  if (!result.text.trim()) return [] as TranscriptSegment[];
  try {
    const payload = JSON.parse(result.text);
    const segments = extractSegmentsFromTranscriptPayload(payload);
    if (segments.length > 0) return segments;
  } catch {
    // Fallback to plain text.
  }
  return [{
    text: normalizeTranscriptWhitespace(result.text),
    startSec: undefined,
    endSec: undefined,
  }];
}

async function resolveTranscriptSegments(
  record: VideoTranscriberRecord,
  sessionId: string,
  requestContext: VideoTranscriberRequestContext,
) {
  const directSegments = normalizeSegments(record.transcript);
  if (directSegments.length > 0) {
    return {
      segments: directSegments,
      source: 'record.transcript',
    };
  }

  const urlCandidates: Array<{ url: string; source: string }> = [];
  const transcriptUrl = normalizeTranscriptWhitespace(String(record.transcript_url || ''));
  if (transcriptUrl) {
    urlCandidates.push({ url: transcriptUrl, source: 'record.transcript_url' });
  }

  for (const lang of [CLIENT_LANG_CODE, 'en', 'auto']) {
    for (const transcriptType of TRANSCRIPT_TYPES) {
      try {
        const meta = await getTranscriptMeta(
          String(record.record_id || ''),
          lang,
          transcriptType,
          sessionId,
          requestContext,
        );
        const metaUrl = normalizeTranscriptWhitespace(String(meta.body?.data?.transcript_url || ''));
        if (meta.body?.code === 100000 && metaUrl && !urlCandidates.some((candidate) => candidate.url === metaUrl)) {
          urlCandidates.push({
            url: metaUrl,
            source: `get-transcript(${lang},${transcriptType})`,
          });
        }
      } catch {
        // Try the next fallback source.
      }
    }
  }

  for (const candidate of urlCandidates) {
    try {
      const segments = await fetchSegmentsFromTranscriptUrl(candidate.url, sessionId, requestContext);
      if (segments.length > 0) {
        return {
          segments,
          source: candidate.source,
        };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return {
    segments: [] as TranscriptSegment[],
    source: 'none',
  };
}

export async function getTranscriptFromVideoTranscriberTemp(videoId: string): Promise<TranscriptResult> {
  const timeoutMs = readVideoTranscriberTempTimeoutMs();
  const requestContext = await createRequestContext();
  const initialSessionId = getAnonymousUserIdForRequest();
  const videoUrl = buildVideoUrl(videoId);
  const transcriptKey = await getTranscriptKey(initialSessionId, requestContext);
  const info = await getUrlInfo(videoUrl, initialSessionId, requestContext);
  const { recordId, sessionId } = await startTranscriptionWithRetry(
    videoUrl,
    info,
    transcriptKey,
    initialSessionId,
    requestContext,
  );
  const record = await pollRecordUntilDone(recordId, sessionId, timeoutMs, requestContext);
  const resolvedTranscript = await resolveTranscriptSegments(record, sessionId, requestContext);
  if (resolvedTranscript.segments.length === 0) {
    throw new TranscriptProviderError('TRANSCRIPT_EMPTY', 'Transcript unavailable for this video. Please try another video.', {
      providerDebug: buildProviderDebug({
        stage: 'transcript_resolution',
        providerErrorCode: 'TRANSCRIPT_EMPTY',
      }),
    });
  }

  const text = normalizeTranscriptWhitespace(
    resolvedTranscript.segments.map((segment) => segment.text).join(' '),
  );
  if (!text) {
    throw new TranscriptProviderError('TRANSCRIPT_EMPTY', 'Transcript unavailable for this video. Please try another video.', {
      providerDebug: buildProviderDebug({
        stage: 'transcript_resolution',
        providerErrorCode: 'TRANSCRIPT_EMPTY',
      }),
    });
  }

  return {
    text,
    source: 'videotranscriber_temp',
    confidence: null,
    segments: resolvedTranscript.segments,
    transport: requestContext.transport,
  };
}

export function resetVideoTranscriberTempProviderStateForTests() {
  cachedTranscriptKey = null;
  sharedAnonymousUserId = null;
}

export const videoTranscriberTempTranscriptProviderAdapter: TranscriptProviderAdapter = {
  id: 'videotranscriber_temp',
  get timeoutMs() {
    return readVideoTranscriberTempTimeoutMs();
  },
  getTranscript: getTranscriptFromVideoTranscriberTemp,
};
