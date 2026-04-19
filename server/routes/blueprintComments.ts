import type express from 'express';
import type {
  BlueprintCommentsRouteDeps,
  BlueprintCommentRouteItem,
  UserBlueprintCommentRouteItem,
} from '../contracts/api/blueprintComments';

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function parseSortMode(value: unknown): 'top' | 'new' {
  return String(value || '').trim().toLowerCase() === 'top' ? 'top' : 'new';
}

function parseLimit(value: unknown, fallback = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(numeric)));
}

async function readBlueprintAccess(input: {
  blueprintId: string;
  viewerUserId: string | null;
  deps: BlueprintCommentsRouteDeps;
}) {
  const db = input.deps.getServiceSupabaseClient();
  if (!db) {
    return {
      status: 500,
      body: {
        ok: false,
        error_code: 'CONFIG_ERROR',
        message: 'Service role client is not configured',
        data: null,
      },
      blueprint: null,
    } as const;
  }

  const { data: blueprint, error } = await db
    .from('blueprints')
    .select('id, creator_user_id, is_public')
    .eq('id', input.blueprintId)
    .maybeSingle();

  if (error) {
    return {
      status: 400,
      body: {
        ok: false,
        error_code: 'READ_FAILED',
        message: error.message,
        data: null,
      },
      blueprint: null,
    } as const;
  }

  if (!blueprint?.id) {
    return {
      status: 404,
      body: {
        ok: false,
        error_code: 'BLUEPRINT_NOT_FOUND',
        message: 'Blueprint not found',
        data: null,
      },
      blueprint: null,
    } as const;
  }

  const isOwner = Boolean(input.viewerUserId && input.viewerUserId === normalizeRequiredString(blueprint.creator_user_id));
  if (!blueprint.is_public && !isOwner) {
    return {
      status: 403,
      body: {
        ok: false,
        error_code: 'BLUEPRINT_PRIVATE',
        message: 'Blueprint is private',
        data: null,
      },
      blueprint: null,
    } as const;
  }

  return {
    status: 200,
    body: null,
    blueprint: {
      id: normalizeRequiredString(blueprint.id),
      creator_user_id: normalizeRequiredString(blueprint.creator_user_id),
      is_public: Boolean(blueprint.is_public),
    },
  } as const;
}

async function buildBlueprintCommentItems(input: {
  rows: Awaited<ReturnType<BlueprintCommentsRouteDeps['listBlueprintCommentRows']>>;
  deps: BlueprintCommentsRouteDeps;
}) {
  const db = input.deps.getServiceSupabaseClient();
  if (!db) throw new Error('Service role client is not configured');

  const userIds = Array.from(new Set(
    input.rows
      .map((row) => normalizeRequiredString(row.user_id))
      .filter(Boolean),
  ));

  const { data: profiles, error } = userIds.length > 0
    ? await db
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds)
    : { data: [] as Array<{ user_id: string; display_name: string | null; avatar_url: string | null }>, error: null };
  if (error) throw error;

  const profileMap = new Map((profiles || []).map((profile) => [
    normalizeRequiredString(profile.user_id),
    {
      display_name: profile.display_name || null,
      avatar_url: profile.avatar_url || null,
    },
  ]));

  return input.rows.map((row) => ({
    id: normalizeRequiredString(row.id),
    blueprint_id: normalizeRequiredString(row.blueprint_id),
    user_id: normalizeRequiredString(row.user_id),
    content: normalizeRequiredString(row.content),
    likes_count: Number(row.likes_count || 0),
    created_at: normalizeRequiredString(row.created_at),
    updated_at: normalizeRequiredString(row.updated_at),
    profile: profileMap.get(normalizeRequiredString(row.user_id)) || null,
  })) satisfies BlueprintCommentRouteItem[];
}

async function readProfileCommentsResponse(input: {
  profileUserId: string;
  viewerUserId: string | null;
  limit: number;
  deps: BlueprintCommentsRouteDeps;
}) {
  const db = input.deps.getServiceSupabaseClient();
  if (!db) {
    return {
      status: 500,
      body: {
        ok: false,
        error_code: 'CONFIG_ERROR',
        message: 'Service role client is not configured',
        data: null,
      },
    } as const;
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('user_id, is_public')
    .eq('user_id', input.profileUserId)
    .maybeSingle();
  if (profileError) {
    return {
      status: 400,
      body: {
        ok: false,
        error_code: 'READ_FAILED',
        message: profileError.message,
        data: null,
      },
    } as const;
  }

  if (!profile?.user_id) {
    return {
      status: 404,
      body: {
        ok: false,
        error_code: 'PROFILE_NOT_FOUND',
        message: 'Profile not found',
        data: null,
      },
    } as const;
  }

  const isOwnerView = Boolean(input.viewerUserId && input.viewerUserId === input.profileUserId);
  if (!profile.is_public && !isOwnerView) {
    return {
      status: 403,
      body: {
        ok: false,
        error_code: 'PROFILE_PRIVATE',
        message: 'Profile is private',
        data: null,
      },
    } as const;
  }

  const commentRows = await input.deps.listUserBlueprintCommentRows({
    userId: input.profileUserId,
    limit: input.limit,
  });
  const blueprintIds = Array.from(new Set(
    commentRows
      .map((row) => normalizeRequiredString(row.blueprint_id))
      .filter(Boolean),
  ));

  const { data: blueprints, error: blueprintError } = blueprintIds.length > 0
    ? await db
      .from('blueprints')
      .select('id, title')
      .in('id', blueprintIds)
      .eq('is_public', true)
    : { data: [] as Array<{ id: string; title: string }>, error: null };
  if (blueprintError) {
    return {
      status: 400,
      body: {
        ok: false,
        error_code: 'READ_FAILED',
        message: blueprintError.message,
        data: null,
      },
    } as const;
  }

  const titleMap = new Map((blueprints || []).map((row) => [
    normalizeRequiredString(row.id),
    normalizeRequiredString(row.title) || 'Blueprint',
  ]));

  const items = commentRows
    .filter((row) => titleMap.has(normalizeRequiredString(row.blueprint_id)))
    .map((row) => ({
      id: normalizeRequiredString(row.id),
      blueprint_id: normalizeRequiredString(row.blueprint_id),
      blueprint_title: titleMap.get(normalizeRequiredString(row.blueprint_id)) || 'Blueprint',
      content: normalizeRequiredString(row.content),
      created_at: normalizeRequiredString(row.created_at),
    })) satisfies UserBlueprintCommentRouteItem[];

  return {
    status: 200,
    body: {
      ok: true,
      error_code: null,
      message: 'profile comments',
      data: {
        profile_user_id: input.profileUserId,
        items,
      },
    },
  } as const;
}

export function registerBlueprintCommentRoutes(app: express.Express, deps: BlueprintCommentsRouteDeps) {
  app.get('/api/blueprints/:blueprintId/comments', async (req, res) => {
    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_BLUEPRINT_ID',
        message: 'Missing blueprint id',
        data: null,
      });
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

    try {
      const rows = await deps.listBlueprintCommentRows({
        blueprintId,
        sortMode: parseSortMode(req.query.sort),
        limit: parseLimit(req.query.limit, 100),
      });
      const items = await buildBlueprintCommentItems({
        rows,
        deps,
      });
      return res.json({
        ok: true,
        error_code: null,
        message: 'blueprint comments',
        data: {
          blueprint_id: blueprintId,
          items,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load comments',
        data: null,
      });
    }
  });

  app.post('/api/blueprints/:blueprintId/comments', async (req, res) => {
    const blueprintId = normalizeRequiredString(req.params.blueprintId);
    if (!blueprintId) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_BLUEPRINT_ID',
        message: 'Missing blueprint id',
        data: null,
      });
    }

    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error_code: 'AUTH_REQUIRED',
        message: 'Unauthorized',
        data: null,
      });
    }

    const access = await readBlueprintAccess({
      blueprintId,
      viewerUserId: userId,
      deps,
    });
    if (!access.blueprint) {
      return res.status(access.status).json(access.body);
    }

    const body = req.body && typeof req.body === 'object'
      ? req.body as Record<string, unknown>
      : {};
    const content = normalizeCommentContent(body.content);
    if (!content) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_CONTENT',
        message: 'Comment content is required',
        data: null,
      });
    }
    if (content.length > 2000) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_CONTENT',
        message: 'Comment content is too long',
        data: null,
      });
    }

    try {
      const row = await deps.createBlueprintCommentRow({
        blueprintId,
        userId,
        content,
      });
      const [item] = await buildBlueprintCommentItems({
        rows: [row],
        deps,
      });
      return res.status(201).json({
        ok: true,
        error_code: null,
        message: 'comment created',
        data: item,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create comment',
        data: null,
      });
    }
  });

  app.get('/api/profile/:userId/comments', async (req, res) => {
    const profileUserId = normalizeRequiredString(req.params.userId);
    if (!profileUserId) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_USER_ID',
        message: 'Missing profile user id',
        data: null,
      });
    }

    const viewerUserId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
    const result = await readProfileCommentsResponse({
      profileUserId,
      viewerUserId,
      limit: parseLimit(req.query.limit, 20),
      deps,
    });
    return res.status(result.status).json(result.body);
  });
}

function normalizeCommentContent(value: unknown) {
  return String(value || '').trim();
}
