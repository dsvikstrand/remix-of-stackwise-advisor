import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PopularTag {
  id: string;
  slug: string;
  count: number;
}

export function usePopularInventoryTags(limit = 10) {
  return useQuery({
    queryKey: ['popular-inventory-tags', limit],
    queryFn: async () => {
      // Get all inventory_tags and count by tag_id
      const { data: tagCounts, error: countError } = await supabase
        .from('inventory_tags')
        .select('tag_id');

      if (countError) throw countError;

      // Count occurrences of each tag
      const countMap = new Map<string, number>();
      (tagCounts || []).forEach((row) => {
        countMap.set(row.tag_id, (countMap.get(row.tag_id) || 0) + 1);
      });

      // Get unique tag ids sorted by count
      const sortedTagIds = [...countMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);

      if (sortedTagIds.length === 0) return [] as PopularTag[];

      // Fetch tag details
      const { data: tags, error: tagError } = await supabase
        .from('tags')
        .select('id, slug')
        .in('id', sortedTagIds);

      if (tagError) throw tagError;

      // Map tags with their counts and sort
      const result: PopularTag[] = (tags || [])
        .map((tag) => ({
          id: tag.id,
          slug: tag.slug,
          count: countMap.get(tag.id) || 0,
        }))
        .sort((a, b) => b.count - a.count);

      return result;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
