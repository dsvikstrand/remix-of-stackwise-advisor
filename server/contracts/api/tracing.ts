import type express from 'express';
import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type GenerationRunRecord = Record<string, any>;
export type GenerationRunEvents = {
  items: Array<Record<string, any>>;
  next_cursor: string | null;
};

export type TracingRouteDeps = {
  isServiceRequestAuthorized: (req: express.Request) => boolean;
  getServiceSupabaseClient: () => DbClient | null;
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  getBlueprintRow: (input: { blueprintId: string }) => Promise<{
    id: string;
    creator_user_id: string;
  } | null>;
  getGenerationRunByRunId: (db: DbClient, runId: string) => Promise<GenerationRunRecord | null>;
  getLatestGenerationRunByBlueprintId: (db: DbClient, blueprintId: string) => Promise<GenerationRunRecord | null>;
  listGenerationRunEvents: (db: DbClient, input: { runId: string; limit?: number; cursor?: string | null }) => Promise<GenerationRunEvents>;
  clampInt: (raw: unknown, fallbackValue: number, minValue: number, maxValue: number) => number;
};
