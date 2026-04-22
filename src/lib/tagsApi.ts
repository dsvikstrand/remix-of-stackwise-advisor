import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type TagApiItem = {
  id: string;
  slug: string;
  follower_count: number;
  created_at: string;
  is_following?: boolean;
};

export type FollowedTagApiItem = {
  id: string;
  slug: string;
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

async function parseEnvelope<T>(response: Response) {
  return (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
}

export async function listTags(limit = 200) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getOptionalAuthHeader();
  const normalizedLimit = Math.max(1, Math.min(5000, Math.floor(Number(limit || 200))));
  const response = await fetch(`${base}/tags?limit=${normalizedLimit}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = await parseEnvelope<{ items: TagApiItem[] }>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Tag directory request failed (${response.status})`);
  }
  return json.data.items || [];
}

export async function getTagsBySlugs(slugs: string[]) {
  const normalizedSlugs = [...new Set(
    (slugs || [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  )];
  if (normalizedSlugs.length === 0) return [] as TagApiItem[];

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/tags/by-slug?slugs=${encodeURIComponent(normalizedSlugs.join(','))}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = await parseEnvelope<{ items: TagApiItem[] }>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Tag by slug request failed (${response.status})`);
  }
  return json.data.items || [];
}

export async function getFollowedTags(limit = 500) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const normalizedLimit = Math.max(1, Math.min(5000, Math.floor(Number(limit || 500))));
  const response = await fetch(`${base}/tags/follows?limit=${normalizedLimit}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = await parseEnvelope<{ items: FollowedTagApiItem[] }>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Followed tags request failed (${response.status})`);
  }
  return json.data.items || [];
}

export async function createTag(input: {
  slug: string;
  follow?: boolean;
}) {
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!slug) throw new Error('Valid tag slug is required.');

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/tags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      slug,
      follow: input.follow !== false,
    }),
  });
  const json = await parseEnvelope<TagApiItem>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Tag create request failed (${response.status})`);
  }
  return json.data;
}

export async function setTagFollowed(tagId: string, followed: boolean) {
  const normalizedTagId = String(tagId || '').trim();
  if (!normalizedTagId) throw new Error('Tag id is required.');

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/tags/${encodeURIComponent(normalizedTagId)}/follow`, {
    method: followed ? 'POST' : 'DELETE',
    headers: {
      ...authHeader,
    },
  });
  const json = await parseEnvelope<TagApiItem>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Tag follow mutation failed (${response.status})`);
  }
  return json.data;
}

export async function clearTagFollows(tagIds: string[]) {
  const normalizedTagIds = [...new Set(
    (tagIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (normalizedTagIds.length === 0) return { removedCount: 0 };

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/tags/follows`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      tag_ids: normalizedTagIds,
    }),
  });
  const json = await parseEnvelope<{ removedCount: number }>(response);
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Tag follow clear request failed (${response.status})`);
  }
  return json.data;
}
