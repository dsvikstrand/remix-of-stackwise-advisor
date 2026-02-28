import type express from 'express';
import type { createClient } from '@supabase/supabase-js';
import type { CandidateEvaluationResult } from '../../gates/types';

type DbClient = ReturnType<typeof createClient>;

export type ChannelsRouteDeps = {
  rejectLegacyManualFlowIfDisabled: (res: express.Response) => boolean;
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  evaluateCandidateForChannel: (input: {
    title: string;
    llmReview: string | null;
    channelSlug: string;
    tagSlugs: string[];
    stepCount: number;
  }) => CandidateEvaluationResult;
};
