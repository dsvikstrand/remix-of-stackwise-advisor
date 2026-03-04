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
d3) [todo] Add any missing minimal instrumentation needed to measure those values.
d4) [todo] Record the baseline numbers in this file once collected.
d5) [todo] Exit criteria:
- current throughput and queue lag are measurable
- the main bottleneck is confirmed with real numbers, not guesswork

### Phase 1 Baseline Capture
d6) [todo] Baseline capture date:
- `YYYY-MM-DD`
d7) [todo] Sample commands:
- `npm run metrics:queue -- --source journalctl --json`
- `curl -sS http://127.0.0.1:8787/api/ops/queue/health -H "x-service-token: <INGESTION_SERVICE_TOKEN>"`
d8) [todo] Record measured values:
- `queue_depth`
- `running_depth`
- `oldest_queued_age_ms`
- `oldest_running_age_ms`
- `duration_median_ms`
- `duration_p95_ms`
- `jobs_per_minute_estimate`
- `error_code_distribution`
d9) [todo] Notes:
- capture unusual backlog scopes
- capture notable transcript/provider failure spikes

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

## Phase 3 - Process Separation (Web vs Worker)
f1) [todo] Split API serving from queue execution.
f2) [todo] Introduce a dedicated worker process that runs queue work only.
f3) [todo] Keep the same DB-backed queue and code paths; do not redesign the queue itself in this phase.
f4) [todo] Confirm:
- API remains responsive while queue is busy
- worker can run independently of web traffic
f5) [todo] Exit criteria:
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
m1) [todo] Phase 1 - Not started
m2) [todo] Phase 2 - Not started
m3) [todo] Phase 3 - Not started
m4) [todo] Phase 4 - Not started
m5) [todo] Phase 5 - Not started
m6) [todo] Phase 6 - Not started
m7) [todo] Phase 7 - Not started
m8) [todo] Phase 8 - Not started

## Validation Notes
n1) [todo] Update this file with measured outcomes after each phase.
n2) [todo] Keep changes phase-scoped so regressions are easy to attribute.
n3) [todo] Do not mix feature work into these phases unless it directly improves launch reliability.
