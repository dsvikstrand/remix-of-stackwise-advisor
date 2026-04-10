import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type BlueprintTagReadsRouteDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  listBlueprintTagRows: (input: {
    blueprintIds: string[];
  }) => Promise<Array<{
    blueprint_id: string;
    tag_id: string;
    tag_slug: string;
  }>>;
  listBlueprintTagRowsByFilters: (input: {
    tagIds?: string[];
    tagSlugs?: string[];
  }) => Promise<Array<{
    blueprint_id: string;
    tag_id: string;
    tag_slug: string;
  }>>;
};
