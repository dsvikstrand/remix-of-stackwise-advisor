import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';

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
  next_page_token: string | null;
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

export function clampChannelSearchLimit(rawLimit?: number) {
  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) return 10;
  return Math.max(1, Math.min(25, Math.floor(rawLimit)));
}

export function validateChannelSearchQuery(rawQuery: string) {
  const query = rawQuery.trim();
  if (query.length < 2) return { ok: false as const, message: 'Query must be at least 2 characters.' };
  return { ok: true as const, query };
}

export function normalizeYouTubeChannelSearchResult(raw: unknown): YouTubeChannelSearchResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<YouTubeChannelSearchResult>;
  const channelId = String(row.channel_id || '').trim();
  if (!channelId) return null;

  return {
    channel_id: channelId,
    channel_title: String(row.channel_title || channelId).trim(),
    channel_url: String(row.channel_url || `https://www.youtube.com/channel/${channelId}`).trim(),
    description: String(row.description || '').trim(),
    thumbnail_url: row.thumbnail_url ? String(row.thumbnail_url) : null,
    published_at: row.published_at ? String(row.published_at) : null,
    subscriber_count: Number.isFinite(Number(row.subscriber_count))
      ? Math.max(0, Math.floor(Number(row.subscriber_count)))
      : null,
  };
}

export async function searchYouTubeChannels(input: { q: string; limit?: number; pageToken?: string }) {
  const base = getApiBase();
  if (!base) {
    throw new ApiRequestError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  }
  const validQuery = validateChannelSearchQuery(input.q);
  if (!validQuery.ok) {
    throw new ApiRequestError(400, validQuery.message, 'INVALID_QUERY');
  }

  const authHeader = await getAuthHeader();
  const params = new URLSearchParams();
  params.set('q', validQuery.query);
  params.set('limit', String(clampChannelSearchLimit(input.limit)));
  if (input.pageToken?.trim()) {
    params.set('page_token', input.pageToken.trim());
  }

  const response = await fetch(`${base}/youtube-channel-search?${params.toString()}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<YouTubeChannelSearchPage> | null;
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
      .map((row) => normalizeYouTubeChannelSearchResult(row))
      .filter((row): row is YouTubeChannelSearchResult => !!row),
    next_page_token: json.data?.next_page_token || null,
  } as YouTubeChannelSearchPage;
}
