import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PublicProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  follower_count: number;
  following_count: number;
  created_at: string;
}

export function useUserProfile(userId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, avatar_url, bio, is_public, follower_count, following_count, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data as PublicProfile | null;
    },
    enabled: !!userId,
  });
}

export function useUserBlueprints(userId: string | undefined, limit = 4) {
  return useQuery({
    queryKey: ['user-blueprints', userId, limit],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('blueprints')
        .select('id, title, selected_items, likes_count, created_at')
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

export function useUserInventories(userId: string | undefined, limit = 4) {
  return useQuery({
    queryKey: ['user-inventories', userId, limit],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('inventories')
        .select('id, title, prompt_categories, likes_count, created_at')
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

      return (blueprints || []).map((bp) => ({
        ...bp,
        creator_profile: profileMap.get(bp.creator_user_id) || null,
      }));
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

      // Fetch recent comments
      const { data: comments } = await supabase
        .from('blueprint_comments')
        .select('id, blueprint_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Get commented blueprint titles
      const commentBlueprintIds = (comments || []).map((c) => c.blueprint_id);
      const { data: commentedBlueprints } = commentBlueprintIds.length > 0
        ? await supabase
            .from('blueprints')
            .select('id, title')
            .in('id', commentBlueprintIds)
            .eq('is_public', true)
        : { data: [] };

      const commentedMap = new Map((commentedBlueprints || []).map((bp) => [bp.id, bp.title]));

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
          .filter((c) => commentedMap.has(c.blueprint_id))
          .map((c) => ({
            type: 'comment' as const,
            id: c.id,
            title: `Commented on "${commentedMap.get(c.blueprint_id)}"`,
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
