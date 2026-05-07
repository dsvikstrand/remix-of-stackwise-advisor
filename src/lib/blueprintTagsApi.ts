import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';

export type BlueprintTagRow = {
  blueprint_id: string;
  tag_id: string;
  tag_slug: string;
};

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

function getApiBase() {
  const agenticBackendUrl = String(config.agenticBackendUrl || '').trim();
  if (!agenticBackendUrl) return null;
  return `${agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function getOptionalAuthHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function listBlueprintTagRows(input: {
  blueprintIds?: string[];
  tagIds?: string[];
  tagSlugs?: string[];
}) {
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const tagIds = [...new Set((input.tagIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const tagSlugs = [...new Set((input.tagSlugs || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
  const base = getApiBase();

  if (!base) {
    throw new Error('Backend API is not configured.');
  }

  const search = new URLSearchParams();
  if (blueprintIds.length > 0) search.set('blueprint_ids', blueprintIds.join(','));
  if (tagIds.length > 0) search.set('tag_ids', tagIds.join(','));
  if (tagSlugs.length > 0) search.set('tag_slugs', tagSlugs.join(','));
  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/blueprint-tags?${search.toString()}`, {
    method: 'GET',
    headers: {
      ...authHeader,
    },
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<{ items: BlueprintTagRow[] }> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint tag request failed (${response.status})`);
  }
  return json.data.items || [];
}

export function collectBlueprintTagMap(rows: BlueprintTagRow[]) {
  const tagsByBlueprint = new Map<string, Array<{ id: string; slug: string }>>();
  for (const row of rows) {
    const blueprintId = String(row.blueprint_id || '').trim();
    const tagId = String(row.tag_id || '').trim();
    const tagSlug = String(row.tag_slug || '').trim();
    if (!blueprintId || !tagId || !tagSlug) continue;
    const existing = tagsByBlueprint.get(blueprintId) || [];
    if (!existing.some((entry) => entry.id === tagId)) {
      existing.push({ id: tagId, slug: tagSlug });
    }
    tagsByBlueprint.set(blueprintId, existing);
  }
  return tagsByBlueprint;
}

export function collectBlueprintTagSlugMap(rows: BlueprintTagRow[]) {
  const tagsByBlueprint = new Map<string, string[]>();
  for (const row of rows) {
    const blueprintId = String(row.blueprint_id || '').trim();
    const tagSlug = String(row.tag_slug || '').trim();
    if (!blueprintId || !tagSlug) continue;
    const existing = tagsByBlueprint.get(blueprintId) || [];
    if (!existing.includes(tagSlug)) {
      existing.push(tagSlug);
    }
    tagsByBlueprint.set(blueprintId, existing);
  }
  return tagsByBlueprint;
}
