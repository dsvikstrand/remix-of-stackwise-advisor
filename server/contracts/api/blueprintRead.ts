import type { Json } from '../../../src/integrations/supabase/types';
import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type BlueprintRouteCreatorProfile = {
  display_name: string | null;
  avatar_url: string | null;
} | null;

export type BlueprintRouteDetail = {
  id: string;
  inventory_id: string | null;
  creator_user_id: string;
  title: string;
  sections_json: Json | null;
  mix_notes: string | null;
  review_prompt: string | null;
  banner_url: string | null;
  llm_review: string | null;
  preview_summary: string | null;
  is_public: boolean;
  likes_count: number;
  source_blueprint_id: string | null;
  created_at: string;
  updated_at: string;
  creator_profile: BlueprintRouteCreatorProfile;
};

export type BlueprintReadRouteDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  getBlueprintRow: (input: { blueprintId: string }) => Promise<BlueprintRouteDetail | null>;
  syncBlueprintRowFromSupabase: (input: { blueprintId: string }) => Promise<BlueprintRouteDetail | null>;
  syncBlueprintReadState: (input: { blueprintId: string; userId: string }) => Promise<BlueprintRouteDetail | null>;
};
