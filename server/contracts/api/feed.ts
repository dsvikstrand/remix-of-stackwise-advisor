import type express from 'express';
import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type GeneratedBlueprint = {
  blueprintId: string;
  runId: string | null;
};

export type AutoChannelResult = {
  userFeedItemId: string;
  candidateId: string;
  channelSlug: string;
  decision: 'published' | 'rejected';
  reasonCode: string;
  classifierMode: string;
  classifierReason: string;
  classifierConfidence?: number | null;
};

export type RouteFeedItemRow = {
  id: string;
  user_id: string;
  source_item_id: string | null;
  blueprint_id: string | null;
  state: string;
  last_decision_code: string | null;
  created_at: string;
  updated_at: string;
};

export type RouteFeedItemPatch = {
  blueprint_id?: string | null;
  state?: string;
  last_decision_code?: string | null;
};

export type FeedRouteDeps = {
  autoChannelPipelineEnabled: boolean;
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  getServiceSupabaseClient: () => DbClient | null;
  saveGeneratedYouTubeBlueprintToFeed: (db: DbClient, input: {
    userId: string;
    videoUrl: string;
    title: string;
    blueprintId?: string | null;
    sourceChannelId?: string | null;
    sourceChannelTitle?: string | null;
    sourceChannelUrl?: string | null;
    metadata?: Record<string, unknown> | null;
    state?: string | null;
  }) => Promise<{
    sourceItem: {
      id: string;
      canonical_key: string;
      thumbnail_url: string | null;
    };
    feedItem: {
      id: string;
      blueprint_id: string | null;
      state: string;
    } | null;
    existing: boolean;
  }>;
  readChannelCandidateRows?: (input: {
    db: DbClient;
    feedItemIds: string[];
    statuses?: string[];
  }) => Promise<Array<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    created_at: string;
  }>>;
  readSourceRows?: (input: {
    db: DbClient;
    sourceIds: string[];
  }) => Promise<Array<{
    id: string;
    source_channel_id?: string | null;
    source_page_id?: string | null;
    source_url?: string | null;
    title?: string | null;
    source_channel_title?: string | null;
    thumbnail_url?: string | null;
    metadata?: unknown;
    source_native_id?: string | null;
  }>>;
  readFeedRows?: (input: {
    db: DbClient;
    userId: string;
    limit: number;
    sourceItemIds?: string[];
    requireBlueprint?: boolean;
  }) => Promise<Array<{
    id: string;
    user_id: string;
    source_item_id: string | null;
    blueprint_id: string | null;
    state: string;
    last_decision_code: string | null;
    generated_at_on_wall?: string | null;
    created_at: string;
    updated_at?: string;
  }>>;
  readPublicFeedRows?: (input: {
    db: DbClient;
    blueprintIds?: string[];
    state?: string;
    limit: number;
    cursor?: {
      created_at: string;
      id: string;
    } | null;
    requireBlueprint?: boolean;
  }) => Promise<Array<{
    id: string;
    user_id: string;
    source_item_id: string | null;
    blueprint_id: string | null;
    state: string;
    last_decision_code?: string | null;
    generated_at_on_wall?: string | null;
    created_at: string;
    updated_at?: string;
  }>>;
  readUnlockRows?: (db: DbClient, sourceIds: string[]) => Promise<Array<{
    source_item_id: string;
    status: string;
    estimated_cost: number | string;
    reservation_expires_at: string | null;
    blueprint_id: string | null;
    last_error_code: string | null;
    transcript_status: string | null;
  }>>;
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
  createBlueprintFromVideo: (db: DbClient, input: {
    userId: string;
    videoUrl: string;
    videoId: string;
    sourceTag: string;
    sourceItemId: string;
  }) => Promise<GeneratedBlueprint>;
  runAutoChannelForFeedItem: (input: {
    db: DbClient;
    userId: string;
    userFeedItemId: string;
    blueprintId: string;
    sourceItemId: string | null;
    sourceTag: string;
  }) => Promise<AutoChannelResult | null>;
};
