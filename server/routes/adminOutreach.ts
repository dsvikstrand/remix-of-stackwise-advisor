import type express from 'express';
import type { OutreachDraftGenerationResult, OutreachDraftHistoryRow } from '../services/outreachDrafts';
import { OutreachDraftError } from '../services/outreachDrafts';
import type { OutreachPostResult } from '../services/outreachPosting';
import type { OutreachCommentDeleteResult } from '../services/outreachCommentDeletion';
import type { OutreachPostedCommentVerificationResult } from '../services/outreachVerification';

type OutreachCandidateStatsRefreshResult = {
  requested: number;
  refreshed: number;
  skipped: number;
  quotaUnitsEstimated: number;
  items: Array<{
    sourceItemId: string;
    sourceChannelId: string | null;
    videoId: string | null;
    viewCount: number | null;
    commentCount: number | null;
    postedCommentsLast7Days: number | null;
    durationSeconds: number | null;
    status: 'refreshed' | 'skipped' | 'failed';
    errorMessage: string | null;
  }>;
};

type AdminOutreachDeps = {
  getCredits: (userId: string) => Promise<unknown>;
  generateOutreachDrafts: (input: {
    adminUserId: string;
    blueprintId: string;
  }) => Promise<OutreachDraftGenerationResult>;
  postOutreachDraft: (input: {
    adminUserId: string;
    draftId: string;
    finalText: string | null;
  }) => Promise<OutreachPostResult>;
  deleteOutreachComment?: (input: {
    adminUserId: string;
    draftId: string;
  }) => Promise<OutreachCommentDeleteResult>;
  listPostedDrafts?: (input: {
    adminUserId: string;
    limit: number;
  }) => Promise<OutreachDraftHistoryRow[]>;
  refreshCandidateStats?: (input: {
    adminUserId: string;
    sourceItemIds: string[];
  }) => Promise<OutreachCandidateStatsRefreshResult>;
  verifyPostedComments?: (input: {
    adminUserId: string;
    limit: number;
  }) => Promise<OutreachPostedCommentVerificationResult>;
};

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

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

async function requireAdmin(input: {
  userId: string;
  deps: AdminOutreachDeps;
}) {
  const credits = await input.deps.getCredits(input.userId) as { plan?: unknown } | null;
  return normalizeString(credits?.plan).toLowerCase() === 'admin';
}

export function registerAdminOutreachRoutes(app: express.Express, deps: AdminOutreachDeps) {
  app.get('/api/admin/outreach-drafts/posted', async (req, res) => {
    const userId = normalizeString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('AUTH_REQUIRED', 'Sign in required.'));
    }

    let isAdmin = false;
    try {
      isAdmin = await requireAdmin({ userId, deps });
    } catch (error) {
      return res.status(503).json(withError(
        'ADMIN_CHECK_UNAVAILABLE',
        error instanceof Error ? error.message : 'Could not verify admin entitlement.',
      ));
    }
    if (!isAdmin) {
      return res.status(403).json(withError('ADMIN_REQUIRED', 'Admin access required.'));
    }
    if (!deps.listPostedDrafts) {
      return res.status(500).json(withError('CONFIG_ERROR', 'Posted outreach draft listing is not configured.'));
    }

    const rawLimit = Math.floor(Number(req.query?.limit || 50));
    const limit = Math.max(1, Math.min(50, Number.isFinite(rawLimit) ? rawLimit : 50));

    try {
      const rows = await deps.listPostedDrafts({
        adminUserId: userId,
        limit,
        includeDeleted: true,
      });
      return res.json(withEnvelope({
        items: rows.map((row) => ({
          draftId: row.id,
          draftGroupId: row.draft_group_id,
          blueprintId: row.blueprint_id,
          sourceItemId: row.source_item_id,
          youtubeVideoId: row.youtube_video_id,
          videoUrl: row.video_url || null,
          sourceChannelTitle: row.source_channel_title || null,
          youtubeCommentId: row.youtube_comment_id || null,
          finalText: row.final_text,
          status: row.status || null,
          postedAt: row.posted_at || null,
          commentDeletedAt: row.comment_deleted_at || null,
        })),
      }, 'posted outreach drafts listed'));
    } catch (error) {
      if (error instanceof OutreachDraftError) {
        return res.status(error.status).json(withError(error.errorCode, error.message));
      }
      return res.status(500).json(withError(
        'POSTED_OUTREACH_DRAFTS_FAILED',
        error instanceof Error ? error.message : 'Could not list posted outreach drafts.',
      ));
    }
  });

  app.post('/api/admin/outreach-drafts/candidate-stats/refresh', async (req, res) => {
    const userId = normalizeString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('AUTH_REQUIRED', 'Sign in required.'));
    }

    let isAdmin = false;
    try {
      isAdmin = await requireAdmin({ userId, deps });
    } catch (error) {
      return res.status(503).json(withError(
        'ADMIN_CHECK_UNAVAILABLE',
        error instanceof Error ? error.message : 'Could not verify admin entitlement.',
      ));
    }
    if (!isAdmin) {
      return res.status(403).json(withError('ADMIN_REQUIRED', 'Admin access required.'));
    }
    if (!deps.refreshCandidateStats) {
      return res.status(500).json(withError('CONFIG_ERROR', 'Outreach stats refresh is not configured.'));
    }

    const body = req.body && typeof req.body === 'object'
      ? req.body as Record<string, unknown>
      : {};
    const sourceItemIds = Array.isArray(body.source_item_ids)
      ? body.source_item_ids.map(normalizeString).filter(Boolean)
      : [];
    if (sourceItemIds.length === 0) {
      return res.status(400).json(withError('INVALID_SOURCE_ITEM_IDS', 'Select at least one source item.'));
    }
    if (sourceItemIds.length > 50) {
      return res.status(400).json(withError('TOO_MANY_SOURCE_ITEM_IDS', 'Select at most 50 source items.'));
    }

    try {
      const result = await deps.refreshCandidateStats({
        adminUserId: userId,
        sourceItemIds,
      });
      return res.json(withEnvelope(result, 'outreach candidate stats refreshed'));
    } catch (error) {
      if (error instanceof OutreachDraftError) {
        return res.status(error.status).json(withError(error.errorCode, error.message));
      }
      return res.status(500).json(withError(
        'OUTREACH_STATS_REFRESH_FAILED',
        error instanceof Error ? error.message : 'Could not refresh outreach candidate stats.',
      ));
    }
  });

  app.post('/api/admin/outreach-drafts/generate', async (req, res) => {
    const userId = normalizeString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('AUTH_REQUIRED', 'Sign in required.'));
    }

    let isAdmin = false;
    try {
      isAdmin = await requireAdmin({ userId, deps });
    } catch (error) {
      return res.status(503).json(withError(
        'ADMIN_CHECK_UNAVAILABLE',
        error instanceof Error ? error.message : 'Could not verify admin entitlement.',
      ));
    }
    if (!isAdmin) {
      return res.status(403).json(withError('ADMIN_REQUIRED', 'Admin access required.'));
    }

    const body = req.body && typeof req.body === 'object'
      ? req.body as Record<string, unknown>
      : {};
    const blueprintId = normalizeString(body.blueprint_id);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id.'));
    }

    try {
      const result = await deps.generateOutreachDrafts({
        adminUserId: userId,
        blueprintId,
      });
      return res.status(201).json(withEnvelope(result, 'outreach drafts generated'));
    } catch (error) {
      if (error instanceof OutreachDraftError) {
        return res.status(error.status).json(withError(error.errorCode, error.message));
      }
      return res.status(500).json(withError(
        'OUTREACH_DRAFT_FAILED',
        error instanceof Error ? error.message : 'Could not generate outreach drafts.',
      ));
    }
  });

  app.post('/api/admin/outreach-drafts/posted-comments/verify', async (req, res) => {
    const userId = normalizeString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('AUTH_REQUIRED', 'Sign in required.'));
    }

    let isAdmin = false;
    try {
      isAdmin = await requireAdmin({ userId, deps });
    } catch (error) {
      return res.status(503).json(withError(
        'ADMIN_CHECK_UNAVAILABLE',
        error instanceof Error ? error.message : 'Could not verify admin entitlement.',
      ));
    }
    if (!isAdmin) {
      return res.status(403).json(withError('ADMIN_REQUIRED', 'Admin access required.'));
    }
    if (!deps.verifyPostedComments) {
      return res.status(500).json(withError('CONFIG_ERROR', 'Outreach comment verification is not configured.'));
    }

    const body = req.body && typeof req.body === 'object'
      ? req.body as Record<string, unknown>
      : {};
    const rawLimit = Math.floor(Number(body.limit || 10));
    const limit = rawLimit <= 10 ? 10 : rawLimit <= 25 ? 25 : 50;

    try {
      const result = await deps.verifyPostedComments({
        adminUserId: userId,
        limit,
      });
      return res.json(withEnvelope(result, 'outreach posted comments verified'));
    } catch (error) {
      if (error instanceof OutreachDraftError) {
        return res.status(error.status).json(withError(error.errorCode, error.message));
      }
      return res.status(500).json(withError(
        'OUTREACH_COMMENT_VERIFY_FAILED',
        error instanceof Error ? error.message : 'Could not verify posted outreach comments.',
      ));
    }
  });

  app.post('/api/admin/outreach-drafts/:draftId/post', async (req, res) => {
    const userId = normalizeString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('AUTH_REQUIRED', 'Sign in required.'));
    }

    let isAdmin = false;
    try {
      isAdmin = await requireAdmin({ userId, deps });
    } catch (error) {
      return res.status(503).json(withError(
        'ADMIN_CHECK_UNAVAILABLE',
        error instanceof Error ? error.message : 'Could not verify admin entitlement.',
      ));
    }
    if (!isAdmin) {
      return res.status(403).json(withError('ADMIN_REQUIRED', 'Admin access required.'));
    }

    const draftId = normalizeString(req.params?.draftId);
    if (!draftId) {
      return res.status(400).json(withError('INVALID_DRAFT_ID', 'Missing outreach draft id.'));
    }
    const body = req.body && typeof req.body === 'object'
      ? req.body as Record<string, unknown>
      : {};
    const finalText = normalizeString(body.final_text) || null;

    try {
      const result = await deps.postOutreachDraft({
        adminUserId: userId,
        draftId,
        finalText,
      });
      return res.status(201).json(withEnvelope(result, 'outreach comment posted'));
    } catch (error) {
      if (error instanceof OutreachDraftError) {
        return res.status(error.status).json(withError(error.errorCode, error.message));
      }
      return res.status(500).json(withError(
        'OUTREACH_POST_FAILED',
        error instanceof Error ? error.message : 'Could not post outreach comment.',
      ));
    }
  });

  app.delete('/api/admin/outreach-drafts/:draftId/comment', async (req, res) => {
    const userId = normalizeString((res.locals.user as { id?: string } | undefined)?.id);
    if (!userId) {
      return res.status(401).json(withError('AUTH_REQUIRED', 'Sign in required.'));
    }

    let isAdmin = false;
    try {
      isAdmin = await requireAdmin({ userId, deps });
    } catch (error) {
      return res.status(503).json(withError(
        'ADMIN_CHECK_UNAVAILABLE',
        error instanceof Error ? error.message : 'Could not verify admin entitlement.',
      ));
    }
    if (!isAdmin) {
      return res.status(403).json(withError('ADMIN_REQUIRED', 'Admin access required.'));
    }
    if (!deps.deleteOutreachComment) {
      return res.status(500).json(withError('CONFIG_ERROR', 'Outreach comment removal is not configured.'));
    }

    const draftId = normalizeString(req.params?.draftId);
    if (!draftId) {
      return res.status(400).json(withError('INVALID_DRAFT_ID', 'Missing outreach draft id.'));
    }

    try {
      const result = await deps.deleteOutreachComment({
        adminUserId: userId,
        draftId,
      });
      return res.json(withEnvelope(result, 'outreach comment removed'));
    } catch (error) {
      if (error instanceof OutreachDraftError) {
        return res.status(error.status).json(withError(error.errorCode, error.message));
      }
      return res.status(500).json(withError(
        'OUTREACH_COMMENT_REMOVE_FAILED',
        error instanceof Error ? error.message : 'Could not remove outreach comment.',
      ));
    }
  });
}
