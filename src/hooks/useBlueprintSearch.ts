import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildFeedSummary } from '@/lib/feedPreview';
import { getBlueprintLikeStates } from '@/lib/blueprintLikesApi';
import { collectBlueprintTagMap, listBlueprintTagRows } from '@/lib/blueprintTagsApi';
import { normalizeTag } from '@/lib/tagging';
import { getTagsBySlugs } from '@/lib/tagsApi';
import { listBlueprintsViaApi } from '@/lib/blueprintReadApi';

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

export async function hydrateBlueprints(rows: BlueprintRow[], userId?: string | null) {
  if (rows.length === 0) return [] as BlueprintListItem[];

  const blueprintIds = rows.map((row) => row.id);
  const inventoryIds = rows.map((row) => row.inventory_id).filter(Boolean) as string[];

  const [tagsRes, likesRes, inventoriesRes] = await Promise.all([
    listBlueprintTagRows({ blueprintIds }),
    userId
      ? getBlueprintLikeStates(blueprintIds)
      : Promise.resolve(new Map<string, boolean>()),
    inventoryIds.length > 0
      ? supabase.from('inventories').select('id, title').in('id', inventoryIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const blueprintTags = collectBlueprintTagMap(tagsRes || []);

  const inventoryMap = new Map((inventoriesRes.data || []).map((inv) => [inv.id, inv.title]));

  return rows.map((row) => {
    const inventoryTitle = row.inventory_id ? inventoryMap.get(row.inventory_id) || null : null;
    return {
      ...row,
      tags: blueprintTags.get(row.id) || [],
      user_liked: Boolean(likesRes.get(row.id)),
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
      const apiSort = sort === 'latest' ? 'latest' : 'popular';

      if (!trimmed) {
        const result = await listBlueprintsViaApi({
          visibility: 'public_or_owner',
          sort: apiSort,
          limit: DEFAULT_BLUEPRINT_LIST_LIMIT,
        });
        blueprints = result.items;
        return hydrateBlueprints(blueprints, user?.id);
      }

      const tagSlug = normalizeTag(trimmed);
      const matched: BlueprintRow[] = [];

      if (tagSlug) {
        const [tagData] = await getTagsBySlugs([tagSlug]);
        if (tagData?.id) {
          const blueprintTagRows = await listBlueprintTagRows({ tagIds: [tagData.id] });
          const blueprintIds = blueprintTagRows.map((row) => row.blueprint_id);
          if (blueprintIds.length > 0) {
            const result = await listBlueprintsViaApi({
              ids: blueprintIds,
              visibility: 'public_or_owner',
              sort: apiSort,
              limit: DEFAULT_BLUEPRINT_LIST_LIMIT,
            });
            matched.push(...result.items);
          }
        }
      }

      const titleMatches = await listBlueprintsViaApi({
        q: trimmed,
        visibility: 'public_or_owner',
        sort: apiSort,
        limit: DEFAULT_BLUEPRINT_LIST_LIMIT,
      });
      matched.push(...titleMatches.items);

      const deduped = Array.from(new Map(matched.map((row) => [row.id, row])).values())
        .slice(0, DEFAULT_BLUEPRINT_LIST_LIMIT);
      blueprints = deduped;

      return hydrateBlueprints(blueprints, user?.id);
    },
  });
}
