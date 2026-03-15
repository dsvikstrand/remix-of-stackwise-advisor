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

type YouTubeApiErrorPayload = {
  error?: { code?: number; message?: string };
} | null;

type YouTubeChannelUploadsLookup = {
  channelTitle: string;
  uploadsPlaylistId: string | null;
};

function mapYouTubeSourceVideoProviderError(status: number, message: string) {
  if (status === 403 || status === 429) {
    throw new YouTubeSourceVideosError('RATE_LIMITED', message || 'YouTube provider quota is currently limited.');
  }
  throw new YouTubeSourceVideosError('PROVIDER_FAIL', message || `YouTube source video provider failed (${status}).`);
}

async function parseYouTubeApiJson(response: Response, fallbackMessage: string) {
  const json = (await response.json().catch(() => null)) as YouTubeApiErrorPayload;
  if (!response.ok) {
    mapYouTubeSourceVideoProviderError(response.status, json?.error?.message || fallbackMessage);
  }
  if (!json) {
    throw new YouTubeSourceVideosError('PROVIDER_FAIL', 'Invalid response from YouTube source video provider.');
  }
  if (json.error) {
    mapYouTubeSourceVideoProviderError(
      Number(json.error.code || response.status || 500),
      json.error.message || fallbackMessage,
    );
  }
  return json;
}

async function fetchYouTubeChannelUploadsLookup(input: {
  apiKey: string;
  channelId: string;
}) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('id', input.channelId);
  url.searchParams.set('key', input.apiKey);

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'bleuv1-youtube-source-videos/1.0 (+https://api.bleup.app)',
      Accept: 'application/json',
    },
  });

  const json = (await parseYouTubeApiJson(
    response,
    `YouTube source channel provider failed (${response.status}).`,
  )) as YouTubeApiErrorPayload & {
    items?: Array<{
      snippet?: { title?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };

  const row = Array.isArray(json.items) ? json.items[0] : null;
  return {
    channelTitle: decodeHtmlEntities(String(row?.snippet?.title || input.channelId)).trim(),
    uploadsPlaylistId: String(row?.contentDetails?.relatedPlaylists?.uploads || '').trim() || null,
  } satisfies YouTubeChannelUploadsLookup;
}

function normalizeYouTubeSourceVideoPlaylistItem(input: {
  raw: unknown;
  channelId: string;
  channelTitle: string;
}): YouTubeSourceVideo | null {
  if (!input.raw || typeof input.raw !== 'object') return null;
  const item = input.raw as {
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
      resourceId?: { videoId?: string };
    };
    contentDetails?: {
      videoId?: string;
      videoPublishedAt?: string;
    };
    status?: {
      privacyStatus?: string;
    };
  };

  const videoId = String(item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || '').trim();
  if (!videoId) return null;

  if (String(item.status?.privacyStatus || '').trim().toLowerCase() === 'private') {
    return null;
  }

  const title = decodeHtmlEntities(String(item.snippet?.title || `Video ${videoId}`)).trim();
  if (!title || title.toLowerCase() === 'deleted video' || title.toLowerCase() === 'private video') {
    return null;
  }

  return {
    video_id: videoId,
    video_url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    description: decodeHtmlEntities(String(item.snippet?.description || '')).trim(),
    channel_id: input.channelId,
    channel_title: input.channelTitle,
    thumbnail_url:
      item.snippet?.thumbnails?.high?.url
      || item.snippet?.thumbnails?.medium?.url
      || item.snippet?.thumbnails?.default?.url
      || null,
    published_at:
      item.contentDetails?.videoPublishedAt
      ? String(item.contentDetails.videoPublishedAt)
      : item.snippet?.publishedAt
        ? String(item.snippet.publishedAt)
        : null,
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

  const channelLookup = await fetchYouTubeChannelUploadsLookup({
    apiKey,
    channelId,
  });
  if (!channelLookup.uploadsPlaylistId) {
    return {
      results: [],
      nextPageToken: null,
    };
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet,contentDetails,status');
  url.searchParams.set('playlistId', channelLookup.uploadsPlaylistId);
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

  const json = (await parseYouTubeApiJson(
    response,
    `YouTube source video provider failed (${response.status}).`,
  )) as YouTubeApiErrorPayload & {
    items?: unknown[];
    nextPageToken?: string;
  };

  const items = Array.isArray(json.items) ? json.items : [];
  let results = items
    .map((item) => normalizeYouTubeSourceVideoPlaylistItem({
      raw: item,
      channelId,
      channelTitle: channelLookup.channelTitle,
    }))
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
