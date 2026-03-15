import {
  TranscriptProviderError,
  normalizeTranscriptWhitespace,
  type TranscriptProviderAdapter,
  type TranscriptProviderDebug,
  type TranscriptResult,
  type TranscriptTransportMetadata,
} from '../types';
import { getWebshareProxyRequestTools } from '../../services/webshareProxy';

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

function buildProviderDebug(input: {
  status?: number | null;
  retryAfterSeconds?: number | null;
  responseExcerpt?: string | null;
  providerErrorCode?: string | null;
  stage?: string | null;
  transport?: TranscriptTransportMetadata | null;
}): TranscriptProviderDebug {
  return {
    provider: 'youtube_timedtext',
    stage: input.stage || null,
    http_status: input.status ?? null,
    retry_after_seconds: input.retryAfterSeconds ?? null,
    provider_error_code: input.providerErrorCode ?? null,
    response_excerpt: input.responseExcerpt ?? null,
    ...(input.transport ? {
      proxy_enabled: input.transport.proxy_enabled,
      proxy_mode: input.transport.proxy_mode,
      proxy_selector: input.transport.proxy_selector,
      proxy_selected_index: input.transport.proxy_selected_index,
      proxy_host: input.transport.proxy_host,
    } : {}),
  };
}

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
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

function parseCaptionTracks(xml: string) {
  const tracks: Array<{ lang: string; name: string | null }> = [];
  const regex = /<track\b([^>]*)\/>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    const attrs = match[1];
    const langMatch = attrs.match(/\blang_code="([^"]+)"/);
    if (!langMatch) continue;
    const nameMatch = attrs.match(/\bname="([^"]*)"/);
    tracks.push({ lang: langMatch[1], name: nameMatch ? decodeHtml(nameMatch[1]) : null });
  }
  return tracks;
}

function extractTranscriptFromJson3(payload: any) {
  if (!payload || !Array.isArray(payload.events)) return '';
  const parts: string[] = [];
  for (const event of payload.events) {
    if (!Array.isArray(event?.segs)) continue;
    for (const seg of event.segs) {
      const text = typeof seg?.utf8 === 'string' ? normalizeTranscriptWhitespace(decodeHtml(seg.utf8)) : '';
      if (text) parts.push(text);
    }
  }
  return normalizeTranscriptWhitespace(parts.join(' '));
}

function mapTimedtextListTerminalStatus(status: number) {
  if (status === 404 || status === 410) {
    return new TranscriptProviderError('VIDEO_UNAVAILABLE', 'This video is unavailable.');
  }
  if (status === 401 || status === 403) {
    return new TranscriptProviderError('ACCESS_DENIED', 'Transcript access is denied for this video.');
  }
  return null;
}

function resolveRetryAttempts() {
  const raw = Number(process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_ATTEMPTS || '');
  if (Number.isInteger(raw) && raw >= 1 && raw <= 6) return raw;
  return DEFAULT_RETRY_ATTEMPTS;
}

function resolveRetryBaseDelayMs() {
  const raw = Number(process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_RETRY_BASE_DELAY_MS || '');
  if (Number.isFinite(raw) && raw >= 0 && raw <= 5000) return raw;
  return DEFAULT_RETRY_BASE_DELAY_MS;
}

function isRetryableTimedtextError(error: unknown) {
  if (error instanceof TranscriptProviderError) {
    if (error.code === 'RATE_LIMITED' || error.code === 'TRANSCRIPT_FETCH_FAIL') {
      return true;
    }
    const status = error.providerDebug?.http_status ?? null;
    return typeof status === 'number' && status >= 500;
  }
  return true;
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryDelayMs(attempt: number) {
  const baseDelayMs = resolveRetryBaseDelayMs();
  if (baseDelayMs <= 0) return 0;
  const jitterMs = Math.floor(Math.random() * Math.max(25, Math.floor(baseDelayMs / 4)));
  return baseDelayMs * attempt + jitterMs;
}

function buildDirectTransportMetadata(): TranscriptTransportMetadata {
  return {
    provider: 'youtube_timedtext',
    proxy_enabled: false,
    proxy_mode: 'direct',
    proxy_selector: null,
    proxy_selected_index: null,
    proxy_host: null,
  };
}

async function fetchTimedtext(
  url: string,
  transport: TranscriptTransportMetadata,
): Promise<{ status: number; headers: Headers; text: string }> {
  if (transport.proxy_enabled) {
    const proxyTools = await getWebshareProxyRequestTools('youtube_timedtext');
    if (proxyTools) {
      const response = await proxyTools.request(url, {
        method: 'GET',
        headers: {},
        dispatcher: proxyTools.dispatcher,
      });
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers || {})) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(', '));
      }
      const text = typeof response.body.text === 'function'
        ? await response.body.text().catch(() => '') || ''
        : typeof response.body.json === 'function'
          ? JSON.stringify(await response.body.json().catch(() => null))
          : '';
      return {
        status: response.statusCode,
        headers,
        text,
      };
    }
  }

  const response = await fetch(url);
  return {
    status: response.status,
    headers: response.headers,
    text: await response.text(),
  };
}

async function fetchOnce(videoId: string): Promise<TranscriptResult> {
  const proxyTools = await getWebshareProxyRequestTools('youtube_timedtext');
  const transport = proxyTools?.transport || buildDirectTransportMetadata();
  const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`;
  const listResponse = await fetchTimedtext(listUrl, transport);
  const listRetryAfterSeconds = parseRetryAfterSeconds(listResponse.headers.get('retry-after'));
  const listXml = listResponse.text;
  const terminalListError = mapTimedtextListTerminalStatus(listResponse.status);
  if (terminalListError) {
    terminalListError.providerDebug = buildProviderDebug({
      stage: 'track_list',
      status: listResponse.status,
      retryAfterSeconds: listRetryAfterSeconds,
      providerErrorCode: terminalListError.code,
      responseExcerpt: listXml,
      transport,
    });
    throw terminalListError;
  }
  if (listResponse.status === 429) {
    throw new TranscriptProviderError(
      'RATE_LIMITED',
      'Transcript provider rate limited. Please retry shortly.',
      {
        retryAfterSeconds: listRetryAfterSeconds,
        providerDebug: buildProviderDebug({
          stage: 'track_list',
          status: listResponse.status,
          retryAfterSeconds: listRetryAfterSeconds,
          providerErrorCode: 'RATE_LIMITED',
          responseExcerpt: listXml,
          transport,
        }),
      },
    );
  }
  if (listResponse.status < 200 || listResponse.status >= 300) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Could not fetch transcript metadata.', {
      providerDebug: buildProviderDebug({
        stage: 'track_list',
        status: listResponse.status,
        retryAfterSeconds: listRetryAfterSeconds,
        responseExcerpt: listXml,
        transport,
      }),
    });
  }
  const tracks = parseCaptionTracks(listXml);
  if (tracks.length === 0) {
    throw new TranscriptProviderError('NO_CAPTIONS', 'Transcript unavailable for this video. Please try another video.', {
      providerDebug: buildProviderDebug({
        stage: 'track_list',
        status: listResponse.status,
        providerErrorCode: 'NO_CAPTIONS',
        responseExcerpt: listXml,
        transport,
      }),
    });
  }

  const preferred = tracks.find((track) => track.lang.startsWith('en')) || tracks[0];
  const trackUrl = new URL('https://www.youtube.com/api/timedtext');
  trackUrl.searchParams.set('v', videoId);
  trackUrl.searchParams.set('lang', preferred.lang);
  trackUrl.searchParams.set('fmt', 'json3');
  if (preferred.name) trackUrl.searchParams.set('name', preferred.name);

  const trackResponse = await fetchTimedtext(trackUrl.toString(), transport);
  const trackRetryAfterSeconds = parseRetryAfterSeconds(trackResponse.headers.get('retry-after'));
  const trackText = trackResponse.text;
  if (trackResponse.status === 401 || trackResponse.status === 403) {
    throw new TranscriptProviderError('ACCESS_DENIED', 'Transcript access is denied for this video.', {
      providerDebug: buildProviderDebug({
        stage: 'track_content',
        status: trackResponse.status,
        retryAfterSeconds: trackRetryAfterSeconds,
        providerErrorCode: 'ACCESS_DENIED',
        responseExcerpt: trackText,
        transport,
      }),
    });
  }
  if (trackResponse.status === 429) {
    throw new TranscriptProviderError(
      'RATE_LIMITED',
      'Transcript provider rate limited. Please retry shortly.',
      {
        retryAfterSeconds: trackRetryAfterSeconds,
        providerDebug: buildProviderDebug({
          stage: 'track_content',
          status: trackResponse.status,
          retryAfterSeconds: trackRetryAfterSeconds,
          providerErrorCode: 'RATE_LIMITED',
          responseExcerpt: trackText,
          transport,
        }),
      },
    );
  }
  if (trackResponse.status < 200 || trackResponse.status >= 300) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Could not fetch transcript content.', {
      providerDebug: buildProviderDebug({
        stage: 'track_content',
        status: trackResponse.status,
        retryAfterSeconds: trackRetryAfterSeconds,
        responseExcerpt: trackText,
        transport,
      }),
    });
  }

  const payload = (() => {
    try {
      return JSON.parse(trackText);
    } catch {
      return null;
    }
  })();
  const text = extractTranscriptFromJson3(payload);
  if (!text) {
    throw new TranscriptProviderError('TRANSCRIPT_EMPTY', 'Transcript unavailable for this video. Please try another video.', {
      providerDebug: buildProviderDebug({
        stage: 'track_content',
        status: trackResponse.status,
        providerErrorCode: 'TRANSCRIPT_EMPTY',
        responseExcerpt: trackText,
        transport,
      }),
    });
  }

  return {
    text,
    source: 'youtube_timedtext',
    confidence: null,
    transport,
  };
}

export async function getTranscriptFromYouTubeTimedtext(videoId: string): Promise<TranscriptResult> {
  const maxAttempts = resolveRetryAttempts();
  let attempt = 1;
  while (true) {
    try {
      return await fetchOnce(videoId);
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableTimedtextError(error)) {
        throw error;
      }
      await sleep(computeRetryDelayMs(attempt));
      attempt += 1;
    }
  }
}

export const youtubeTimedtextTranscriptProviderAdapter: TranscriptProviderAdapter = {
  id: 'youtube_timedtext',
  getTranscript: getTranscriptFromYouTubeTimedtext,
};
