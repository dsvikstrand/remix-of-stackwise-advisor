import type express from 'express';
import type { IngestionRouteDeps } from '../contracts/api/ingestion';

export function registerIngestionUserRoutes(app: express.Express, deps: IngestionRouteDeps) {
  app.get('/api/ingestion/jobs/:id([0-9a-fA-F-]{36})', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const { data, error } = await db
      .from('ingestion_jobs')
      .select('id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, created_at, updated_at')
      .eq('id', req.params.id)
      .eq('requested_by_user_id', userId)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });
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
    const selectColumns = 'id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, created_at, updated_at';

    const { data: activeData, error: activeError } = await db
      .from('ingestion_jobs')
      .select(selectColumns)
      .eq('requested_by_user_id', userId)
      .eq('scope', scope)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: activeError.message, data: null });
    }

    let data = activeData;
    if (!data) {
      const { data: latestData, error: latestError } = await db
        .from('ingestion_jobs')
        .select(selectColumns)
        .eq('requested_by_user_id', userId)
        .eq('scope', scope)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) {
        return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: latestError.message, data: null });
      }
      data = latestData;
    }

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
}
