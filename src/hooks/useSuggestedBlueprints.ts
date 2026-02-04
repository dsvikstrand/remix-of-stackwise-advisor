import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { BlueprintListItem, BlueprintRow } from './useBlueprintSearch';

const BLUEPRINT_FIELDS = 'id, inventory_id, creator_user_id, title, selected_items, mix_notes, llm_review, is_public, likes_count, created_at, updated_at';

export function useSuggestedBlueprints(limit = 6) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['suggested-blueprints', user?.id, limit],
    queryFn: async (): Promise<BlueprintListItem[]> => {
      let suggestedTagIds: string[] = [];

      if (user?.id) {
        const { data: likedBlueprints } = await supabase
          .from('blueprint_likes')
          .select('blueprint_id')
          .eq('user_id', user.id);

        const likedIds = (likedBlueprints || []).map((row) => row.blueprint_id);

        if (likedIds.length > 0) {
          const { data: tagRows } = await supabase
            .from('blueprint_tags')
            .select('tag_id')
            .in('blueprint_id', likedIds);

          suggestedTagIds = [...new Set((tagRows || []).map((row) => row.tag_id))];
        }
      }

      let blueprints: BlueprintRow[] = [];

      if (suggestedTagIds.length > 0 && user?.id) {
        const { data: blueprintTagRows } = await supabase
          .from('blueprint_tags')
          .select('blueprint_id')
          .in('tag_id', suggestedTagIds);

        const candidateIds = [...new Set((blueprintTagRows || []).map((row) => row.blueprint_id))];

        const { data: userLikes } = await supabase
          .from('blueprint_likes')
          .select('blueprint_id')
          .eq('user_id', user.id);

        const excludeIds = new Set((userLikes || []).map((row) => row.blueprint_id));
        const filteredIds = candidateIds.filter((id) => !excludeIds.has(id));

        if (filteredIds.length > 0) {
          const { data } = await supabase
            .from('blueprints')
            .select(BLUEPRINT_FIELDS)
            .in('id', filteredIds)
            .eq('is_public', true)
            .order('likes_count', { ascending: false })
            .limit(limit);

          blueprints = data || [];
        }
      }

      if (blueprints.length < limit) {
        const existingIds = blueprints.map((bp) => bp.id);
        const { data: popular } = await supabase
          .from('blueprints')
          .select(BLUEPRINT_FIELDS)
          .eq('is_public', true)
          .order('likes_count', { ascending: false })
          .limit(limit * 2);

        const additional = (popular || [])
          .filter((bp) => !existingIds.includes(bp.id))
          .slice(0, limit - blueprints.length);

        blueprints = [...blueprints, ...additional];
      }

      if (blueprints.length === 0) return [];

      // Reuse hydration from useBlueprintSearch by calling it indirectly is not possible here,
      // so duplicate the hydration logic inline.
      const blueprintIds = blueprints.map((bp) => bp.id);
      const inventoryIds = blueprints.map((bp) => bp.inventory_id).filter(Boolean) as string[];

      const [tagsRes, likesRes, inventoriesRes] = await Promise.all([
        supabase.from('blueprint_tags').select('blueprint_id, tag_id').in('blueprint_id', blueprintIds),
        user?.id
          ? supabase.from('blueprint_likes').select('blueprint_id').eq('user_id', user.id).in('blueprint_id', blueprintIds)
          : Promise.resolve({ data: [] as { blueprint_id: string }[] }),
        inventoryIds.length > 0
          ? supabase.from('inventories').select('id, title').in('id', inventoryIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);

      const tagRows = tagsRes.data || [];
      const tagIds = [...new Set(tagRows.map((row) => row.tag_id))];
      const { data: tagsData } = tagIds.length > 0
        ? await supabase.from('tags').select('id, slug').in('id', tagIds)
        : { data: [] as { id: string; slug: string }[] };

      const tagsMap = new Map((tagsData || []).map((tag) => [tag.id, tag]));
      const blueprintTags = new Map<string, { id: string; slug: string }[]>();

      tagRows.forEach((row) => {
        const tag = tagsMap.get(row.tag_id);
        if (!tag) return;
        const list = blueprintTags.get(row.blueprint_id) || [];
        list.push(tag);
        blueprintTags.set(row.blueprint_id, list);
      });

      const likedIds = new Set((likesRes.data || []).map((row) => row.blueprint_id));
      const inventoryMap = new Map((inventoriesRes.data || []).map((inv) => [inv.id, inv.title]));

      return blueprints.map((bp) => ({
        ...bp,
        tags: blueprintTags.get(bp.id) || [],
        user_liked: likedIds.has(bp.id),
        inventory_title: bp.inventory_id ? inventoryMap.get(bp.inventory_id) || null : null,
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}
