import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { collectBlueprintTagSlugMap, listBlueprintTagRows } from '@/lib/blueprintTagsApi';
import { listTags } from '@/lib/tagsApi';
import { listBlueprintsViaApi } from '@/lib/blueprintReadApi';

export interface CommunityStats {
  totalBlueprints: number;
  totalSources: number;
  activeTags: number;
}

export function useCommunityStats() {
  return useQuery({
    queryKey: ['community-stats'],
    queryFn: async (): Promise<CommunityStats> => {
      const [blueprintsRes, sourcesRes, tags] = await Promise.all([
        listBlueprintsViaApi({ visibility: 'public', limit: 1, includeTotal: true }),
        supabase.from('source_pages').select('id', { count: 'exact', head: true }),
        listTags(5000),
      ]);

      return {
        totalBlueprints: blueprintsRes.total_count ?? blueprintsRes.items.length,
        totalSources: sourcesRes.count ?? 0,
        activeTags: tags.length,
      };
    },
    staleTime: 60_000, // 1 minute
  });
}

export interface TopBlueprint {
  id: string;
  title: string;
  likes_count: number;
  created_at: string;
  creator_profile: {
    display_name: string | null;
  } | null;
  tags: { slug: string }[];
}

export function useTopBlueprints(limit = 4) {
  return useQuery({
    queryKey: ['top-blueprints', limit],
    queryFn: async (): Promise<TopBlueprint[]> => {
      const blueprints = (await listBlueprintsViaApi({
        visibility: 'public',
        sort: 'popular',
        limit,
      })).items;
      if (blueprints.length === 0) return [];

      const blueprintIds = blueprints.map((b) => b.id);
      const tagRows = await listBlueprintTagRows({ blueprintIds });
      const blueprintTagMap = collectBlueprintTagSlugMap(tagRows);

      return blueprints.map((b) => ({
        id: b.id,
        title: b.title,
        likes_count: b.likes_count,
        created_at: b.created_at,
        creator_profile: b.creator_profile
          ? { display_name: b.creator_profile.display_name }
          : null,
        tags: (blueprintTagMap.get(b.id) || []).map((slug) => ({ slug })),
      }));
    },
    staleTime: 60_000,
  });
}

export function useFeaturedTags(limit = 8) {
  return useQuery({
    queryKey: ['featured-tags', limit],
    queryFn: async () => {
      return listTags(limit);
    },
    staleTime: 60_000,
  });
}
