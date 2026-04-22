import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type WallRouteDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  normalizeTranscriptTruthStatus: (value: unknown) => string;
  readLikedBlueprintIds?: (input: {
    userId: string;
    blueprintIds: string[];
  }) => Promise<string[]>;
  listBlueprintTagRows: (input: {
    blueprintIds: string[];
  }) => Promise<Array<{
    blueprint_id: string;
    tag_id: string;
    tag_slug: string;
  }>>;
  readPublicFeedRows?: any;
  readFeedRows?: any;
  readSourceRows?: any;
  readUnlockRows?: any;
  readActiveSubscriptions?: any;
  readFollowedTagSlugs?: (input: {
    userId: string;
    limit?: number;
  }) => Promise<string[]>;
  readChannelCandidateRows?: any;
  readBlueprintRows?: any;
  readProfileRows?: any;
};
