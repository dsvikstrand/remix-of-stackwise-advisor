export type ResolvedYouTubeChannel = {
  channelId: string;
  channelUrl: string;
  channelTitle: string | null;
};

export type PublicYouTubeSubscriptionPreviewItem = {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  thumbnailUrl: string | null;
};

export type PublicYouTubeSubscriptionsPreview = {
  items: PublicYouTubeSubscriptionPreviewItem[];
  nextPageToken: string | null;
  hasMore: boolean;
};

export class YouTubeChannelLookupError extends Error {
  code: 'CHANNEL_NOT_FOUND' | 'CHANNEL_LOOKUP_UNAVAILABLE';

  constructor(
    code: 'CHANNEL_NOT_FOUND' | 'CHANNEL_LOOKUP_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export class YouTubePublicSubscriptionsError extends Error {
  code: 'PUBLIC_IMPORT_CHANNEL_NOT_FOUND' | 'PUBLIC_SUBSCRIPTIONS_PRIVATE' | 'PUBLIC_IMPORT_UNAVAILABLE';

  constructor(
    code: 'PUBLIC_IMPORT_CHANNEL_NOT_FOUND' | 'PUBLIC_SUBSCRIPTIONS_PRIVATE' | 'PUBLIC_IMPORT_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export type YouTubeFeedVideo = {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  durationSeconds?: number | null;
};

export type YouTubeVideoState = {
  videoId: string;
  liveBroadcastContent: 'none' | 'live' | 'upcoming';
  scheduledStartAt: string | null;
  actualStartAt: string | null;
  isUpcoming: boolean;
  isLiveNow: boolean;
};

export type YouTubeFeedFetchErrorKind =
  | 'feed_not_found'
  | 'feed_upstream_unavailable'
  | 'feed_request_failed';

export class YouTubeFeedFetchError extends Error {
  channelId: string;
  status: number | null;
  kind: YouTubeFeedFetchErrorKind;
  retryable: boolean;

  constructor(input: {
    channelId: string;
    status: number | null;
    kind: YouTubeFeedFetchErrorKind;
    retryable: boolean;
    message: string;
  }) {
    super(input.message);
    this.channelId = input.channelId;
    this.status = input.status;
    this.kind = input.kind;
    this.retryable = input.retryable;
  }
}

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{20,}$/;
const HANDLE_RE = /^@[a-zA-Z0-9._-]{3,30}$/;
const BARE_HANDLE_RE = /^[a-zA-Z0-9._-]{3,30}$/;

function decodeXml(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseFirst(text: string, re: RegExp): string | null {
  const match = text.match(re);
  return match?.[1] ? decodeXml(match[1]) : null;
}

function getCanonicalChannelUrl(channelId: string) {
  return `https://www.youtube.com/channel/${channelId}`;
}

function classifyYouTubeFeedFetchStatus(status: number | null): {
  kind: YouTubeFeedFetchErrorKind;
  retryable: boolean;
} {
  if (status === 404) {
    return {
      kind: 'feed_not_found',
      retryable: false,
    };
  }
  if (status != null && status >= 500) {
    return {
      kind: 'feed_upstream_unavailable',
      retryable: true,
    };
  }
  return {
    kind: 'feed_request_failed',
    retryable: status == null,
  };
}

export function toYouTubeFeedFetchError(error: unknown, channelId?: string): YouTubeFeedFetchError | null {
  if (error instanceof YouTubeFeedFetchError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error || '');
  const statusMatch = message.match(/^FEED_FETCH_FAILED:(\d{3}|network|unknown)$/);
  if (statusMatch) {
    const rawStatus = statusMatch[1];
    const status = /^\d{3}$/.test(rawStatus) ? Number.parseInt(rawStatus, 10) : null;
    const classified = classifyYouTubeFeedFetchStatus(status);
    return new YouTubeFeedFetchError({
      channelId: String(channelId || '').trim(),
      status,
      kind: classified.kind,
      retryable: classified.retryable,
      message,
    });
  }

  return null;
}

function normalizeHandleValue(value: string) {
  return value.trim().replace(/^@+/, '');
}

function toYouTubeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (CHANNEL_ID_RE.test(raw)) {
    return getCanonicalChannelUrl(raw);
  }

  if (HANDLE_RE.test(raw)) {
    return `https://www.youtube.com/${raw}`;
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}

type OfficialChannelLookup =
  | { kind: 'id'; value: string }
  | { kind: 'forHandle'; value: string }
  | { kind: 'forUsername'; value: string };

function toOfficialChannelLookup(input: string): OfficialChannelLookup | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (CHANNEL_ID_RE.test(raw)) {
    return { kind: 'id', value: raw };
  }

  if (HANDLE_RE.test(raw)) {
    const handle = normalizeHandleValue(raw);
    if (!handle) return null;
    return { kind: 'forHandle', value: handle };
  }

  if (BARE_HANDLE_RE.test(raw)) {
    return { kind: 'forHandle', value: raw };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;

  const parts = url.pathname.split('/').filter(Boolean);
  const first = String(parts[0] || '').trim();
  const second = String(parts[1] || '').trim();

  if (first.startsWith('@')) {
    const handle = normalizeHandleValue(first);
    if (!handle) return null;
    return { kind: 'forHandle', value: handle };
  }

  if (first === 'channel' && CHANNEL_ID_RE.test(second)) {
    return { kind: 'id', value: second };
  }

  if (first === 'user' && second) {
    return { kind: 'forUsername', value: second };
  }

  return null;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'bleuv1-subscriptions/1.0 (+https://api.bleup.app)',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) {
    throw new Error(`CHANNEL_FETCH_FAILED:${response.status}`);
  }
  return response.text();
}

function extractChannelIdFromHtml(html: string): string | null {
  const fromJson = parseFirst(html, /"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/i);
  if (fromJson && CHANNEL_ID_RE.test(fromJson)) return fromJson;

  const fromMeta = parseFirst(html, /<meta[^>]*itemprop=["']channelId["'][^>]*content=["'](UC[a-zA-Z0-9_-]{20,})["']/i);
  if (fromMeta && CHANNEL_ID_RE.test(fromMeta)) return fromMeta;

  // Some handle pages expose only browseId in bootstrap payload.
  const fromBrowseId = parseFirst(html, /"browseId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/i);
  if (fromBrowseId && CHANNEL_ID_RE.test(fromBrowseId)) return fromBrowseId;

  return null;
}

function extractTitleFromHtml(html: string): string | null {
  const og = parseFirst(html, /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (og) return og;
  const title = parseFirst(html, /<title>([^<]+)<\/title>/i);
  if (!title) return null;
  return title.replace(/\s*-\s*YouTube\s*$/i, '').trim() || null;
}

export async function fetchYouTubeFeed(channelId: string, maxItems = 15): Promise<{ channelTitle: string | null; videos: YouTubeFeedVideo[] }> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let response: Response;
  try {
    response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'bleuv1-subscriptions/1.0 (+https://api.bleup.app)' },
    });
  } catch {
    throw new YouTubeFeedFetchError({
      channelId,
      status: null,
      kind: 'feed_upstream_unavailable',
      retryable: true,
      message: 'FEED_FETCH_FAILED:network',
    });
  }
  if (!response.ok) {
    const classified = classifyYouTubeFeedFetchStatus(response.status);
    throw new YouTubeFeedFetchError({
      channelId,
      status: response.status,
      kind: classified.kind,
      retryable: classified.retryable,
      message: `FEED_FETCH_FAILED:${response.status}`,
    });
  }
  const xml = await response.text();

  const channelTitle = parseFirst(xml, /<feed[\s\S]*?<title>([^<]+)<\/title>/i);
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi))
    .map((match) => {
      const block = match[1] || '';
      const videoId = parseFirst(block, /<yt:videoId>([^<]+)<\/yt:videoId>/i);
      if (!videoId) return null;

      const url =
        parseFirst(block, /<link[^>]+href=["']([^"']+)["']/i) ||
        `https://www.youtube.com/watch?v=${videoId}`;

      return {
        videoId,
        title: parseFirst(block, /<title>([^<]+)<\/title>/i) || `Video ${videoId}`,
        url,
        publishedAt: parseFirst(block, /<published>([^<]+)<\/published>/i),
        thumbnailUrl: parseFirst(block, /<media:thumbnail[^>]+url=["']([^"']+)["']/i),
      } as YouTubeFeedVideo;
    })
    .filter((item): item is YouTubeFeedVideo => !!item)
    .sort((a, b) => {
      const aTs = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bTs = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bTs - aTs;
    })
    .slice(0, maxItems);

  return { channelTitle, videos: entries };
}

export async function fetchYouTubeVideoStates(input: {
  apiKey: string;
  videoIds: string[];
}): Promise<Map<string, YouTubeVideoState>> {
  const apiKey = String(input.apiKey || '').trim();
  const uniqueVideoIds = Array.from(new Set(
    (input.videoIds || [])
      .map((videoId) => String(videoId || '').trim())
      .filter(Boolean),
  ));

  const stateMap = new Map<string, YouTubeVideoState>();
  if (!apiKey || uniqueVideoIds.length === 0) {
    return stateMap;
  }

  const batchSize = 50;
  for (let offset = 0; offset < uniqueVideoIds.length; offset += batchSize) {
    const ids = uniqueVideoIds.slice(offset, offset + batchSize);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,liveStreamingDetails');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'bleuv1-subscriptions/1.0 (+https://api.bleup.app)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`VIDEO_STATE_FETCH_FAILED:${response.status}`);
    }

    const json = (await response.json().catch(() => null)) as {
      items?: Array<{
        id?: string;
        snippet?: {
          liveBroadcastContent?: string;
        };
        liveStreamingDetails?: {
          scheduledStartTime?: string;
          actualStartTime?: string;
        };
      }>;
      error?: {
        code?: number;
        message?: string;
      };
    } | null;

    if (!json) {
      throw new Error('VIDEO_STATE_FETCH_FAILED:invalid_json');
    }
    if (json.error) {
      throw new Error(`VIDEO_STATE_FETCH_FAILED:${json.error.code || 'unknown'}:${json.error.message || 'unknown'}`);
    }

    for (const row of json.items || []) {
      const videoId = String(row.id || '').trim();
      if (!videoId) continue;

      const rawLive = String(row.snippet?.liveBroadcastContent || 'none').trim().toLowerCase();
      const liveBroadcastContent: YouTubeVideoState['liveBroadcastContent'] =
        rawLive === 'live' || rawLive === 'upcoming' ? rawLive : 'none';
      const scheduledStartAt = row.liveStreamingDetails?.scheduledStartTime
        ? String(row.liveStreamingDetails.scheduledStartTime)
        : null;
      const actualStartAt = row.liveStreamingDetails?.actualStartTime
        ? String(row.liveStreamingDetails.actualStartTime)
        : null;
      const isUpcoming = liveBroadcastContent === 'upcoming' || (!!scheduledStartAt && !actualStartAt);
      const isLiveNow = liveBroadcastContent === 'live';

      stateMap.set(videoId, {
        videoId,
        liveBroadcastContent,
        scheduledStartAt,
        actualStartAt,
        isUpcoming,
        isLiveNow,
      });
    }
  }

  return stateMap;
}

export async function resolveYouTubeChannel(input: string): Promise<ResolvedYouTubeChannel> {
  const normalizedUrl = toYouTubeUrl(input);
  if (!normalizedUrl) {
    throw new Error('INVALID_CHANNEL');
  }

  const asChannelId = input.trim();
  if (CHANNEL_ID_RE.test(asChannelId)) {
    const feed = await fetchYouTubeFeed(asChannelId, 1);
    return {
      channelId: asChannelId,
      channelUrl: getCanonicalChannelUrl(asChannelId),
      channelTitle: feed.channelTitle,
    };
  }

  const url = new URL(normalizedUrl);
  const parts = url.pathname.split('/').filter(Boolean);

  let channelId: string | null = null;
  let channelTitle: string | null = null;

  if (parts[0] === 'channel' && CHANNEL_ID_RE.test(parts[1] || '')) {
    channelId = parts[1];
  }

  if (!channelId) {
    const html = await fetchHtml(normalizedUrl);
    channelId = extractChannelIdFromHtml(html);
    channelTitle = extractTitleFromHtml(html);
  }

  if (!channelId || !CHANNEL_ID_RE.test(channelId)) {
    throw new Error('INVALID_CHANNEL');
  }

  const feed = await fetchYouTubeFeed(channelId, 1);
  return {
    channelId,
    channelUrl: getCanonicalChannelUrl(channelId),
    channelTitle: feed.channelTitle || channelTitle,
  };
}

export async function resolvePublicYouTubeChannel(input: {
  channelInput: string;
  apiKey: string;
}): Promise<ResolvedYouTubeChannel> {
  const apiKey = String(input.apiKey || '').trim();
  const lookup = toOfficialChannelLookup(input.channelInput);
  if (!lookup) {
    throw new YouTubeChannelLookupError(
      'CHANNEL_NOT_FOUND',
      'Could not resolve YouTube channel from the provided input.',
    );
  }
  if (!apiKey) {
    throw new YouTubeChannelLookupError(
      'CHANNEL_LOOKUP_UNAVAILABLE',
      'YouTube public import is not configured.',
    );
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('fields', 'items(id,snippet/title)');
  url.searchParams.set('key', apiKey);

  if (lookup.kind === 'id') {
    url.searchParams.set('id', lookup.value);
  } else if (lookup.kind === 'forHandle') {
    url.searchParams.set('forHandle', lookup.value);
  } else {
    url.searchParams.set('forUsername', lookup.value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'bleuv1-subscriptions/1.0 (+https://api.bleup.app)',
      Accept: 'application/json',
    },
  });

  const json = (await response.json().catch(() => null)) as
    | {
        items?: Array<{
          id?: string | null;
          snippet?: {
            title?: string | null;
          } | null;
        }>;
        error?: {
          message?: string | null;
        } | null;
      }
    | null;

  if (!response.ok) {
    throw new YouTubeChannelLookupError(
      'CHANNEL_LOOKUP_UNAVAILABLE',
      json?.error?.message ?? 'Failed to resolve YouTube channel.',
    );
  }

  const row = Array.isArray(json?.items) ? json?.items?.[0] : null;
  const channelId = String(row?.id || '').trim();
  if (!channelId || !CHANNEL_ID_RE.test(channelId)) {
    throw new YouTubeChannelLookupError(
      'CHANNEL_NOT_FOUND',
      'Could not find that YouTube channel.',
    );
  }

  return {
    channelId,
    channelUrl: getCanonicalChannelUrl(channelId),
    channelTitle: row?.snippet?.title?.trim() || null,
  };
}

export async function fetchPublicYouTubeSubscriptions(input: {
  apiKey: string;
  channelId: string;
  pageToken?: string | null;
  pageSize?: number;
}): Promise<PublicYouTubeSubscriptionsPreview> {
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 50, 50));
  const creators: PublicYouTubeSubscriptionPreviewItem[] = [];
  const seenChannelIds = new Set<string>();
  const nextPageTokenInput = String(input.pageToken || '').trim();
  const url = new URL('https://www.googleapis.com/youtube/v3/subscriptions');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('channelId', input.channelId);
  url.searchParams.set('maxResults', String(pageSize));
  url.searchParams.set('key', input.apiKey);
  if (nextPageTokenInput) {
    url.searchParams.set('pageToken', nextPageTokenInput);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'bleuv1-subscriptions/1.0 (+https://api.bleup.app)',
      Accept: 'application/json',
    },
  });

  const json = (await response.json().catch(() => null)) as
    | {
        items?: Array<{
          snippet?: {
            title?: string | null;
            resourceId?: { channelId?: string | null } | null;
            thumbnails?: {
              high?: { url?: string | null } | null;
              medium?: { url?: string | null } | null;
              default?: { url?: string | null } | null;
            } | null;
          } | null;
        }>;
        nextPageToken?: string | null;
        error?: {
          errors?: Array<{ reason?: string | null }>;
          message?: string | null;
        };
      }
    | null;

  if (!response.ok) {
    const reason = json?.error?.errors?.[0]?.reason ?? null;
    if (
      response.status === 404 &&
      reason === 'subscriberNotFound'
    ) {
      throw new YouTubePublicSubscriptionsError(
        'PUBLIC_IMPORT_CHANNEL_NOT_FOUND',
        'Could not find that YouTube channel.',
      );
    }
    if (
      response.status === 403 &&
      (reason === 'subscriptionForbidden' || reason === 'forbidden')
    ) {
      throw new YouTubePublicSubscriptionsError(
        'PUBLIC_SUBSCRIPTIONS_PRIVATE',
        'The channel subscriptions are private or inaccessible.',
      );
    }
    if (
      response.status === 429
      || reason === 'quotaExceeded'
      || reason === 'dailyLimitExceeded'
      || reason === 'userRateLimitExceeded'
      || reason === 'rateLimitExceeded'
    ) {
      throw new YouTubePublicSubscriptionsError(
        'PUBLIC_IMPORT_UNAVAILABLE',
        'YouTube import is temporarily limited. Please try again shortly.',
      );
    }

    throw new YouTubePublicSubscriptionsError(
      'PUBLIC_IMPORT_UNAVAILABLE',
      json?.error?.message ?? 'Failed to fetch public YouTube subscriptions.',
    );
  }

  const items = Array.isArray(json?.items) ? json.items : [];
  for (const item of items) {
    const channelId = item.snippet?.resourceId?.channelId?.trim();
    const channelTitle = item.snippet?.title?.trim();
    if (!channelId || !channelTitle || seenChannelIds.has(channelId)) {
      continue;
    }

    seenChannelIds.add(channelId);
    creators.push({
      channelId,
      channelTitle,
      channelUrl: getCanonicalChannelUrl(channelId),
      thumbnailUrl:
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
    });
  }

  return {
    items: creators,
    nextPageToken: json?.nextPageToken ?? null,
    hasMore: Boolean(json?.nextPageToken),
  };
}

export function isNewerThanCheckpoint(video: YouTubeFeedVideo, checkpointAt: string | null, checkpointVideoId: string | null) {
  if (!checkpointAt) return true;
  const currentTs = video.publishedAt ? Date.parse(video.publishedAt) : 0;
  const checkpointTs = Date.parse(checkpointAt);
  if (Number.isNaN(currentTs) || Number.isNaN(checkpointTs)) return true;
  if (currentTs > checkpointTs) return true;
  if (currentTs < checkpointTs) return false;
  if (!checkpointVideoId) return true;
  return video.videoId !== checkpointVideoId;
}
