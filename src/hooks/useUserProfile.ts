import { useQuery } from '@tanstack/react-query';
import { getProfileComments } from '@/lib/blueprintCommentsApi';
import {
  getProfileActivity,
  getProfileBlueprints,
  getProfileByUserId,
  getProfileLikedBlueprints,
} from '@/lib/profileApi';

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
      return getProfileBlueprints(userId, limit);
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
      return getProfileLikedBlueprints(userId, limit);
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
      return getProfileActivity(userId, limit);
    },
    enabled: !!userId,
  });
}
