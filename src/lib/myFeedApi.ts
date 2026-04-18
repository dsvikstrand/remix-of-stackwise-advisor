import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';
import type { MyFeedItemView } from '@/lib/myFeedData';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
};

const MY_FEED_CACHE_KEY_PREFIX = 'bleup:my-feed-cache:v1:';
const MY_FEED_CACHE_MAX_AGE_MS = 30 * 60_000;
const myFeedMemoryCache = new Map<string, { savedAtMs: number; items: MyFeedItemView[] }>();

export type MyFeedListResult = {
  items: MyFeedItemView[];
  staleFallback: boolean;
  staleReason: string | null;
  source: 'api' | 'cache';
};

export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getApiBase() {
  if (config.agenticBackendUrl) {
    return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
  }
  return null;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  return { Authorization: `Bearer ${token}` };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getAuthHeader();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(init?.headers || {}),
    },
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !json) {
    const message = json?.message || `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, message);
  }
  if (!json.ok) {
    throw new ApiRequestError(response.status, json.message || 'Request failed.');
  }

  return json;
}

export function shouldFallbackToSupabase(error: unknown) {
  if (!(error instanceof ApiRequestError)) return true;
  return error.status === 404 || error.status >= 500;
}

function getMyFeedCacheKey(userId: string) {
  return `${MY_FEED_CACHE_KEY_PREFIX}${userId}`;
}

function readCachedMyFeedItems(userId: string) {
  const nowMs = Date.now();
  const cached = myFeedMemoryCache.get(userId);
  if (cached && nowMs - cached.savedAtMs <= MY_FEED_CACHE_MAX_AGE_MS) {
    return cached.items;
  }

  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getMyFeedCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAtMs?: unknown; items?: unknown };
    const savedAtMs = Number(parsed.savedAtMs || 0);
    const items = Array.isArray(parsed.items) ? (parsed.items as MyFeedItemView[]) : null;
    if (!savedAtMs || !items || nowMs - savedAtMs > MY_FEED_CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(getMyFeedCacheKey(userId));
      return null;
    }
    myFeedMemoryCache.set(userId, { savedAtMs, items });
    return items;
  } catch {
    return null;
  }
}

function writeCachedMyFeedItems(userId: string, items: MyFeedItemView[]) {
  const payload = {
    savedAtMs: Date.now(),
    items,
  };
  myFeedMemoryCache.set(userId, payload);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getMyFeedCacheKey(userId), JSON.stringify(payload));
  } catch {
    // Ignore storage errors and keep the in-memory cache only.
  }
}

export async function listMyFeedItems(userId: string): Promise<MyFeedListResult> {
  const apiBase = getApiBase();
  if (!apiBase) {
    const cachedItems = readCachedMyFeedItems(userId);
    if (cachedItems) {
      return {
        items: cachedItems,
        staleFallback: true,
        staleReason: 'Showing the last saved feed snapshot because the backend API is not configured.',
        source: 'cache',
      };
    }
    throw new Error('Backend API is not configured.');
  }
  try {
    const response = await apiRequest<{ items: MyFeedItemView[] }>('/my-feed', {
      method: 'GET',
    });
    const items = response.data.items || [];
    writeCachedMyFeedItems(userId, items);
    return {
      items,
      staleFallback: false,
      staleReason: null,
      source: 'api',
    };
  } catch (error) {
    if (!shouldFallbackToSupabase(error)) throw error;
    const cachedItems = readCachedMyFeedItems(userId);
    if (cachedItems) {
      return {
        items: cachedItems,
        staleFallback: true,
        staleReason: 'Showing the last saved feed snapshot because the backend is temporarily unavailable.',
        source: 'cache',
      };
    }
    throw error;
  }
}

export async function saveGeneratedBlueprintToMyFeed(input: {
  videoUrl: string;
  title: string;
  blueprintId: string;
  sourceChannelId?: string | null;
  sourceChannelTitle?: string | null;
  sourceChannelUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  state?: string;
}) {
  const response = await apiRequest<{
    source_item: {
      id: string;
      canonical_key: string;
      thumbnail_url: string | null;
    };
    feed_item: {
      id: string;
      blueprint_id: string | null;
      state: string;
    } | null;
    existing: boolean;
  }>('/my-feed/youtube-save', {
    method: 'POST',
    body: JSON.stringify({
      video_url: input.videoUrl,
      title: input.title,
      blueprint_id: input.blueprintId,
      source_channel_id: input.sourceChannelId || null,
      source_channel_title: input.sourceChannelTitle || null,
      source_channel_url: input.sourceChannelUrl || null,
      metadata: input.metadata || {},
      state: input.state || 'my_feed_published',
    }),
  });

  return response.data;
}

export async function submitCandidateAndEvaluate(input: {
  userId: string;
  userFeedItemId: string;
  blueprintId: string;
  channelSlug: string;
  title: string;
  llmReview?: string | null;
  stepCount: number;
  tagSlugs: string[];
}) {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('Backend API is not configured.');
  }

  const upsertResult = await apiRequest<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
  }>('/channel-candidates', {
    method: 'POST',
    body: JSON.stringify({
      user_feed_item_id: input.userFeedItemId,
      channel_slug: input.channelSlug,
    }),
  });

  const candidateId = upsertResult.data.id;

  const evalResult = await apiRequest<{
    candidate_id: string;
    decision: 'pass' | 'warn' | 'block';
    next_state: 'candidate_submitted' | 'candidate_pending_manual_review' | 'channel_rejected';
    reason_code: string;
  }>(`/channel-candidates/${candidateId}/evaluate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  const nextState = evalResult.data.next_state;
  return {
    candidateId,
    status: nextState === 'candidate_pending_manual_review'
      ? ('pending_manual_review' as const)
      : nextState === 'channel_rejected'
        ? ('rejected' as const)
        : ('passed' as const),
    reasonCode: evalResult.data.reason_code,
  };
}

export async function publishCandidate(input: {
  userId: string;
  candidateId: string;
  userFeedItemId: string;
  blueprintId: string;
  channelSlug: string;
}) {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('Backend API is not configured.');
  }
  await apiRequest<{ candidate_id: string; published: boolean; channel_slug: string }>(
    `/channel-candidates/${input.candidateId}/publish`,
    {
      method: 'POST',
      body: JSON.stringify({ tag_slug: input.channelSlug }),
    },
  );
}

export async function rejectCandidate(input: {
  userId: string;
  candidateId: string;
  userFeedItemId: string;
  blueprintId: string;
  reasonCode: string;
}) {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('Backend API is not configured.');
  }
  await apiRequest<{ candidate_id: string; reason_code: string }>(
    `/channel-candidates/${input.candidateId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason_code: input.reasonCode }),
    },
  );
}

export async function autoPublishMyFeedItem(input: {
  userFeedItemId: string;
  sourceTag?: string;
}) {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('Backend API is not configured.');
  }

  const response = await apiRequest<{
    user_feed_item_id: string;
    candidate_id: string;
    channel_slug: string;
    decision: 'published' | 'held';
    reason_code: string;
    classifier_mode?: 'deterministic_v1' | 'general_placeholder' | 'llm_labeler_v1';
    classifier_reason?: 'tag_match' | 'alias_match' | 'fallback_general' | 'llm_valid' | 'llm_retry_valid';
    classifier_confidence?: number | null;
  }>(`/my-feed/items/${input.userFeedItemId}/auto-publish`, {
    method: 'POST',
    body: JSON.stringify({
      source_tag: input.sourceTag || 'manual_save',
    }),
  });

  return {
    userFeedItemId: response.data.user_feed_item_id,
    candidateId: response.data.candidate_id,
    channelSlug: response.data.channel_slug,
    decision: response.data.decision,
    reasonCode: response.data.reason_code,
    classifierMode: response.data.classifier_mode || null,
    classifierReason: response.data.classifier_reason || null,
    classifierConfidence: typeof response.data.classifier_confidence === 'number'
      ? response.data.classifier_confidence
      : null,
  };
}
