import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useIsFollowing(targetUserId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['is-following', user?.id, targetUserId],
    queryFn: async () => {
      if (!user || !targetUserId || user.id === targetUserId) return false;

      const { data, error } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
  });
}

export function useFollowUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error('Must be logged in');
      if (user.id === targetUserId) throw new Error('Cannot follow yourself');

      const { error } = await supabase.from('user_follows').insert({
        follower_id: user.id,
        following_id: targetUserId,
      });

      if (error) throw error;
    },
    onSuccess: (_, targetUserId) => {
      queryClient.invalidateQueries({ queryKey: ['is-following', user?.id, targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-profile', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-followers', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-following', user?.id] });
    },
  });
}

export function useUnfollowUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetUserId);

      if (error) throw error;
    },
    onSuccess: (_, targetUserId) => {
      queryClient.invalidateQueries({ queryKey: ['is-following', user?.id, targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-profile', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-followers', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-following', user?.id] });
    },
  });
}

export interface FollowUser {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function useUserFollowers(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-followers', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data: follows, error } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', userId);

      if (error) throw error;
      if (!follows || follows.length === 0) return [];

      const followerIds = follows.map((f) => f.follower_id);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', followerIds);

      if (profilesError) throw profilesError;
      return (profiles || []) as FollowUser[];
    },
    enabled: !!userId,
  });
}

export function useUserFollowing(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-following', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data: follows, error } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', userId);

      if (error) throw error;
      if (!follows || follows.length === 0) return [];

      const followingIds = follows.map((f) => f.following_id);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', followingIds);

      if (profilesError) throw profilesError;
      return (profiles || []) as FollowUser[];
    },
    enabled: !!userId,
  });
}
