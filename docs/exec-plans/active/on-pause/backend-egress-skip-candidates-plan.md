# Backend Egress Skip Candidates Plan

Status: `on-pause`  
Owner: `Codex / David`  
Last updated: `2026-03-30`

## Purpose

Track the next narrow backend-side egress cuts that do not require broad product rewrites. This plan focuses on maintenance work, trigger-path housekeeping, control-plane churn, and support-table/bookkeeping work that may be skipped, deferred, or thinned while preserving core user flows.

This is intentionally narrower than the earlier broader egress plans. It is a follow-up tracker for the remaining backend work that still looks expensive after the major frontend/backend reduction passes and the runtime feature-off switches.

## Current State

a1) [have] Production already has these runtime cuts active:
- `YOUTUBE_REFRESH_ENABLED=false`
- `SUBSCRIPTION_AUTO_BANNER_MODE=off`
- `SOURCE_PAGE_ASSET_SWEEP_ENABLED=false`
- `SOURCE_UNLOCK_SWEEPS_ENABLED=false`

a2) [have] The biggest remaining request pressure still appears concentrated in backend/control-plane families:
- `ingestion_jobs`
- `claim_ingestion_jobs`
- `user_source_subscriptions`
- residual unlock and maintenance work

a3) [have] The next likely wins are no longer obvious user-facing features to disable.

a4) [todo] The next work should target backend operations that still run even when little or no direct user value is created.

## Goal

b1) [todo] Reduce backend request churn further without introducing broad new surfaces.

b2) [todo] Prefer skipping, deferring, or coalescing existing maintenance/control-plane work over adding new endpoints, new storage, or new architecture.

b3) [todo] Preserve:
- blueprint reading
- main browse flows
- successful generation/unlock completion
- manual blueprint refresh

## Ranked Candidates

c1) [todo] **Trim pre-enqueue maintenance from `/api/ingestion/jobs/trigger`**
Primary files:
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)

Current behavior:
- the trigger route currently runs maintenance work before it even decides whether a new `all_active_subscriptions` job should be queued:
  - stale ingestion recovery
  - unlock sweeps
  - source-page asset sweep
  - transcript revalidate seeding
- only after that does it check:
  - already queued/running job
  - minimum trigger interval
  - queue suppression

Why this matters:
- we can spend backend reads/writes even when the route exits early with “suppressed” or “already running”

Smallest credible cut:
- move maintenance work behind the enqueue-eligibility checks
- or remove some of it from this route entirely

Expected impact:
- medium-high

Risk:
- low-medium

c2) [todo] **Remove or severely downshift transcript revalidate seeding**
Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)

Current behavior:
- `seedSourceTranscriptRevalidateJobs(...)` is maintenance work triggered from the ingestion trigger path

Why this matters:
- it is not a direct user action
- it adds reads and enqueue attempts from a support/repair path

Smallest credible cut:
- remove automatic seeding from `/api/ingestion/jobs/trigger`
- keep it only as manual/ops work if still needed

Expected impact:
- low-medium

Risk:
- low

c3) [todo] **Reduce stale-recovery work inside the queued worker loop**
Primary files:
- [queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Current behavior:
- every worker cycle still does:
  - `runUnlockSweeps(...)`
  - `recoverStaleIngestionJobs(...)` across queued scopes
before claiming work

Why this matters:
- repeated maintenance work happens as part of ordinary worker polling
- this is a control-plane cost even when little productive work is claimed

Smallest credible cut:
- only do stale recovery every `N`th cycle
- or only when there is evidence of stuck work
- or move it to a slower dedicated maintenance path

Expected impact:
- high

Risk:
- medium

c4) [todo] **Thin `all_active_subscriptions` full-sync breadth**
Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Current behavior:
- `processAllActiveSubscriptionsJob(...)` loads all active YouTube subscriptions and loops through all of them every run

Why this matters:
- this grows with subscription count
- it is one of the most likely scaling multipliers as more subscriptions are added

Smallest credible cut:
- skip recently-polled subscriptions
- process only subscriptions that appear eligible for checkpoint advance
- or split into smaller incremental batches

Expected impact:
- high

Risk:
- medium

c5) [todo] **Reduce lease heartbeat churn for short-lived jobs**
Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Current behavior:
- each claimed ingestion job starts repeated `touchIngestionJobLease(...)` heartbeats

Why this matters:
- this is pure control-plane write work

Smallest credible cut:
- heartbeat less often
- or only heartbeat for slower scopes
- or skip heartbeats on obviously short/fast jobs

Expected impact:
- medium

Risk:
- medium

c6) [todo] **Drop `refresh_video_attempts` persistence if acceptable**
Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Current behavior:
- failed subscription refresh candidates write/read/delete from `refresh_video_attempts`

Why this matters:
- support-table churn for failure memory and cooldown

Smallest credible cut:
- remove persistence entirely
- or simplify it sharply if repeated failures are acceptable

Expected impact:
- low-medium

Risk:
- low-medium

c7) [todo] **Skip subscription-notice cleanup writes**
Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [sourceSubscriptionsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourceSubscriptionsHandlers.ts)
- [sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)

Current behavior:
- `cleanupSubscriptionNoticeForChannel(...)` does source-item lookup plus feed-item delete cleanup

Why this matters:
- polish-only cleanup work

Smallest credible cut:
- make it best-effort and deferred
- or skip it completely

Expected impact:
- low

Risk:
- low

c8) [todo] **Reduce `latest-mine` status churn**
Primary files:
- [ingestion.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/ingestion.ts)
- [useSourceUnlockJobTracker.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSourceUnlockJobTracker.ts)

Current behavior:
- steady user status polling still reads `ingestion_jobs` via `latest-mine`

Why this matters:
- not the biggest single bucket
- but steady background/user-session churn remains

Smallest credible cut:
- longer stale windows
- less auto-resume
- more explicit/manual status fetch

Expected impact:
- medium

Risk:
- low-medium

## Recommended Execution Order

d1) [have] Best high-payoff order:
1. trim `/api/ingestion/jobs/trigger` pre-maintenance
2. reduce stale-recovery work in the worker loop
3. thin `all_active_subscriptions` breadth

d2) [have] Best safer cleanup order:
1. transcript revalidate seeding
2. `refresh_video_attempts`
3. subscription notice cleanup
4. `latest-mine` churn

d3) [todo] Do not start all slices at once. Prefer one narrow batch, then recheck production request history.

## Proposed Phase Split

e1) [todo] **Phase 1: trigger-path and maintenance skips**
Scope:
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Targets:
- candidate `c1`
- candidate `c2`
- candidate `c6`
- candidate `c7`

Reason:
- smallest-risk backend-only cut set

e2) [todo] **Phase 2: worker/control-plane churn**
Scope:
- [queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Targets:
- candidate `c3`
- candidate `c5`

Reason:
- stronger payoff, but more runtime sensitivity

e3) [todo] **Phase 3: subscription breadth and user status**
Scope:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [ingestion.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/ingestion.ts)
- [useSourceUnlockJobTracker.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSourceUnlockJobTracker.ts)

Targets:
- candidate `c4`
- candidate `c8`

Reason:
- likely payoff is strong, but it is closer to visible freshness/status behavior

## Verification

f1) [todo] After each phase, run:
- `npm run typecheck`
- targeted tests for touched backend routes/services
- Oracle backend smoke
- public release smoke

f2) [todo] Re-pull request-history analytics after each phase and compare:
- `ingestion_jobs`
- `claim_ingestion_jobs`
- `user_source_subscriptions`
- any exact shapes tied to the edited path

f3) [todo] Product sanity checks:
- subscription refresh still works
- generations still complete
- queue status is not obviously broken
- no persistent stale-state regressions appear beyond the already accepted roughness

## Rollback Order

g1) [have] If the cuts are too harsh, restore in this order:
1. `latest-mine` freshness
2. worker stale-recovery cadence
3. `all_active_subscriptions` breadth
4. low-value cleanup persistence last

## Decision

h1) [have] This plan is trackable and intentionally narrow.

h2) [have] The smallest credible first implementation slice is **Phase 1**.

h3) [todo] If resumed for implementation, start with:
- trigger-path pre-maintenance reduction
- transcript revalidate seeding removal/downshift
- support-table cleanup persistence reduction
