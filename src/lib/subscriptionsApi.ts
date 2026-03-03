import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';

export type SubscriptionMode = 'auto' | 'manual';
export type GenerationTier = 'free' | 'tier';

export type SourceSubscription = {
  id: string;
  source_type: string;
  source_channel_id: string;
  source_channel_url: string | null;
  source_channel_title: string | null;
  source_channel_avatar_url?: string | null;
  source_page_id?: string | null;
  source_page_path?: string | null;
  mode: SubscriptionMode;
  auto_unlock_enabled: boolean;
  is_active: boolean;
  last_polled_at: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionRefreshCandidate = {
  subscription_id: string;
  source_channel_id: string;
  source_channel_title: string | null;
  source_channel_url: string | null;
  video_id: string;
  video_url: string;
  title: string;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_seconds?: number | null;
};

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

class ApiRequestError extends Error {
  status: number;
  errorCode: string | null;
  data: unknown;

  constructor(status: number, message: string, errorCode: string | null = null, data: unknown = null) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
    this.data = data;
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

async function getRefreshedAuthHeader(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new ApiRequestError(401, 'Session expired or invalid. Please sign in again.', 'AUTH_REQUIRED');
  }
  return { Authorization: `Bearer ${token}` };
}

async function parseApiResponse<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  return (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
}

function getApiErrorMessage<T>(response: Response, json: ApiEnvelope<T> | null) {
  if (response.status === 401) return 'Session expired or invalid. Please sign in again.';
  const fallback = `Request failed (${response.status})`;
  if (!json) return fallback;
  const maybeError = (json as unknown as { error?: string }).error;
  return json.message || maybeError || fallback;
}

function getApiErrorCode<T>(json: ApiEnvelope<T> | null): string | null {
  if (!json) return null;
  return json.error_code || (json as unknown as { error?: string }).error || null;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  return apiRequestInternal(path, init, false);
}

async function apiRequestInternal<T>(path: string, init: RequestInit | undefined, refreshed: boolean): Promise<ApiEnvelope<T>> {
  const base = getApiBase();
  if (!base) {
    throw new ApiRequestError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  }

  const authHeader = refreshed ? await getRefreshedAuthHeader() : await getAuthHeader();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(init?.headers || {}),
    },
  });

  if (response.status === 401 && !refreshed) {
    return apiRequestInternal(path, init, true);
  }

  const json = await parseApiResponse<T>(response);
  if (!response.ok || !json) {
    throw new ApiRequestError(
      response.status,
      getApiErrorMessage(response, json),
      getApiErrorCode(json),
      json?.data ?? null,
    );
  }
  if (!json.ok) {
    throw new ApiRequestError(
      response.status,
      getApiErrorMessage(response, json),
      getApiErrorCode(json),
      json.data ?? null,
    );
  }
  return json;
}

export async function listSourceSubscriptions() {
  const response = await apiRequest<SourceSubscription[]>('/source-subscriptions', { method: 'GET' });
  return response.data;
}

export async function createSourceSubscription(input: { channelInput: string; mode?: SubscriptionMode }) {
  const response = await apiRequest<{
    subscription: SourceSubscription;
    sync: {
      processed: number;
      inserted: number;
      skipped: number;
      newestVideoId: string | null;
      newestPublishedAt: string | null;
      channelTitle: string | null;
    } | null;
  }>('/source-subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      channel_input: input.channelInput,
      mode: input.mode || 'auto',
    }),
  });

  return response.data;
}

export async function updateSourceSubscription(input: {
  id: string;
  mode?: SubscriptionMode;
  isActive?: boolean;
  autoUnlockEnabled?: boolean;
}) {
  const response = await apiRequest<SourceSubscription>(`/source-subscriptions/${input.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      mode: input.mode,
      is_active: input.isActive,
      auto_unlock_enabled: input.autoUnlockEnabled,
    }),
  });
  return response.data;
}

export async function deactivateSourceSubscription(id: string) {
  const response = await apiRequest<{ id: string }>(`/source-subscriptions/${id}`, { method: 'DELETE' });
  return response.data;
}

export async function deactivateSourceSubscriptionByChannelId(channelId: string) {
  const normalized = String(channelId || '').trim();
  if (!normalized) {
    throw new ApiRequestError(400, 'Channel id is required.', 'INVALID_CHANNEL_ID');
  }

  const subscriptions = await listSourceSubscriptions();
  const match = subscriptions.find((row) => row.source_channel_id === normalized && row.is_active);
  if (!match) {
    throw new ApiRequestError(404, 'Subscription not found for this channel.', 'NOT_FOUND');
  }

  return deactivateSourceSubscription(match.id);
}

export async function syncSourceSubscription(id: string) {
  const response = await apiRequest<{
    job_id: string;
    processed: number;
    inserted: number;
    skipped: number;
    newestVideoId: string | null;
    newestPublishedAt: string | null;
    channelTitle: string | null;
  }>(`/source-subscriptions/${id}/sync`, { method: 'POST', body: JSON.stringify({}) });
  return response.data;
}

export async function scanSubscriptionRefreshCandidates(input?: {
  maxPerSubscription?: number;
  maxTotal?: number;
}) {
  const response = await apiRequest<{
    subscriptions_total: number;
    candidates_total: number;
    candidates: SubscriptionRefreshCandidate[];
    scan_errors: Array<{ subscription_id: string; error: string }>;
    cooldown_filtered?: number;
    duration_filtered_count?: number;
    duration_filtered_reasons?: { too_long: number; unknown: number };
  }>('/source-subscriptions/refresh-scan', {
    method: 'POST',
    body: JSON.stringify({
      max_per_subscription: input?.maxPerSubscription,
      max_total: input?.maxTotal,
    }),
  });
  return response.data;
}

export type IngestionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type IngestionJob = {
  job_id: string;
  trigger: string;
  scope: string;
  status: IngestionJobStatus;
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ActiveIngestionJob = {
  job_id: string;
  title?: string | null;
  scope: string;
  trigger: string;
  status: Extract<IngestionJobStatus, 'queued' | 'running'>;
  created_at: string;
  started_at: string | null;
  next_run_at: string | null;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  queue_position: number | null;
  queue_ahead_count: number | null;
  estimated_start_seconds: number | null;
  is_position_estimate: boolean;
};

export type ActiveIngestionJobsResponse = {
  items: ActiveIngestionJob[];
  summary: {
    active_count: number;
    queued_count: number;
    running_count: number;
  };
};

export async function getIngestionJob(jobId: string) {
  const response = await apiRequest<IngestionJob>(`/ingestion/jobs/${jobId}`, {
    method: 'GET',
  });
  return response.data;
}

export async function getLatestMyIngestionJob(scope = 'manual_refresh_selection') {
  const query = new URLSearchParams();
  if (scope) query.set('scope', scope);
  const response = await apiRequest<IngestionJob | null>(`/ingestion/jobs/latest-mine?${query.toString()}`, {
    method: 'GET',
  });
  return response.data;
}

export async function listActiveMyIngestionJobs(input?: {
  scopes?: string[];
  limit?: number;
}) {
  const query = new URLSearchParams();
  const scopes = Array.isArray(input?.scopes)
    ? input.scopes.map((scope) => String(scope || '').trim()).filter(Boolean)
    : [];
  if (scopes.length > 0) query.set('scope', scopes.join(','));
  if (Number.isFinite(input?.limit)) {
    query.set('limit', String(input?.limit));
  }
  const suffix = query.toString();
  const response = await apiRequest<ActiveIngestionJobsResponse>(`/ingestion/jobs/active-mine${suffix ? `?${suffix}` : ''}`, {
    method: 'GET',
  });
  return response.data;
}

export async function generateSubscriptionRefreshBlueprints(input: {
  items: SubscriptionRefreshCandidate[];
}) {
  const response = await apiRequest<{
    job_id: string;
    queued_count: number;
    requested_tier?: GenerationTier | null;
    resolved_tier?: GenerationTier;
    variant_status?: 'queued' | 'generated' | 'ready' | 'in_progress';
    duration_blocked_count?: number;
    duration_blocked?: Array<{
      video_id: string;
      title: string;
      error_code: 'VIDEO_TOO_LONG' | 'VIDEO_DURATION_UNAVAILABLE';
      reason: 'too_long' | 'unknown';
      max_duration_seconds: number;
      video_duration_seconds: number | null;
    }>;
  }>('/source-subscriptions/refresh-generate', {
    method: 'POST',
    body: JSON.stringify({
      items: input.items,
    }),
  });
  return response.data;
}

export async function getGenerationTierAccess() {
  const response = await apiRequest<{
    allowed_tiers: GenerationTier[];
    default_tier: GenerationTier;
    test_mode_enabled: boolean;
  }>('/generation/tier-access', {
    method: 'GET',
  });
  return response.data;
}

export async function listBlueprintVariants(blueprintId: string) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) {
    throw new ApiRequestError(400, 'Blueprint id is required.', 'INVALID_INPUT');
  }
  const response = await apiRequest<{
    source_item_id: string | null;
    variants: Array<{
      tier: GenerationTier;
      blueprint_id: string | null;
      status: 'available' | 'queued' | 'running' | 'ready' | 'failed';
    }>;
  }>(`/blueprints/${encodeURIComponent(normalizedBlueprintId)}/variants`, {
    method: 'GET',
  });
  return response.data;
}

export async function acceptMyFeedPendingItem(id: string) {
  const response = await apiRequest<{
    user_feed_item_id: string;
    blueprint_id: string;
    state: string;
  }>(`/my-feed/items/${id}/accept`, { method: 'POST', body: JSON.stringify({}) });
  return response.data;
}

export async function skipMyFeedPendingItem(id: string) {
  const response = await apiRequest<{
    user_feed_item_id: string;
    state: string;
  }>(`/my-feed/items/${id}/skip`, { method: 'POST', body: JSON.stringify({}) });
  return response.data;
}

export { ApiRequestError };
