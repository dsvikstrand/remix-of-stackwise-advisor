import type express from 'express';
import type { ProfileHistoryResponse, ProfileRouteDeps } from '../contracts/api/profile';
import { resolveProfileHistory } from '../services/profileHistory';

async function readProfileHistoryResponse(input: {
  profileUserId: string;
  isOwnerView: boolean;
  deps: ProfileRouteDeps;
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

  if (!profile.is_public && !input.isOwnerView) {
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

  const history = await resolveProfileHistory({
    db,
    userId: input.profileUserId,
    normalizeTranscriptTruthStatus: input.deps.normalizeTranscriptTruthStatus,
    readFeedRows: input.deps.readFeedRows,
    readSourceRows: input.deps.readSourceRows,
    readUnlockRows: input.deps.readUnlockRows,
  });

  const data: ProfileHistoryResponse = {
    profile_user_id: input.profileUserId,
    is_owner_view: input.isOwnerView,
    items: history.items,
  };

  return {
    status: 200,
    body: {
      ok: true,
      error_code: null,
      message: 'profile history',
      data,
    },
  } as const;
}

export function registerProfileRoutes(app: express.Express, deps: ProfileRouteDeps) {
  const handleProfileHistoryRequest = async (req: express.Request, res: express.Response) => {
    const profileUserId = String(req.params.userId || '').trim();
    if (!profileUserId) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_USER_ID',
        message: 'Missing profile user id',
        data: null,
      });
    }

    const viewerUserId = String((res.locals.user as { id?: string } | undefined)?.id || '').trim() || null;
    const result = await readProfileHistoryResponse({
      profileUserId,
      isOwnerView: Boolean(viewerUserId && viewerUserId === profileUserId),
      deps,
    });
    return res.status(result.status).json(result.body);
  };

  app.get('/api/profile/:userId/history', handleProfileHistoryRequest);
  app.get('/api/profile/:userId/feed', handleProfileHistoryRequest);
}
