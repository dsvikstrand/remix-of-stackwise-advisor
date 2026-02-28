import type express from 'express';

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
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/credits', deps.creditsReadLimiter, async (_req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const credits = await deps.getCredits(userId);
    return res.json(credits);
  });

  app.post('/api/analyze-blueprint', async (req, res) => {
    const parsed = deps.blueprintReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const creditCheck = await deps.consumeCredit(userId, {
      reasonCode: 'BLUEPRINT_REVIEW',
    });
    if (!creditCheck.ok) {
      if (creditCheck.reason === 'global') {
        return res.status(429).json({
          error: 'We\'re at capacity right now. Please try again in a few minutes.',
          retryAfterSeconds: creditCheck.retryAfterSeconds,
        });
      }
      return res.status(429).json({
        error: 'Insufficient credits right now. Please wait for refill and try again.',
        remaining: creditCheck.remaining,
        limit: creditCheck.limit,
        resetAt: creditCheck.resetAt,
      });
    }

    const normalizedItems: Record<string, Array<{ name: string; context?: string }>> = {};
    Object.entries(parsed.data.selectedItems).forEach(([category, items]) => {
      const normalized = items.map((item) => {
        if (typeof item === 'string') {
          return { name: item };
        }
        return { name: item.name, context: item.context };
      });
      normalizedItems[category] = normalized;
    });

    const payload = {
      title: parsed.data.title,
      inventoryTitle: parsed.data.inventoryTitle,
      selectedItems: normalizedItems,
      mixNotes: parsed.data.mixNotes,
      reviewPrompt: parsed.data.reviewPrompt,
      reviewSections: parsed.data.reviewSections,
      includeScore: parsed.data.includeScore,
    };

    try {
      const client = deps.createLLMClient();
      const review = await client.analyzeBlueprint(payload);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chunkSize = 200;
      for (let i = 0; i < review.length; i += chunkSize) {
        const chunk = review.slice(i, i + chunkSize);
        const frame = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
        res.write(`data: ${frame}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/generate-banner', async (req, res) => {
    const parsed = deps.bannerRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    if (!deps.supabaseUrl) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const creditCheck = await deps.consumeCredit(userId, {
      reasonCode: 'BANNER_GENERATE',
    });
    if (!creditCheck.ok) {
      if (creditCheck.reason === 'global') {
        return res.status(429).json({
          error: 'We\'re at capacity right now. Please try again in a few minutes.',
          retryAfterSeconds: creditCheck.retryAfterSeconds,
        });
      }
      return res.status(429).json({
        error: 'Insufficient credits right now. Please wait for refill and try again.',
        remaining: creditCheck.remaining,
        limit: creditCheck.limit,
        resetAt: creditCheck.resetAt,
      });
    }

    try {
      const client = deps.createLLMClient();
      const result = await client.generateBanner(parsed.data);

      if (parsed.data.dryRun) {
        return res.json({
          contentType: result.mimeType,
          imageBase64: result.buffer.toString('base64'),
        });
      }

      const uploadUrl = `${deps.supabaseUrl.replace(/\/$/, '')}/functions/v1/upload-banner`;
      const imageBase64 = result.buffer.toString('base64');
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          contentType: result.mimeType,
          imageBase64,
        }),
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        return res.status(uploadResponse.status).json({
          error: (errorData as { error?: string }).error || 'Banner upload failed',
        });
      }

      const uploadData = (await uploadResponse.json()) as { bannerUrl?: string };
      if (!uploadData?.bannerUrl) {
        return res.status(500).json({ error: 'Banner URL missing from upload' });
      }

      return res.json({
        bannerUrl: uploadData.bannerUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: message });
    }
  });
}
