import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BLUEPRINT_FIELDS, hydrateBlueprints, type BlueprintListItem, type BlueprintRow } from './useBlueprintSearch';


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

      return hydrateBlueprints(blueprints, user?.id);
    },
    staleTime: 2 * 60 * 1000,
  });
}
