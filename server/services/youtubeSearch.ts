import { fetchYouTubeDurationMap, YouTubeDurationLookupError } from './youtubeDuration';
import { decodeHtmlEntities } from '../lib/decodeHtmlEntities';

export type YouTubeSearchResult = {
  video_id: string;
  video_url: string;
  title: string;
  description: string;
  channel_id: string;
  channel_title: string;
  channel_url: string;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
};

export type YouTubeSearchPage = {
  results: YouTubeSearchResult[];
  nextPageToken: string | null;
};

type YouTubeSearchErrorCode =
  | 'INVALID_QUERY'
  | 'SEARCH_DISABLED'
  | 'PROVIDER_FAIL'
  | 'RATE_LIMITED';

export class YouTubeSearchError extends Error {
  code: YouTubeSearchErrorCode;

  constructor(code: YouTubeSearchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function clampYouTubeSearchLimit(rawLimit: number | undefined, defaultLimit = 10) {
  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) return defaultLimit;
  return Math.max(1, Math.min(25, Math.floor(rawLimit)));
}

export function normalizeYouTubeSearchItem(raw: unknown): YouTubeSearchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
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

  return {
    video_id: videoId,
    video_url: `https://www.youtube.com/watch?v=${videoId}`,
    title: decodeHtmlEntities(String(item.snippet?.title || `Video ${videoId}`)).trim(),
    description: decodeHtmlEntities(String(item.snippet?.description || '')).trim(),
    channel_id: channelId,
    channel_title: decodeHtmlEntities(String(item.snippet?.channelTitle || channelId)).trim(),
    channel_url: `https://www.youtube.com/channel/${channelId}`,
    thumbnail_url:
      item.snippet?.thumbnails?.high?.url
      || item.snippet?.thumbnails?.medium?.url
      || item.snippet?.thumbnails?.default?.url
      || null,
    published_at: item.snippet?.publishedAt ? String(item.snippet.publishedAt) : null,
    duration_seconds: null,
  };
}

export async function searchYouTubeVideos(input: {
  apiKey: string;
  query: string;
  limit?: number;
  pageToken?: string;
}): Promise<YouTubeSearchPage> {
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) {
    throw new YouTubeSearchError('SEARCH_DISABLED', 'YouTube search is not configured.');
  }

  const query = String(input.query || '').trim();
  if (query.length < 2) {
    throw new YouTubeSearchError('INVALID_QUERY', 'Search query must be at least 2 characters.');
  }

  const limit = clampYouTubeSearchLimit(input.limit, 10);
  const pageToken = String(input.pageToken || '').trim();

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(limit));
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('key', apiKey);
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'bleuv1-youtube-search/1.0 (+https://api.bleup.app)',
      Accept: 'application/json',
    },
  });

  if (response.status === 403 || response.status === 429) {
    throw new YouTubeSearchError('RATE_LIMITED', 'Search provider quota is currently limited.');
  }

  if (!response.ok) {
    throw new YouTubeSearchError('PROVIDER_FAIL', `YouTube search provider failed (${response.status}).`);
  }

  const json = (await response.json().catch(() => null)) as {
    items?: unknown[];
    nextPageToken?: string;
    error?: { code?: number; message?: string };
  } | null;
  if (!json) {
    throw new YouTubeSearchError('PROVIDER_FAIL', 'Invalid response from YouTube search provider.');
  }
  if (json.error) {
    if (json.error.code === 403 || json.error.code === 429) {
      throw new YouTubeSearchError('RATE_LIMITED', json.error.message || 'Search provider quota is currently limited.');
    }
    throw new YouTubeSearchError('PROVIDER_FAIL', json.error.message || 'YouTube search provider returned an error.');
  }

  const items = Array.isArray(json.items) ? json.items : [];
  let results = items
    .map((item) => normalizeYouTubeSearchItem(item))
    .filter((item): item is YouTubeSearchResult => !!item);

  if (results.length > 0) {
    try {
      const durationMap = await fetchYouTubeDurationMap({
        apiKey,
        videoIds: results.map((row) => row.video_id),
        userAgent: 'bleuv1-youtube-search/1.0 (+https://api.bleup.app)',
      });
      results = results.map((row) => ({
        ...row,
        duration_seconds: durationMap.get(row.video_id) ?? null,
      }));
    } catch (error) {
      if (error instanceof YouTubeDurationLookupError) {
        throw new YouTubeSearchError(error.code, error.message);
      }
      throw error;
    }
  }

  return {
    results,
    nextPageToken: typeof json.nextPageToken === 'string' ? json.nextPageToken : null,
  };
}
