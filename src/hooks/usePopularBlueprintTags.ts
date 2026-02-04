import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PopularBlueprintTag {
  id: string;
  slug: string;
  count: number;
}

export function usePopularBlueprintTags(limit = 10) {
  return useQuery({
    queryKey: ['popular-blueprint-tags', limit],
    queryFn: async () => {
      const { data: tagCounts, error: countError } = await supabase
        .from('blueprint_tags')
        .select('tag_id');

      if (countError) throw countError;

      const countMap = new Map<string, number>();
      (tagCounts || []).forEach((row) => {
        countMap.set(row.tag_id, (countMap.get(row.tag_id) || 0) + 1);
      });

      const sortedTagIds = [...countMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);

      if (sortedTagIds.length === 0) return [] as PopularBlueprintTag[];

      const { data: tags, error: tagError } = await supabase
        .from('tags')
        .select('id, slug')
        .in('id', sortedTagIds);

      if (tagError) throw tagError;

      const result: PopularBlueprintTag[] = (tags || [])
        .map((tag) => ({
          id: tag.id,
          slug: tag.slug,
          count: countMap.get(tag.id) || 0,
        }))
        .sort((a, b) => b.count - a.count);

      return result;
    },
    staleTime: 5 * 60 * 1000,
  });
}
