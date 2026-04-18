import type express from 'express';
import type { createClient } from '@supabase/supabase-js';
import type { CandidateEvaluationResult } from '../../gates/types';
import type { RouteFeedItemPatch, RouteFeedItemRow } from './feed';

type DbClient = ReturnType<typeof createClient>;

export type ChannelsRouteDeps = {
  rejectLegacyManualFlowIfDisabled: (res: express.Response) => boolean;
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  getServiceSupabaseClient: () => DbClient | null;
  listBlueprintTagRows: (input: {
    blueprintIds: string[];
  }) => Promise<Array<{
    blueprint_id: string;
    tag_id: string;
    tag_slug: string;
  }>>;
  listBlueprintTagSlugs: (input: {
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
  listChannelCandidateRows: (db: DbClient, input: {
    feedItemIds?: string[];
    candidateIds?: string[];
    channelSlug?: string | null;
    statuses?: string[];
    limit?: number;
  }) => Promise<Array<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    submitted_by_user_id: string;
    created_at: string;
    updated_at: string;
  }>>;
  getChannelCandidateById: (db: DbClient, input: {
    candidateId: string;
  }) => Promise<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    submitted_by_user_id: string;
    created_at: string;
    updated_at: string;
  } | null>;
  upsertChannelCandidate: (db: DbClient, input: {
    row: {
      id?: string;
      user_feed_item_id: string;
      channel_slug: string;
      submitted_by_user_id: string;
      status: string;
      created_at?: string | null;
      updated_at?: string | null;
    };
  }) => Promise<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    submitted_by_user_id: string;
    created_at: string;
    updated_at: string;
  }>;
  updateChannelCandidateStatus: (db: DbClient, input: {
    candidateId: string;
    status: string;
  }) => Promise<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    submitted_by_user_id: string;
    created_at: string;
    updated_at: string;
  } | null>;
  listChannelGateDecisions: (db: DbClient, input: {
    candidateId: string;
  }) => Promise<Array<{
    id: string;
    candidate_id: string;
    gate_id: string;
    outcome: string;
    reason_code: string;
    score: number | null;
    policy_version: string;
    method_version: string | null;
    created_at: string;
  }>>;
  insertChannelGateDecisions: (db: DbClient, input: {
    candidateId: string;
    decisions: Array<{
      gate_id: string;
      outcome: 'pass' | 'warn' | 'block';
      reason_code: string;
      score?: number | null;
      method_version?: string;
    }>;
  }) => Promise<void>;
  evaluateCandidateForChannel: (input: {
    title: string;
    llmReview: string | null;
    channelSlug: string;
    tagSlugs: string[];
    stepCount: number;
  }) => CandidateEvaluationResult;
};
