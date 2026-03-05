import type express from 'express';
import type { SafeParser } from './shared';

export type CreditCheck = {
  ok: boolean;
  reason?: 'global' | string;
  retryAfterSeconds?: number;
  remaining?: number;
  limit?: number;
  resetAt?: string | null;
};

export type GenerationDailyCapStatus = {
  enabled: boolean;
  plan: 'free' | 'plus' | 'admin';
  bypass: boolean;
  limit: number;
  effectiveLimit: number | null;
  used: number;
  remaining: number;
  usageDay: string;
  resetAt: string;
};

type AnalyzeBlueprintSelectedItemInput =
  | string
  | {
      name: string;
      context?: string;
    };

export type AnalyzeBlueprintInput = {
  title: string;
  inventoryTitle?: string;
  selectedItems: Record<string, AnalyzeBlueprintSelectedItemInput[]>;
  mixNotes?: string;
  reviewPrompt?: string;
  reviewSections?: string[];
  includeScore?: boolean;
};

export type AnalyzeBlueprintNormalizedPayload = {
  title: string;
  inventoryTitle?: string;
  selectedItems: Record<string, Array<{ name: string; context?: string }>>;
  mixNotes?: string;
  reviewPrompt?: string;
  reviewSections?: string[];
  includeScore?: boolean;
};

export type BannerInput = {
  title: string;
  inventoryTitle?: string;
  tags?: string[];
  dryRun?: boolean;
};

export type CoreLLMClient = {
  analyzeBlueprint: (payload: AnalyzeBlueprintNormalizedPayload) => Promise<string>;
  generateBanner: (payload: BannerInput) => Promise<{ mimeType: string; buffer: Buffer }>;
};

export type CoreRouteDeps = {
  creditsReadLimiter: express.RequestHandler;
  getCredits: (userId: string) => Promise<unknown>;
  getServiceSupabaseClient: () => any;
  getGenerationDailyCapStatus: (input: {
    db: any | null;
    userId: string;
  }) => Promise<GenerationDailyCapStatus>;
  blueprintReviewSchema: SafeParser<AnalyzeBlueprintInput>;
  bannerRequestSchema: SafeParser<BannerInput>;
  consumeCredit: (userId: string, input: { reasonCode: string }) => Promise<CreditCheck>;
  createLLMClient: () => CoreLLMClient;
  supabaseUrl: string;
};
