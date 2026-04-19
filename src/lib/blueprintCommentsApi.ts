import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type BlueprintCommentItem = {
  id: string;
  blueprint_id: string;
  user_id: string;
  content: string;
  likes_count: number;
  created_at: string;
  updated_at: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type UserBlueprintCommentItem = {
  id: string;
  blueprint_id: string;
  blueprint_title: string;
  content: string;
  created_at: string;
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

export async function getBlueprintComments(input: {
  blueprintId: string;
  sortMode?: 'top' | 'new';
  limit?: number;
}) {
  const blueprintId = String(input.blueprintId || '').trim();
  if (!blueprintId) return [] as BlueprintCommentItem[];

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const search = new URLSearchParams();
  if (input.sortMode) search.set('sort', input.sortMode);
  if (input.limit) search.set('limit', String(input.limit));
  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/blueprints/${encodeURIComponent(blueprintId)}/comments?${search.toString()}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<{
    blueprint_id: string;
    items: BlueprintCommentItem[];
  }> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint comments request failed (${response.status})`);
  }
  return json.data.items || [];
}

export async function createBlueprintComment(input: {
  blueprintId: string;
  content: string;
}) {
  const blueprintId = String(input.blueprintId || '').trim();
  if (!blueprintId) throw new Error('Blueprint id is required.');

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/blueprints/${encodeURIComponent(blueprintId)}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      content: String(input.content || '').trim(),
    }),
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<BlueprintCommentItem> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Create blueprint comment failed (${response.status})`);
  }
  return json.data;
}

export async function getProfileComments(input: {
  userId: string;
  limit?: number;
}) {
  const userId = String(input.userId || '').trim();
  if (!userId) return [] as UserBlueprintCommentItem[];

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const search = new URLSearchParams();
  if (input.limit) search.set('limit', String(input.limit));
  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/profile/${encodeURIComponent(userId)}/comments?${search.toString()}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<{
    profile_user_id: string;
    items: UserBlueprintCommentItem[];
  }> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Profile comments request failed (${response.status})`);
  }
  return json.data.items || [];
}
