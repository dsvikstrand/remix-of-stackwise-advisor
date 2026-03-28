type DbClient = any;

const AUTO_BANNER_REBALANCE_COOLDOWN_MS = Math.max(
  5 * 60_000,
  Math.min(
    24 * 60 * 60_000,
    Math.floor(Number(process.env.AUTO_BANNER_REBALANCE_COOLDOWN_MS || 6 * 60 * 60_000) || 6 * 60 * 60_000),
  ),
);
let lastAutoBannerRebalanceAtMs = 0;

type AutoBannerJobRow = {
  id: string;
  blueprint_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  available_at: string;
  source_item_id: string | null;
  subscription_id: string | null;
  run_id: string | null;
  last_error: string | null;
};

type AutoBannerRunResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  errors: Array<{ job_id: string; error: string }>;
  rebalance: {
    eligible: number;
    kept: number;
    demoted: number;
    restoredToGenerated: number;
    demotedToDefault: number;
    demotedToNone: number;
  };
};

export type AutoBannerQueueDeps = {
  autoBannerBatchSize: number;
  autoBannerMaxAttempts: number;
  autoBannerTimeoutMs: number;
  autoBannerCap: number;
  recoverStaleAutoBannerJobs: (db: DbClient) => Promise<unknown>;
  getFailureTransition: (input: {
    attempts: number;
    maxAttempts: number;
    now: Date;
  }) => { status: string; availableAt: string | null };
  processAutoBannerJob: (db: DbClient, job: AutoBannerJobRow) => Promise<{ blueprintId: string; bannerUrl: string }>;
  rebalanceGeneratedBannerCap: (db: DbClient) => Promise<{
    eligible: number;
    kept: number;
    demoted: number;
    restoredToGenerated: number;
    demotedToDefault: number;
    demotedToNone: number;
  }>;
};

export function createAutoBannerQueueService(deps: AutoBannerQueueDeps) {
  async function processAutoBannerQueue(db: DbClient, input?: { maxJobs?: number }): Promise<AutoBannerRunResult> {
    const nowIso = new Date().toISOString();
    const maxJobs = Math.max(1, Math.min(200, input?.maxJobs || deps.autoBannerBatchSize));
    const claimScanLimit = Math.max(maxJobs * 2, maxJobs);

    await deps.recoverStaleAutoBannerJobs(db);

    const { data: queueCandidates, error: queueError } = await db
      .from('auto_banner_jobs')
      .select('id, blueprint_id, status, attempts, max_attempts, available_at, source_item_id, subscription_id, run_id, last_error')
      .in('status', ['queued', 'failed'])
      .lte('available_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(claimScanLimit);
    if (queueError) throw queueError;

    const claimed: AutoBannerJobRow[] = [];
    for (const candidate of queueCandidates || []) {
      if (claimed.length >= maxJobs) break;
      const attempts = Number(candidate.attempts || 0);
      const maxAttempts = Math.max(1, Number(candidate.max_attempts || deps.autoBannerMaxAttempts));
      if (attempts >= maxAttempts) {
        await db.from('auto_banner_jobs')
          .update({
            status: 'dead',
            finished_at: new Date().toISOString(),
            last_error: candidate.last_error || 'Reached max attempts',
          })
          .eq('id', candidate.id)
          .eq('status', candidate.status);
        continue;
      }

      const { data: locked } = await db
        .from('auto_banner_jobs')
        .update({
          status: 'running',
          attempts: attempts + 1,
          started_at: new Date().toISOString(),
          finished_at: null,
        })
        .eq('id', candidate.id)
        .eq('status', candidate.status)
        .lte('available_at', nowIso)
        .select('id, blueprint_id, status, attempts, max_attempts, available_at, source_item_id, subscription_id, run_id')
        .maybeSingle();
      if (locked) claimed.push(locked as AutoBannerJobRow);
    }

    const results = {
      claimed: claimed.length,
      succeeded: 0,
      failed: 0,
      dead: 0,
      errors: [] as Array<{ job_id: string; error: string }>,
    };

    for (const job of claimed) {
      try {
        const processed = await deps.processAutoBannerJob(db, job);
        results.succeeded += 1;
        console.log('[auto_banner_job_succeeded]', JSON.stringify({
          job_id: job.id,
          blueprint_id: processed.blueprintId,
          source_item_id: job.source_item_id,
          subscription_id: job.subscription_id,
          run_id: job.run_id,
          attempts: Number(job.attempts || 0),
          timeout_ms: deps.autoBannerTimeoutMs,
          transition_reason: 'completed',
        }));
      } catch (error) {
        const transition = deps.getFailureTransition({
          attempts: Number(job.attempts || 0),
          maxAttempts: Math.max(1, Number(job.max_attempts || deps.autoBannerMaxAttempts)),
          now: new Date(),
        });
        const message = error instanceof Error ? error.message : String(error);
        await db
          .from('auto_banner_jobs')
          .update({
            status: transition.status,
            available_at: transition.availableAt,
            finished_at: transition.status === 'dead' ? new Date().toISOString() : null,
            last_error: message.slice(0, 500),
          })
          .eq('id', job.id);
        if (transition.status === 'dead') results.dead += 1;
        else results.failed += 1;
        results.errors.push({ job_id: job.id, error: message.slice(0, 180) });
        console.log('[auto_banner_job_failed]', JSON.stringify({
          job_id: job.id,
          blueprint_id: job.blueprint_id,
          attempts: Number(job.attempts || 0),
          timeout_ms: deps.autoBannerTimeoutMs,
          transition_reason: 'process_error',
          status: transition.status,
          next_available_at: transition.availableAt,
          error: message,
        }));
      }
    }

    const shouldRebalance = Date.now() - lastAutoBannerRebalanceAtMs >= AUTO_BANNER_REBALANCE_COOLDOWN_MS;
    const rebalance = shouldRebalance
      ? await deps.rebalanceGeneratedBannerCap(db)
      : {
          eligible: 0,
          kept: 0,
          demoted: 0,
          restoredToGenerated: 0,
          demotedToDefault: 0,
          demotedToNone: 0,
        };
    if (shouldRebalance) {
      lastAutoBannerRebalanceAtMs = Date.now();
      console.log('[auto_banner_rebalance]', JSON.stringify({
        cap: deps.autoBannerCap,
        eligible: rebalance.eligible,
        kept: rebalance.kept,
        demoted: rebalance.demoted,
        restored_generated: rebalance.restoredToGenerated,
        demoted_default: rebalance.demotedToDefault,
        demoted_none: rebalance.demotedToNone,
      }));
    }

    return {
      ...results,
      rebalance,
    };
  }

  return {
    processAutoBannerQueue,
  };
}
