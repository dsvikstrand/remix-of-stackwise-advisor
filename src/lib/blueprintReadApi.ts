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
  selected_items?: Json | null;
  steps?: Json | null;
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

export type BlueprintWriteApiInput = {
  inventoryId: string | null;
  title: string;
  selectedItems: Json | null;
  steps: Json | null;
  sectionsJson?: Json | null;
  mixNotes: string | null;
  reviewPrompt: string | null;
  bannerUrl: string | null;
  llmReview: string | null;
  previewSummary: string | null;
  generationControls?: Json | null;
  tags: string[];
  isPublic: boolean;
  sourceBlueprintId?: string | null;
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

function toBlueprintWritePayload(input: BlueprintWriteApiInput) {
  return {
    inventory_id: input.inventoryId,
    title: input.title,
    selected_items: input.selectedItems,
    steps: input.steps,
    sections_json: input.sectionsJson ?? null,
    mix_notes: input.mixNotes,
    review_prompt: input.reviewPrompt,
    banner_url: input.bannerUrl,
    llm_review: input.llmReview,
    preview_summary: input.previewSummary,
    generation_controls: input.generationControls ?? null,
    tags: input.tags,
    is_public: input.isPublic,
    source_blueprint_id: input.sourceBlueprintId || null,
  };
}

export async function createBlueprintViaApi(input: BlueprintWriteApiInput) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/blueprints`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(toBlueprintWritePayload(input)),
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<BlueprintReadApiItem> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint create request failed (${response.status})`);
  }
  return json.data;
}

export async function updateBlueprintViaApi(blueprintId: string, input: BlueprintWriteApiInput) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) throw new Error('Blueprint id is required.');

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/blueprints/${encodeURIComponent(normalizedBlueprintId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(toBlueprintWritePayload(input)),
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<BlueprintReadApiItem> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint update request failed (${response.status})`);
  }
  return json.data;
}

export async function patchBlueprintFieldsViaApi(blueprintId: string, input: {
  llmReview?: string | null;
  bannerUrl?: string | null;
  previewSummary?: string | null;
}) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) throw new Error('Blueprint id is required.');

  const payload: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(input, 'llmReview')) payload.llm_review = input.llmReview ?? null;
  if (Object.prototype.hasOwnProperty.call(input, 'bannerUrl')) payload.banner_url = input.bannerUrl ?? null;
  if (Object.prototype.hasOwnProperty.call(input, 'previewSummary')) payload.preview_summary = input.previewSummary ?? null;

  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/blueprints/${encodeURIComponent(normalizedBlueprintId)}/fields`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<BlueprintReadApiItem> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint field patch request failed (${response.status})`);
  }
  return json.data;
}
