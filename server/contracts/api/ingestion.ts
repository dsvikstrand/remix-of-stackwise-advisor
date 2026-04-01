import type express from 'express';
import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type IngestionRouteDeps = {
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  getServiceSupabaseClient: () => DbClient | null;
  getUserIngestionJobById: (db: DbClient, input: { userId: string; jobId: string }) => Promise<any | null>;
  getLatestUserIngestionJobs: (db: DbClient, input: { userId: string; scope: string; limit: number }) => Promise<any[]>;
  listActiveUserIngestionJobs: (db: DbClient, input: { userId: string; scopes: string[]; limit: number }) => Promise<any[]>;
  listQueuedJobsForScopes: (input: { scopes: string[] }) => Promise<Array<{
    id: string;
    next_run_at: string | null;
    created_at: string | null;
  }>>;
  clampInt: (raw: unknown, fallbackValue: number, minValue: number, maxValue: number) => number;
  ingestionLatestMineLimiter: express.RequestHandler;
  workerConcurrency: number;
  queuedIngestionScopes: readonly string[];
  isQueuedIngestionScope: (scope: string) => boolean;
};
