import type express from 'express';
import type {
  GenerationRunEvents,
  GenerationRunRecord,
  TracingRouteDeps,
} from '../contracts/api/tracing';

function parseIncludeEvents(raw: unknown, defaultValue = true) {
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return defaultValue;
}

function formatGenerationTraceResponse(run: GenerationRunRecord, events: GenerationRunEvents) {
  return {
    run_id: String(run.run_id || ''),
    status: String(run.status || 'unknown'),
    source_scope: String(run.source_scope || '').trim() || null,
    source_tag: String(run.source_tag || '').trim() || null,
    video_id: String(run.video_id || '').trim() || null,
    video_url: String(run.video_url || '').trim() || null,
    model: {
      primary: String(run.model_primary || '').trim() || null,
      used: String(run.model_used || '').trim() || null,
      fallback_used: run.fallback_used == null ? null : Boolean(run.fallback_used),
      fallback_model: String(run.fallback_model || '').trim() || null,
      reasoning_effort: String(run.reasoning_effort || '').trim() || null,
    },
    quality: {
      ok: run.quality_ok == null ? null : Boolean(run.quality_ok),
      issues: Array.isArray(run.quality_issues) ? run.quality_issues : [],
      retries_used: Number(run.quality_retries_used || 0),
      final_mode: String(run.quality_final_mode || '').trim() || null,
    },
    timing: {
      started_at: run.started_at || null,
      finished_at: run.finished_at || null,
      created_at: run.created_at || null,
      updated_at: run.updated_at || null,
    },
    error: {
      code: String(run.error_code || '').trim() || null,
      message: String(run.error_message || '').trim() || null,
    },
    trace_version: String(run.trace_version || '').trim() || null,
    summary: run.summary && typeof run.summary === 'object' ? run.summary : {},
    events: events.items || [],
    next_cursor: events.next_cursor || null,
  };
}

export function registerTracingRoutes(app: express.Express, deps: TracingRouteDeps) {
  app.get('/api/generation-runs/:runId', async (req, res) => {
    const runId = String(req.params.runId || '').trim();
    if (!runId) {
      return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'runId required', data: null });
    }

    const serviceRequest = deps.isServiceRequestAuthorized(req);
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!serviceRequest && (!userId || !authToken)) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = serviceRequest
      ? deps.getServiceSupabaseClient()
      : deps.getAuthedSupabaseClient(authToken);
    if (!db) {
      return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
    }

    try {
      const run = await deps.getGenerationRunByRunId(db, runId);
      if (!run) {
        return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Generation run not found', data: null });
      }
      if (!serviceRequest && run.user_id !== userId) {
        return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Generation run not found', data: null });
      }

      const includeEvents = parseIncludeEvents(req.query.include_events, true);
      const limit = deps.clampInt(req.query.limit, 50, 1, 200);
      const cursor = String(req.query.cursor || '').trim() || null;
      const events = includeEvents
        ? await deps.listGenerationRunEvents(db, { runId: run.run_id, limit, cursor })
        : { items: [], next_cursor: null };

      return res.json({
        ok: true,
        error_code: null,
        message: 'generation trace',
        data: formatGenerationTraceResponse(run, events),
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Could not load generation trace.',
        data: null,
      });
    }
  });

  app.get('/api/blueprints/:id([0-9a-fA-F-]{36})/generation-trace', async (req, res) => {
    const blueprintId = String(req.params.id || '').trim();
    const serviceRequest = deps.isServiceRequestAuthorized(req);
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!serviceRequest && (!userId || !authToken)) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = serviceRequest
      ? deps.getServiceSupabaseClient()
      : deps.getAuthedSupabaseClient(authToken);
    if (!db) {
      return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
    }

    try {
      const { data: blueprint, error: blueprintError } = await db
        .from('blueprints')
        .select('id, creator_user_id')
        .eq('id', blueprintId)
        .maybeSingle();
      if (blueprintError) {
        return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: blueprintError.message, data: null });
      }
      if (!blueprint) {
        return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Blueprint not found', data: null });
      }
      if (!serviceRequest && String(blueprint.creator_user_id || '').trim() !== String(userId || '').trim()) {
        return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Blueprint not found', data: null });
      }

      let run = await deps.getLatestGenerationRunByBlueprintId(db, blueprintId);

      if (run) {
        const includeEvents = parseIncludeEvents(req.query.include_events, true);
        const limit = deps.clampInt(req.query.limit, 50, 1, 200);
        const cursor = String(req.query.cursor || '').trim() || null;
        const events = includeEvents
          ? await deps.listGenerationRunEvents(db, { runId: run.run_id, limit, cursor })
          : { items: [], next_cursor: null };

        return res.json({
          ok: true,
          error_code: null,
          message: 'blueprint generation trace',
          data: {
            source: 'generation_runs',
            blueprint_id: blueprintId,
            ...formatGenerationTraceResponse(run, events),
          },
        });
      }

      return res.status(404).json({
        ok: false,
        error_code: 'TRACE_NOT_FOUND',
        message: 'No generation trace found for this blueprint.',
        data: null,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Could not load generation trace.',
        data: null,
      });
    }
  });
}
