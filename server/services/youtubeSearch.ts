import {
  fetchYouTubeDurationMap,
  parseYouTubeIsoDurationToSeconds,
  YouTubeDurationLookupError,
} from './youtubeDuration';
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

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{8,15}$/;

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

function normalizeYouTubeVideoId(rawValue: string) {
  const value = String(rawValue || '').trim();
  return YOUTUBE_VIDEO_ID_REGEX.test(value) ? value : null;
}

function normalizePotentialYouTubeUrl(rawValue: string) {
  const value = String(rawValue || '').trim();
  if (/^(?:www\.)?(?:youtube\.com|m\.youtube\.com|youtu\.be)\//i.test(value)) {
    return `https://${value}`;
  }
  return value;
}

function looksLikeUrlInput(rawValue: string) {
  const value = String(rawValue || '').trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^(?:www\.)?(?:youtube\.com|m\.youtube\.com|youtu\.be)\//i.test(value);
}

function looksLikeYouTubeUrlInput(rawValue: string) {
  const value = String(rawValue || '').trim();
  return /(?:youtube\.com|m\.youtube\.com|youtu\.be)/i.test(value);
}

export function extractYouTubeVideoIdFromLookupInput(rawValue: string) {
  const directVideoId = normalizeYouTubeVideoId(rawValue);
  if (directVideoId) return directVideoId;

  try {
    const url = new URL(normalizePotentialYouTubeUrl(rawValue));
    const host = url.hostname.replace(/^www\./i, '');
    const pathParts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.searchParams.has('list')) return null;
      if (url.pathname === '/watch') {
        return normalizeYouTubeVideoId(url.searchParams.get('v') || '');
      }
      if (pathParts[0] === 'shorts' || pathParts[0] === 'live' || pathParts[0] === 'embed') {
        return normalizeYouTubeVideoId(pathParts[1] || '');
      }
      return null;
    }

    if (host === 'youtu.be') {
      return normalizeYouTubeVideoId(pathParts[0] || '');
    }

    return null;
  } catch {
    return null;
  }
}

export function validateYouTubeVideoLookupQuery(rawQuery: string) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    return {
      ok: false as const,
      message: 'Enter a YouTube link, video id, or a specific title.',
    };
  }

  const videoId = extractYouTubeVideoIdFromLookupInput(query);
  if (videoId) {
    return {
      ok: true as const,
      query,
      videoId,
    };
  }

  if (looksLikeYouTubeUrlInput(query)) {
    return {
      ok: false as const,
      message: 'Please use a single YouTube video link, not a playlist or channel link.',
    };
  }

  if (looksLikeUrlInput(query)) {
    return {
      ok: false as const,
      message: 'Please use a YouTube link, video id, or a specific title.',
    };
  }

  if (query.length < 3) {
    return {
      ok: false as const,
      message: 'Add a little more detail so we can find the right video.',
    };
  }

  return {
    ok: true as const,
    query,
    videoId: null,
  };
}

export function normalizeYouTubeSearchItem(raw: unknown): YouTubeSearchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as {
    id?: string | { videoId?: string };
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
    contentDetails?: {
      duration?: string;
    };
  };

  const videoId = typeof item.id === 'string'
    ? String(item.id || '').trim()
    : String(item.id?.videoId || '').trim();
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

function normalizeYouTubeLookupItem(raw: unknown): YouTubeSearchResult | null {
  const normalized = normalizeYouTubeSearchItem(raw);
  if (!normalized) return null;
  const item = raw as { contentDetails?: { duration?: string } };
  return {
    ...normalized,
    duration_seconds: item.contentDetails?.duration
      ? parseYouTubeIsoDurationToSeconds(item.contentDetails?.duration)
      : normalized.duration_seconds,
  };
}

async function lookupYouTubeVideoById(input: {
  apiKey: string;
  videoId: string;
  userAgent: string;
}) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('id', input.videoId);
  url.searchParams.set('key', input.apiKey);

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': input.userAgent,
      Accept: 'application/json',
    },
  });

  if (response.status === 403 || response.status === 429) {
    throw new YouTubeSearchError('RATE_LIMITED', 'Video lookup is currently limited. Please retry later.');
  }

  if (!response.ok) {
    throw new YouTubeSearchError('PROVIDER_FAIL', `YouTube video lookup failed (${response.status}).`);
  }

  const json = (await response.json().catch(() => null)) as {
    items?: unknown[];
    error?: { code?: number; message?: string };
  } | null;
  if (!json) {
    throw new YouTubeSearchError('PROVIDER_FAIL', 'Invalid response from YouTube video lookup.');
  }
  if (json.error) {
    if (json.error.code === 403 || json.error.code === 429) {
      throw new YouTubeSearchError('RATE_LIMITED', json.error.message || 'Video lookup is currently limited. Please retry later.');
    }
    throw new YouTubeSearchError('PROVIDER_FAIL', json.error.message || 'YouTube video lookup returned an error.');
  }

  const item = (Array.isArray(json.items) ? json.items : [])
    .map((row) => normalizeYouTubeLookupItem(row))
    .find((row): row is YouTubeSearchResult => !!row);

  return item || null;
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

  const validation = validateYouTubeVideoLookupQuery(input.query);
  if (!validation.ok) {
    throw new YouTubeSearchError('INVALID_QUERY', validation.message);
  }

  const query = validation.query;
  const userAgent = 'bleuv1-youtube-search/1.0 (+https://api.bleup.app)';

  if (validation.videoId) {
    const directMatch = await lookupYouTubeVideoById({
      apiKey,
      videoId: validation.videoId,
      userAgent,
    });
    return {
      results: directMatch ? [directMatch] : [],
      nextPageToken: null,
    };
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json',
    },
  });

  if (response.status === 403 || response.status === 429) {
    throw new YouTubeSearchError('RATE_LIMITED', 'Video lookup is currently limited. Please retry later.');
  }

  if (!response.ok) {
    throw new YouTubeSearchError('PROVIDER_FAIL', `YouTube lookup provider failed (${response.status}).`);
  }

  const json = (await response.json().catch(() => null)) as {
    items?: unknown[];
    nextPageToken?: string;
    error?: { code?: number; message?: string };
  } | null;
  if (!json) {
    throw new YouTubeSearchError('PROVIDER_FAIL', 'Invalid response from YouTube lookup provider.');
  }
  if (json.error) {
    if (json.error.code === 403 || json.error.code === 429) {
      throw new YouTubeSearchError('RATE_LIMITED', json.error.message || 'Video lookup is currently limited. Please retry later.');
    }
    throw new YouTubeSearchError('PROVIDER_FAIL', json.error.message || 'YouTube lookup provider returned an error.');
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
        userAgent,
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
    nextPageToken: null,
  };
}
