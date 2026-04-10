import type express from 'express';
import type { createClient } from '@supabase/supabase-js';
import type { CandidateEvaluationResult } from '../../gates/types';
import type { RouteFeedItemPatch, RouteFeedItemRow } from './feed';

type DbClient = ReturnType<typeof createClient>;

export type ChannelsRouteDeps = {
  rejectLegacyManualFlowIfDisabled: (res: express.Response) => boolean;
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  getServiceSupabaseClient: () => DbClient | null;
  listBlueprintTagRows?: (input: {
    blueprintIds: string[];
  }) => Promise<Array<{
    blueprint_id: string;
    tag_id: string;
    tag_slug: string;
  }>>;
  listBlueprintTagSlugs?: (input: {
    blueprintId: string;
  }) => Promise<string[]>;
  attachBlueprintTag?: (input: {
    blueprintId: string;
    tagId: string;
    tagSlug: string;
  }) => Promise<void>;
  getFeedItemById: (db: DbClient, input: {
    feedItemId: string;
    userId?: string | null;
  }) => Promise<RouteFeedItemRow | null>;
  patchFeedItemById: (db: DbClient, input: {
    feedItemId: string;
    userId?: string | null;
    patch: RouteFeedItemPatch;
    action: string;
    current?: RouteFeedItemRow | null;
  }) => Promise<RouteFeedItemRow | null>;
  evaluateCandidateForChannel: (input: {
    title: string;
    llmReview: string | null;
    channelSlug: string;
    tagSlugs: string[];
    stepCount: number;
  }) => CandidateEvaluationResult;
};
