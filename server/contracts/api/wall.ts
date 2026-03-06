import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type WallRouteDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  normalizeTranscriptTruthStatus: (value: unknown) => string;
};
