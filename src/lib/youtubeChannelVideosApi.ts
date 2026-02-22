import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';

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

export type YouTubeChannelVideoItem = {
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
};

export type YouTubeChannelVideosPage = {
  items: YouTubeChannelVideoItem[];
  next_page_token: string | null;
  kind: 'full' | 'shorts' | 'all';
  shorts_max_seconds: number;
};

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

export async function listYouTubeChannelVideos(input: {
  channelId: string;
  limit?: number;
  pageToken?: string | null;
}) {
  const base = getApiBase();
  if (!base) {
    throw new ApiRequestError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  }

  const channelId = String(input.channelId || '').trim();
  if (!channelId) {
    throw new ApiRequestError(400, 'A valid channel id is required.', 'INVALID_INPUT');
  }

  const authHeader = await getAuthHeader();
  const params = new URLSearchParams();
  const safeLimit = Math.max(1, Math.min(25, Number(input.limit || 12)));
  params.set('limit', String(Number.isFinite(safeLimit) ? safeLimit : 12));
  if (input.pageToken) {
    params.set('page_token', String(input.pageToken));
  }

  const response = await fetch(`${base}/youtube/channels/${encodeURIComponent(channelId)}/videos?${params.toString()}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<YouTubeChannelVideosPage> | null;
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

