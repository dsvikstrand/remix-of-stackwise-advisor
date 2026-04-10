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
  const viteEnv = (import.meta as any)?.env || {};
  const agenticBackendUrl = String(viteEnv.VITE_AGENTIC_BACKEND_URL || '').trim();
  if (!agenticBackendUrl) return null;
  return `${agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function fetchBlueprintTagRowsFromSupabase(input: {
  blueprintIds?: string[];
  tagIds?: string[];
  tagSlugs?: string[];
}) {
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  let tagIds = [...new Set((input.tagIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const tagSlugs = [...new Set((input.tagSlugs || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];

  if (blueprintIds.length === 0 && tagIds.length === 0 && tagSlugs.length === 0) {
    return [] as BlueprintTagRow[];
  }

  if (tagSlugs.length > 0) {
    const { data: tags, error: tagError } = await supabase
      .from('tags')
      .select('id')
      .in('slug', tagSlugs);
    if (tagError) throw tagError;
    tagIds = Array.from(new Set([
      ...tagIds,
      ...(tags || []).map((row) => String(row.id || '').trim()).filter(Boolean),
    ]));
  }

  let query = supabase
    .from('blueprint_tags')
    .select('blueprint_id, tag_id, tags(slug)');
  if (blueprintIds.length > 0) {
    query = query.in('blueprint_id', blueprintIds);
  }
  if (tagIds.length > 0) {
    query = query.in('tag_id', tagIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: BlueprintTagRow[] = [];
  for (const row of data || []) {
    const blueprintId = String((row as any).blueprint_id || '').trim();
    const tagId = String((row as any).tag_id || '').trim();
    const joined = (row as any).tags;
    const tagCandidates = Array.isArray(joined) ? joined : joined ? [joined] : [];
    for (const candidate of tagCandidates) {
      const tagSlug = String(candidate?.slug || '').trim().toLowerCase();
      if (!blueprintId || !tagId || !tagSlug) continue;
      rows.push({
        blueprint_id: blueprintId,
        tag_id: tagId,
        tag_slug: tagSlug,
      });
    }
  }
  return rows;
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
    return fetchBlueprintTagRowsFromSupabase({ blueprintIds, tagIds, tagSlugs });
  }

  const search = new URLSearchParams();
  if (blueprintIds.length > 0) search.set('blueprint_ids', blueprintIds.join(','));
  if (tagIds.length > 0) search.set('tag_ids', tagIds.join(','));
  if (tagSlugs.length > 0) search.set('tag_slugs', tagSlugs.join(','));
  const response = await fetch(`${base}/blueprint-tags?${search.toString()}`, {
    method: 'GET',
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
