import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildFeedSummary } from '@/lib/feedPreview';
import { collectBlueprintTagMap, listBlueprintTagRows } from '@/lib/blueprintTagsApi';
import { normalizeTag } from '@/lib/tagging';

export interface BlueprintRow {
  id: string;
  inventory_id: string | null;
  creator_user_id: string;
  title: string;
  banner_url: string | null;
  preview_summary: string | null;
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

export const BLUEPRINT_FIELDS = 'id, inventory_id, creator_user_id, title, banner_url, preview_summary, is_public, likes_count, created_at, updated_at';
const DEFAULT_BLUEPRINT_LIST_LIMIT = 24;

function applyVisibilityFilter(query: any, userId?: string | null) {
  if (userId) {
    return query.or(`is_public.eq.true,creator_user_id.eq.${userId}`);
  }
  return query.eq('is_public', true);
}

export async function hydrateBlueprints(rows: BlueprintRow[], userId?: string | null) {
  if (rows.length === 0) return [] as BlueprintListItem[];

  const blueprintIds = rows.map((row) => row.id);
  const inventoryIds = rows.map((row) => row.inventory_id).filter(Boolean) as string[];

  const [tagsRes, likesRes, inventoriesRes] = await Promise.all([
    listBlueprintTagRows({ blueprintIds }),
    userId
      ? supabase.from('blueprint_likes').select('blueprint_id').eq('user_id', userId).in('blueprint_id', blueprintIds)
      : Promise.resolve({ data: [] as { blueprint_id: string }[] }),
    inventoryIds.length > 0
      ? supabase.from('inventories').select('id, title').in('id', inventoryIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const blueprintTags = collectBlueprintTagMap(tagsRes || []);

  const likedIds = new Set((likesRes.data || []).map((row) => row.blueprint_id));
  const inventoryMap = new Map((inventoriesRes.data || []).map((inv) => [inv.id, inv.title]));

  return rows.map((row) => {
    const inventoryTitle = row.inventory_id ? inventoryMap.get(row.inventory_id) || null : null;
    return {
      ...row,
      tags: blueprintTags.get(row.id) || [],
      user_liked: likedIds.has(row.id),
      inventory_title: inventoryTitle,
      preview_summary: buildFeedSummary({
        primary: row.preview_summary,
        secondary: inventoryTitle ? `From ${inventoryTitle}` : null,
        fallback: inventoryTitle ? `From ${inventoryTitle}` : 'Community blueprint',
        maxChars: 170,
      }),
    };
  });
}

export function useBlueprintSearch(search: string, sort: BlueprintSort) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['blueprint-search', search, sort, user?.id],
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
          .limit(DEFAULT_BLUEPRINT_LIST_LIMIT);

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
          const blueprintTagRows = await listBlueprintTagRows({ tagIds: [tagData.id] });
          const blueprintIds = blueprintTagRows.map((row) => row.blueprint_id);
          if (blueprintIds.length > 0) {
            let tagQuery = supabase
              .from('blueprints')
              .select(BLUEPRINT_FIELDS)
              .in('id', blueprintIds)
              .order(orderBy.column, { ascending: orderBy.ascending })
              .limit(DEFAULT_BLUEPRINT_LIST_LIMIT);

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
        .order(orderBy.column, { ascending: orderBy.ascending })
        .limit(DEFAULT_BLUEPRINT_LIST_LIMIT);

      titleQuery = applyVisibilityFilter(titleQuery, user?.id);

      const { data: titleMatches } = await titleQuery;
      if (titleMatches) matched.push(...titleMatches);

      const deduped = Array.from(new Map(matched.map((row) => [row.id, row])).values())
        .slice(0, DEFAULT_BLUEPRINT_LIST_LIMIT);
      blueprints = deduped;

      return hydrateBlueprints(blueprints, user?.id);
    },
  });
}
