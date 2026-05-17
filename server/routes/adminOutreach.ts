import type express from 'express';
import type { OutreachDraftGenerationResult } from '../services/outreachDrafts';
import { OutreachDraftError } from '../services/outreachDrafts';

type AdminOutreachDeps = {
  getCredits: (userId: string) => Promise<unknown>;
  generateOutreachDrafts: (input: {
    adminUserId: string;
    blueprintId: string;
  }) => Promise<OutreachDraftGenerationResult>;
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
}
