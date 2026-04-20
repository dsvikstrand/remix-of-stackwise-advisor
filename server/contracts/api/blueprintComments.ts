import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type BlueprintCommentProfile = {
  display_name: string | null;
  avatar_url: string | null;
} | null;

export type BlueprintCommentRouteItem = {
  id: string;
  blueprint_id: string;
  user_id: string;
  content: string;
  likes_count: number;
  created_at: string;
  updated_at: string;
  profile: BlueprintCommentProfile;
};

export type UserBlueprintCommentRouteItem = {
  id: string;
  blueprint_id: string;
  blueprint_title: string;
  content: string;
  created_at: string;
};

export type BlueprintCommentsRouteDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  getBlueprintRow: (input: { blueprintId: string }) => Promise<{
    id: string;
    creator_user_id: string;
    title: string;
    is_public: boolean;
  } | null>;
  readBlueprintRows: (input: { blueprintIds: string[] }) => Promise<Array<{
    id: string;
    title: string;
    is_public: boolean;
  }>>;
  listBlueprintCommentRows: (input: {
    blueprintId: string;
    sortMode?: 'top' | 'new' | null;
    limit?: number;
  }) => Promise<Array<{
    id: string;
    blueprint_id: string;
    user_id: string;
    content: string;
    likes_count: number;
    created_at: string;
    updated_at: string;
  }>>;
  createBlueprintCommentRow: (input: {
    blueprintId: string;
    userId: string;
    content: string;
  }) => Promise<{
    id: string;
    blueprint_id: string;
    user_id: string;
    content: string;
    likes_count: number;
    created_at: string;
    updated_at: string;
  }>;
  listUserBlueprintCommentRows: (input: {
    userId: string;
    limit?: number;
  }) => Promise<Array<{
    id: string;
    blueprint_id: string;
    user_id: string;
    content: string;
    likes_count: number;
    created_at: string;
    updated_at: string;
  }>>;
};
