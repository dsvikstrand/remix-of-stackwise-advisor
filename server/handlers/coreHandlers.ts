import type express from 'express';
import type {
  AnalyzeBlueprintNormalizedPayload,
  CoreRouteDeps,
} from '../contracts/api/core';

export function handleHealth(_req: express.Request, res: express.Response, _deps: CoreRouteDeps) {
  res.json({ ok: true });
}

export async function handleCredits(_req: express.Request, res: express.Response, deps: CoreRouteDeps) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  let credits: Record<string, unknown>;
  try {
    credits = await deps.getCredits(userId) as Record<string, unknown>;
  } catch (error) {
    const errorCode = String((error as { code?: unknown } | null)?.code || '').trim().toUpperCase();
    if (errorCode === 'CREDITS_UNAVAILABLE') {
      return res.status(503).json({
        error: 'Credits backend unavailable.',
        error_code: 'CREDITS_UNAVAILABLE',
        credits_backend_mode: 'unavailable',
        credits_backend_ok: false,
        credits_backend_error: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
  return res.json(credits);
}

export async function handleAnalyzeBlueprint(req: express.Request, res: express.Response, deps: CoreRouteDeps) {
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
    if (creditCheck.reason === 'service' || String(creditCheck.errorCode || '').trim().toUpperCase() === 'CREDITS_UNAVAILABLE') {
      return res.status(503).json({
        error: 'Credits backend unavailable.',
        error_code: 'CREDITS_UNAVAILABLE',
      });
    }
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

  const payload: AnalyzeBlueprintNormalizedPayload = {
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
}

export async function handleGenerateBanner(req: express.Request, res: express.Response, deps: CoreRouteDeps) {
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
    if (creditCheck.reason === 'service' || String(creditCheck.errorCode || '').trim().toUpperCase() === 'CREDITS_UNAVAILABLE') {
      return res.status(503).json({
        error: 'Credits backend unavailable.',
        error_code: 'CREDITS_UNAVAILABLE',
      });
    }
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
}
