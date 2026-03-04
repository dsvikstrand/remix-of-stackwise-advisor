# MVP Launch Hardening Phases

Status: `active`

## Goal
a1) [todo] Execute launch hardening in a phase-by-phase sequence that can be checked off without mixing operational work with unrelated product work.

## Scope
b1) [have] This plan covers launch hardening for queue throughput, worker architecture, dependency resilience, launch controls, and backlog UX.
b2) [have] This plan does not replace the broader strategic notes in `docs/exec-plans/active/bleuv1-mvp-hardening-playbook.md`.
b3) [have] This plan is a practical execution tracker for the queue/reliability work discussed after the MVP feature pass.

## How To Use This Plan
c1) [todo] Treat each phase as a distinct implementation and validation checkpoint.
c2) [todo] Do not start the next phase until the previous phase has a measured outcome.
c3) [todo] Prefer small, measurable changes over broad infrastructure rewrites.
c4) [have] Phase 1 telemetry was shipped in commit `dd473b8` (`Add queue baseline telemetry and metrics`).

## Phase 1 - Baseline and Load Visibility
d1) [todo] Define a realistic launch simulation target:
- `1000` signups
- `1000` blueprint generations in one day
- `100` queued blueprint jobs at once
d2) [todo] Measure current baseline:
- median generation duration
- p95 generation duration
- queue depth growth
- oldest queued job age
- API latency during queue load
- transcript failure rate
- YouTube API failure rate
d3) [have] Minimal instrumentation for Phase 1 is now in place:
- `GET /api/ops/queue/health` exposes queue-age metrics and per-scope oldest-age data
- `npm run metrics:queue` parses queue-worker outcomes from logs
d4) [have] Baseline numbers are now recorded in this file.
d5) [have] Exit criteria:
- current throughput and queue lag are measurable
- the main bottleneck is confirmed with real numbers, not guesswork

### Phase 1 Baseline Capture
d6) [have] Baseline capture date:
- `2026-03-04`
d7) [have] Oracle baseline commands:
- `ssh oracle-free 'source /etc/agentic-backend.env >/dev/null 2>&1; curl -sS http://127.0.0.1:8787/api/ops/queue/health -H "x-service-token: $INGESTION_SERVICE_TOKEN"'`
- `ssh oracle-free 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.20.0 >/dev/null; cd /home/ubuntu/remix-of-stackwise-advisor && npm run metrics:queue -- --source journalctl --json'`
d8) [have] Recorded measured values:
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
d9) [have] Notes:
- Live queue snapshot was fully idle at the capture moment.
- Historical throughput is low enough to justify a controlled concurrency increase as Phase 2.
- Recent failures in the sampled window were transcript-related only.
- The sampled workload was dominated by `all_active_subscriptions`, not direct user-triggered generation.
d10) [have] Exit condition for Phase 1:
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
g1) [todo] Harden the transcript provider path.
g2) [todo] Tighten:
- provider timeout behavior
- retry limits
- failure classification
- backoff on repeated upstream failure
g3) [todo] Harden YouTube API enrichment behavior under quota/rate-limit pressure.
g4) [todo] Confirm optional enrichment remains non-blocking to core generation.
g5) [todo] Exit criteria:
- upstream failures fail fast
- transcript/provider instability no longer causes silent queue pileups
g6) [have] Phase 4A implementation is now added in code:
- low-priority worker-only scheduler for `blueprint_youtube_refresh`
- queue-depth guardrails and per-cycle budgets
- periodic view/comments refresh state with backoff persistence
- page-load behavior unchanged (still stored-data only)

## Phase 5 - Queue Prioritization and Backpressure
h1) [todo] Add or tighten queue priority rules.
h2) [todo] Priority order target:
- direct user-triggered generation
- manual feed/search/source actions
- background sync and enrichment
h3) [todo] Improve overload behavior:
- clearer queue-full handling
- graceful delay states
- ability to suppress lower-priority work during spikes
h4) [todo] Exit criteria:
- core user-triggered actions remain responsive under heavy queue pressure

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
l1) [have] The most important pre-launch phases are:
- Phase 1
- Phase 2
- Phase 3
- at least part of Phase 4
- at least part of Phase 6
l2) [have] The remaining phases improve launch quality and survivability but are not all required before first launch.

## Current Tracking
m1) [have] Phase 1 - Completed (telemetry shipped, baseline captured)
m2) [have] Phase 2 - Completed (`WORKER_CONCURRENCY=4` retained after under-load sample)
m3) [have] Phase 3 - Completed (web/worker split deployed on Oracle)
m4) [have] Phase 4 - In progress (Phase 4A shipped in code; rollout verification pending)
m5) [todo] Phase 5 - Not started
m6) [todo] Phase 6 - Not started
m7) [todo] Phase 7 - Not started
m8) [todo] Phase 8 - Not started

## Validation Notes
n1) [todo] Update this file with measured outcomes after each phase.
n2) [todo] Keep changes phase-scoped so regressions are easy to attribute.
n3) [todo] Do not mix feature work into these phases unless it directly improves launch reliability.
n4) [have] Phase 1 is complete and the first Phase 2 throughput change is deployed; the next action is to capture a meaningful post-change sample under real queue activity.
