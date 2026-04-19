import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type ProfileApiItem = {
  id: string | null;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  follower_count: number;
  following_count: number;
  unlocked_blueprints_count: number;
  created_at: string;
  updated_at: string;
};

export type ProfileBlueprintListApiItem = {
  id: string;
  title: string;
  creator_user_id: string;
  likes_count: number;
  created_at: string;
  liked_at?: string | null;
  creator_profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  source_channel: {
    title: string | null;
    avatar_url: string | null;
  } | null;
};

export type ProfileActivityApiItem = {
  type: 'blueprint_created' | 'blueprint_liked' | 'comment';
  id: string;
  title: string;
  created_at: string;
  target_id?: string;
};

export type UpdateProfileApiInput = {
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  is_public?: boolean;
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
  if (!token) throw new Error('Sign in required.');
  return { Authorization: `Bearer ${token}` };
}

export async function getProfileByUserId(userId: string) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/profile/${encodeURIComponent(normalizedUserId)}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<ProfileApiItem> | null;
  if (response.status === 404 && json?.error_code === 'PROFILE_NOT_FOUND') {
    return null;
  }
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Profile request failed (${response.status})`);
  }
  return json.data;
}

export async function updateMyProfile(input: UpdateProfileApiInput) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/profile/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(input),
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<ProfileApiItem> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Profile update failed (${response.status})`);
  }
  return json.data;
}

async function getProfileCollection<T>(path: string) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<{ items: T[] }> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Profile collection request failed (${response.status})`);
  }
  return Array.isArray(json.data.items) ? json.data.items : [];
}

export async function getProfileBlueprints(userId: string, limit = 12) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [] as ProfileBlueprintListApiItem[];
  const normalizedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit || 12))));
  return getProfileCollection<ProfileBlueprintListApiItem>(
    `/profile/${encodeURIComponent(normalizedUserId)}/blueprints?limit=${normalizedLimit}`,
  );
}

export async function getProfileLikedBlueprints(userId: string, limit = 12) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [] as ProfileBlueprintListApiItem[];
  const normalizedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit || 12))));
  return getProfileCollection<ProfileBlueprintListApiItem>(
    `/profile/${encodeURIComponent(normalizedUserId)}/liked-blueprints?limit=${normalizedLimit}`,
  );
}

export async function getProfileActivity(userId: string, limit = 12) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [] as ProfileActivityApiItem[];
  const normalizedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit || 12))));
  return getProfileCollection<ProfileActivityApiItem>(
    `/profile/${encodeURIComponent(normalizedUserId)}/activity?limit=${normalizedLimit}`,
  );
}
