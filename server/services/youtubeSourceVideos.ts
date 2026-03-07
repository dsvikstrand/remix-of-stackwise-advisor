import { fetchYouTubeDurationMap, YouTubeDurationLookupError } from './youtubeDuration';
import { decodeHtmlEntities } from '../lib/decodeHtmlEntities';

export type YouTubeSourceVideo = {
  video_id: string;
  video_url: string;
  title: string;
  description: string;
  channel_id: string;
  channel_title: string;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
};

export type YouTubeSourceVideoPage = {
  results: YouTubeSourceVideo[];
  nextPageToken: string | null;
};

export type YouTubeSourceVideoKind = 'all' | 'full' | 'shorts';

type YouTubeSourceVideoErrorCode =
  | 'SEARCH_DISABLED'
  | 'INVALID_CHANNEL'
  | 'PROVIDER_FAIL'
  | 'RATE_LIMITED';

export class YouTubeSourceVideosError extends Error {
  code: YouTubeSourceVideoErrorCode;

  constructor(code: YouTubeSourceVideoErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function clampYouTubeSourceVideoLimit(rawLimit: number | undefined, defaultLimit = 12) {
  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) return defaultLimit;
  return Math.max(1, Math.min(25, Math.floor(rawLimit)));
}

export function normalizeYouTubeSourceVideoKind(rawKind: string | undefined, fallback: YouTubeSourceVideoKind = 'all') {
  const kind = String(rawKind || '').trim().toLowerCase();
  if (kind === 'full' || kind === 'shorts' || kind === 'all') return kind;
  return fallback;
}

function normalizeYouTubeSourceVideoItem(raw: unknown): YouTubeSourceVideo | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      liveBroadcastContent?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  };

  const videoId = String(item.id?.videoId || '').trim();
  const channelId = String(item.snippet?.channelId || '').trim();
  if (!videoId || !channelId) return null;

  // Skip upcoming placeholders that are not importable yet.
  if (String(item.snippet?.liveBroadcastContent || '').toLowerCase() === 'upcoming') {
    return null;
  }

  return {
    video_id: videoId,
    video_url: `https://www.youtube.com/watch?v=${videoId}`,
    title: decodeHtmlEntities(String(item.snippet?.title || `Video ${videoId}`)).trim(),
    description: decodeHtmlEntities(String(item.snippet?.description || '')).trim(),
    channel_id: channelId,
    channel_title: decodeHtmlEntities(String(item.snippet?.channelTitle || channelId)).trim(),
    thumbnail_url:
      item.snippet?.thumbnails?.high?.url
      || item.snippet?.thumbnails?.medium?.url
      || item.snippet?.thumbnails?.default?.url
      || null,
    published_at: item.snippet?.publishedAt ? String(item.snippet.publishedAt) : null,
    duration_seconds: null,
  };
}

export async function listYouTubeSourceVideos(input: {
  apiKey: string;
  channelId: string;
  limit?: number;
  pageToken?: string;
  kind?: YouTubeSourceVideoKind;
  shortsMaxSeconds?: number;
}): Promise<YouTubeSourceVideoPage> {
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) {
    throw new YouTubeSourceVideosError('SEARCH_DISABLED', 'YouTube source video listing is not configured.');
  }

  const channelId = String(input.channelId || '').trim();
  if (!channelId) {
    throw new YouTubeSourceVideosError('INVALID_CHANNEL', 'A valid source channel id is required.');
  }

  const limit = clampYouTubeSourceVideoLimit(input.limit, 12);
  const pageToken = String(input.pageToken || '').trim();
  const kind = normalizeYouTubeSourceVideoKind(input.kind, 'all');
  const shortsMaxSeconds = Math.max(10, Math.min(600, Number(input.shortsMaxSeconds || 60)));

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'date');
  url.searchParams.set('channelId', channelId);
  url.searchParams.set('maxResults', String(limit));
  url.searchParams.set('key', apiKey);
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'bleuv1-youtube-source-videos/1.0 (+https://api.bleup.app)',
      Accept: 'application/json',
    },
  });

  if (response.status === 403 || response.status === 429) {
    throw new YouTubeSourceVideosError('RATE_LIMITED', 'YouTube provider quota is currently limited.');
  }

  if (!response.ok) {
    throw new YouTubeSourceVideosError('PROVIDER_FAIL', `YouTube source video provider failed (${response.status}).`);
  }

  const json = (await response.json().catch(() => null)) as {
    items?: unknown[];
    nextPageToken?: string;
    error?: { code?: number; message?: string };
  } | null;
  if (!json) {
    throw new YouTubeSourceVideosError('PROVIDER_FAIL', 'Invalid response from YouTube source video provider.');
  }
  if (json.error) {
    if (json.error.code === 403 || json.error.code === 429) {
      throw new YouTubeSourceVideosError('RATE_LIMITED', json.error.message || 'YouTube provider quota is currently limited.');
    }
    throw new YouTubeSourceVideosError('PROVIDER_FAIL', json.error.message || 'YouTube provider returned an error.');
  }

  const items = Array.isArray(json.items) ? json.items : [];
  let results = items
    .map((item) => normalizeYouTubeSourceVideoItem(item))
    .filter((item): item is YouTubeSourceVideo => Boolean(item));

  if (results.length > 0) {
    try {
      const durationMap = await fetchYouTubeDurationMap({
        apiKey,
        videoIds: results.map((item) => item.video_id),
        userAgent: 'bleuv1-youtube-source-videos/1.0 (+https://api.bleup.app)',
      });
      results = results.map((item) => ({
        ...item,
        duration_seconds: durationMap.get(item.video_id) ?? null,
      }));
    } catch (error) {
      if (error instanceof YouTubeDurationLookupError) {
        throw new YouTubeSourceVideosError(error.code, error.message);
      }
      throw error;
    }
  }

  if (kind !== 'all') {
    results = results.filter((item) => {
      if (item.duration_seconds == null) return kind === 'full';
      const isShort = item.duration_seconds <= shortsMaxSeconds;
      return kind === 'shorts' ? isShort : !isShort;
    });
  }

  return {
    results,
    nextPageToken: typeof json.nextPageToken === 'string' ? json.nextPageToken : null,
  };
}
