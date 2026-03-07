export type YouTubeChannelSearchResult = {
  channel_id: string;
  channel_title: string;
  channel_url: string;
  description: string;
  thumbnail_url: string | null;
  published_at: string | null;
  subscriber_count: number | null;
};

export type YouTubeChannelSearchPage = {
  results: YouTubeChannelSearchResult[];
  nextPageToken: string | null;
};

type YouTubeChannelSearchErrorCode =
  | 'INVALID_QUERY'
  | 'SEARCH_DISABLED'
  | 'PROVIDER_FAIL'
  | 'RATE_LIMITED';

export class YouTubeChannelSearchError extends Error {
  code: YouTubeChannelSearchErrorCode;

  constructor(code: YouTubeChannelSearchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function clampYouTubeChannelSearchLimit(rawLimit: number | undefined, defaultLimit = 10) {
  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) return defaultLimit;
  return Math.max(1, Math.min(25, Math.floor(rawLimit)));
}

export function normalizeYouTubeChannelSearchItem(raw: unknown): YouTubeChannelSearchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as {
    id?: { channelId?: string };
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
  };

  const channelId = String(item.id?.channelId || '').trim();
  if (!channelId) return null;

  return {
    channel_id: channelId,
    channel_title: String(item.snippet?.title || channelId).trim(),
    channel_url: `https://www.youtube.com/channel/${channelId}`,
    description: String(item.snippet?.description || '').trim(),
    thumbnail_url:
      item.snippet?.thumbnails?.high?.url
      || item.snippet?.thumbnails?.medium?.url
      || item.snippet?.thumbnails?.default?.url
      || null,
    published_at: item.snippet?.publishedAt ? String(item.snippet.publishedAt) : null,
    subscriber_count: null,
  };
}

async function fetchChannelSubscriberMap(input: {
  apiKey: string;
  channelIds: string[];
}) {
  const apiKey = String(input.apiKey || '').trim();
  const uniqueChannelIds = Array.from(new Set(
    input.channelIds.map((channelId) => String(channelId || '').trim()).filter(Boolean),
  ));
  const subscriberMap = new Map<string, number | null>();
  if (!apiKey || uniqueChannelIds.length === 0) return subscriberMap;

  const batchSize = 50;
  for (let offset = 0; offset < uniqueChannelIds.length; offset += batchSize) {
    const ids = uniqueChannelIds.slice(offset, offset + batchSize);
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'bleuv1-youtube-channel-search/1.0 (+https://api.bleup.app)',
        Accept: 'application/json',
      },
    });
    if (response.status === 403 || response.status === 429) {
      throw new YouTubeChannelSearchError('RATE_LIMITED', 'Search provider quota is currently limited.');
    }
    if (!response.ok) {
      throw new YouTubeChannelSearchError('PROVIDER_FAIL', `YouTube channels provider failed (${response.status}).`);
    }

    const json = (await response.json().catch(() => null)) as {
      items?: Array<{ id?: string; statistics?: { subscriberCount?: string } }>;
      error?: { code?: number; message?: string };
    } | null;
    if (!json) {
      throw new YouTubeChannelSearchError('PROVIDER_FAIL', 'Invalid response from YouTube channels provider.');
    }
    if (json.error) {
      if (json.error.code === 403 || json.error.code === 429) {
        throw new YouTubeChannelSearchError('RATE_LIMITED', json.error.message || 'Search provider quota is currently limited.');
      }
      throw new YouTubeChannelSearchError('PROVIDER_FAIL', json.error.message || 'YouTube channels provider returned an error.');
    }

    for (const row of json.items || []) {
      const channelId = String(row.id || '').trim();
      if (!channelId) continue;
      const rawCount = Number(row.statistics?.subscriberCount || NaN);
      subscriberMap.set(channelId, Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : null);
    }
  }

  return subscriberMap;
}

export async function searchYouTubeChannels(input: {
  apiKey: string;
  query: string;
  limit?: number;
  pageToken?: string;
}): Promise<YouTubeChannelSearchPage> {
  const apiKey = String(input.apiKey || '').trim();
  if (!apiKey) {
    throw new YouTubeChannelSearchError('SEARCH_DISABLED', 'YouTube channel search is not configured.');
  }

  const query = String(input.query || '').trim();
  if (query.length < 2) {
    throw new YouTubeChannelSearchError('INVALID_QUERY', 'Search query must be at least 2 characters.');
  }

  const limit = clampYouTubeChannelSearchLimit(input.limit, 10);
  const pageToken = String(input.pageToken || '').trim();

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'channel');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(limit));
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('key', apiKey);
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'bleuv1-youtube-channel-search/1.0 (+https://api.bleup.app)',
      Accept: 'application/json',
    },
  });

  if (response.status === 403 || response.status === 429) {
    throw new YouTubeChannelSearchError('RATE_LIMITED', 'Search provider quota is currently limited.');
  }
  if (!response.ok) {
    throw new YouTubeChannelSearchError('PROVIDER_FAIL', `YouTube search provider failed (${response.status}).`);
  }

  const json = (await response.json().catch(() => null)) as {
    items?: unknown[];
    nextPageToken?: string;
    error?: { code?: number; message?: string };
  } | null;

  if (!json) {
    throw new YouTubeChannelSearchError('PROVIDER_FAIL', 'Invalid response from YouTube search provider.');
  }
  if (json.error) {
    if (json.error.code === 403 || json.error.code === 429) {
      throw new YouTubeChannelSearchError('RATE_LIMITED', json.error.message || 'Search provider quota is currently limited.');
    }
    throw new YouTubeChannelSearchError('PROVIDER_FAIL', json.error.message || 'YouTube search provider returned an error.');
  }

  const items = Array.isArray(json.items) ? json.items : [];
  const results = items
    .map((item) => normalizeYouTubeChannelSearchItem(item))
    .filter((item): item is YouTubeChannelSearchResult => !!item);

  const subscriberMap = await fetchChannelSubscriberMap({
    apiKey,
    channelIds: results.map((row) => row.channel_id),
  });

  return {
    results: results.map((row) => ({
      ...row,
      subscriber_count: subscriberMap.get(row.channel_id) ?? null,
    })),
    nextPageToken: typeof json.nextPageToken === 'string' ? json.nextPageToken : null,
  };
}
