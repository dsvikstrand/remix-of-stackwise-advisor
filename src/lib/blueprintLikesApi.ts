import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type BlueprintLikeStateApiItem = {
  blueprint_id: string;
  user_liked: boolean;
  likes_count: number;
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

async function parseEnvelope<T>(response: Response) {
  return (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
}

export async function getBlueprintLikeState(blueprintId: string) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) return null;

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/blueprints/${encodeURIComponent(normalizedBlueprintId)}/like-state`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = await parseEnvelope<BlueprintLikeStateApiItem>(response);
  if (response.status === 404 && json?.error_code === 'BLUEPRINT_NOT_FOUND') {
    return null;
  }
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint like-state request failed (${response.status})`);
  }
  return json.data;
}

export async function setBlueprintLiked(blueprintId: string, liked: boolean) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) throw new Error('Blueprint id is required.');

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/blueprints/${encodeURIComponent(normalizedBlueprintId)}/like`, {
    method: liked ? 'POST' : 'DELETE',
    headers: {
      ...authHeader,
    },
  });
  const json = await parseEnvelope<BlueprintLikeStateApiItem>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint like mutation failed (${response.status})`);
  }
  return json.data;
}

export async function getBlueprintLikeStates(blueprintIds: string[]) {
  const normalizedBlueprintIds = [...new Set(
    (blueprintIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (normalizedBlueprintIds.length === 0) {
    return new Map<string, boolean>();
  }

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/blueprint-likes/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      blueprint_ids: normalizedBlueprintIds,
    }),
  });
  const json = await parseEnvelope<{ items: Array<{ blueprint_id: string; user_liked: boolean }> }>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint like batch request failed (${response.status})`);
  }

  return new Map(
    (json.data.items || []).map((item) => [
      String(item.blueprint_id || '').trim(),
      Boolean(item.user_liked),
    ]),
  );
}

export async function getMyLikedBlueprintIds(limit = 500) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const normalizedLimit = Math.max(1, Math.min(5000, Math.floor(Number(limit || 500))));
  const response = await fetch(`${base}/me/blueprint-likes?limit=${normalizedLimit}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = await parseEnvelope<{ blueprint_ids: string[] }>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Liked blueprints request failed (${response.status})`);
  }

  return Array.isArray(json.data.blueprint_ids) ? json.data.blueprint_ids : [];
}
