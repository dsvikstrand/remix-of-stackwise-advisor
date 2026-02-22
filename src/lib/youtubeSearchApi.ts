import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';

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
  already_exists_for_user: boolean;
  existing_blueprint_id: string | null;
  existing_feed_item_id: string | null;
};

export type YouTubeSearchPage = {
  results: YouTubeSearchResult[];
  next_page_token: string | null;
};

export type SearchVideoGenerateItem = {
  video_id: string;
  video_url: string;
  title: string;
  channel_id: string;
  channel_title?: string | null;
  channel_url?: string | null;
  published_at?: string | null;
  thumbnail_url?: string | null;
};

export type SearchVideoGenerateResponse = {
  job_id: string;
  queue_depth: number;
  estimated_start_seconds: number;
  queued_count: number;
};

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export class ApiRequestError extends Error {
  status: number;
  errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

function getApiBase() {
  if (!config.agenticBackendUrl) return null;
  return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiRequestError(401, 'Sign in required.', 'AUTH_REQUIRED');
  return { Authorization: `Bearer ${token}` };
}

export function clampSearchLimit(rawLimit?: number) {
  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) return 10;
  return Math.max(1, Math.min(25, Math.floor(rawLimit)));
}

export function validateSearchQuery(rawQuery: string) {
  const query = rawQuery.trim();
  if (query.length < 2) return { ok: false as const, message: 'Query must be at least 2 characters.' };
  return { ok: true as const, query };
}

export function normalizeYouTubeSearchResult(raw: unknown): YouTubeSearchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<YouTubeSearchResult>;
  const videoId = String(row.video_id || '').trim();
  const channelId = String(row.channel_id || '').trim();
  if (!videoId || !channelId) return null;

  return {
    video_id: videoId,
    video_url: String(row.video_url || `https://www.youtube.com/watch?v=${videoId}`).trim(),
    title: String(row.title || `Video ${videoId}`).trim(),
    description: String(row.description || '').trim(),
    channel_id: channelId,
    channel_title: String(row.channel_title || channelId).trim(),
    channel_url: String(row.channel_url || `https://www.youtube.com/channel/${channelId}`).trim(),
    thumbnail_url: row.thumbnail_url ? String(row.thumbnail_url) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    already_exists_for_user: Boolean(row.already_exists_for_user),
    existing_blueprint_id: row.existing_blueprint_id ? String(row.existing_blueprint_id) : null,
    existing_feed_item_id: row.existing_feed_item_id ? String(row.existing_feed_item_id) : null,
  };
}

export async function searchYouTube(input: { q: string; limit?: number; pageToken?: string }) {
  const base = getApiBase();
  if (!base) {
    throw new ApiRequestError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  }
  const validQuery = validateSearchQuery(input.q);
  if (!validQuery.ok) {
    throw new ApiRequestError(400, validQuery.message, 'INVALID_QUERY');
  }

  const authHeader = await getAuthHeader();
  const params = new URLSearchParams();
  params.set('q', validQuery.query);
  params.set('limit', String(clampSearchLimit(input.limit)));
  if (input.pageToken?.trim()) {
    params.set('page_token', input.pageToken.trim());
  }

  const response = await fetch(`${base}/youtube-search?${params.toString()}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<YouTubeSearchPage> | null;
  if (!response.ok || !json) {
    throw new ApiRequestError(
      response.status,
      json?.message || `Request failed (${response.status})`,
      json?.error_code || null,
    );
  }
  if (!json.ok) {
    throw new ApiRequestError(response.status, json.message || 'Request failed.', json.error_code || null);
  }

  return {
    results: (json.data?.results || [])
      .map((row) => normalizeYouTubeSearchResult(row))
      .filter((row): row is YouTubeSearchResult => !!row),
    next_page_token: json.data?.next_page_token || null,
  } as YouTubeSearchPage;
}

export async function generateSearchVideos(input: {
  items: SearchVideoGenerateItem[];
}) {
  const base = getApiBase();
  if (!base) {
    throw new ApiRequestError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  }
  const authHeader = await getAuthHeader();

  const response = await fetch(`${base}/search/videos/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      items: input.items,
    }),
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<SearchVideoGenerateResponse> | null;
  if (!response.ok || !json) {
    throw new ApiRequestError(
      response.status,
      json?.message || `Request failed (${response.status})`,
      json?.error_code || null,
    );
  }
  if (!json.ok) {
    throw new ApiRequestError(response.status, json.message || 'Request failed.', json.error_code || null);
  }

  return json.data;
}
