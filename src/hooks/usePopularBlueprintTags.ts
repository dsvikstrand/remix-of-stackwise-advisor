import { useQuery } from '@tanstack/react-query';
import { listTags } from '@/lib/tagsApi';

export interface PopularBlueprintTag {
  id: string;
  slug: string;
  count: number;
}

export function usePopularBlueprintTags(limit = 10) {
  return useQuery({
    queryKey: ['popular-blueprint-tags', limit],
    queryFn: async () => {
      const tags = await listTags(limit);
      return tags.map((tag) => ({
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
