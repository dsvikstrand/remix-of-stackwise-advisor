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

export type FeedRouteDeps = {
  autoChannelPipelineEnabled: boolean;
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  getServiceSupabaseClient: () => DbClient | null;
  syncFeedRowsByIds: (db: DbClient, feedItemIds: string[], action: string) => Promise<void>;
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
