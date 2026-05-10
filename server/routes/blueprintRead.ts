import type express from 'express';
import type { BlueprintReadRouteDeps, BlueprintRouteDetail } from '../contracts/api/blueprintRead';

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeNullableString(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(
    value
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean),
  )).slice(0, 12);
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeCsv(value: unknown, maxItems = 500) {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry || '').split(','))
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeLimit(value: unknown, fallback = 24, max = 500) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(numeric)));
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
  const blueprint = await input.deps.getBlueprintRow({
    blueprintId: input.blueprintId,
  });
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
  app.post('/api/blueprints', async (req, res) => {
    if (!deps.createBlueprintRow) {
      return res.status(500).json(withError('CONFIG_ERROR', 'Blueprint write route is not configured'));
    }

    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const title = normalizeRequiredString(body.title);
    if (!title) {
      return res.status(400).json(withError('VALIDATION_ERROR', 'Blueprint title is required.'));
    }

    try {
      const blueprint = await deps.createBlueprintRow({
        userId,
        inventoryId: normalizeNullableString(body.inventory_id),
        title,
        selectedItems: (body.selected_items ?? null) as never,
        steps: (body.steps ?? null) as never,
        sectionsJson: (body.sections_json ?? null) as never,
        mixNotes: normalizeNullableString(body.mix_notes),
        reviewPrompt: normalizeNullableString(body.review_prompt),
        bannerUrl: normalizeNullableString(body.banner_url),
        llmReview: normalizeNullableString(body.llm_review),
        previewSummary: normalizeNullableString(body.preview_summary),
        generationControls: (body.generation_controls ?? null) as never,
        tags: normalizeTags(body.tags),
        isPublic: normalizeBoolean(body.is_public, false),
        sourceBlueprintId: normalizeNullableString(body.source_blueprint_id),
      });

      return res.status(201).json(withEnvelope(blueprint, 'blueprint created'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blueprint create failed';
      return res.status(400).json(withError('WRITE_FAILED', message));
    }
  });

  app.get('/api/blueprints', async (req, res) => {
    if (!deps.listBlueprintRows) {
      return res.status(500).json(withError('CONFIG_ERROR', 'Blueprint list route is not configured'));
    }

    const viewerUserId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
    const visibilityRaw = normalizeRequiredString(req.query.visibility).toLowerCase();
    const visibility = visibilityRaw === 'public_or_owner' ? 'public_or_owner' : 'public';
    const sortRaw = normalizeRequiredString(req.query.sort).toLowerCase();
    const sort = sortRaw === 'popular' ? 'popular' : 'latest';

    try {
      const result = await deps.listBlueprintRows({
        viewerUserId,
        blueprintIds: normalizeCsv(req.query.ids),
        titleQuery: normalizeNullableString(req.query.q),
        visibility,
        sort,
        limit: normalizeLimit(req.query.limit, 24, 500),
        requireSectionsJson: normalizeBoolean(req.query.require_sections, false),
        requireBannerUrl: normalizeBoolean(req.query.require_banner, false),
        includeTotal: normalizeBoolean(req.query.include_total, false),
      });

      return res.status(200).json(withEnvelope(result, 'blueprint list'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blueprint list failed';
      return res.status(400).json(withError('READ_FAILED', message));
    }
  });

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

  app.patch('/api/blueprints/:blueprintId', async (req, res) => {
    if (!deps.updateBlueprintRow) {
      return res.status(500).json(withError('CONFIG_ERROR', 'Blueprint write route is not configured'));
    }

    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id'));
    }

    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const title = normalizeRequiredString(body.title);
    if (!title) {
      return res.status(400).json(withError('VALIDATION_ERROR', 'Blueprint title is required.'));
    }

    try {
      const blueprint = await deps.updateBlueprintRow({
        blueprintId,
        userId,
        inventoryId: normalizeNullableString(body.inventory_id),
        title,
        selectedItems: (body.selected_items ?? null) as never,
        steps: (body.steps ?? null) as never,
        sectionsJson: (body.sections_json ?? null) as never,
        mixNotes: normalizeNullableString(body.mix_notes),
        reviewPrompt: normalizeNullableString(body.review_prompt),
        bannerUrl: normalizeNullableString(body.banner_url),
        llmReview: normalizeNullableString(body.llm_review),
        previewSummary: normalizeNullableString(body.preview_summary),
        generationControls: (body.generation_controls ?? null) as never,
        tags: normalizeTags(body.tags),
        isPublic: normalizeBoolean(body.is_public, false),
        sourceBlueprintId: normalizeNullableString(body.source_blueprint_id),
      });
      if (!blueprint) {
        return res.status(404).json(withError('BLUEPRINT_NOT_FOUND', 'Blueprint not found'));
      }

      return res.status(200).json(withEnvelope(blueprint, 'blueprint updated'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blueprint update failed';
      return res.status(400).json(withError('WRITE_FAILED', message));
    }
  });

  app.patch('/api/blueprints/:blueprintId/fields', async (req, res) => {
    if (!deps.patchBlueprintFields) {
      return res.status(500).json(withError('CONFIG_ERROR', 'Blueprint field patch route is not configured'));
    }

    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id'));
    }

    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const patch = {
      ...(Object.prototype.hasOwnProperty.call(body, 'llm_review') ? { llmReview: normalizeNullableString(body.llm_review) } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, 'banner_url') ? { bannerUrl: normalizeNullableString(body.banner_url) } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, 'preview_summary') ? { previewSummary: normalizeNullableString(body.preview_summary) } : {}),
    };
    if (Object.keys(patch).length === 0) {
      return res.status(400).json(withError('VALIDATION_ERROR', 'No supported fields provided.'));
    }

    try {
      const blueprint = await deps.patchBlueprintFields({
        blueprintId,
        userId,
        ...patch,
      });
      if (!blueprint) {
        return res.status(404).json(withError('BLUEPRINT_NOT_FOUND', 'Blueprint not found'));
      }
      return res.status(200).json(withEnvelope(blueprint, 'blueprint fields updated'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blueprint field patch failed';
      return res.status(400).json(withError('WRITE_FAILED', message));
    }
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
