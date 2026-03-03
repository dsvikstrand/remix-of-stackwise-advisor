import type express from 'express';
import type { OpsRouteDeps } from '../contracts/api/ops';

export async function handleIngestionJobsTrigger(req: express.Request, res: express.Response, deps: OpsRouteDeps) {
  if (!deps.isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = deps.getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const recoveredJobs = await deps.recoverStaleIngestionJobs(db, {
    scope: 'all_active_subscriptions',
  });
  if (recoveredJobs.length > 0) {
    console.log('[ingestion_stale_recovered]', JSON.stringify({
      scope: 'all_active_subscriptions',
      recovered_count: recoveredJobs.length,
      recovered_job_ids: recoveredJobs.map((row) => row.id),
    }));
  }
  await deps.runUnlockSweeps(db, { mode: 'cron', force: true });
  await deps.runSourcePageAssetSweep(db, { mode: 'cron' });
  try {
    const seeded = await deps.seedSourceTranscriptRevalidateJobs(db, 50);
    if (seeded.enqueued > 0) {
      console.log('[transcript_revalidate_seeded]', JSON.stringify({
        scanned: seeded.scanned,
        enqueued: seeded.enqueued,
      }));
    }
  } catch (seedError) {
    console.log('[transcript_revalidate_seed_failed]', JSON.stringify({
      error: seedError instanceof Error ? seedError.message : String(seedError),
    }));
  }

  const { data: existingJob, error: runningJobError } = await db
    .from('ingestion_jobs')
    .select('id, status, started_at')
    .eq('scope', 'all_active_subscriptions')
    .in('status', ['queued', 'running'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runningJobError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: runningJobError.message, data: null });
  }
  if (existingJob?.id) {
    return res.status(409).json({
      ok: false,
      error_code: 'JOB_ALREADY_RUNNING',
      message: 'A subscription ingestion job is already queued or running.',
      data: { job_id: existingJob.id, status: existingJob.status },
    });
  }

  const queueDepth = await deps.countQueueDepth(db, { includeRunning: true });
  if (queueDepth >= deps.queueDepthHardLimit) {
    return res.status(429).json({
      ok: false,
      error_code: 'QUEUE_BACKPRESSURE',
      message: 'Queue is busy. Retry shortly.',
      retry_after_seconds: 30,
      data: {
        queue_depth: queueDepth,
      },
    });
  }

  const traceId = deps.createUnlockTraceId();
  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'service_cron',
      scope: 'all_active_subscriptions',
      status: 'queued',
      trace_id: traceId,
      payload: {
        trace_id: traceId,
      },
      next_run_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });

  deps.scheduleQueuedIngestionProcessing();
  return res.status(202).json({
    ok: true,
    error_code: null,
    message: 'ingestion job queued',
    data: {
      job_id: job.id,
      queue_depth: queueDepth + 1,
      trace_id: traceId,
    },
  });
}

export async function handleIngestionJobsLatest(req: express.Request, res: express.Response, deps: OpsRouteDeps) {
  if (!deps.isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = deps.getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });
  }

  return res.json({
    ok: true,
    error_code: null,
    message: data ? 'latest ingestion job fetched' : 'no ingestion jobs found',
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
        }
      : null,
  });
}

export async function handleQueueHealth(req: express.Request, res: express.Response, deps: OpsRouteDeps) {
  if (!deps.isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = deps.getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const nowIso = new Date().toISOString();
  const [queuedDepth, runningDepth] = await Promise.all([
    deps.countQueueDepth(db, { includeRunning: false }),
    deps.countQueueDepth(db, { includeRunning: true }),
  ]);

  const { count: staleLeaseCount, error: staleLeaseError } = await db
    .from('ingestion_jobs')
    .select('id', { head: true, count: 'exact' })
    .eq('status', 'running')
    .not('lease_expires_at', 'is', null)
    .lt('lease_expires_at', nowIso);
  if (staleLeaseError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: staleLeaseError.message, data: null });
  }

  const { data: byScopeRows, error: byScopeError } = await db
    .from('ingestion_jobs')
    .select('scope, status')
    .in('status', ['queued', 'running'])
    .in('scope', [...deps.queuedIngestionScopes]);
  if (byScopeError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: byScopeError.message, data: null });
  }
  const byScope: Record<string, { queued: number; running: number }> = {};
  for (const scope of deps.queuedIngestionScopes) {
    byScope[scope] = { queued: 0, running: 0 };
  }
  for (const row of byScopeRows || []) {
    const scope = String((row as { scope?: string }).scope || '').trim();
    const status = String((row as { status?: string }).status || '').trim();
    if (!deps.isQueuedIngestionScope(scope)) continue;
    if (status === 'queued') byScope[scope].queued += 1;
    if (status === 'running') byScope[scope].running += 1;
  }

  const providerKeys = [
    'transcript',
    'llm_generate_blueprint',
    'llm_quality_judge',
    'llm_safety_judge',
    'llm_review',
    'llm_banner',
  ];
  const providerCircuitState: Record<string, unknown> = {};
  for (const providerKey of providerKeys) {
    providerCircuitState[providerKey] = await deps.getProviderCircuitSnapshot(db, providerKey);
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'queue health',
    data: {
      worker_id: deps.queuedWorkerId,
      worker_running: deps.queuedWorkerRunning,
      queue_depth: queuedDepth,
      running_depth: Math.max(0, runningDepth - queuedDepth),
      stale_leases: Number(staleLeaseCount || 0),
      limits: {
        queue_depth_hard_limit: deps.queueDepthHardLimit,
        queue_depth_per_user_limit: deps.queueDepthPerUserLimit,
        worker_concurrency: deps.workerConcurrency,
        worker_batch_size: deps.workerBatchSize,
        worker_lease_ms: deps.workerLeaseMs,
        worker_heartbeat_ms: deps.workerHeartbeatMs,
        job_execution_timeout_ms: deps.jobExecutionTimeoutMs,
      },
      by_scope: byScope,
      provider_circuit_state: providerCircuitState,
    },
  });
}

export async function handleSourcePagesAssetSweep(req: express.Request, res: express.Response, deps: OpsRouteDeps) {
  if (!deps.isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = deps.getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const forceRaw = String((req.body as { force?: unknown } | undefined)?.force ?? '').trim().toLowerCase();
  const force = forceRaw === 'true' || forceRaw === '1' || forceRaw === 'on';
  const traceId = deps.createUnlockTraceId();
  const summary = await deps.runSourcePageAssetSweep(db, { mode: 'manual', force, traceId });

  return res.json({
    ok: true,
    error_code: null,
    message: summary ? 'source page asset sweep complete' : 'source page asset sweep skipped',
    data: {
      trace_id: traceId,
      summary,
    },
  });
}

export async function handleAutoBannerJobsTrigger(req: express.Request, res: express.Response, deps: OpsRouteDeps) {
  if (!deps.isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  if (deps.autoBannerMode === 'off') {
    return res.status(409).json({ ok: false, error_code: 'AUTO_BANNER_DISABLED', message: 'Auto banner mode is disabled', data: null });
  }

  const db = deps.getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  try {
    const workerRuns = Math.max(1, deps.autoBannerConcurrency);
    const batchPerRun = Math.max(1, Math.ceil(deps.autoBannerBatchSize / workerRuns));
    const runResults = [] as Awaited<ReturnType<OpsRouteDeps['processAutoBannerQueue']>>[];

    for (let index = 0; index < workerRuns; index += 1) {
      const run = await deps.processAutoBannerQueue(db, { maxJobs: batchPerRun });
      runResults.push(run);
    }

    const totals = runResults.reduce((acc, run) => ({
      claimed: acc.claimed + run.claimed,
      succeeded: acc.succeeded + run.succeeded,
      failed: acc.failed + run.failed,
      dead: acc.dead + run.dead,
      errors: acc.errors.concat(run.errors),
    }), {
      claimed: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
      errors: [] as Array<{ job_id: string; error: string }>,
    });
    const rebalance = runResults[runResults.length - 1]?.rebalance || {
      eligible: 0,
      kept: 0,
      demoted: 0,
      restoredToGenerated: 0,
      demotedToDefault: 0,
      demotedToNone: 0,
    };

    return res.status(totals.failed || totals.dead ? 207 : 200).json({
      ok: true,
      error_code: totals.failed || totals.dead ? 'PARTIAL_FAILURE' : null,
      message: 'auto banner trigger complete',
      data: {
        mode: deps.autoBannerMode,
        cap: deps.autoBannerCap,
        batch_size: deps.autoBannerBatchSize,
        concurrency: deps.autoBannerConcurrency,
        ...totals,
        rebalance,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      ok: false,
      error_code: 'AUTO_BANNER_TRIGGER_FAILED',
      message,
      data: null,
    });
  }
}

export async function handleAutoBannerJobsLatest(req: express.Request, res: express.Response, deps: OpsRouteDeps) {
  if (!deps.isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = deps.getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const { data: latest, error: latestError } = await db
    .from('auto_banner_jobs')
    .select('id, blueprint_id, status, attempts, max_attempts, available_at, last_error, started_at, finished_at, created_at, updated_at, source_item_id, subscription_id, run_id')
    .order('created_at', { ascending: false })
    .limit(20);
  if (latestError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: latestError.message, data: null });
  }

  const summary = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
  };
  for (const row of latest || []) {
    if (row.status === 'queued') summary.queued += 1;
    else if (row.status === 'running') summary.running += 1;
    else if (row.status === 'succeeded') summary.succeeded += 1;
    else if (row.status === 'failed') summary.failed += 1;
    else if (row.status === 'dead') summary.dead += 1;
  }

  return res.json({
    ok: true,
    error_code: null,
    message: latest?.length ? 'latest auto banner jobs fetched' : 'no auto banner jobs found',
    data: {
      mode: deps.autoBannerMode,
      cap: deps.autoBannerCap,
      max_attempts: deps.autoBannerMaxAttempts,
      timeout_ms: deps.autoBannerTimeoutMs,
      batch_size: deps.autoBannerBatchSize,
      concurrency: deps.autoBannerConcurrency,
      summary,
      jobs: latest || [],
    },
  });
}

export async function handleDebugResetYtProxy(req: express.Request, res: express.Response, deps: OpsRouteDeps) {
  if (!deps.debugEndpointsEnabled) {
    return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Not found', data: null });
  }
  if (!deps.isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }

  await deps.resetYtToTextProxyDispatcher();

  return res.json({
    ok: true,
    error_code: null,
    message: 'yt_to_text proxy cache reset',
    data: {
      reset: true,
      proxy_selector_mode: deps.getYtToTextProxyDebugMode(),
    },
  });
}

export async function handleDebugSimulateNewUploads(req: express.Request, res: express.Response, deps: OpsRouteDeps) {
  if (!deps.debugEndpointsEnabled) {
    return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Not found', data: null });
  }
  if (!deps.isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }

  const parsed = deps.debugSimulateSubscriptionRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'Invalid request payload',
      data: null,
    });
  }
  const rewindDays = parsed.data.rewind_days || 30;

  const db = deps.getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const { data: subscription, error: subscriptionError } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, mode, source_channel_id, source_page_id, last_seen_published_at, last_seen_video_id, is_active')
    .eq('id', req.params.id)
    .maybeSingle();

  if (subscriptionError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: subscriptionError.message, data: null });
  if (!subscription) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });
  if (!subscription.is_active) return res.status(400).json({ ok: false, error_code: 'INACTIVE_SUBSCRIPTION', message: 'Subscription is inactive', data: null });

  const rewoundToIso = new Date(Date.now() - rewindDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: rewindError } = await db
    .from('user_source_subscriptions')
    .update({
      last_seen_published_at: rewoundToIso,
      last_seen_video_id: null,
      last_sync_error: null,
    })
    .eq('id', subscription.id);

  if (rewindError) {
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: rewindError.message, data: null });
  }

  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'debug_simulation',
      scope: 'subscription_debug',
      status: 'running',
      subscription_id: subscription.id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });

  try {
    const sync = await deps.syncSingleSubscription(
      db,
      {
        ...subscription,
        last_seen_published_at: rewoundToIso,
        last_seen_video_id: null,
      },
      { trigger: 'debug_simulation' },
    );

    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: sync.processed,
      inserted_count: sync.inserted,
      skipped_count: sync.skipped,
      error_code: null,
      error_message: null,
    }).eq('id', job.id);

    return res.json({
      ok: true,
      error_code: null,
      message: 'subscription debug simulation complete',
      data: {
        job_id: job.id,
        subscription_id: subscription.id,
        rewind_days: rewindDays,
        checkpoint_rewound_to: rewoundToIso,
        ...sync,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.markSubscriptionSyncError(db, subscription.id, error);
    await db.from('ingestion_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_code: 'SYNC_FAILED',
      error_message: message.slice(0, 500),
    }).eq('id', job.id);
    return res.status(500).json({ ok: false, error_code: 'SYNC_FAILED', message, data: { job_id: job.id } });
  }
}
