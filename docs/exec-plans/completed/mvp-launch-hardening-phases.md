# MVP Launch Hardening Phases

Status: `completed`

## Reference Status
a0) [have] This file is historical reference only.
a00) [have] Current launch-gate truth lives in `docs/ops/mvp-launch-readiness-checklist.md`.
a000) [have] Current active proof-only sequencing lives in `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`, and the completed implementation program lives in `docs/exec-plans/completed/mvp-readiness-review-followup.md`.
a0000) [have] Older runtime/config states in this file, including split worker topology or superseded env/drop-in layouts, are factual rollout history only and must not be used as the current Oracle production contract.

## Goal
a1) [todo] Execute launch hardening in a phase-by-phase sequence that can be checked off without mixing operational work with unrelated product work.

## Scope
b1) [have] This plan covers launch hardening for queue throughput, worker architecture, dependency resilience, launch controls, and backlog UX.
b2) [have] This plan does not replace the broader strategic notes in `docs/exec-plans/completed/bleuv1-mvp-hardening-playbook.md`.
b3) [have] This plan is a practical execution tracker for the queue/reliability work discussed after the MVP feature pass.

## Launch Gate Control
c1) [have] MVP launch go/no-go is controlled by `docs/ops/mvp-launch-readiness-checklist.md`.
c2) [have] This phase file tracks implementation sequencing and evidence, not final launch authorization.
c3) [have] Checklist sync milestone completed on `2026-03-05`:
- P0/P1 owner/date/status fields are filled
- baseline command evidence bundle is appended in checklist Evidence Log
- launch snapshot reflects current SHA and migration watermark
c4) [todo] Keep phase status in sync with the checklist P0/P1 board after every material change.
c5) [have] Service-auth queue visibility blocker resolved on `2026-03-05`:
- `INGESTION_SERVICE_TOKEN` source confirmed in systemd drop-in (`10-ingestion-token.conf`)
- queue-health and latest-ingestion evidence were captured successfully and appended to checklist Evidence Log (`o11-o13`)
c6) [have] Launch gate closeout pass (A8/A9) status:
- P0-1 and P0-2 parity evidence are done in checklist.
- P0-3/P0-4/P0-5/P0-6 now have production-closeout evidence and are marked done.
- Launch checklist snapshot now reports `P0 open count: 0` and `GO (P0 cleared)`.
c7) [have] A9 P0 evidence closeout update on `2026-03-05`:
- P0-3 is now closed with sidecar fail-safe proof (`CREDITS_UNAVAILABLE`) and production non-impact evidence (`o25-o28`).
- P0-4 is now closed with deterministic paused-endpoint rejection and recovery proof (`o29-o31`).
- P0-5 is now closed with canonical mapper cross-surface wiring and dedicated test evidence (`o32-o33`).
- P0-6 is now closed with browser-level deep-link proof on deployed frontend routes (`/terms`, `/privacy`, `/auth`; see `o36-o38`).
c8) [have] P1-1 evidence refresh on `2026-03-05`:
- CI Gate run `#5` on commit `b31c663` passed after docs-link cleanup (`o39`).
- `P1-1` remains in progress until branch-protection required-check enforcement evidence is captured (`o40`).

## How To Use This Plan
d1) [todo] Treat each phase as a distinct implementation and validation checkpoint.
d2) [todo] Do not start the next phase until the previous phase has a measured outcome.
d3) [todo] Prefer small, measurable changes over broad infrastructure rewrites.
d4) [have] Phase 1 telemetry was shipped in commit `dd473b8` (`Add queue baseline telemetry and metrics`).

## Phase 1 - Baseline and Load Visibility
e1) [todo] Define a realistic launch simulation target:
- `1000` signups
- `1000` blueprint generations in one day
- `100` queued blueprint jobs at once
e2) [todo] Measure current baseline:
- median generation duration
- p95 generation duration
- queue depth growth
- oldest queued job age
- API latency during queue load
- transcript failure rate
- YouTube API failure rate
e3) [have] Minimal instrumentation for Phase 1 is now in place:
- `GET /api/ops/queue/health` exposes queue-age metrics and per-scope oldest-age data
- `npm run metrics:queue` parses queue-worker outcomes from logs
e4) [have] Baseline numbers are now recorded in this file.
e5) [have] Exit criteria:
- current throughput and queue lag are measurable
- the main bottleneck is confirmed with real numbers, not guesswork

### Phase 1 Baseline Capture
e6) [have] Baseline capture date:
- `2026-03-04`
e7) [have] Oracle baseline commands:
- `ssh oracle-free 'source /etc/agentic-backend.env >/dev/null 2>&1; curl -sS http://127.0.0.1:8787/api/ops/queue/health -H "x-service-token: $INGESTION_SERVICE_TOKEN"'`
- `ssh oracle-free 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.20.0 >/dev/null; cd /home/ubuntu/remix-of-stackwise-advisor && npm run metrics:queue -- --source journalctl --json'`
e8) [have] Recorded measured values:
- `snapshot_at`: `2026-03-04T15:40:42.703Z`
- `queue_depth`: `0`
- `running_depth`: `0`
- `oldest_queued_age_ms`: `null`
- `oldest_running_age_ms`: `null`
- `duration_median_ms`: `13046.5`
- `duration_p95_ms`: `45764`
- `duration_max_ms`: `71676`
- `jobs_per_minute_estimate`: `0.38`
- `error_code_distribution`:
  - `TRANSCRIPT_UNAVAILABLE: 2`
- `scope_distribution`:
  - `all_active_subscriptions: 104`
  - `source_item_unlock_generation: 8`
  - `source_auto_unlock_retry: 4`
e9) [have] Notes:
- Live queue snapshot was fully idle at the capture moment.
- Historical throughput is low enough to justify a controlled concurrency increase as Phase 2.
- Recent failures in the sampled window were transcript-related only.
- The sampled workload was dominated by `all_active_subscriptions`, not direct user-triggered generation.
e10) [have] Exit condition for Phase 1:
- baseline snapshot is recorded here
- one historical log sample is recorded here
- Phase 2 starts only after those values are written down

## Phase 2 - Quick Throughput Wins
e1) [todo] Increase worker throughput with minimal change first.
e2) [todo] Test `WORKER_CONCURRENCY` at:
- `4`
- then `6` only if stable
e3) [todo] Keep `WORKER_BATCH_SIZE` unchanged unless metrics show claim overhead is the problem.
e4) [todo] Re-check:
- jobs completed per minute
- oldest queued job age
- API responsiveness under load
e5) [todo] Exit criteria:
- backlog drains faster than baseline
- API responsiveness does not materially regress

### Phase 2 Execution Record
e6) [have] First controlled change applied on Oracle:
- `WORKER_CONCURRENCY: 2 -> 4`
- runtime config is loaded from `/etc/agentic-backend.env`
- deployed and verified on `2026-03-04`

e7) [have] Post-change live verification:
- `snapshot_at`: `2026-03-04T15:51:56.047Z`
- `queue_depth`: `0`
- `running_depth`: `0`
- `oldest_queued_age_ms`: `null`
- `oldest_running_age_ms`: `null`
- `worker_concurrency`: `4`

e8) [have] Post-change historical metrics sample:
- `finished_count`: `114`
- `failed_count`: `2`
- `duration_median_ms`: `13167.5`
- `duration_p95_ms`: `45764`
- `duration_max_ms`: `71676`
- `jobs_per_minute_estimate`: `0.38`

e9) [have] Notes:
- The live config change is active and verified.
- The sampled historical metrics did not materially change yet because the queue was idle and no meaningful new load was applied after the change.
- Oracle requires Node 20 for `npm run metrics:queue`; use the `nvm use 20.20.0` command path above instead of the system Node.

e10) [have] Under-load post-change sample is now captured and representative enough to make a decision.
e11) [have] Post-change under-load live snapshot:
- `snapshot_at`: `2026-03-04T16:13:52.702Z`
- `queue_depth`: `1`
- `running_depth`: `0`
- `oldest_queued_age_ms`: `250392`
- `oldest_running_age_ms`: `null`
- `worker_concurrency`: `4`
- active queued scope:
  - `source_auto_unlock_retry: queued=1`

e12) [have] Post-change under-load historical metrics sample (since rollout):
- `finished_count`: `11`
- `failed_count`: `2`
- `duration_median_ms`: `15102`
- `duration_p95_ms`: `18533`
- `duration_max_ms`: `18533`
- `jobs_per_minute_estimate`: `0.62`
- `error_code_distribution`:
  - `TRANSCRIPT_UNAVAILABLE: 2`
- `scope_distribution`:
  - `all_active_subscriptions: 8`
  - `source_auto_unlock_retry: 3`
  - `source_item_unlock_generation: 2`

e13) [have] Comparison vs Phase 1 baseline:
- `jobs_per_minute_estimate`: `0.38 -> 0.62` (`+63%`)
- `duration_median_ms`: `13046.5 -> 15102` (`+15.8%`)
- `duration_p95_ms`: `45764 -> 18533` (`-59.5%`)
- transcript-related failures remain present and unchanged in type (`TRANSCRIPT_UNAVAILABLE`)

e14) [have] Decision:
- keep `WORKER_CONCURRENCY=4`
- do not test `6` yet
- treat Phase 2 as successful enough to proceed to the next phase only if API responsiveness under queue load remains a concern

e15) [have] Exit condition for Phase 2:
- one real under-load sample is recorded
- before/after comparison is recorded
- the decision outcome is recorded here

## Phase 3 - Process Separation (Web vs Worker)
f1) [have] Split API serving from queue execution.
f2) [have] Introduced a dedicated worker process that runs queue work only.
f3) [have] Kept the same DB-backed queue and code paths; no queue redesign was needed in this phase.
f4) [have] Phase 3 rollout details:
- code deployed with runtime role flags:
  - `RUN_HTTP_SERVER`
  - `RUN_INGESTION_WORKER`
- combined mode remains available as rollback
- `agentic-backend.service` now runs in web-only mode
- `agentic-worker.service` now runs in worker-only mode
- Oracle startup logs confirm:
  - web: `runtime_mode=web_only`
  - worker: `runtime_mode=worker_only`
f5) [have] Validation:
- API remains responsive while queue is busy
- worker can run independently of web traffic
 - web local `/api/ops/queue/health` reports `worker_running=false`
 - public `/api/health` remains healthy after the split
 - worker logs show queue activity without binding the public port
f6) [have] Exit criteria:
- web and worker are separately operable
- queue spikes no longer directly choke API responsiveness

## Phase 4 - Dependency Resilience
g1) [have] Hardened the transcript provider path.
g2) [have] Tightened:
- provider timeout behavior
- retry limits
- failure classification
- backoff on repeated upstream failure
g3) [have] Hardened YouTube API enrichment behavior under quota/rate-limit pressure.
g4) [have] Confirmed optional enrichment remains non-blocking to core generation.
g5) [have] Exit criteria achieved:
- upstream failures fail fast
- transcript/provider instability no longer causes silent queue pileups
g6) [have] Phase 4A implementation is now added in code:
- low-priority worker-only scheduler for `blueprint_youtube_refresh`
- queue-depth guardrails and per-cycle budgets
- periodic view/comments refresh state with backoff persistence
- page-load behavior unchanged (still stored-data only)
g7) [have] Phase 4A closeout verification captured on `2026-03-04`:
- target blueprint: `f6b0aa1d-4b87-4f0d-a4d5-8c9de7027e0d`
- forced-due smoke test executed by setting both `next_view_refresh_at` and `next_comments_refresh_at` to past timestamps
- worker scheduler cycle enqueued `2` refresh jobs (`view_count` + `comments`)
- both refresh jobs completed with `status=succeeded` and no error codes
- refresh-state advanced as expected:
  - `last_view_refresh_status=ok`
  - `last_comments_refresh_status=ok`
  - failure counters remained `0`
  - next due timestamps moved forward to normal cadence windows
- source metadata updated by refresh (`view_count` and `view_count_fetched_at` changed)
g8) [have] Phase 4B closeout verification captured on `2026-03-04`:
- deployed commit: `4fee142` (`Harden transcript fail-fast classification and retry behavior`)
- production test case used a disposable queued unlock with terminal transcript outcome:
  - `video_id`: `_qh1BDb-aaa`
  - `source_item_id`: `666768ca-c076-45ba-b1e1-0a2843f28edf`
  - `unlock_id`: `90c1fb8a-4f33-42c8-80be-232e8b44130d`
  - `queue_job_id`: `978b20aa-060d-4548-9d7b-ccbd66ac3087`
- observed terminal behavior:
  - `error_code=ACCESS_DENIED`
  - unlock moved to `transcript_status=confirmed_no_speech`
  - `transcript_retry_after=null`
  - `last_error_code=ACCESS_DENIED`
- verified retry suppression:
  - no matching `source_auto_unlock_retry` jobs were enqueued for that `source_item_id`
  - worker logs include `transcript_confirmed_no_speech` with `"fail_fast": true`
g9) [have] Exit criteria:
- upstream failures fail fast
- transcript/provider instability no longer causes silent queue pileups
g10) [have] Comments refresh policy updated (`2026-03-05`) to quota-safer lifecycle:
- auto at `+15m`
- auto at `+24h`
- then manual-only refresh via blueprint endpoint with `24h` per-blueprint cooldown

## Phase 5 - Queue Prioritization and Backpressure
h1) [have] Added and tightened queue priority rules.
h2) [have] Priority order target implemented:
- direct user-triggered generation
- manual feed/search/source actions
- background sync and enrichment
h3) [have] Improved overload behavior:
- clearer queue-full handling
- graceful delay states
- ability to suppress lower-priority work during spikes
h4) [have] Exit criteria met:
- core user-triggered actions remain responsive under heavy queue pressure
h5) [have] Phase 5A implementation shipped in code:
- queue priority tiers (`high`/`medium`/`low`) with tiered worker claims
- low-priority enqueue suppression under queue pressure
- queue health response includes per-scope priority metadata
- runbook/env knobs added for tier batch sizes and suppression threshold
h6) [have] Phase 5A closeout validation captured on `2026-03-04`:
- controlled suppression smoke test executed on Oracle with a deterministic low-priority queue-depth probe
- test runtime override:
  - `QUEUE_PRIORITY_ENABLED=true`
  - `QUEUE_LOW_PRIORITY_SUPPRESSION_DEPTH=1`
- trigger result from `POST /api/ingestion/jobs/trigger`:
  - `message: "low-priority ingestion enqueue suppressed due to queue pressure"`
  - `data.suppressed: true`
  - `data.scope: "all_active_subscriptions"`
  - `data.queue_depth: 1`
  - `data.suppression_depth: 1`
- backend journal evidence:
  - `[queue_low_priority_suppressed]` logged with `scope=all_active_subscriptions`, `queue_depth=1`, `priority=low`
- queue priority metadata remains visible in `/api/ops/queue/health` (`by_scope.*.priority`)
- cleanup completed after test:
  - temporary systemd override removed
  - backend + worker services restarted into normal config
  - local and public health checks returned `ok=true`
h7) [todo] Optional Phase 5B follow-up (not required for Phase 5A closeout):
- run a longer mixed-scope backlog sample and record tier-drain ordering under sustained load
- capture post-change throughput snapshot with `npm run metrics:queue -- --source journalctl --json`
h8) [have] Search quota hardening implementation added in code (cache-first + global budget guard):
- new cache table + service for `/api/youtube-search` and `/api/youtube-channel-search`
- stale-serve fallback when global live-call budget is constrained
- global cooldown path after provider `RATE_LIMITED` responses
- env knobs + runbook documentation added for tuning and launch safety

## Phase 6 - Launch Controls and Safeguards
i1) [todo] Add operational kill switches and launch toggles.
i2) [todo] Target controls:
- pause queue intake
- pause background sync
- pause optional enrichment
- keep direct generation only
- temporarily lower per-user limits if needed
i3) [todo] Document exactly how to use these controls during launch.
i4) [todo] Exit criteria:
- you can reduce system load without emergency code edits
i5) [have] Free-user daily generation cap guard is now implemented (`5/day` default, global UTC rollover, allowlist bypass), including:
- central enforcement across direct + queued generation paths
- additive visibility in `/api/credits`
- stable denial code `DAILY_GENERATION_CAP_REACHED`
i6) [todo] Remaining Phase 6 focus is launch tuning + operator playbook for cap values and bypass procedures.

## Phase 7 - Launch-Day UX for Delay and Recovery
j1) [todo] Make backlog and delay states explicit in the UI.
j2) [todo] Improve:
- queued state
- processing state
- delayed state
- non-fatal “still pending” messaging
j3) [todo] Avoid presenting slow queue behavior as unexplained failure.
j4) [todo] Exit criteria:
- users can tell the difference between waiting and failure

## Phase 8 - Post-Launch Stabilization
k1) [todo] Review real launch data before investing in deeper architecture changes.
k2) [todo] Reassess after live usage:
- queue depth under real traffic
- transcript provider reliability
- YouTube quota pressure
- need for further worker scaling
k3) [todo] Decide whether to:
- keep the current DB queue
- add more worker capacity
- replace/strengthen transcript infrastructure
k4) [todo] Exit criteria:
- next operational investment is based on observed data, not forecast guesses

## Priority Order Before MVP Launch
m1) [have] The most important pre-launch phases are:
- Phase 1
- Phase 2
- Phase 3
- at least part of Phase 4
- at least part of Phase 6
m2) [have] The remaining phases improve launch quality and survivability but are not all required before first launch.
m3) [have] Launch release gating must be read from `docs/ops/mvp-launch-readiness-checklist.md` P0/P1 status.

## Current Tracking
n1) [have] Phase 1 - Completed (telemetry shipped, baseline captured)
n2) [have] Phase 2 - Completed (`WORKER_CONCURRENCY=4` retained after under-load sample)
n3) [have] Phase 3 - Completed (web/worker split deployed on Oracle)
n4) [have] Phase 4 - Completed (Phase 4A + Phase 4B shipped and closeout-verified)
n5) [have] Phase 5 - Completed (Phase 5A implemented and closeout-verified)
n6) [todo] Phase 6 - In progress (daily cap implemented; launch-toggle/operator playbook and drill evidence pending)
n7) [todo] Phase 7 - Deferred until after P0/P1 launch gate items are complete
n8) [todo] Phase 8 - Deferred until post-launch data review window
n9) [have] A7 operationalization Phase A/B is complete (governance metadata + first evidence bundle captured in checklist).

## Validation Notes
o1) [todo] Update this file with measured outcomes after each phase.
o2) [todo] Keep changes phase-scoped so regressions are easy to attribute.
o3) [todo] Do not mix feature work into these phases unless it directly improves launch reliability.
o4) [have] Phase 1-5 are complete with recorded evidence; immediate focus is checklist P0/P1 closeout + Phase 6 launch controls.
