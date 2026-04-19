import type express from 'express';
import type { BlueprintReadRouteDeps, BlueprintRouteDetail } from '../contracts/api/blueprintRead';

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

async function readBlueprintDetail(input: {
  blueprintId: string;
  viewerUserId: string | null;
  deps: BlueprintReadRouteDeps;
}) {
  let blueprint = await input.deps.getBlueprintRow({
    blueprintId: input.blueprintId,
  });
  if (!blueprint) {
    blueprint = await input.deps.syncBlueprintRowFromSupabase({
      blueprintId: input.blueprintId,
    });
  }
  if (!blueprint) {
    return {
      status: 404,
      body: withError('BLUEPRINT_NOT_FOUND', 'Blueprint not found'),
    } as const;
  }

  const isOwnerView = Boolean(input.viewerUserId && input.viewerUserId === blueprint.creator_user_id);
  if (!blueprint.is_public && !isOwnerView) {
    return {
      status: 403,
      body: withError('BLUEPRINT_PRIVATE', 'Blueprint is private'),
    } as const;
  }

  return {
    status: 200,
    body: withEnvelope<BlueprintRouteDetail>(blueprint, 'blueprint detail'),
  } as const;
}

export function registerBlueprintReadRoutes(app: express.Express, deps: BlueprintReadRouteDeps) {
  app.get('/api/blueprints/:blueprintId', async (req, res) => {
    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id'));
    }

    const viewerUserId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
    const result = await readBlueprintDetail({
      blueprintId,
      viewerUserId,
      deps,
    });

    return res.status(result.status).json(result.body);
  });

  app.post('/api/blueprints/:blueprintId/sync-state', async (req, res) => {
    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id'));
    }

    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    try {
      const blueprint = await deps.syncBlueprintReadState({
        blueprintId,
        userId,
      });
      if (!blueprint) {
        return res.status(404).json(withError('BLUEPRINT_NOT_FOUND', 'Blueprint not found'));
      }
      return res.status(200).json(withEnvelope(blueprint, 'blueprint state synced'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blueprint sync failed';
      return res.status(400).json(withError('SYNC_FAILED', message));
    }
  });
}
