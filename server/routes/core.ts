import type express from 'express';
import {
  handleAnalyzeBlueprint,
  handleCredits,
  handleGenerateBanner,
  handleHealth,
} from '../handlers/coreHandlers';

type CreditCheck = {
  ok: boolean;
  reason?: 'global' | string;
  retryAfterSeconds?: number;
  remaining?: number;
  limit?: number;
  resetAt?: string | null;
};

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { flatten: () => unknown } };

type SafeParser<T> = {
  safeParse: (input: unknown) => ParseResult<T>;
};

type AnalyzeBlueprintInput = {
  title: string;
  inventoryTitle?: string;
  selectedItems: Record<string, Array<string | { name: string; context?: string }>>;
  mixNotes?: string;
  reviewPrompt?: string;
  reviewSections?: string[];
  includeScore?: boolean;
};

type BannerInput = {
  dryRun?: boolean;
};

type LLMClient = {
  analyzeBlueprint: (payload: unknown) => Promise<string>;
  generateBanner: (payload: unknown) => Promise<{ mimeType: string; buffer: Buffer }>;
};

export type CoreRouteDeps = {
  creditsReadLimiter: express.RequestHandler;
  getCredits: (userId: string) => Promise<unknown>;
  blueprintReviewSchema: SafeParser<AnalyzeBlueprintInput>;
  bannerRequestSchema: SafeParser<BannerInput>;
  consumeCredit: (userId: string, input: { reasonCode: string }) => Promise<CreditCheck>;
  createLLMClient: () => LLMClient;
  supabaseUrl: string;
};

export function registerCoreRoutes(app: express.Express, deps: CoreRouteDeps) {
  app.get('/api/health', (req, res) => handleHealth(req, res, deps));

  app.get('/api/credits', deps.creditsReadLimiter, (req, res) => handleCredits(req, res, deps));

  app.post('/api/analyze-blueprint', (req, res) => handleAnalyzeBlueprint(req, res, deps));

  app.post('/api/generate-banner', (req, res) => handleGenerateBanner(req, res, deps));
}
