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
  selected_items?: Json | null;
  steps?: Json | null;
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

export type BlueprintWriteInput = {
  userId: string;
  blueprintId?: string;
  inventoryId: string | null;
  title: string;
  selectedItems: Json | null;
  steps: Json | null;
  sectionsJson?: Json | null;
  mixNotes: string | null;
  reviewPrompt: string | null;
  bannerUrl: string | null;
  llmReview: string | null;
  previewSummary: string | null;
  generationControls?: Json | null;
  tags: string[];
  isPublic: boolean;
  sourceBlueprintId?: string | null;
};

export type BlueprintReadRouteDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  getBlueprintRow: (input: { blueprintId: string }) => Promise<BlueprintRouteDetail | null>;
  listBlueprintRows?: (input: {
    viewerUserId: string | null;
    blueprintIds?: string[];
    titleQuery?: string | null;
    visibility?: 'public' | 'public_or_owner';
    sort?: 'latest' | 'popular';
    limit?: number;
    requireSectionsJson?: boolean;
    requireBannerUrl?: boolean;
    includeTotal?: boolean;
  }) => Promise<{
    items: BlueprintRouteDetail[];
    total_count?: number | null;
  }>;
  syncBlueprintReadState: (input: { blueprintId: string; userId: string }) => Promise<BlueprintRouteDetail | null>;
  createBlueprintRow?: (input: BlueprintWriteInput) => Promise<BlueprintRouteDetail>;
  updateBlueprintRow?: (input: BlueprintWriteInput & { blueprintId: string }) => Promise<BlueprintRouteDetail | null>;
  patchBlueprintFields?: (input: {
    blueprintId: string;
    userId: string;
    llmReview?: string | null;
    bannerUrl?: string | null;
    previewSummary?: string | null;
  }) => Promise<BlueprintRouteDetail | null>;
};
