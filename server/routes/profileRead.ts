import type express from 'express';
import type {
  ProfileReadRouteDeps,
  ProfileRouteReadItem,
  ProfileRouteUpdateInput,
} from '../contracts/api/profileRead';

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeNullableString(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeOptionalBoolean(value: unknown) {
  if (value == null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized === 'true' || normalized === '1' || normalized === 't';
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

async function readProfile(input: {
  userId: string;
  viewerUserId: string | null;
  deps: ProfileReadRouteDeps;
}) {
  let profile = await input.deps.getProfileRow({
    userId: input.userId,
  });
  if (!profile) {
    profile = await input.deps.syncProfileRowFromSupabase({
      userId: input.userId,
    });
  }
  if (!profile) {
    return {
      status: 404,
      body: withError('PROFILE_NOT_FOUND', 'Profile not found'),
    } as const;
  }

  const isOwnerView = Boolean(input.viewerUserId && input.viewerUserId === input.userId);
  if (!profile.is_public && !isOwnerView) {
    return {
      status: 403,
      body: withError('PROFILE_PRIVATE', 'Profile is private'),
    } as const;
  }

  return {
    status: 200,
    body: withEnvelope<ProfileRouteReadItem>(profile, 'profile detail'),
  } as const;
}

export function registerProfileReadRoutes(app: express.Express, deps: ProfileReadRouteDeps) {
  app.get('/api/profile/:userId', async (req, res) => {
    const userId = normalizeRequiredString(req.params.userId);
    if (!userId) {
      return res.status(400).json(withError('INVALID_USER_ID', 'Missing profile user id'));
    }

    const viewerUserId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id) || null;
    const result = await readProfile({
      userId,
      viewerUserId,
      deps,
    });

    return res.status(result.status).json(result.body);
  });

  app.patch('/api/profile/me', async (req, res) => {
    const userId = normalizeRequiredString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('UNAUTHORIZED', 'Sign in required'));
    }

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const updates: ProfileRouteUpdateInput = {};
    if (Object.prototype.hasOwnProperty.call(body, 'display_name')) {
      updates.display_name = normalizeNullableString(body.display_name);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'avatar_url')) {
      updates.avatar_url = normalizeNullableString(body.avatar_url);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
      updates.bio = normalizeNullableString(body.bio);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'is_public')) {
      updates.is_public = normalizeOptionalBoolean(body.is_public);
    }

    try {
      const profile = await deps.updateOwnProfile({
        userId,
        updates,
      });
      if (!profile) {
        return res.status(404).json(withError('PROFILE_NOT_FOUND', 'Profile not found'));
      }
      return res.status(200).json(withEnvelope(profile, 'profile updated'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Profile update failed';
      return res.status(400).json(withError('UPDATE_FAILED', message));
    }
  });
}
