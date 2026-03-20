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
  unlocked_blueprints_count: number;
  created_at: string;
}

export function useUserProfile(userId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-profile', userId],
    staleTime: 120_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, avatar_url, bio, is_public, follower_count, following_count, unlocked_blueprints_count, created_at')
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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
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

      const { data: unlockRows } = publicBlueprintIds.length > 0
        ? await supabase
          .from('source_item_unlocks')
          .select('blueprint_id, source_item_id, updated_at')
          .in('blueprint_id', publicBlueprintIds)
          .order('updated_at', { ascending: false })
        : { data: [] as Array<{ blueprint_id: string; source_item_id: string | null; updated_at: string | null }> };

      const sourceItemIdByBlueprint = new Map<string, string>();
      (unlockRows || []).forEach((row) => {
        const blueprintId = String(row.blueprint_id || '').trim();
        const sourceItemId = String(row.source_item_id || '').trim();
        if (!blueprintId || !sourceItemId) return;
        if (!sourceItemIdByBlueprint.has(blueprintId)) {
          sourceItemIdByBlueprint.set(blueprintId, sourceItemId);
        }
      });

      const unresolvedBlueprintIds = publicBlueprintIds.filter((id) => !sourceItemIdByBlueprint.has(id));
      if (unresolvedBlueprintIds.length > 0) {
        const { data: feedRows } = await supabase
          .from('user_feed_items')
          .select('blueprint_id, source_item_id, created_at')
          .in('blueprint_id', unresolvedBlueprintIds)
          .order('created_at', { ascending: false });
        (feedRows || []).forEach((row) => {
          const blueprintId = String(row.blueprint_id || '').trim();
          const sourceItemId = String(row.source_item_id || '').trim();
          if (!blueprintId || !sourceItemId) return;
          if (!sourceItemIdByBlueprint.has(blueprintId)) {
            sourceItemIdByBlueprint.set(blueprintId, sourceItemId);
          }
        });
      }

      const sourceItemIds = Array.from(new Set(Array.from(sourceItemIdByBlueprint.values()).filter(Boolean)));
      const { data: sourceRows } = sourceItemIds.length > 0
        ? await supabase
          .from('source_items')
          .select('id, source_page_id, source_channel_id, source_channel_title, metadata')
          .in('id', sourceItemIds)
        : { data: [] as Array<{ id: string; source_page_id: string | null; source_channel_id: string | null; source_channel_title: string | null; metadata: unknown }> };
      const sourceById = new Map((sourceRows || []).map((row) => [row.id, row]));

      const sourcePageIds = Array.from(new Set(
        (sourceRows || [])
          .map((row) => String(row.source_page_id || '').trim())
          .filter(Boolean),
      ));
      const sourceChannelIds = Array.from(new Set(
        (sourceRows || [])
          .map((row) => String(row.source_channel_id || '').trim())
          .filter(Boolean),
      ));
      const { data: sourcePagesById } = sourcePageIds.length > 0
        ? await supabase.from('source_pages').select('id, avatar_url').in('id', sourcePageIds)
        : { data: [] as Array<{ id: string; avatar_url: string | null }> };
      const { data: sourcePagesByExternal } = sourceChannelIds.length > 0
        ? await supabase
          .from('source_pages')
          .select('external_id, avatar_url')
          .eq('platform', 'youtube')
          .in('external_id', sourceChannelIds)
        : { data: [] as Array<{ external_id: string; avatar_url: string | null }> };
      const sourceAvatarByPageId = new Map((sourcePagesById || []).map((row) => [row.id, row.avatar_url || null]));
      const sourceAvatarByExternalId = new Map((sourcePagesByExternal || []).map((row) => [row.external_id, row.avatar_url || null]));

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
          const sourcePageId = String(source.source_page_id || '').trim();
          const sourceChannelId = String(source.source_channel_id || '').trim();
          return {
            title: source.source_channel_title || metadataTitle || null,
            avatar_url:
              sourceAvatarByPageId.get(sourcePageId)
              || metadataAvatar
              || sourceAvatarByExternalId.get(sourceChannelId)
              || null,
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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!userId) return [] as UserCommentItem[];

      const { data: comments, error: commentsError } = await supabase
        .from('blueprint_comments')
        .select('id, blueprint_id, content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (commentsError) throw commentsError;
      if (!comments || comments.length === 0) return [] as UserCommentItem[];

      const blueprintIds = Array.from(new Set(comments.map((row) => row.blueprint_id).filter(Boolean)));
      const { data: blueprints, error: blueprintsError } = blueprintIds.length > 0
        ? await supabase
          .from('blueprints')
          .select('id, title')
          .in('id', blueprintIds)
          .eq('is_public', true)
        : { data: [] as Array<{ id: string; title: string }>, error: null };
      if (blueprintsError) throw blueprintsError;

      const titleMap = new Map((blueprints || []).map((row) => [row.id, row.title]));
      return comments
        .filter((row) => titleMap.has(row.blueprint_id))
        .map((row) => ({
          id: row.id,
          blueprint_id: row.blueprint_id,
          blueprint_title: titleMap.get(row.blueprint_id) || 'Blueprint',
          content: row.content,
          created_at: row.created_at,
        })) as UserCommentItem[];
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
