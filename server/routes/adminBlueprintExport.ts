import { promises as fs } from 'node:fs';
import path from 'node:path';
import type express from 'express';

type AdminBlueprintExportDeps = {
  getCredits: (userId: string) => Promise<unknown>;
  exportDir?: string | null;
};

const DEFAULT_EXPORT_DIR = process.env.BLUEPRINT_TEXT_EXPORT_DIR
  || '/home/ubuntu/bleup-exports/blueprints/incoming';

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
  deps: AdminBlueprintExportDeps;
}) {
  const credits = await input.deps.getCredits(input.userId) as { plan?: unknown } | null;
  return normalizeString(credits?.plan).toLowerCase() === 'admin';
}

function safeFileName(value: unknown, blueprintId: string) {
  const raw = path.basename(normalizeString(value) || `${blueprintId}.txt`);
  const withoutControlChars = raw.replace(/[\x00-\x1f\x7f]/g, '');
  const cleaned = withoutControlChars
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  const base = cleaned || `${blueprintId}.txt`;
  return base.toLowerCase().endsWith('.txt') ? base : `${base}.txt`;
}

function buildStampedFileName(input: {
  fileName: string;
  blueprintId: string;
  now: Date;
}) {
  const stamp = input.now.toISOString().replace(/[:.]/g, '-');
  const fileName = safeFileName(input.fileName, input.blueprintId);
  return `${stamp}__${input.blueprintId}__${fileName}`;
}

export function registerAdminBlueprintExportRoutes(app: express.Express, deps: AdminBlueprintExportDeps) {
  app.post('/api/admin/blueprints/:blueprintId/text-export', async (req, res) => {
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

    const blueprintId = normalizeString(req.params.blueprintId);
    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const text = normalizeString(body.text);
    if (!blueprintId) {
      return res.status(400).json(withError('INVALID_BLUEPRINT_ID', 'Missing blueprint id.'));
    }
    if (!text) {
      return res.status(400).json(withError('EMPTY_EXPORT_TEXT', 'Blueprint export text is empty.'));
    }
    if (Buffer.byteLength(text, 'utf8') > 1_000_000) {
      return res.status(413).json(withError('EXPORT_TOO_LARGE', 'Blueprint export text is too large.'));
    }

    const exportDir = normalizeString(deps.exportDir) || DEFAULT_EXPORT_DIR;
    const now = new Date();
    const fileName = buildStampedFileName({
      fileName: body.file_name,
      blueprintId,
      now,
    });
    const filePath = path.join(exportDir, fileName);

    try {
      await fs.mkdir(exportDir, { recursive: true });
      await fs.writeFile(filePath, text.endsWith('\n') ? text : `${text}\n`, { encoding: 'utf8', flag: 'wx' });
      return res.status(201).json(withEnvelope({
        blueprintId,
        fileName,
        exportDir,
        filePath,
        writtenAt: now.toISOString(),
      }, 'blueprint text exported'));
    } catch (error) {
      return res.status(500).json(withError(
        'EXPORT_WRITE_FAILED',
        error instanceof Error ? error.message : 'Could not write blueprint export.',
      ));
    }
  });
}
