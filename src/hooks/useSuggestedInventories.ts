import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { InventoryListItem } from './useInventories';

const INVENTORY_FIELDS = 'id, title, prompt_inventory, prompt_categories, generated_schema, review_sections, include_score, creator_user_id, is_public, likes_count, created_at, updated_at';

export function useSuggestedInventories(limit = 6) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['suggested-inventories', user?.id, limit],
    queryFn: async (): Promise<InventoryListItem[]> => {
      // For authenticated users, find tags from their liked inventories
      let suggestedTagIds: string[] = [];

      if (user?.id) {
        // Get user's liked inventory ids
        const { data: likedInventories } = await supabase
          .from('inventory_likes')
          .select('inventory_id')
          .eq('user_id', user.id);

        const likedIds = (likedInventories || []).map((row) => row.inventory_id);

        if (likedIds.length > 0) {
          // Get tags from liked inventories
          const { data: tagRows } = await supabase
            .from('inventory_tags')
            .select('tag_id')
            .in('inventory_id', likedIds);

          suggestedTagIds = [...new Set((tagRows || []).map((row) => row.tag_id))];
        }
      }

      let inventories: any[] = [];

      if (suggestedTagIds.length > 0 && user?.id) {
        // Find inventories with these tags that user hasn't liked
        const { data: inventoryTagRows } = await supabase
          .from('inventory_tags')
          .select('inventory_id')
          .in('tag_id', suggestedTagIds);

        const candidateIds = [...new Set((inventoryTagRows || []).map((row) => row.inventory_id))];

        // Get user's liked inventory ids to exclude
        const { data: userLikes } = await supabase
          .from('inventory_likes')
          .select('inventory_id')
          .eq('user_id', user.id);

        const excludeIds = new Set((userLikes || []).map((row) => row.inventory_id));
        const filteredIds = candidateIds.filter((id) => !excludeIds.has(id));

        if (filteredIds.length > 0) {
          const { data } = await supabase
            .from('inventories')
            .select(INVENTORY_FIELDS)
            .in('id', filteredIds)
            .eq('is_public', true)
            .order('likes_count', { ascending: false })
            .limit(limit);

          inventories = data || [];
        }
      }

      // Fallback to most popular if not enough suggestions
      if (inventories.length < limit) {
        const existingIds = inventories.map((inv) => inv.id);
        const { data: popular } = await supabase
          .from('inventories')
          .select(INVENTORY_FIELDS)
          .eq('is_public', true)
          .order('likes_count', { ascending: false })
          .limit(limit * 2);

        const additional = (popular || [])
          .filter((inv) => !existingIds.includes(inv.id))
          .slice(0, limit - inventories.length);

        inventories = [...inventories, ...additional];
      }

      // Hydrate with tags, likes, and blueprint counts
      if (inventories.length === 0) return [];

      const inventoryIds = inventories.map((inv) => inv.id);

      const [tagsRes, likesRes, blueprintCountsRes] = await Promise.all([
        supabase.from('inventory_tags').select('inventory_id, tag_id').in('inventory_id', inventoryIds),
        user?.id
          ? supabase.from('inventory_likes').select('inventory_id').eq('user_id', user.id).in('inventory_id', inventoryIds)
          : Promise.resolve({ data: [] as { inventory_id: string }[] }),
        supabase.from('blueprints').select('inventory_id').in('inventory_id', inventoryIds),
      ]);

      // Get tag details
      const tagRows = tagsRes.data || [];
      const tagIds = [...new Set(tagRows.map((row) => row.tag_id))];
      const { data: tagsData } = tagIds.length > 0
        ? await supabase.from('tags').select('id, slug').in('id', tagIds)
        : { data: [] };

      const tagsMap = new Map((tagsData || []).map((tag) => [tag.id, tag]));
      const inventoryTags = new Map<string, { id: string; slug: string }[]>();

      tagRows.forEach((row) => {
        const tag = tagsMap.get(row.tag_id);
        if (!tag) return;
        const list = inventoryTags.get(row.inventory_id) || [];
        list.push(tag);
        inventoryTags.set(row.inventory_id, list);
      });

      const likedIds = new Set((likesRes.data || []).map((row) => row.inventory_id));

      // Count blueprints per inventory
      const blueprintCounts = new Map<string, number>();
      (blueprintCountsRes.data || []).forEach((row) => {
        if (row.inventory_id) {
          blueprintCounts.set(row.inventory_id, (blueprintCounts.get(row.inventory_id) || 0) + 1);
        }
      });

      return inventories.map((inv) => ({
        ...inv,
        tags: inventoryTags.get(inv.id) || [],
        user_liked: likedIds.has(inv.id),
        is_owner: user?.id === inv.creator_user_id,
        blueprint_count: blueprintCounts.get(inv.id) || 0,
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}
