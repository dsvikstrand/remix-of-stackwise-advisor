export type YouTubeDurationLookupErrorCode =
  | 'RATE_LIMITED'
  | 'PROVIDER_FAIL';

export class YouTubeDurationLookupError extends Error {
  code: YouTubeDurationLookupErrorCode;

  constructor(code: YouTubeDurationLookupErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function parseYouTubeIsoDurationToSeconds(rawDuration: string | undefined) {
  const value = String(rawDuration || '').trim();
  if (!value) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const total = (hours * 3600) + (minutes * 60) + seconds;
  return Number.isFinite(total) ? total : null;
}

function withTimeoutSignal(timeoutMs: number) {
  const clamped = Number.isFinite(timeoutMs) ? Math.max(1000, Math.floor(timeoutMs)) : 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), clamped);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

export async function fetchYouTubeDurationMap(input: {
  apiKey: string;
  videoIds: string[];
  timeoutMs?: number;
  userAgent?: string;
}) {
  const apiKey = String(input.apiKey || '').trim();
  const uniqueVideoIds = Array.from(new Set(
    (input.videoIds || []).map((videoId) => String(videoId || '').trim()).filter(Boolean),
  ));
  const durationMap = new Map<string, number | null>();

  if (!apiKey || uniqueVideoIds.length === 0) {
    return durationMap;
  }

  const userAgent = String(input.userAgent || '').trim() || 'bleuv1-youtube-duration/1.0 (+https://bapi.vdsai.cloud)';
  const batchSize = 50;
  for (let offset = 0; offset < uniqueVideoIds.length; offset += batchSize) {
    const ids = uniqueVideoIds.slice(offset, offset + batchSize);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', apiKey);

    const timeout = withTimeoutSignal(input.timeoutMs ?? 8000);
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        signal: timeout.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new YouTubeDurationLookupError('PROVIDER_FAIL', `YouTube duration provider failed (${message}).`);
    } finally {
      timeout.cleanup();
    }

    if (response.status === 403 || response.status === 429) {
      throw new YouTubeDurationLookupError('RATE_LIMITED', 'YouTube provider quota is currently limited.');
    }
    if (!response.ok) {
      throw new YouTubeDurationLookupError('PROVIDER_FAIL', `YouTube duration provider failed (${response.status}).`);
    }

    const json = (await response.json().catch(() => null)) as {
      items?: Array<{ id?: string; contentDetails?: { duration?: string } }>;
      error?: { code?: number; message?: string };
    } | null;
    if (!json) {
      throw new YouTubeDurationLookupError('PROVIDER_FAIL', 'Invalid response from YouTube duration provider.');
    }
    if (json.error) {
      if (json.error.code === 403 || json.error.code === 429) {
        throw new YouTubeDurationLookupError('RATE_LIMITED', json.error.message || 'YouTube provider quota is currently limited.');
      }
      throw new YouTubeDurationLookupError('PROVIDER_FAIL', json.error.message || 'YouTube duration provider returned an error.');
    }

    for (const row of json.items || []) {
      const videoId = String(row.id || '').trim();
      if (!videoId) continue;
      durationMap.set(videoId, parseYouTubeIsoDurationToSeconds(row.contentDetails?.duration));
    }
  }

  return durationMap;
}
