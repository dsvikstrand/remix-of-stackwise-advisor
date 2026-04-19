import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type ProfileRouteReadItem = {
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
  updated_at: string;
};

export type ProfileRouteUpdateInput = {
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  is_public?: boolean;
};

export type ProfileReadRouteDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  getProfileRow: (input: { userId: string }) => Promise<ProfileRouteReadItem | null>;
  syncProfileRowFromSupabase: (input: { userId: string }) => Promise<ProfileRouteReadItem | null>;
  updateOwnProfile: (input: {
    userId: string;
    updates: ProfileRouteUpdateInput;
  }) => Promise<ProfileRouteReadItem | null>;
};
