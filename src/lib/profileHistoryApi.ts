import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export class ProfileHistoryApiError extends Error {
  status: number;
  errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

export type ProfileHistoryBlueprintItem = {
  id: string;
  kind: 'blueprint';
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
  avatarUrl: string | null;
  badge: 'Blueprint';
  statusText: string | null;
  bannerUrl: string | null;
};

export type ProfileHistoryCreatorItem = {
  id: string;
  kind: 'creator';
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
  avatarUrl: string | null;
  badge: 'Creator';
  statusText: null;
  bannerUrl: null;
};

export type ProfileHistoryItem = ProfileHistoryBlueprintItem | ProfileHistoryCreatorItem;

export type ProfileHistoryResponse = {
  profile_user_id: string;
  is_owner_view: boolean;
  items: ProfileHistoryItem[];
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

export async function getProfileHistory(userId: string) {
  const base = getApiBase();
  if (!base) {
    throw new ProfileHistoryApiError(503, 'Backend API is not configured.', 'API_NOT_CONFIGURED');
  }

  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/profile/${encodeURIComponent(userId)}/history`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<ProfileHistoryResponse> | null;
  if (!response.ok || !json) {
    throw new ProfileHistoryApiError(
      response.status,
      json?.message || `Request failed (${response.status})`,
      json?.error_code || null,
    );
  }
  if (!json.ok) {
    throw new ProfileHistoryApiError(response.status, json.message || 'Request failed.', json.error_code || null);
  }

  return json.data;
}
