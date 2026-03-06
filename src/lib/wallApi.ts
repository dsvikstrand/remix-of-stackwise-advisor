import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';
import type { Json } from '@/integrations/supabase/types';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export class WallApiError extends Error {
  status: number;
  errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

export type WallFeedItem = {
  id: string;
  creator_user_id: string;
  title: string;
  sections_json: Json | null;
  steps: Json | null;
  llm_review: string | null;
  mix_notes: string | null;
  banner_url: string | null;
  likes_count: number;
  created_at: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  };
  tags: { id: string; slug: string }[];
  user_liked: boolean;
  published_channel_slug: string | null;
  source_channel_title: string | null;
  source_channel_avatar_url: string | null;
  source_thumbnail_url: string | null;
  source_view_count: number | null;
  comments_count: number;
};

export type WallForYouItem =
  | {
      kind: 'locked';
      feedItemId: string;
      sourceItemId: string;
      createdAt: string;
      title: string;
      sourceChannelTitle: string | null;
      sourceChannelAvatarUrl: string | null;
      sourceUrl: string;
      unlockCost: number;
      sourcePageId: string | null;
      sourceChannelId: string | null;
      unlockInProgress: boolean;
    }
  | {
      kind: 'blueprint';
      feedItemId: string;
      sourceItemId: string;
      createdAt: string;
      blueprintId: string;
      title: string;
      sourceChannelTitle: string | null;
      sourceChannelAvatarUrl: string | null;
      sourceThumbnailUrl: string | null;
      sourceViewCount: number | null;
      sectionsJson: Json | null;
      llmReview: string | null;
      mixNotes: string | null;
      steps: unknown;
      bannerUrl: string | null;
      tags: string[];
      publishedChannelSlug: string | null;
      likesCount: number;
      userLiked: boolean;
      commentsCount: number;
    };

function getApiBase() {
  if (!config.agenticBackendUrl) return null;
  return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function getOptionalAuthHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function getRequiredAuthHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new WallApiError(401, 'Sign in required.', 'AUTH_REQUIRED');
  return { Authorization: `Bearer ${token}` };
}

async function parseEnvelope<T>(response: Response) {
  return (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
}

async function requestWallApi<T>(path: string, options?: { auth?: 'optional' | 'required' }) {
  const base = getApiBase();
  if (!base) throw new WallApiError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  const authHeader =
    options?.auth === 'required'
      ? await getRequiredAuthHeader()
      : await getOptionalAuthHeader();
  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = await parseEnvelope<T>(response);
  if (!response.ok || !json) {
    throw new WallApiError(response.status, json?.message || `Request failed (${response.status})`, json?.error_code || null);
  }
  if (!json.ok) {
    throw new WallApiError(response.status, json.message || 'Request failed.', json.error_code || null);
  }
  return json.data;
}

export async function getWallFeed(input: { scope: string; sort: 'latest' | 'trending' }) {
  const search = new URLSearchParams({
    scope: input.scope,
    sort: input.sort,
  });
  const data = await requestWallApi<{ items: WallFeedItem[] }>(`/wall/feed?${search.toString()}`, { auth: 'optional' });
  return data.items;
}

export async function getWallForYouFeed() {
  const data = await requestWallApi<{ items: WallForYouItem[] }>('/wall/for-you', { auth: 'required' });
  return data.items;
}
