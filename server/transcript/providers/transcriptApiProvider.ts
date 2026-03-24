import {
  TranscriptProviderError,
  normalizeTranscriptWhitespace,
  type TranscriptProviderAdapter,
  type TranscriptProviderDebug,
  type TranscriptResult,
} from '../types';

const BASE_URL = 'https://transcriptapi.com/api/v2/youtube/transcript';

type TranscriptApiSuccessResponse = {
  transcript?: unknown;
};

function buildProviderDebug(input: {
  status?: number | null;
  retryAfterSeconds?: number | null;
  responseExcerpt?: string | null;
  providerErrorCode?: string | null;
  stage?: string | null;
}): TranscriptProviderDebug {
  return {
    provider: 'transcriptapi',
    stage: input.stage || null,
    http_status: input.status ?? null,
    retry_after_seconds: input.retryAfterSeconds ?? null,
    provider_error_code: input.providerErrorCode ?? null,
    response_excerpt: input.responseExcerpt ?? null,
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

async function readJsonResponse(response: Response) {
  const text = await response.text();
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return { text, body: null as Record<string, unknown> | null };
  }
  try {
    return {
      text,
      body: JSON.parse(normalizedText) as Record<string, unknown>,
    };
  } catch {
    return { text, body: null as Record<string, unknown> | null };
  }
}

function extractErrorDetail(body: Record<string, unknown> | null) {
  const detail = body?.detail;
  if (typeof detail === 'string') return normalizeTranscriptWhitespace(detail);
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const row = entry as Record<string, unknown>;
        const msg = String(row.msg || '').trim();
        return msg || null;
      })
      .filter((entry): entry is string => Boolean(entry));
    return normalizeTranscriptWhitespace(parts.join(' '));
  }
  const message = String(body?.message || '').trim();
  return message ? normalizeTranscriptWhitespace(message) : '';
}

function isNoCaptionsDetail(detail: string) {
  const normalized = detail.toLowerCase();
  return normalized.includes('no caption')
    || normalized.includes('captions disabled')
    || normalized.includes('transcription may not be available')
    || normalized.includes('transcript not available')
    || normalized.includes('no transcript');
}

function isVideoUnavailableDetail(detail: string) {
  const normalized = detail.toLowerCase();
  return normalized.includes('not found')
    || normalized.includes('unavailable')
    || normalized.includes('video removed')
    || normalized.includes('private video');
}

function mapFailureToTranscriptProviderError(input: {
  status: number;
  retryAfterSeconds: number | null;
  responseExcerpt: string;
  detail: string;
}) {
  if (input.status === 401 || input.status === 403) {
    return new TranscriptProviderError('ACCESS_DENIED', 'Transcript access is denied for this video.', {
      retryAfterSeconds: input.retryAfterSeconds,
      providerDebug: buildProviderDebug({
        stage: 'transcript',
        status: input.status,
        retryAfterSeconds: input.retryAfterSeconds,
        providerErrorCode: 'ACCESS_DENIED',
        responseExcerpt: input.responseExcerpt,
      }),
    });
  }

  if (input.status === 404) {
    const code = isNoCaptionsDetail(input.detail) ? 'NO_CAPTIONS' : 'VIDEO_UNAVAILABLE';
    const message = code === 'NO_CAPTIONS'
      ? 'Transcript unavailable for this video. Please try another video.'
      : 'This video is unavailable.';
    return new TranscriptProviderError(code, message, {
      providerDebug: buildProviderDebug({
        stage: 'transcript',
        status: input.status,
        providerErrorCode: code,
        responseExcerpt: input.responseExcerpt,
      }),
    });
  }

  if (input.status === 429) {
    return new TranscriptProviderError('RATE_LIMITED', 'Transcript provider rate limited. Please retry shortly.', {
      retryAfterSeconds: input.retryAfterSeconds,
      providerDebug: buildProviderDebug({
        stage: 'transcript',
        status: input.status,
        retryAfterSeconds: input.retryAfterSeconds,
        providerErrorCode: 'RATE_LIMITED',
        responseExcerpt: input.responseExcerpt,
      }),
    });
  }

  if (input.status >= 500) {
    return new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Could not fetch transcript content.', {
      providerDebug: buildProviderDebug({
        stage: 'transcript',
        status: input.status,
        responseExcerpt: input.responseExcerpt,
      }),
    });
  }

  if (isNoCaptionsDetail(input.detail)) {
    return new TranscriptProviderError('NO_CAPTIONS', 'Transcript unavailable for this video. Please try another video.', {
      providerDebug: buildProviderDebug({
        stage: 'transcript',
        status: input.status,
        providerErrorCode: 'NO_CAPTIONS',
        responseExcerpt: input.responseExcerpt,
      }),
    });
  }

  if (isVideoUnavailableDetail(input.detail)) {
    return new TranscriptProviderError('VIDEO_UNAVAILABLE', 'This video is unavailable.', {
      providerDebug: buildProviderDebug({
        stage: 'transcript',
        status: input.status,
        providerErrorCode: 'VIDEO_UNAVAILABLE',
        responseExcerpt: input.responseExcerpt,
      }),
    });
  }

  return new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Could not fetch transcript content.', {
    providerDebug: buildProviderDebug({
      stage: 'transcript',
      status: input.status,
      responseExcerpt: input.responseExcerpt,
    }),
  });
}

export async function getTranscriptFromTranscriptApi(videoId: string): Promise<TranscriptResult> {
  const apiKey = String(process.env.TRANSCRIPTAPI_APIKEY || '').trim();
  if (!apiKey) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'TranscriptAPI key is not configured.');
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('video_url', videoId);
  url.searchParams.set('format', 'text');
  url.searchParams.set('include_timestamp', 'false');

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Could not fetch transcript content.', {
      providerDebug: buildProviderDebug({
        stage: 'transcript',
        responseExcerpt: message,
      }),
    });
  }

  const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'));
  const { text, body } = await readJsonResponse(response);
  const detail = extractErrorDetail(body);
  const responseExcerpt = detail || normalizeTranscriptWhitespace(text);

  if (response.status < 200 || response.status >= 300) {
    throw mapFailureToTranscriptProviderError({
      status: response.status,
      retryAfterSeconds,
      responseExcerpt,
      detail,
    });
  }

  const transcript = normalizeTranscriptWhitespace(String((body as TranscriptApiSuccessResponse | null)?.transcript || ''));
  if (!transcript) {
    throw new TranscriptProviderError('TRANSCRIPT_EMPTY', 'Transcript unavailable for this video. Please try another video.', {
      providerDebug: buildProviderDebug({
        stage: 'transcript',
        status: response.status,
        providerErrorCode: 'TRANSCRIPT_EMPTY',
        responseExcerpt,
      }),
    });
  }

  return {
    text: transcript,
    source: 'transcriptapi',
    confidence: null,
  };
}

export const transcriptApiTranscriptProviderAdapter: TranscriptProviderAdapter = {
  id: 'transcriptapi',
  getTranscript: getTranscriptFromTranscriptApi,
};
