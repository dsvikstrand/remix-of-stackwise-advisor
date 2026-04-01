import type express from 'express';
import type { IngestionRouteDeps } from '../contracts/api/ingestion';

const INGESTION_JOB_DETAIL_SELECT_COLUMNS = 'id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, created_at, updated_at';
const INGESTION_JOB_SUMMARY_SELECT_COLUMNS = 'id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, created_at, updated_at';

export type ActiveIngestionJobRow = {
  id: string;
  trigger: string;
  scope: string;
  status: 'queued' | 'running';
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  next_run_at: string | null;
  lease_expires_at: string | null;
  trace_id: string | null;
  payload?: unknown;
  created_at: string;
  updated_at: string;
};

type QueueOrderRow = {
  id: string;
  next_run_at: string | null;
  created_at: string | null;
};

type LatestIngestionJobRow = {
  id: string;
  status: string;
};

function parseTimeToMs(value: string | null | undefined, fallbackMs: number) {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

export function parseScopeCsv(raw: unknown) {
  return String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function compareQueuedJobsForPosition(a: QueueOrderRow, b: QueueOrderRow) {
  const aNext = parseTimeToMs(a.next_run_at, Number.POSITIVE_INFINITY);
  const bNext = parseTimeToMs(b.next_run_at, Number.POSITIVE_INFINITY);
  if (aNext !== bNext) return aNext - bNext;

  const aCreated = parseTimeToMs(a.created_at, Number.POSITIVE_INFINITY);
  const bCreated = parseTimeToMs(b.created_at, Number.POSITIVE_INFINITY);
  if (aCreated !== bCreated) return aCreated - bCreated;

  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function buildQueueAheadByJobId(input: QueueOrderRow[]) {
  const ordered = [...input].sort(compareQueuedJobsForPosition);
  const queueAheadByJobId = new Map<string, number>();
  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    if (!row?.id) continue;
    queueAheadByJobId.set(row.id, index);
  }
  return queueAheadByJobId;
}

export function estimateStartSeconds(queueAheadCount: number, workerConcurrency: number) {
  const normalizedAhead = Math.max(0, Math.floor(Number(queueAheadCount) || 0));
  const normalizedConcurrency = Math.max(1, Math.floor(Number(workerConcurrency) || 1));
  return Math.max(1, Math.ceil((normalizedAhead + 1) / normalizedConcurrency) * 4);
}

export function pickLatestRelevantIngestionJob<T extends LatestIngestionJobRow>(rows: T[]) {
  let latestRow: T | null = null;
  for (const row of rows) {
    if (!row) continue;
    latestRow ??= row;
    const status = String(row.status || '').trim();
    if (status === 'queued' || status === 'running') {
      return row;
    }
  }
  return latestRow;
}

export function resolveQueuePositionScopes(input: {
  requestedScopes: string[];
  rows: ActiveIngestionJobRow[];
  queuedIngestionScopes: readonly string[];
}) {
  const requestedScopes = input.requestedScopes.map((scope) => String(scope || '').trim()).filter(Boolean);
  if (requestedScopes.length > 0) {
    return [...new Set(requestedScopes)];
  }

  const rowScopes = input.rows
    .filter((row) => row.status === 'queued')
    .map((row) => String(row.scope || '').trim())
    .filter(Boolean);
  if (rowScopes.length > 0) {
    return [...new Set(rowScopes)];
  }

  return [...new Set(input.queuedIngestionScopes.map((scope) => String(scope || '').trim()).filter(Boolean))];
}

function extractJobTitle(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as { items?: unknown };
  if (!Array.isArray(root.items) || root.items.length === 0) return null;
  const firstItem = root.items[0];
  if (!firstItem || typeof firstItem !== 'object') return null;
  const item = firstItem as { title?: unknown; video_title?: unknown };
  const title = String(item.title || item.video_title || '').trim();
  return title || null;
}

export function buildActiveIngestionJobsPayload(input: {
  rows: ActiveIngestionJobRow[];
  queueAheadByJobId: Map<string, number>;
  workerConcurrency: number;
}) {
  const summary = input.rows.reduce(
    (acc, row) => {
      acc.active_count += 1;
      if (row.status === 'queued') acc.queued_count += 1;
      if (row.status === 'running') acc.running_count += 1;
      return acc;
    },
    {
      active_count: 0,
      queued_count: 0,
      running_count: 0,
    },
  );

  const items = input.rows.map((row) => {
    if (row.status === 'running') {
      return {
        job_id: row.id,
        title: extractJobTitle(row.payload),
        scope: row.scope,
        trigger: row.trigger,
        status: row.status,
        created_at: row.created_at,
        started_at: row.started_at,
        next_run_at: row.next_run_at,
        processed_count: row.processed_count,
        inserted_count: row.inserted_count,
        skipped_count: row.skipped_count,
        attempts: row.attempts,
        max_attempts: row.max_attempts,
        error_code: row.error_code,
        error_message: row.error_message,
        queue_position: null,
        queue_ahead_count: 0,
        estimated_start_seconds: 0,
        is_position_estimate: false,
      };
    }

    const queueAheadCount = input.queueAheadByJobId.get(row.id);
    const hasQueuePosition = Number.isFinite(queueAheadCount);
    const normalizedAhead = hasQueuePosition ? Math.max(0, Math.floor(Number(queueAheadCount))) : null;

    return {
      job_id: row.id,
      title: extractJobTitle(row.payload),
      scope: row.scope,
      trigger: row.trigger,
      status: row.status,
      created_at: row.created_at,
      started_at: row.started_at,
      next_run_at: row.next_run_at,
      processed_count: row.processed_count,
      inserted_count: row.inserted_count,
      skipped_count: row.skipped_count,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      error_code: row.error_code,
      error_message: row.error_message,
      queue_position: normalizedAhead == null ? null : normalizedAhead + 1,
      queue_ahead_count: normalizedAhead,
      estimated_start_seconds: normalizedAhead == null ? null : estimateStartSeconds(normalizedAhead, input.workerConcurrency),
      is_position_estimate: true,
    };
  });

  return {
    items,
    summary,
  };
}

export function registerIngestionUserRoutes(app: express.Express, deps: IngestionRouteDeps) {
  app.get('/api/ingestion/jobs/:id([0-9a-fA-F-]{36})', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    let data: any | null = null;
    try {
      data = await deps.getUserIngestionJobById(db, {
        userId,
        jobId: req.params.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read ingestion job';
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message, data: null });
    }
    if (!data) {
      return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Ingestion job not found', data: null });
    }

    return res.json({
      ok: true,
      error_code: null,
      message: 'ingestion job fetched',
      data: {
        job_id: data.id,
        trigger: data.trigger,
        scope: data.scope,
        status: data.status,
        started_at: data.started_at,
        finished_at: data.finished_at,
        processed_count: data.processed_count,
        inserted_count: data.inserted_count,
        skipped_count: data.skipped_count,
        error_code: data.error_code,
        error_message: data.error_message,
        attempts: data.attempts,
        max_attempts: data.max_attempts,
        next_run_at: data.next_run_at,
        lease_expires_at: data.lease_expires_at,
        trace_id: data.trace_id || null,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
    });
  });

  app.get('/api/ingestion/jobs/latest-mine', deps.ingestionLatestMineLimiter, async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const scopeRaw = String(req.query.scope || '').trim();
    const scope = scopeRaw || 'manual_refresh_selection';

    let latestRows: any[] = [];
    try {
      latestRows = await deps.getLatestUserIngestionJobs(db, {
        userId,
        scope,
        limit: 2,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read ingestion jobs';
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message, data: null });
    }

    const data = pickLatestRelevantIngestionJob(latestRows as any[]);

    return res.json({
      ok: true,
      error_code: null,
      message: data ? 'latest user ingestion job fetched' : 'no ingestion jobs found',
      data: data
        ? {
            job_id: data.id,
            trigger: data.trigger,
            scope: data.scope,
            status: data.status,
            started_at: data.started_at,
            finished_at: data.finished_at,
            processed_count: data.processed_count,
            inserted_count: data.inserted_count,
            skipped_count: data.skipped_count,
            error_code: data.error_code,
            error_message: data.error_message,
            attempts: data.attempts,
            max_attempts: data.max_attempts,
            next_run_at: data.next_run_at,
            lease_expires_at: data.lease_expires_at,
            trace_id: data.trace_id || null,
            created_at: data.created_at,
            updated_at: data.updated_at,
          }
        : null,
    });
  });

  app.get('/api/ingestion/jobs/active-mine', deps.ingestionLatestMineLimiter, async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const limit = deps.clampInt(req.query.limit, 20, 1, 50);
    const scopes = parseScopeCsv(req.query.scope);

    let activeRows: any[] = [];
    try {
      activeRows = await deps.listActiveUserIngestionJobs(db, {
        userId,
        scopes,
        limit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read active ingestion jobs';
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message, data: null });
    }

    const rows = (activeRows as ActiveIngestionJobRow[]).map((row) => ({
      ...row,
      status: row.status === 'running' ? 'running' : 'queued',
    }));

    const includePositions = String(req.query.positions || '').trim() === '1';
    let queueAheadByJobId = new Map<string, number>();
    const queuedJobIds = rows
      .filter((row) => row.status === 'queued')
      .map((row) => row.id);

    if (includePositions && queuedJobIds.length > 0) {
      const queuedScopes = resolveQueuePositionScopes({
        requestedScopes: scopes,
        rows,
        queuedIngestionScopes: deps.queuedIngestionScopes,
      });

      let queueRows: QueueOrderRow[] = [];
      try {
        queueRows = await deps.listQueuedJobsForScopes({
          scopes: queuedScopes,
        });
      } catch {
        queueRows = [];
      }

      if (Array.isArray(queueRows)) {
        queueAheadByJobId = buildQueueAheadByJobId(queueRows);
      }
    }

    const payload = buildActiveIngestionJobsPayload({
      rows,
      queueAheadByJobId,
      workerConcurrency: deps.workerConcurrency,
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'active user ingestion jobs fetched',
      data: payload,
    });
  });
}
