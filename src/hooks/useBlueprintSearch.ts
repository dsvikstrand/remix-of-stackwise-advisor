import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTag } from '@/lib/tagging';
import type { Json } from '@/integrations/supabase/types';

export interface BlueprintRow {
  id: string;
  inventory_id: string | null;
  creator_user_id: string;
  title: string;
  selected_items: Json;
  mix_notes: string | null;
  llm_review: string | null;
  is_public: boolean;
  likes_count: number;
  created_at: string;
  updated_at: string;
}

export interface BlueprintTag {
  id: string;
  slug: string;
}

export interface BlueprintListItem extends BlueprintRow {
  tags: BlueprintTag[];
  user_liked: boolean;
  inventory_title: string | null;
}

export type BlueprintSort = 'popular' | 'latest';

const BLUEPRINT_FIELDS = 'id, inventory_id, creator_user_id, title, selected_items, mix_notes, llm_review, is_public, likes_count, created_at, updated_at';

function applyVisibilityFilter(query: any, userId?: string | null) {
  if (userId) {
    return query.or(`is_public.eq.true,creator_user_id.eq.${userId}`);
  }
  return query.eq('is_public', true);
}

async function hydrateBlueprints(rows: BlueprintRow[], userId?: string | null) {
  if (rows.length === 0) return [] as BlueprintListItem[];

  const blueprintIds = rows.map((row) => row.id);
  const inventoryIds = rows.map((row) => row.inventory_id).filter(Boolean) as string[];

  const [tagsRes, likesRes, inventoriesRes] = await Promise.all([
    supabase.from('blueprint_tags').select('blueprint_id, tag_id').in('blueprint_id', blueprintIds),
    userId
      ? supabase.from('blueprint_likes').select('blueprint_id').eq('user_id', userId).in('blueprint_id', blueprintIds)
      : Promise.resolve({ data: [] as { blueprint_id: string }[] }),
    inventoryIds.length > 0
      ? supabase.from('inventories').select('id, title').in('id', inventoryIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const tagRows = tagsRes.data || [];
  const tagIds = [...new Set(tagRows.map((row) => row.tag_id))];
  const { data: tagsData } = tagIds.length > 0
    ? await supabase.from('tags').select('id, slug').in('id', tagIds)
    : { data: [] as BlueprintTag[] };

  const tagsMap = new Map((tagsData || []).map((tag) => [tag.id, tag]));
  const blueprintTags = new Map<string, BlueprintTag[]>();

  tagRows.forEach((row) => {
    const tag = tagsMap.get(row.tag_id);
    if (!tag) return;
    const list = blueprintTags.get(row.blueprint_id) || [];
    list.push(tag);
    blueprintTags.set(row.blueprint_id, list);
  });

  const likedIds = new Set((likesRes.data || []).map((row) => row.blueprint_id));
  const inventoryMap = new Map((inventoriesRes.data || []).map((inv) => [inv.id, inv.title]));

  return rows.map((row) => ({
    ...row,
    tags: blueprintTags.get(row.id) || [],
    user_liked: likedIds.has(row.id),
    inventory_title: row.inventory_id ? inventoryMap.get(row.inventory_id) || null : null,
  }));
}

export function useBlueprintSearch(search: string, sort: BlueprintSort) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['blueprint-search', search, sort, user?.id],
    queryFn: async () => {
      const trimmed = search.trim();
      let blueprints: BlueprintRow[] = [];

      const orderBy = sort === 'latest'
        ? { column: 'created_at', ascending: false }
        : { column: 'likes_count', ascending: false };

      if (!trimmed) {
        let query = supabase
          .from('blueprints')
          .select(BLUEPRINT_FIELDS)
          .order(orderBy.column, { ascending: orderBy.ascending })
          .limit(60);

        query = applyVisibilityFilter(query, user?.id);

        const { data, error } = await query;
        if (error) throw error;
        blueprints = data || [];
        return hydrateBlueprints(blueprints, user?.id);
      }

      const tagSlug = normalizeTag(trimmed);
      const matched: BlueprintRow[] = [];

      if (tagSlug) {
        const { data: tagData } = await supabase.from('tags').select('id').eq('slug', tagSlug).maybeSingle();
        if (tagData?.id) {
          const { data: blueprintTagRows } = await supabase
            .from('blueprint_tags')
            .select('blueprint_id')
            .eq('tag_id', tagData.id);

          const blueprintIds = (blueprintTagRows || []).map((row) => row.blueprint_id);
          if (blueprintIds.length > 0) {
            let tagQuery = supabase
              .from('blueprints')
              .select(BLUEPRINT_FIELDS)
              .in('id', blueprintIds)
              .order(orderBy.column, { ascending: orderBy.ascending });

            tagQuery = applyVisibilityFilter(tagQuery, user?.id);

            const { data } = await tagQuery;
            matched.push(...(data || []));
          }
        }
      }

      let titleQuery = supabase
        .from('blueprints')
        .select(BLUEPRINT_FIELDS)
        .ilike('title', `%${trimmed}%`)
        .order(orderBy.column, { ascending: orderBy.ascending });

      titleQuery = applyVisibilityFilter(titleQuery, user?.id);

      const { data: titleMatches } = await titleQuery;
      if (titleMatches) matched.push(...titleMatches);

      const deduped = Array.from(new Map(matched.map((row) => [row.id, row])).values());
      blueprints = deduped;

      return hydrateBlueprints(blueprints, user?.id);
    },
  });
}
