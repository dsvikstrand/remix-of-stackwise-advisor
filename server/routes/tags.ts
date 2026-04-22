import type express from 'express';
import type { TagsRouteDeps } from '../contracts/api/tags';

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeTagSlug(value: unknown) {
  return String(value || '').trim().toLowerCase();
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

function parseLimit(value: unknown, fallback = 200) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(5000, Math.floor(numeric)));
}

function parseCsvList(value: unknown) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function registerTagRoutes(app: express.Express, deps: TagsRouteDeps) {
  app.get('/api/tags', async (req, res) => {
    try {
      const viewerUserId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
      const items = await deps.listTags({
        viewerUserId,
        limit: parseLimit(req.query.limit, 200),
      });
      return res.status(200).json(withEnvelope({ items }, 'tags'));
    } catch (error) {
      return res.status(400).json(withError('READ_FAILED', error instanceof Error ? error.message : 'Failed to load tags'));
    }
  });

  app.get('/api/tags/by-slug', async (req, res) => {
    try {
      const slugs = parseCsvList(req.query.slugs).map((value) => normalizeTagSlug(value)).filter(Boolean);
      if (slugs.length === 0) {
        return res.status(400).json(withError('INVALID_INPUT', 'Provide slugs.'));
      }
      const viewerUserId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
      const items = await deps.listTagsBySlugs({
        slugs,
        viewerUserId,
      });
      return res.status(200).json(withEnvelope({ items }, 'tags by slug'));
    } catch (error) {
      return res.status(400).json(withError('READ_FAILED', error instanceof Error ? error.message : 'Failed to load tags by slug'));
    }
  });

  app.get('/api/tags/follows', async (req, res) => {
    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    try {
      const items = await deps.listFollowedTags({
        userId,
        limit: parseLimit(req.query.limit, 500),
      });
      return res.status(200).json(withEnvelope({ items }, 'followed tags'));
    } catch (error) {
      return res.status(400).json(withError('READ_FAILED', error instanceof Error ? error.message : 'Failed to load followed tags'));
    }
  });

  app.post('/api/tags', async (req, res) => {
    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const slug = normalizeTagSlug(body.slug);
    if (!slug) {
      return res.status(400).json(withError('INVALID_INPUT', 'Valid tag slug is required'));
    }

    try {
      const created = await deps.createTag({
        slug,
        userId,
        follow: body.follow !== false,
      });
      if (!created) {
        return res.status(400).json(withError('CREATE_FAILED', 'Failed to create tag'));
      }
      return res.status(200).json(withEnvelope(created, 'tag created'));
    } catch (error) {
      return res.status(400).json(withError('CREATE_FAILED', error instanceof Error ? error.message : 'Failed to create tag'));
    }
  });

  app.post('/api/tags/:tagId/follow', async (req, res) => {
    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const tagId = normalizeRequiredString(req.params.tagId);
    if (!tagId) {
      return res.status(400).json(withError('INVALID_TAG_ID', 'Missing tag id'));
    }

    try {
      const item = await deps.setTagFollowed({
        tagId,
        userId,
        followed: true,
      });
      if (!item) {
        return res.status(404).json(withError('TAG_NOT_FOUND', 'Tag not found'));
      }
      return res.status(200).json(withEnvelope(item, 'tag followed'));
    } catch (error) {
      return res.status(400).json(withError('FOLLOW_FAILED', error instanceof Error ? error.message : 'Failed to follow tag'));
    }
  });

  app.delete('/api/tags/:tagId/follow', async (req, res) => {
    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const tagId = normalizeRequiredString(req.params.tagId);
    if (!tagId) {
      return res.status(400).json(withError('INVALID_TAG_ID', 'Missing tag id'));
    }

    try {
      const item = await deps.setTagFollowed({
        tagId,
        userId,
        followed: false,
      });
      if (!item) {
        return res.status(404).json(withError('TAG_NOT_FOUND', 'Tag not found'));
      }
      return res.status(200).json(withEnvelope(item, 'tag unfollowed'));
    } catch (error) {
      return res.status(400).json(withError('UNFOLLOW_FAILED', error instanceof Error ? error.message : 'Failed to unfollow tag'));
    }
  });

  app.delete('/api/tags/follows', async (req, res) => {
    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const tagIds = Array.isArray(body.tag_ids)
      ? [...new Set(body.tag_ids.map((value) => normalizeRequiredString(value)).filter(Boolean))]
      : [];

    if (tagIds.length === 0) {
      return res.status(400).json(withError('INVALID_INPUT', 'Provide tag_ids.'));
    }

    try {
      const result = await deps.clearTagFollows({
        userId,
        tagIds,
      });
      return res.status(200).json(withEnvelope(result, 'tag follows cleared'));
    } catch (error) {
      return res.status(400).json(withError('UNFOLLOW_FAILED', error instanceof Error ? error.message : 'Failed to clear tag follows'));
    }
  });
}
