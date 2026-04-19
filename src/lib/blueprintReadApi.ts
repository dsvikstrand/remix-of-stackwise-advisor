import type { Json } from '@/integrations/supabase/types';
import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type BlueprintReadApiItem = {
  id: string;
  inventory_id: string | null;
  creator_user_id: string;
  title: string;
  sections_json: Json | null;
  mix_notes: string | null;
  review_prompt: string | null;
  banner_url: string | null;
  llm_review: string | null;
  preview_summary: string | null;
  is_public: boolean;
  likes_count: number;
  source_blueprint_id: string | null;
  created_at: string;
  updated_at: string;
  creator_profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
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

export async function getBlueprintDetailById(blueprintId: string) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) return null;

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/blueprints/${encodeURIComponent(normalizedBlueprintId)}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<BlueprintReadApiItem> | null;
  if (response.status === 404 && json?.error_code === 'BLUEPRINT_NOT_FOUND') {
    return null;
  }
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint detail request failed (${response.status})`);
  }
  return json.data;
}

export async function syncBlueprintReadState(blueprintId: string) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) throw new Error('Blueprint id is required.');

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/blueprints/${encodeURIComponent(normalizedBlueprintId)}/sync-state`, {
    method: 'POST',
    headers: {
      ...authHeader,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<BlueprintReadApiItem> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint sync request failed (${response.status})`);
  }
  return json.data;
}
