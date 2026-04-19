import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getProfileComments } from '@/lib/blueprintCommentsApi';
import { getProfileByUserId } from '@/lib/profileApi';
import { lookupSourceItems } from '@/lib/sourceItemsApi';

export interface PublicProfile {
  id: string | null;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  follower_count: number;
  following_count: number;
  unlocked_blueprints_count: number;
  created_at: string;
}

export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-profile', userId],
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!userId) return null;
      return await getProfileByUserId(userId) as PublicProfile | null;
    },
    enabled: !!userId,
  });
}

export function useUserBlueprints(userId: string | undefined, limit = 4) {
  return useQuery({
    queryKey: ['user-blueprints', userId, limit],
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('blueprints')
        .select('id, title, likes_count, created_at')
        .eq('creator_user_id', userId)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

export function useUserLikedBlueprints(userId: string | undefined, limit = 4) {
  return useQuery({
    queryKey: ['user-liked-blueprints', userId, limit],
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!userId) return [];

      // Get blueprint likes by user
      const { data: likes, error: likesError } = await supabase
        .from('blueprint_likes')
        .select('blueprint_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (likesError) throw likesError;
      if (!likes || likes.length === 0) return [];

      const blueprintIds = likes.map((like) => like.blueprint_id);

      const { data: blueprints, error: blueprintsError } = await supabase
        .from('blueprints')
        .select('id, title, creator_user_id, likes_count, created_at')
        .in('id', blueprintIds)
        .eq('is_public', true);

      if (blueprintsError) throw blueprintsError;

      // Get creator profiles
      const creatorIds = [...new Set((blueprints || []).map((bp) => bp.creator_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', creatorIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      const publicBlueprintIds = (blueprints || []).map((bp) => bp.id);

      const sourceItemIdByBlueprint = new Map<string, string>();
      const sourceLookup = publicBlueprintIds.length > 0
        ? await lookupSourceItems({ blueprintIds: publicBlueprintIds })
        : { items: [], source_item_id_by_blueprint_id: {} };

      Object.entries(sourceLookup.source_item_id_by_blueprint_id).forEach(([blueprintId, sourceItemId]) => {
        if (!sourceItemIdByBlueprint.has(blueprintId) && sourceItemId) {
          sourceItemIdByBlueprint.set(blueprintId, sourceItemId);
        }
      });

      const sourceById = new Map((sourceLookup.items || []).map((row) => [row.id, row]));

      return (blueprints || []).map((bp) => ({
        ...bp,
        source_channel: (() => {
          const sourceItemId = sourceItemIdByBlueprint.get(bp.id);
          if (!sourceItemId) return null;
          const source = sourceById.get(sourceItemId);
          if (!source) return null;
          const sourceMetadata =
            source.metadata && typeof source.metadata === 'object' && source.metadata !== null
              ? (source.metadata as Record<string, unknown>)
              : null;
          const metadataTitle =
            sourceMetadata && typeof sourceMetadata.source_channel_title === 'string'
              ? String(sourceMetadata.source_channel_title || '').trim() || null
              : (
                sourceMetadata && typeof sourceMetadata.channel_title === 'string'
                  ? String(sourceMetadata.channel_title || '').trim() || null
                  : null
              );
          const metadataAvatar =
            sourceMetadata && typeof sourceMetadata.source_channel_avatar_url === 'string'
              ? String(sourceMetadata.source_channel_avatar_url || '').trim() || null
              : (
                sourceMetadata && typeof sourceMetadata.channel_avatar_url === 'string'
                  ? String(sourceMetadata.channel_avatar_url || '').trim() || null
                  : null
              );
          return {
            title: source.source_channel_title || metadataTitle || null,
            avatar_url: metadataAvatar || null,
          };
        })(),
        creator_profile: profileMap.get(bp.creator_user_id) || null,
      }));
    },
    enabled: !!userId,
  });
}

export interface UserCommentItem {
  id: string;
  blueprint_id: string;
  blueprint_title: string;
  content: string;
  created_at: string;
}

export function useUserComments(userId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['user-comments', userId, limit],
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!userId) return [] as UserCommentItem[];
      return getProfileComments({
        userId,
        limit,
      });
    },
    enabled: !!userId,
  });
}

export interface ActivityItem {
  type: 'blueprint_created' | 'blueprint_liked' | 'comment';
  id: string;
  title: string;
  created_at: string;
  target_id?: string;
}

export function useUserActivity(userId: string | undefined, limit = 4) {
  return useQuery({
    queryKey: ['user-activity', userId, limit],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!userId) return [];

      // Fetch recent blueprints created
      const { data: blueprints } = await supabase
        .from('blueprints')
        .select('id, title, created_at')
        .eq('creator_user_id', userId)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Fetch recent blueprint likes
      const { data: likes } = await supabase
        .from('blueprint_likes')
        .select('id, blueprint_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Get liked blueprint titles
      const likedBlueprintIds = (likes || []).map((like) => like.blueprint_id);
      const { data: likedBlueprints } = likedBlueprintIds.length > 0
        ? await supabase
            .from('blueprints')
            .select('id, title')
            .in('id', likedBlueprintIds)
            .eq('is_public', true)
        : { data: [] };

      const likedMap = new Map((likedBlueprints || []).map((bp) => [bp.id, bp.title]));

      const comments = await getProfileComments({
        userId,
        limit,
      });

      // Combine all activities
      const activities: ActivityItem[] = [
        ...(blueprints || []).map((bp) => ({
          type: 'blueprint_created' as const,
          id: bp.id,
          title: `Created "${bp.title}"`,
          created_at: bp.created_at,
          target_id: bp.id,
        })),
        ...(likes || [])
          .filter((like) => likedMap.has(like.blueprint_id))
          .map((like) => ({
            type: 'blueprint_liked' as const,
            id: like.id,
            title: `Liked "${likedMap.get(like.blueprint_id)}"`,
            created_at: like.created_at,
            target_id: like.blueprint_id,
          })),
        ...(comments || [])
          .map((c) => ({
            type: 'comment' as const,
            id: c.id,
            title: `Commented on "${c.blueprint_title}"`,
            created_at: c.created_at,
            target_id: c.blueprint_id,
          })),
      ];

      // Sort by created_at and take top N
      return activities
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
    },
    enabled: !!userId,
  });
}
