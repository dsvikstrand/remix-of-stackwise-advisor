import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';
import { ApiRequestError } from '@/lib/subscriptionsApi';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type SourcePage = {
  id: string;
  platform: string;
  external_id: string;
  external_url: string;
  title: string;
  avatar_url: string | null;
  banner_url: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  path: string;
  follower_count: number;
};

export type SourceSearchResult = {
  id: string;
  platform: string;
  external_id: string;
  external_url: string;
  title: string;
  avatar_url: string | null;
  is_active: boolean;
  path: string;
};

export type SourcePageSubscriptionState = {
  authenticated: boolean;
  subscribed: boolean;
  subscription_id: string | null;
};

export type SourcePageBlueprintFeedItem = {
  source_item_id: string;
  blueprint_id: string;
  title: string;
  summary: string;
  banner_url: string | null;
  source_thumbnail_url: string | null;
  created_at: string;
  published_channel_slug: string | null;
  tags: Array<{ id: string; slug: string }>;
  source_url: string;
};

export type SourcePageBlueprintFeedPage = {
  items: SourcePageBlueprintFeedItem[];
  next_cursor: string | null;
};

export type SourcePageVideoLibraryItem = {
  video_id: string;
  video_url: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  channel_id: string;
  channel_title: string;
  already_exists_for_user: boolean;
  existing_blueprint_id: string | null;
  existing_feed_item_id: string | null;
  unlock_status: 'available' | 'reserved' | 'processing' | 'ready';
  unlock_cost: number;
  unlock_in_progress: boolean;
  ready_blueprint_id: string | null;
  unlock_id: string | null;
};

export type SourcePageVideoLibraryPage = {
  items: SourcePageVideoLibraryItem[];
  next_page_token: string | null;
  kind: 'full' | 'shorts' | 'all';
  shorts_max_seconds: number;
};

export type SourcePageVideoGenerateSummary = {
  job_id: string | null;
  queued_count: number;
  client_transcript_used?: boolean;
  client_transcript_count?: number;
  requested_tier?: 'free' | 'tier' | null;
  resolved_tier?: 'free' | 'tier';
  variant_status?: 'queued' | 'generated' | 'ready' | 'in_progress';
  skipped_existing_count: number;
  skipped_existing: Array<{
    video_id: string;
    title: string;
    existing_blueprint_id: string | null;
    existing_feed_item_id: string | null;
  }>;
  ready_count: number;
  ready: Array<{ video_id: string; title: string; blueprint_id: string | null }>;
  in_progress_count: number;
  in_progress: Array<{ video_id: string; title: string }>;
  insufficient_count: number;
  insufficient: Array<{ video_id: string; title: string; required: number; balance: number }>;
  transcript_unavailable_count?: number;
  transcript_unavailable?: Array<{ video_id: string; title: string; retry_after_seconds: number }>;
  transcript_status?: 'unknown' | 'retrying' | 'confirmed_no_speech' | 'transient_error' | null;
  transcript_attempt_count?: number | null;
  transcript_retry_after_seconds?: number | null;
  duration_blocked_count?: number;
  duration_blocked?: Array<{
    video_id: string;
    title: string;
    error_code: 'VIDEO_TOO_LONG' | 'VIDEO_DURATION_UNAVAILABLE';
    reason: 'too_long' | 'unknown';
    max_duration_seconds: number;
    video_duration_seconds: number | null;
  }>;
};

function getApiBase() {
  if (!config.agenticBackendUrl) return null;
  return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function getOptionalAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function getRequiredAuthHeader(): Promise<Record<string, string>> {
  const auth = await getOptionalAuthHeader();
  if (!auth.Authorization) {
    throw new ApiRequestError(401, 'Sign in required.', 'AUTH_REQUIRED');
  }
  return auth;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const base = getApiBase();
  if (!base) {
    throw new ApiRequestError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  }

  const response = await fetch(`${base}${path}`, init);
  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !json) {
    throw new ApiRequestError(
      response.status,
      json?.message || `Request failed (${response.status})`,
      json?.error_code || null,
      json?.data ?? null,
    );
  }
  if (!json.ok) {
    throw new ApiRequestError(
      response.status,
      json.message || 'Request failed.',
      json.error_code || null,
      json.data ?? null,
    );
  }
  return json;
}

export function buildSourcePagePath(platform: string, externalId: string) {
  return `/s/${encodeURIComponent(platform)}/${encodeURIComponent(externalId)}`;
}

export async function getSourcePage(input: { platform: string; externalId: string }) {
  const authHeader = await getOptionalAuthHeader();
  const response = await apiRequest<{
    source_page: SourcePage;
    viewer: SourcePageSubscriptionState;
  }>(`/source-pages/${encodeURIComponent(input.platform)}/${encodeURIComponent(input.externalId)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  return response.data;
}

export async function searchSourcePages(input: { q: string; limit?: number }) {
  const params = new URLSearchParams();
  params.set('q', String(input.q || '').trim());
  const safeLimit = Math.max(1, Math.min(25, Number(input.limit || 12)));
  params.set('limit', String(Number.isFinite(safeLimit) ? safeLimit : 12));

  const authHeader = await getOptionalAuthHeader();
  const response = await apiRequest<{ items: SourceSearchResult[] }>(
    `/source-pages/search?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
    },
  );
  return response.data;
}

export async function subscribeToSourcePage(input: { platform: string; externalId: string }) {
  const authHeader = await getRequiredAuthHeader();
  const response = await apiRequest<{
    source_page: SourcePage;
    subscription: {
      id: string;
      source_page_path: string | null;
    };
  }>(`/source-pages/${encodeURIComponent(input.platform)}/${encodeURIComponent(input.externalId)}/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({}),
  });
  return response.data;
}

export async function unsubscribeFromSourcePage(input: { platform: string; externalId: string }) {
  const authHeader = await getRequiredAuthHeader();
  const response = await apiRequest<{
    source_page: SourcePage;
    subscription: { id: string; source_channel_id: string };
  }>(`/source-pages/${encodeURIComponent(input.platform)}/${encodeURIComponent(input.externalId)}/subscribe`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
  });
  return response.data;
}

export async function getSourcePageBlueprints(input: {
  platform: string;
  externalId: string;
  limit?: number;
  cursor?: string | null;
}) {
  const params = new URLSearchParams();
  const safeLimit = Math.max(1, Math.min(24, Number(input.limit || 12)));
  params.set('limit', String(Number.isFinite(safeLimit) ? safeLimit : 12));
  if (input.cursor) params.set('cursor', String(input.cursor));

  const authHeader = await getOptionalAuthHeader();
  const response = await apiRequest<SourcePageBlueprintFeedPage>(
    `/source-pages/${encodeURIComponent(input.platform)}/${encodeURIComponent(input.externalId)}/blueprints?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
    },
  );
  return response.data;
}

export async function getSourcePageVideos(input: {
  platform: string;
  externalId: string;
  limit?: number;
  pageToken?: string | null;
  kind?: 'full' | 'shorts' | 'all';
}) {
  const params = new URLSearchParams();
  const safeLimit = Math.max(1, Math.min(25, Number(input.limit || 12)));
  params.set('limit', String(Number.isFinite(safeLimit) ? safeLimit : 12));
  if (input.pageToken) params.set('page_token', String(input.pageToken));
  if (input.kind) params.set('kind', input.kind);

  const authHeader = await getRequiredAuthHeader();
  const response = await apiRequest<SourcePageVideoLibraryPage>(
    `/source-pages/${encodeURIComponent(input.platform)}/${encodeURIComponent(input.externalId)}/videos?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
    },
  );
  return response.data;
}

export async function generateSourcePageVideos(input: {
  platform: string;
  externalId: string;
  items: Array<{
    video_id: string;
    video_url: string;
    title: string;
    published_at?: string | null;
    thumbnail_url?: string | null;
    duration_seconds?: number | null;
    transcript_text?: string | null;
  }>;
  requestedTier?: 'free' | 'tier';
}) {
  return unlockSourcePageVideos(input);
}

export async function unlockSourcePageVideos(input: {
  platform: string;
  externalId: string;
  items: Array<{
    video_id: string;
    video_url: string;
    title: string;
    published_at?: string | null;
    thumbnail_url?: string | null;
    duration_seconds?: number | null;
  }>;
  requestedTier?: 'free' | 'tier';
}) {
  const authHeader = await getRequiredAuthHeader();
  const response = await apiRequest<SourcePageVideoGenerateSummary>(
    `/source-pages/${encodeURIComponent(input.platform)}/${encodeURIComponent(input.externalId)}/videos/unlock`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({
        items: input.items,
        requested_tier: input.requestedTier,
      }),
    },
  );
  return response.data;
}
