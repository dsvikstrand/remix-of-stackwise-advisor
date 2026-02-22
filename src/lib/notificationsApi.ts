import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';
import { ApiRequestError } from '@/lib/subscriptionsApi';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type NotificationType =
  | 'comment_reply'
  | 'generation_succeeded'
  | 'generation_failed'
  | (string & {});

export type NotificationItem = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link_path: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  dedupe_key: string | null;
};

export type NotificationListPage = {
  items: NotificationItem[];
  unread_count: number;
  next_cursor: string | null;
};

export type NotificationReadResult = {
  id: string;
  is_read: boolean;
  read_at: string | null;
};

export type NotificationReadAllResult = {
  updated_count: number;
  read_at: string;
};

function getApiBase() {
  if (!config.agenticBackendUrl) return null;
  return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function getRequiredAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiRequestError(401, 'Sign in required.', 'AUTH_REQUIRED');
  return { Authorization: `Bearer ${token}` };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const base = getApiBase();
  if (!base) {
    throw new ApiRequestError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  }
  const authHeader = await getRequiredAuthHeader();
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

export async function listNotifications(input?: { limit?: number; cursor?: string | null }) {
  const params = new URLSearchParams();
  const limit = Math.max(1, Math.min(50, Number(input?.limit || 20)));
  params.set('limit', String(Number.isFinite(limit) ? limit : 20));
  if (input?.cursor) params.set('cursor', String(input.cursor));
  const response = await apiRequest<NotificationListPage>(`/notifications?${params.toString()}`, {
    method: 'GET',
  });
  return response.data;
}

export async function markNotificationRead(notificationId: string) {
  const response = await apiRequest<NotificationReadResult>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return response.data;
}

export async function markAllNotificationsRead() {
  const response = await apiRequest<NotificationReadAllResult>('/notifications/read-all', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return response.data;
}
