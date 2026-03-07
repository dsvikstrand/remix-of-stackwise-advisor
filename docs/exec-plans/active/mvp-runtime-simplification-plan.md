# MVP Runtime Simplification Plan

Status: `active`

## Goal
a1) [todo] Simplify Bleu's live runtime and release process to a single-service MVP model that is easy to reason about, easy to restart, and robust enough for temporary spikes around `~100` concurrent users.

## Scope
b1) [have] This is an MVP reliability/simplicity plan, not a large-scale production platform plan.
b2) [have] In scope:
- backend runtime mode and queue-processing ownership
- Oracle systemd service shape
- production env/source-of-truth cleanup
- frontend/backend release ordering
- canonical runtime/deploy docs
- modest validation for MVP user spikes

b3) [have] Out of scope:
- multi-host scaling
- Kubernetes/containerization
- queue/storage redesign
- large-scale traffic engineering for `1000+` concurrent users
- billing/product behavior changes unrelated to runtime simplification

## Why This Plan Exists
c1) [have] The current live system works, but the operational model is still more complex than the MVP needs.
c2) [have] The main cleanup drivers are:
- runtime ownership is conceptually split between `combined`, `web_only`, and `worker_only` paths
- production config can still come from multiple places
- frontend and backend releases can drift
- docs describe more runtime complexity than the MVP actually needs

## Target End State
d1) [todo] One production backend service: `agentic-backend.service`.
d2) [todo] One explicit production runtime mode: `combined`.
d3) [todo] One canonical production env source of truth.
d4) [todo] One clear release order: backend first, smoke-check, then frontend release.
d5) [todo] One canonical runbook that answers how Bleu runs in production today.
d6) [todo] Keep existing queue, rate-limit, and backpressure protections unless validation proves they need tuning.

## Execution Rule
e1) [have] This file is the umbrella phase plan only.
e2) [todo] Before implementation of each phase, create or confirm a focused implementation plan for that phase.
e3) [todo] Keep changes additive and reversible where practical.

## Phases

### Phase 1: Runtime Model Lock
f1) [todo] Goal:
- make the single-service MVP runtime intentional instead of accidental

f2) [todo] Primary files/surfaces:
- `server/index.ts`
- `server/services/runtimeConfig.ts`
- `server/services/queuedIngestionWorkerController.ts`
- `server/services/youtubeRefreshSchedulerController.ts`
- Oracle systemd units

f3) [todo] Actions:
- define `combined` as the only supported production runtime for MVP
- make queue processing and scheduled background work behave correctly in `combined` mode
- remove ambiguity between request-triggered queue kicks and long-lived worker behavior
- retire the production split-service path for now, while preserving code-level rollback options only if clearly justified

f4) [todo] Success criteria:
- one process handles HTTP + queue + scheduled background work after restart
- delayed/retry background work does not depend on incoming user traffic to keep moving
- runtime behavior is understandable from one code path

### Phase 2: Production Config Source Consolidation
g1) [todo] Goal:
- make production restart behavior deterministic

g2) [todo] Primary files/surfaces:
- `server/loadEnv.ts`
- `.env.example`
- `.env.production`
- Oracle `/etc/agentic-backend.env`
- Oracle systemd drop-ins

g3) [todo] Actions:
- define the single canonical production env source
- stop the production backend from implicitly depending on repo-adjacent `.env` files
- consolidate runtime-critical settings so they are not split across multiple hidden places
- preserve a simple local-development env story without leaking that model into production

g4) [todo] Success criteria:
- production boot does not depend on repo `.env` or `.env.production`
- a restart reads the same runtime settings every time
- operators can answer "where does this setting come from?" with one clear location

### Phase 3: Release Contract Simplification
h1) [todo] Goal:
- prevent frontend/backend drift during normal MVP shipping

h2) [todo] Primary files/surfaces:
- `.github/workflows/pages.yml`
- deployment/runbook docs
- Oracle release commands

h3) [todo] Actions:
- define a release contract where backend compatibility lands before the frontend depends on it
- simplify the frontend release trigger if needed so API-shape changes do not publish prematurely
- document one small smoke-check bundle for every deploy

h4) [todo] Success criteria:
- a new frontend cannot publicly depend on a backend route that is not live yet
- releases are easy to perform manually without hidden steps
- post-deploy verification is lightweight and repeatable

### Phase 4: Docs And Ops Canonicalization
i1) [todo] Goal:
- make the current runtime truth easy to find and hard to misread

i2) [todo] Primary files/surfaces:
- `README.md`
- `docs/README.md`
- `docs/exec-plans/index.md`
- `docs/ops/yt2bp_runbook.md`
- historical hardening docs that still imply the split-service model

i3) [todo] Actions:
- align canonical docs to the single-service MVP runtime
- demote split-worker guidance to historical/deferred status where appropriate
- keep only one normal-read path for "how prod works now"

i4) [todo] Success criteria:
- repo navigation makes the current runtime model obvious
- historical rollout context no longer reads like the current production contract
- runtime/deploy docs agree with the actual live setup

### Phase 5: MVP Validation And Capacity Guard
j1) [todo] Goal:
- prove the simpler runtime is robust enough for the intended MVP load band

j2) [todo] Primary files/surfaces:
- backend validation commands
- queue-health endpoints
- lightweight load/drill tooling
- launch/readiness evidence docs if needed

j3) [todo] Actions:
- run restart smoke checks for health, auth, queue processing, and one async background path
- verify a queued job progresses without a dedicated worker service
- run one modest concurrency/load drill aligned to the MVP target rather than a large-scale benchmark
- adjust only the minimum operational knobs needed from observed results

j4) [todo] Success criteria:
- no route/version drift on release
- no stuck queue after restart
- the app remains operational under a realistic MVP spike

## Recommended Order
k1) [todo] Implement Phase 1 first because the runtime ownership model drives every later cleanup.
k2) [todo] Implement Phase 2 next because config/source-of-truth cleanup makes restarts trustworthy.
k3) [todo] Implement Phase 3 after runtime/config are stable so the release contract matches the new reality.
k4) [todo] Implement Phase 4 as part of or immediately after the technical cleanup so docs do not drift again.
k5) [todo] Use Phase 5 as the closeout gate for the simplified MVP runtime.

## Deferred Until Proven Necessary
l1) [have] Dedicated worker-service production topology.
l2) [have] Multi-node background processing.
l3) [have] Advanced secret-management systems beyond a clean single-source Oracle setup.
l4) [have] Large-scale throughput engineering for traffic well beyond the MVP target.

## Completion Rule
m1) [todo] Move this file to `docs/exec-plans/completed/` when the live system is operating on the simplified single-service contract and the release/config/docs/validation work is all closed.
