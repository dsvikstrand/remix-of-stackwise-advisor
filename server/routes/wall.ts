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

function normalizeLimit(value: unknown, fallback: number, max: number) {
  const parsed = Math.floor(Number(value));
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(1, Math.min(max, limit));
}

function normalizeCursor(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
      feedItemId?: unknown;
    };
    const createdAt = String(parsed.createdAt || '').trim();
    const id = String(parsed.id || parsed.feedItemId || '').trim();
    if (!createdAt || !id || !Number.isFinite(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(input: { createdAt?: string | null; id?: string | null } | null | undefined) {
  const createdAt = String(input?.createdAt || '').trim();
  const id = String(input?.id || '').trim();
  if (!createdAt || !id || !Number.isFinite(Date.parse(createdAt))) return null;
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');
}

async function isAdminUser(userId: string | null, deps: WallRouteDeps) {
  if (!userId || !deps.getCredits) return false;
  try {
    const credits = await deps.getCredits(userId) as { plan?: unknown } | null;
    return String(credits?.plan || '').trim().toLowerCase() === 'admin';
  } catch {
    return false;
  }
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
      const admin = await isAdminUser(viewerUserId, deps);
      const limit = normalizeLimit(req.query.limit, 120, admin ? 200 : 120);
      const cursor = admin ? normalizeCursor(req.query.cursor) : null;
      const page = await listWallBlueprintFeed({
        db,
        scope: normalizeScope(req.query.scope),
        sort: normalizeSort(req.query.sort),
        limit,
        cursor,
        viewerUserId,
        readLikedBlueprintIds: deps.readLikedBlueprintIds,
        listBlueprintTagRows: deps.listBlueprintTagRows,
        readPublicFeedRows: deps.readPublicFeedRows,
        readFollowedTagSlugs: deps.readFollowedTagSlugs,
        readSourceRows: deps.readSourceRows,
        readChannelCandidateRows: deps.readChannelCandidateRows,
        readBlueprintRows: deps.readBlueprintRows,
        readProfileRows: deps.readProfileRows,
      });
      return res.json({
        ok: true,
        error_code: null,
        message: 'wall feed',
        data: {
          items: page.items,
          next_cursor: admin ? encodeCursor(page.nextCursor) : null,
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
      const admin = await isAdminUser(userId, deps);
      const limit = normalizeLimit(req.query.limit, 200, admin ? 200 : 200);
      const cursor = admin ? normalizeCursor(req.query.cursor) : null;
      const page = await listWallForYouFeed({
        db,
        userId,
        limit,
        cursor,
        readLikedBlueprintIds: deps.readLikedBlueprintIds,
        normalizeTranscriptTruthStatus: deps.normalizeTranscriptTruthStatus,
        listBlueprintTagRows: deps.listBlueprintTagRows,
        readFeedRows: deps.readFeedRows,
        readSourceRows: deps.readSourceRows,
        readUnlockRows: deps.readUnlockRows,
        readChannelCandidateRows: deps.readChannelCandidateRows,
        readActiveSubscriptions: deps.readActiveSubscriptions,
        readBlueprintRows: deps.readBlueprintRows,
      });
      return res.json({
        ok: true,
        error_code: null,
        message: 'wall for you',
        data: {
          items: page.items,
          next_cursor: admin ? encodeCursor(page.nextCursor) : null,
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
