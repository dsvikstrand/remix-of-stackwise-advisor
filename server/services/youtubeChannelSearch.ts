import Innertube from 'youtubei.js';
import { decodeHtmlEntities } from '../lib/decodeHtmlEntities';
import { resolveYouTubeChannel } from './youtubeSubscriptions';

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

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{20,}$/;
const HANDLE_RE = /^@[a-zA-Z0-9._-]{3,30}$/;
const YOUTUBEI_TIMEOUT_MS = 5_000;
const MAX_CHANNEL_LOOKUP_RESULTS = 3;

let youtubeiClientPromise: Promise<Innertube> | null = null;

export class YouTubeChannelSearchError extends Error {
  code: YouTubeChannelSearchErrorCode;

  constructor(code: YouTubeChannelSearchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function clampYouTubeChannelSearchLimit(rawLimit: number | undefined, defaultLimit = 3) {
  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) return defaultLimit;
  return Math.max(1, Math.min(MAX_CHANNEL_LOOKUP_RESULTS, Math.floor(rawLimit)));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new YouTubeChannelSearchError('RATE_LIMITED', message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizePotentialYouTubeUrl(rawValue: string) {
  const value = String(rawValue || '').trim();
  if (/^(?:www\.)?(?:youtube\.com|m\.youtube\.com)\//i.test(value)) {
    return `https://${value}`;
  }
  return value;
}

function normalizeChannelText(rawValue: string) {
  return decodeHtmlEntities(String(rawValue || ''))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9@._-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenizeChannelText(rawValue: string) {
  const normalized = normalizeChannelText(rawValue);
  return normalized ? normalized.split(' ') : [];
}

function parseSubscriberCount(rawValue: string) {
  const value = String(rawValue || '').trim().toUpperCase();
  const match = value.match(/([\d,.]+)\s*([KMB])?/);
  if (!match) return null;
  const numeric = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return null;
  const suffix = match[2] || '';
  const multiplier = suffix === 'B' ? 1_000_000_000 : suffix === 'M' ? 1_000_000 : suffix === 'K' ? 1_000 : 1;
  return Math.max(0, Math.round(numeric * multiplier));
}

function getCanonicalChannelUrl(channelId: string) {
  return `https://www.youtube.com/channel/${channelId}`;
}

function extractHandleFromChannelUrl(rawValue: string) {
  const value = String(rawValue || '').trim();
  if (!value) return null;
  const directHandle = value.match(/(^|\/)(@[a-zA-Z0-9._-]{3,30})(?:\/|$)/);
  if (directHandle?.[2]) return directHandle[2].toLowerCase();
  return null;
}

function looksLikeUrlInput(rawValue: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(String(rawValue || '').trim());
}

function isDirectChannelLookupInput(rawValue: string) {
  const value = String(rawValue || '').trim();
  if (!value) return false;
  if (CHANNEL_ID_RE.test(value) || HANDLE_RE.test(value)) return true;

  try {
    const url = new URL(normalizePotentialYouTubeUrl(value));
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== 'youtube.com' && host !== 'm.youtube.com') return false;
    const path = url.pathname.trim();
    return /^\/(@[a-zA-Z0-9._-]{3,30}|channel\/UC[a-zA-Z0-9_-]{20,}|user\/[^/]+|c\/[^/]+)/i.test(path);
  } catch {
    return false;
  }
}

export function validateYouTubeChannelLookupQuery(rawQuery: string) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    return {
      ok: false as const,
      message: 'Enter a channel link, @handle, channel id, or creator name.',
    };
  }

  if (isDirectChannelLookupInput(query)) {
    return {
      ok: true as const,
      query,
      direct: true,
    };
  }

  if (looksLikeUrlInput(query)) {
    return {
      ok: false as const,
      message: 'Please use a YouTube creator link, @handle, channel id, or creator name.',
    };
  }

  if (query.length < 2) {
    return {
      ok: false as const,
      message: 'Add a little more detail so we can find the right creator.',
    };
  }

  return {
    ok: true as const,
    query,
    direct: false,
  };
}

function scoreChannelTextMatch(query: string, candidate: string) {
  const left = normalizeChannelText(query);
  const right = normalizeChannelText(candidate);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (right.startsWith(left) || left.startsWith(right)) return 0.92;

  const leftTokens = tokenizeChannelText(left);
  const rightTokens = tokenizeChannelText(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }

  const coverageLeft = overlap / leftSet.size;
  const coverageRight = overlap / rightSet.size;
  const inclusionBonus = right.includes(left) || left.includes(right) ? 0.08 : 0;
  return Math.min(1, (coverageLeft * 0.65) + (coverageRight * 0.25) + inclusionBonus);
}

export function scoreYouTubeChannelMatch(query: string, candidate: Pick<YouTubeChannelSearchResult, 'channel_title' | 'channel_url' | 'description'>) {
  const titleScore = scoreChannelTextMatch(query, candidate.channel_title || '');
  const handleScore = scoreChannelTextMatch(query, extractHandleFromChannelUrl(candidate.channel_url || '') || '');
  const descriptionScore = scoreChannelTextMatch(query, candidate.description || '');
  return Math.max(titleScore, handleScore, Math.min(descriptionScore, 0.65));
}

function isStrongEnoughChannelMatch(query: string, candidate: Pick<YouTubeChannelSearchResult, 'channel_title' | 'channel_url' | 'description'>) {
  return scoreYouTubeChannelMatch(query, candidate) >= 0.62;
}

async function getYouTubeiClient() {
  if (!youtubeiClientPromise) {
    youtubeiClientPromise = Innertube.create();
  }
  return youtubeiClientPromise;
}

export function resetYouTubeChannelLookupHelpersForTest() {
  youtubeiClientPromise = null;
}

function normalizeThumbnailUrl(rawValue: any) {
  if (Array.isArray(rawValue) && rawValue[0]?.url) return String(rawValue[0].url);
  if (rawValue?.[0]?.url) return String(rawValue[0].url);
  if (rawValue?.url) return String(rawValue.url);
  return null;
}

function normalizeYouTubeiChannelSearchResult(raw: any): YouTubeChannelSearchResult | null {
  const channelId = String(raw?.id || raw?.channel_id || raw?.author?.id || '').trim();
  if (!channelId) return null;

  const derivedChannelUrl =
    raw?.author?.url
    || raw?.endpoint?.metadata?.url
    || (raw?.endpoint?.payload?.browseId ? getCanonicalChannelUrl(channelId) : null)
    || getCanonicalChannelUrl(channelId);
  const channelUrl = String(derivedChannelUrl || getCanonicalChannelUrl(channelId)).trim();

  const channelTitle = decodeHtmlEntities(String(
    raw?.author?.name
    || raw?.display_name?.toString?.()
    || raw?.title?.toString?.()
    || `Channel ${channelId}`,
  )).trim();

  return {
    channel_id: channelId,
    channel_title: channelTitle || channelId,
    channel_url: channelUrl || getCanonicalChannelUrl(channelId),
    description: decodeHtmlEntities(String(
      raw?.description_snippet?.toString?.()
      || raw?.short_byline?.toString?.()
      || raw?.long_byline?.toString?.()
      || '',
    )).trim(),
    thumbnail_url:
      normalizeThumbnailUrl(raw?.author?.best_thumbnail)
      || normalizeThumbnailUrl(raw?.thumbnail)
      || normalizeThumbnailUrl(raw?.best_thumbnail)
      || null,
    published_at: null,
    subscriber_count: parseSubscriberCount(String(raw?.subscriber_count?.toString?.() || raw?.subscriber_count || '')),
  };
}

function normalizeYouTubeiChannelDetail(channelId: string, info: any, fallbackTitle?: string | null): YouTubeChannelSearchResult {
  const header = info?.header;
  const metadata = info?.metadata || {};
  const title = decodeHtmlEntities(String(
    header?.author?.name
    || metadata?.title
    || fallbackTitle
    || channelId,
  )).trim() || channelId;
  const handle = String(header?.channel_handle?.toString?.() || '').trim();
  const channelUrl = handle
    ? `https://www.youtube.com/${handle}`
    : String(metadata?.url_canonical || metadata?.channel_url || getCanonicalChannelUrl(channelId)).trim() || getCanonicalChannelUrl(channelId);
  const thumbnailUrl =
    normalizeThumbnailUrl(header?.author?.thumbnails)
    || normalizeThumbnailUrl(metadata?.avatar)
    || null;

  return {
    channel_id: channelId,
    channel_title: title,
    channel_url: channelUrl,
    description: decodeHtmlEntities(String(metadata?.description || '')).trim(),
    thumbnail_url: thumbnailUrl,
    published_at: null,
    subscriber_count: parseSubscriberCount(String(header?.subscribers?.toString?.() || metadata?.subscriber_count || '')),
  };
}

async function resolveDirectYouTubeChannel(query: string): Promise<YouTubeChannelSearchResult[] | null> {
  try {
    const resolved = await resolveYouTubeChannel(query);
    try {
      const client = await getYouTubeiClient();
      const info = await withTimeout(
        client.getChannel(resolved.channelId),
        YOUTUBEI_TIMEOUT_MS,
        'Creator lookup is taking longer than expected. Please try again.',
      );
      return [normalizeYouTubeiChannelDetail(resolved.channelId, info, resolved.channelTitle)];
    } catch {
      return [{
        channel_id: resolved.channelId,
        channel_title: resolved.channelTitle || resolved.channelId,
        channel_url: resolved.channelUrl || getCanonicalChannelUrl(resolved.channelId),
        description: '',
        thumbnail_url: null,
        published_at: null,
        subscriber_count: null,
      }];
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'INVALID_CHANNEL' || message.startsWith('CHANNEL_FETCH_FAILED:') || message.startsWith('FEED_FETCH_FAILED:')) {
      return [];
    }
    return null;
  }
}

async function searchYouTubeChannelsByName(query: string, limit: number): Promise<YouTubeChannelSearchResult[] | null> {
  try {
    const client = await getYouTubeiClient();
    const search = await withTimeout(
      client.search(query, { type: 'channel' }),
      YOUTUBEI_TIMEOUT_MS,
      'Creator lookup is taking longer than expected. Please try again.',
    );
    const ranked = search.results
      .map((item: any, index: number) => ({
        item: normalizeYouTubeiChannelSearchResult(item),
        index,
      }))
      .filter((entry): entry is { item: YouTubeChannelSearchResult; index: number } => !!entry.item)
      .map((entry) => ({
        ...entry,
        score: scoreYouTubeChannelMatch(query, entry.item),
      }))
      .filter((entry) => isStrongEnoughChannelMatch(query, entry.item))
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        return left.index - right.index;
      })
      .slice(0, limit)
      .map((entry) => entry.item);

    return ranked;
  } catch {
    return null;
  }
}

export function normalizeYouTubeChannelSearchResult(raw: unknown): YouTubeChannelSearchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<YouTubeChannelSearchResult>;
  const channelId = String(row.channel_id || '').trim();
  if (!channelId) return null;

  return {
    channel_id: channelId,
    channel_title: decodeHtmlEntities(String(row.channel_title || channelId)).trim(),
    channel_url: String(row.channel_url || getCanonicalChannelUrl(channelId)).trim(),
    description: decodeHtmlEntities(String(row.description || '')).trim(),
    thumbnail_url: row.thumbnail_url ? String(row.thumbnail_url) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    subscriber_count: Number.isFinite(Number(row.subscriber_count))
      ? Math.max(0, Math.floor(Number(row.subscriber_count)))
      : null,
  };
}

export async function searchYouTubeChannels(input: {
  apiKey?: string;
  query: string;
  limit?: number;
  pageToken?: string;
}): Promise<YouTubeChannelSearchPage> {
  const validation = validateYouTubeChannelLookupQuery(input.query);
  if (!validation.ok) {
    throw new YouTubeChannelSearchError('INVALID_QUERY', validation.message);
  }

  const limit = clampYouTubeChannelSearchLimit(input.limit, 3);
  if (validation.direct) {
    const results = await resolveDirectYouTubeChannel(validation.query);
    if (results === null) {
      throw new YouTubeChannelSearchError('SEARCH_DISABLED', 'Creator lookup is currently unavailable.');
    }
    return {
      results,
      nextPageToken: null,
    };
  }

  const results = await searchYouTubeChannelsByName(validation.query, limit);
  if (results === null) {
    throw new YouTubeChannelSearchError('SEARCH_DISABLED', 'Creator lookup is currently unavailable.');
  }

  return {
    results,
    nextPageToken: null,
  };
}
