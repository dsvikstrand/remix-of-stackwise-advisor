import type express from 'express';
import type {
  BlueprintLikesRouteDeps,
  BlueprintLikeStateRouteItem,
} from '../contracts/api/blueprintLikes';

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function withEnvelope<T>(data: T, message: string) {
  return {
    ok: true,
    error_code: null,
    message,
    data,
  } as const;
}

function withError(errorCode: string, message: string, data: unknown = null) {
  return {
    ok: false,
    error_code: errorCode,
    message,
    data,
  } as const;
}

function parseLimit(value: unknown, fallback = 500) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(5000, Math.floor(numeric)));
}

async function readBlueprintAccess(input: {
  blueprintId: string;
  viewerUserId: string | null;
  deps: BlueprintLikesRouteDeps;
}) {
  const blueprint = await input.deps.getBlueprintRow({
    blueprintId: input.blueprintId,
  });
  if (!blueprint?.id) {
    return {
      status: 404,
      body: withError('BLUEPRINT_NOT_FOUND', 'Blueprint not found'),
      blueprint: null,
    } as const;
  }

  const isOwner = Boolean(input.viewerUserId && input.viewerUserId === normalizeRequiredString(blueprint.creator_user_id));
  if (!blueprint.is_public && !isOwner) {
    return {
      status: 403,
      body: withError('BLUEPRINT_PRIVATE', 'Blueprint is private'),
      blueprint: null,
    } as const;
  }

  return {
    status: 200,
    body: null,
    blueprint: {
      id: normalizeRequiredString(blueprint.id),
      creator_user_id: normalizeRequiredString(blueprint.creator_user_id),
      likes_count: Math.max(0, Math.floor(Number(blueprint.likes_count || 0))),
      is_public: Boolean(blueprint.is_public),
    },
  } as const;
}

function withLikeStateFallback(blueprintId: string, likesCount: number, userLiked = false) {
  return {
    blueprint_id: blueprintId,
    user_liked: userLiked,
    likes_count: Math.max(0, Math.floor(Number(likesCount || 0))),
  } satisfies BlueprintLikeStateRouteItem;
}

export function registerBlueprintLikeRoutes(app: express.Express, deps: BlueprintLikesRouteDeps) {
  app.get('/api/blueprints/:blueprintId/like-state', async (req, res) => {
    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id'));
    }

    const viewerUserId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
    const access = await readBlueprintAccess({
      blueprintId,
      viewerUserId,
      deps,
    });
    if (!access.blueprint) {
      return res.status(access.status).json(access.body);
    }

    const state = await deps.getBlueprintLikeState({
      blueprintId,
      userId: viewerUserId,
    });

    return res.status(200).json(withEnvelope(
      state || withLikeStateFallback(blueprintId, access.blueprint.likes_count, false),
      'blueprint like state',
    ));
  });

  app.post('/api/blueprint-likes/state', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const blueprintIds = Array.isArray(body.blueprint_ids)
      ? [...new Set(body.blueprint_ids.map((value) => normalizeRequiredString(value)).filter(Boolean))]
      : [];
    if (blueprintIds.length === 0) {
      return res.status(200).json(withEnvelope<{ items: Array<{ blueprint_id: string; user_liked: boolean }> }>({
        items: [],
      }, 'blueprint like states'));
    }

    const viewerUserId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
    const items = await deps.listBlueprintLikeStates({
      blueprintIds,
      userId: viewerUserId,
    });
    return res.status(200).json(withEnvelope({ items }, 'blueprint like states'));
  });

  app.get('/api/me/blueprint-likes', async (req, res) => {
    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const blueprintIds = await deps.listLikedBlueprintIds({
      userId,
      limit: parseLimit(req.query.limit, 500),
    });
    return res.status(200).json(withEnvelope({ blueprint_ids: blueprintIds }, 'liked blueprints'));
  });

  app.post('/api/blueprints/:blueprintId/like', async (req, res) => {
    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id'));
    }

    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const access = await readBlueprintAccess({
      blueprintId,
      viewerUserId: userId,
      deps,
    });
    if (!access.blueprint) {
      return res.status(access.status).json(access.body);
    }

    const state = await deps.setBlueprintLiked({
      blueprintId,
      userId,
      liked: true,
    });
    if (!state) {
      return res.status(404).json(withError('BLUEPRINT_NOT_FOUND', 'Blueprint not found'));
    }

    return res.status(200).json(withEnvelope(state, 'blueprint liked'));
  });

  app.delete('/api/blueprints/:blueprintId/like', async (req, res) => {
    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id'));
    }

    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const access = await readBlueprintAccess({
      blueprintId,
      viewerUserId: userId,
      deps,
    });
    if (!access.blueprint) {
      return res.status(access.status).json(access.body);
    }

    const state = await deps.setBlueprintLiked({
      blueprintId,
      userId,
      liked: false,
    });
    if (!state) {
      return res.status(404).json(withError('BLUEPRINT_NOT_FOUND', 'Blueprint not found'));
    }

    return res.status(200).json(withEnvelope(state, 'blueprint unliked'));
  });
}
