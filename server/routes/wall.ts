import type express from 'express';
import type { WallRouteDeps } from '../contracts/api/wall';
import { listWallBlueprintFeed, listWallForYouFeed } from '../services/wallFeed';

function normalizeScope(value: unknown) {
  const scope = String(value || '').trim().toLowerCase();
  if (scope === 'your-channels') return 'joined';
  return scope || 'all';
}

function normalizeSort(value: unknown): 'latest' | 'trending' {
  return String(value || '').trim().toLowerCase() === 'trending' ? 'trending' : 'latest';
}

export function registerWallRoutes(app: express.Express, deps: WallRouteDeps) {
  app.get('/api/wall/feed', async (req, res) => {
    const db = deps.getServiceSupabaseClient();
    if (!db) {
      return res.status(500).json({
        ok: false,
        error_code: 'CONFIG_ERROR',
        message: 'Service role client is not configured',
        data: null,
      });
    }

    try {
      const viewerUserId = String((res.locals.user as { id?: string } | undefined)?.id || '').trim() || null;
      const items = await listWallBlueprintFeed({
        db,
        scope: normalizeScope(req.query.scope),
        sort: normalizeSort(req.query.sort),
        viewerUserId,
        listBlueprintTagRows: deps.listBlueprintTagRows,
        readPublicFeedRows: deps.readPublicFeedRows,
        readSourceRows: deps.readSourceRows,
      });
      return res.json({
        ok: true,
        error_code: null,
        message: 'wall feed',
        data: {
          items,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load wall feed',
        data: null,
      });
    }
  });

  app.get('/api/wall/for-you', async (req, res) => {
    const userId = String((res.locals.user as { id?: string } | undefined)?.id || '').trim();
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error_code: 'AUTH_REQUIRED',
        message: 'Unauthorized',
        data: null,
      });
    }

    const db = deps.getServiceSupabaseClient();
    if (!db) {
      return res.status(500).json({
        ok: false,
        error_code: 'CONFIG_ERROR',
        message: 'Service role client is not configured',
        data: null,
      });
    }

    try {
      const items = await listWallForYouFeed({
        db,
        userId,
        normalizeTranscriptTruthStatus: deps.normalizeTranscriptTruthStatus,
        listBlueprintTagRows: deps.listBlueprintTagRows,
        readFeedRows: deps.readFeedRows,
        readSourceRows: deps.readSourceRows,
        readUnlockRows: deps.readUnlockRows,
        readActiveSubscriptions: deps.readActiveSubscriptions,
      });
      return res.json({
        ok: true,
        error_code: null,
        message: 'wall for you',
        data: {
          items,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load For You feed',
        data: null,
      });
    }
  });
}
