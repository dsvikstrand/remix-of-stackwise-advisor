import type express from 'express';
import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type IngestionRouteDeps = {
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  clampInt: (raw: unknown, fallbackValue: number, minValue: number, maxValue: number) => number;
  ingestionLatestMineLimiter: express.RequestHandler;
};
