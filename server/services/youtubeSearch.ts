import { execFile } from 'node:child_process';
import Innertube from 'youtubei.js';
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
const TITLE_LOOKUP_TIMEOUT_MS = 8_000;
const YOUTUBEI_TIMEOUT_MS = 5_000;
const YTDLP_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

type HelperLookupResult = {
  result: YouTubeSearchResult;
  provider: 'youtubei' | 'yt_dlp';
  score?: number;
};

type YtDlpJson = {
  id?: string;
  title?: string;
  description?: string;
  channel_id?: string;
  uploader_id?: string;
  channel?: string;
  uploader?: string;
  channel_url?: string;
  thumbnail?: string;
  upload_date?: string;
  duration?: number | string | null;
  webpage_url?: string;
  url?: string;
  entries?: YtDlpJson[];
};

let youtubeiClientPromise: Promise<Innertube> | null = null;

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new YouTubeSearchError('RATE_LIMITED', message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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

function parseYtDlpPublishedAt(rawValue: string | undefined) {
  const value = String(rawValue || '').trim();
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
}

function normalizeTitleForMatch(rawValue: string) {
  return decodeHtmlEntities(String(rawValue || ''))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenizeForMatch(rawValue: string) {
  const normalized = normalizeTitleForMatch(rawValue);
  return normalized ? normalized.split(' ') : [];
}

export function scoreYouTubeTitleMatch(query: string, candidateTitle: string) {
  const left = normalizeTitleForMatch(query);
  const right = normalizeTitleForMatch(candidateTitle);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = tokenizeForMatch(left);
  const rightTokens = tokenizeForMatch(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }

  const coverageLeft = overlap / leftSet.size;
  const coverageRight = overlap / rightSet.size;
  const orderBonus = right.includes(left) || left.includes(right) ? 0.1 : 0;
  return Math.min(1, (Math.min(coverageLeft, coverageRight) * 0.8) + (Math.max(coverageLeft, coverageRight) * 0.1) + orderBonus);
}

export function isStrongYouTubeTitleMatch(query: string, candidateTitle: string) {
  return scoreYouTubeTitleMatch(query, candidateTitle) >= 0.92;
}

async function getYouTubeiClient() {
  if (!youtubeiClientPromise) {
    youtubeiClientPromise = Innertube.create();
  }
  return youtubeiClientPromise;
}

export function resetYouTubeLookupHelpersForTest() {
  youtubeiClientPromise = null;
}

function normalizeYouTubeiVideoResult(raw: any): YouTubeSearchResult | null {
  const videoId = String(raw?.video_id || raw?.id || '').trim();
  const channelId = String(raw?.author?.id || '').trim();
  if (!videoId || !channelId) return null;

  return {
    video_id: videoId,
    video_url: `https://www.youtube.com/watch?v=${videoId}`,
    title: decodeHtmlEntities(String(raw?.title?.toString?.() || raw?.title || `Video ${videoId}`)).trim(),
    description: decodeHtmlEntities(String(raw?.description || raw?.description_snippet?.toString?.() || '')).trim(),
    channel_id: channelId,
    channel_title: decodeHtmlEntities(String(raw?.author?.name || channelId)).trim(),
    channel_url: String(raw?.author?.url || `https://www.youtube.com/channel/${channelId}`).trim(),
    thumbnail_url: raw?.best_thumbnail?.url || raw?.thumbnails?.[0]?.url || null,
    published_at: null,
    duration_seconds: Number.isFinite(Number(raw?.duration?.seconds))
      ? Math.max(0, Math.floor(Number(raw.duration.seconds)))
      : null,
  };
}

function normalizeYouTubeiVideoInfo(info: any): YouTubeSearchResult | null {
  const basicInfo = info?.basic_info;
  const videoId = String(basicInfo?.id || '').trim();
  const channelId = String(basicInfo?.channel?.id || basicInfo?.channel_id || '').trim();
  if (!videoId || !channelId) return null;

  return {
    video_id: videoId,
    video_url: String(basicInfo?.url_canonical || `https://www.youtube.com/watch?v=${videoId}`).trim(),
    title: decodeHtmlEntities(String(basicInfo?.title || `Video ${videoId}`)).trim(),
    description: decodeHtmlEntities(String(basicInfo?.short_description || '')).trim(),
    channel_id: channelId,
    channel_title: decodeHtmlEntities(String(basicInfo?.channel?.name || basicInfo?.author || channelId)).trim(),
    channel_url: String(basicInfo?.channel?.url || `https://www.youtube.com/channel/${channelId}`).trim(),
    thumbnail_url: basicInfo?.thumbnail?.[0]?.url || null,
    published_at: null,
    duration_seconds: Number.isFinite(Number(basicInfo?.duration))
      ? Math.max(0, Math.floor(Number(basicInfo.duration)))
      : null,
  };
}

function normalizeYtDlpResult(rawValue: YtDlpJson | null | undefined): YouTubeSearchResult | null {
  const raw = Array.isArray(rawValue?.entries) ? rawValue.entries[0] : rawValue;
  if (!raw || typeof raw !== 'object') return null;
  const videoId = normalizeYouTubeVideoId(String(raw.id || ''));
  const channelId = String(raw.channel_id || raw.uploader_id || '').trim();
  if (!videoId || !channelId) return null;

  const channelUrl = String(raw.channel_url || '').trim();
  return {
    video_id: videoId,
    video_url: String(raw.webpage_url || `https://www.youtube.com/watch?v=${videoId}`).trim(),
    title: decodeHtmlEntities(String(raw.title || `Video ${videoId}`)).trim(),
    description: decodeHtmlEntities(String(raw.description || '')).trim(),
    channel_id: channelId,
    channel_title: decodeHtmlEntities(String(raw.channel || raw.uploader || channelId)).trim(),
    channel_url: channelUrl || `https://www.youtube.com/channel/${channelId}`,
    thumbnail_url: raw.thumbnail ? String(raw.thumbnail) : null,
    published_at: parseYtDlpPublishedAt(raw.upload_date),
    duration_seconds: Number.isFinite(Number(raw.duration))
      ? Math.max(0, Math.floor(Number(raw.duration)))
      : null,
  };
}

async function runYtDlpLookup(args: string[]) {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile('yt-dlp', args, {
        timeout: TITLE_LOOKUP_TIMEOUT_MS,
        maxBuffer: YTDLP_MAX_BUFFER_BYTES,
        windowsHide: true,
      }, (error, commandStdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(commandStdout || ''));
      });
    });
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as YtDlpJson;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    if (error?.signal === 'SIGTERM' || error?.killed) {
      throw new YouTubeSearchError('RATE_LIMITED', 'Video lookup took too long. Please try again.');
    }
    return null;
  }
}

async function lookupYouTubeVideoByIdWithYouTubei(videoId: string): Promise<HelperLookupResult | null> {
  try {
    const client = await getYouTubeiClient();
    const info = await withTimeout(
      client.getBasicInfo(videoId),
      YOUTUBEI_TIMEOUT_MS,
      'Video lookup is taking longer than expected. Please try again.',
    );
    const result = normalizeYouTubeiVideoInfo(info);
    return result ? { result, provider: 'youtubei' } : null;
  } catch {
    return null;
  }
}

async function lookupYouTubeVideoByIdWithYtDlp(videoId: string): Promise<HelperLookupResult | null> {
  const json = await runYtDlpLookup([
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  const result = normalizeYtDlpResult(json);
  return result ? { result, provider: 'yt_dlp' } : null;
}

async function lookupYouTubeVideoByTitleWithYouTubei(query: string): Promise<HelperLookupResult | null> {
  try {
    const client = await getYouTubeiClient();
    const search = await withTimeout(
      client.search(query, { type: 'video' }),
      YOUTUBEI_TIMEOUT_MS,
      'Video lookup is taking longer than expected. Please try again.',
    );
    const node = search.results.find((item: any) => item?.type === 'Video');
    const result = normalizeYouTubeiVideoResult(node);
    if (!result) return null;
    return {
      result,
      provider: 'youtubei',
      score: scoreYouTubeTitleMatch(query, result.title),
    };
  } catch {
    return null;
  }
}

async function lookupYouTubeVideoByTitleWithYtDlp(query: string): Promise<HelperLookupResult | null> {
  const json = await runYtDlpLookup([
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    `ytsearch1:${query}`,
  ]);
  const result = normalizeYtDlpResult(json);
  if (!result) return null;
  return {
    result,
    provider: 'yt_dlp',
    score: scoreYouTubeTitleMatch(query, result.title),
  };
}

export async function searchYouTubeVideos(input: {
  apiKey?: string;
  query: string;
  limit?: number;
  pageToken?: string;
}): Promise<YouTubeSearchPage> {
  const validation = validateYouTubeVideoLookupQuery(input.query);
  if (!validation.ok) {
    throw new YouTubeSearchError('INVALID_QUERY', validation.message);
  }

  if (validation.videoId) {
    const directMatch = await lookupYouTubeVideoByIdWithYouTubei(validation.videoId)
      || await lookupYouTubeVideoByIdWithYtDlp(validation.videoId);
    if (!directMatch) {
      throw new YouTubeSearchError('SEARCH_DISABLED', 'Video lookup providers are unavailable right now.');
    }
    return {
      results: directMatch ? [directMatch.result] : [],
      nextPageToken: null,
    };
  }
  const query = validation.query;
  const helperMatch = await lookupYouTubeVideoByTitleWithYouTubei(query)
    || await lookupYouTubeVideoByTitleWithYtDlp(query);

  if (!helperMatch) {
    return {
      results: [],
      nextPageToken: null,
    };
  }

  if (!isStrongYouTubeTitleMatch(query, helperMatch.result.title)) {
    return {
      results: [],
      nextPageToken: null,
    };
  }

  return {
    results: [helperMatch.result],
    nextPageToken: null,
  };
}
