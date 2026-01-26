import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommunityStats {
  totalBlueprints: number;
  totalInventories: number;
  activeTags: number;
}

export function useCommunityStats() {
  return useQuery({
    queryKey: ['community-stats'],
    queryFn: async (): Promise<CommunityStats> => {
      const [blueprintsRes, inventoriesRes, tagsRes] = await Promise.all([
        supabase.from('blueprints').select('id', { count: 'exact', head: true }).eq('is_public', true),
        supabase.from('inventories').select('id', { count: 'exact', head: true }).eq('is_public', true),
        supabase.from('tags').select('id', { count: 'exact', head: true }),
      ]);

      return {
        totalBlueprints: blueprintsRes.count ?? 0,
        totalInventories: inventoriesRes.count ?? 0,
        activeTags: tagsRes.count ?? 0,
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

      // Fetch tags for each blueprint
      const blueprintIds = blueprints.map((b) => b.id);
      const { data: tagLinks } = await supabase
        .from('blueprint_tags')
        .select('blueprint_id, tag_id')
        .in('blueprint_id', blueprintIds);

      const tagIds = [...new Set((tagLinks || []).map((t) => t.tag_id))];
      const { data: tags } = tagIds.length > 0
        ? await supabase.from('tags').select('id, slug').in('id', tagIds)
        : { data: [] as { id: string; slug: string }[] };

      const tagMap = new Map((tags || []).map((t) => [t.id, t.slug]));
      const blueprintTagMap = new Map<string, string[]>();
      (tagLinks || []).forEach((link) => {
        const arr = blueprintTagMap.get(link.blueprint_id) || [];
        const slug = tagMap.get(link.tag_id);
        if (slug) arr.push(slug);
        blueprintTagMap.set(link.blueprint_id, arr);
      });

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
      const { data, error } = await supabase
        .from('tags')
        .select('id, slug, follower_count')
        .order('follower_count', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });
}
