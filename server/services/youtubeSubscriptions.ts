export type ResolvedYouTubeChannel = {
  channelId: string;
  channelUrl: string;
  channelTitle: string | null;
};

export type YouTubeFeedVideo = {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
};

export type YouTubeVideoState = {
  videoId: string;
  liveBroadcastContent: 'none' | 'live' | 'upcoming';
  scheduledStartAt: string | null;
  actualStartAt: string | null;
  isUpcoming: boolean;
  isLiveNow: boolean;
};

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{20,}$/;
const HANDLE_RE = /^@[a-zA-Z0-9._-]{3,30}$/;

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

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'bleuv1-subscriptions/1.0 (+https://bapi.vdsai.cloud)',
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
  const response = await fetch(feedUrl, {
    headers: { 'User-Agent': 'bleuv1-subscriptions/1.0 (+https://bapi.vdsai.cloud)' },
  });
  if (!response.ok) {
    throw new Error(`FEED_FETCH_FAILED:${response.status}`);
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
        'User-Agent': 'bleuv1-subscriptions/1.0 (+https://bapi.vdsai.cloud)',
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
