import type express from 'express';
import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type IngestionRouteDeps = {
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  getServiceSupabaseClient: () => DbClient | null;
  getLatestUserIngestionJobs?: (input: { userId: string; scope: string; limit: number }) => Promise<any[] | null>;
  listActiveUserIngestionJobs?: (input: { userId: string; scopes: string[]; limit: number }) => Promise<any[] | null>;
  clampInt: (raw: unknown, fallbackValue: number, minValue: number, maxValue: number) => number;
  ingestionLatestMineLimiter: express.RequestHandler;
  workerConcurrency: number;
  queuedIngestionScopes: readonly string[];
  isQueuedIngestionScope: (scope: string) => boolean;
};
