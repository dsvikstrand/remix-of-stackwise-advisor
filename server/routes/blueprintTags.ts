import type express from 'express';
import type { BlueprintTagReadsRouteDeps } from '../contracts/api/blueprintTags';

function parseCsvList(value: unknown) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function registerBlueprintTagReadRoutes(app: express.Express, deps: BlueprintTagReadsRouteDeps) {
  app.get('/api/blueprint-tags', async (req, res) => {
    if (!deps.getServiceSupabaseClient()) {
      return res.status(500).json({
        ok: false,
        error_code: 'CONFIG_ERROR',
        message: 'Service role client is not configured',
        data: null,
      });
    }

    try {
      const blueprintIds = parseCsvList(req.query.blueprint_ids);
      const tagIds = parseCsvList(req.query.tag_ids);
      const tagSlugs = parseCsvList(req.query.tag_slugs).map((value) => value.toLowerCase());
      if (blueprintIds.length === 0 && tagIds.length === 0 && tagSlugs.length === 0) {
        return res.status(400).json({
          ok: false,
          error_code: 'INVALID_INPUT',
          message: 'Provide blueprint_ids, tag_ids, or tag_slugs.',
          data: null,
        });
      }

      const rows = blueprintIds.length > 0
        ? await deps.listBlueprintTagRows({ blueprintIds })
        : await deps.listBlueprintTagRowsByFilters({ tagIds, tagSlugs });

      return res.json({
        ok: true,
        error_code: null,
        message: 'blueprint tag rows',
        data: {
          items: rows,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load blueprint tag rows.',
        data: null,
      });
    }
  });
}
