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
      const { data: tags, error: tagError } = await supabase
        .from('tags')
        .select('id, slug, follower_count')
        .order('follower_count', { ascending: false })
        .order('slug', { ascending: true })
        .limit(limit);

      if (tagError) throw tagError;

      return (tags || []).map((tag) => ({
        id: tag.id,
        slug: tag.slug,
        count: Number(tag.follower_count || 0),
      })) as PopularBlueprintTag[];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
