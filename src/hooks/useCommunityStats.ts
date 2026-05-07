import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { collectBlueprintTagSlugMap, listBlueprintTagRows } from '@/lib/blueprintTagsApi';
import { listTags } from '@/lib/tagsApi';

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
        supabase.from('blueprints').select('id', { count: 'exact', head: true }).eq('is_public', true),
        supabase.from('source_pages').select('id', { count: 'exact', head: true }),
        listTags(5000),
      ]);

      return {
        totalBlueprints: blueprintsRes.count ?? 0,
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
      const { data: blueprints, error } = await supabase
        .from('blueprints')
        .select('id, title, likes_count, created_at, creator_user_id')
        .eq('is_public', true)
        .order('likes_count', { ascending: false })
        .limit(limit);

      if (error) throw error;
      if (!blueprints || blueprints.length === 0) return [];

      // Fetch profiles
      const userIds = [...new Set(blueprints.map((b) => b.creator_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      const blueprintIds = blueprints.map((b) => b.id);
      const tagRows = await listBlueprintTagRows({ blueprintIds });
      const blueprintTagMap = collectBlueprintTagSlugMap(tagRows);

      return blueprints.map((b) => ({
        id: b.id,
        title: b.title,
        likes_count: b.likes_count,
        created_at: b.created_at,
        creator_profile: profileMap.get(b.creator_user_id) || null,
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
