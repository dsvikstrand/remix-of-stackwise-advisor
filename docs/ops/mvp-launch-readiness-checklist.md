# bleuV1 MVP Launch Readiness Checklist

Status: `active`  
Scope: small test launch readiness for current source-first bleuV1 product direction.

## Purpose and Scope
a1) [have] This checklist is the canonical launch-readiness source for MVP hardening and rollout safety.
a2) [have] The target is a small test launch where real users can sign up, connect YouTube, import subscriptions, unlock/generate, and engage on Home.
a3) [have] This document is decision-oriented and execution-ready: each item includes risk level, owner placeholder, status, and pass criteria.
a4) [todo] Non-goals for this checklist:
- major feature redesign
- new infrastructure vendors
- broad monetization redesign
- non-YouTube adapter expansion

## Current State Snapshot
b1) [have] Core user flows are implemented:
- auth + onboarding (`/welcome`)
- source subscriptions/import
- shared unlock generation with wallet + queue
- source pages + source video library
- wall/feed/community interactions
b2) [have] Ops hardening primitives exist:
- queue leasing and worker controls
- unlock reliability sweeps
- provider retry/circuit behavior
- queue health/service endpoints
- unlock trace IDs
b3) [have] Validation baseline is currently healthy:
- `npm run test` passes
- `npm run docs:refresh-check -- --json` passes
- `npm run docs:link-check` passes
b4) [have] Known structural risk remains:
- large orchestration files (`server/index.ts`, `src/pages/Wall.tsx`, `src/pages/Subscriptions.tsx`, `src/pages/Search.tsx`)

## Launch Blockers (P0)

### P0-1 Deployment Parity Guard
c1) [todo] Risk: `blocking`  
c2) [todo] Owner: `TBD`  
c3) [todo] Status: `not started`  
c4) [todo] Require backend/frontend commit parity before launch window opens.
c5) [todo] Verification:
- Oracle service commit SHA matches GitHub `main` target SHA
- release notes capture both frontend and backend SHAs
c6) [todo] Pass criteria:
- no route drift in smoke checks (for example, newly shipped endpoints return expected status)

### P0-2 Migration Parity Guard
d1) [todo] Risk: `blocking`  
d2) [todo] Owner: `TBD`  
d3) [todo] Status: `not started`  
d4) [todo] Require production migration watermark verification before release.
d5) [todo] Verification:
- `npx supabase migration list`
- database confirms latest expected migrations applied
d6) [todo] Pass criteria:
- no runtime query errors due to missing columns/tables

### P0-3 Credit Fallback Fail-Safe
e1) [todo] Risk: `blocking`  
e2) [todo] Owner: `TBD`  
e3) [todo] Status: `not started`  
e4) [todo] Ensure production cannot silently run in fallback/bypass-style credits mode.
e5) [todo] Verification:
- service startup/runtime check confirms DB-backed wallet availability
- explicit alert/log for missing service-role credit path
e6) [todo] Pass criteria:
- credit reads/debits are DB-backed under normal production operation

### P0-4 Incident Toggle Drill
f1) [todo] Risk: `high`  
f2) [todo] Owner: `TBD`  
f3) [todo] Status: `not started`  
f4) [todo] Rehearse controlled intake pause/recovery.
f5) [todo] Drill sequence:
- disable intake (`UNLOCK_INTAKE_ENABLED=false`)
- verify new unlock requests are rejected with deterministic code
- recover queue and re-enable intake
f6) [todo] Pass criteria:
- team can execute pause/recover in less than 15 minutes with no data loss

### P0-5 User-Facing Error Copy Normalization
g1) [todo] Risk: `high`  
g2) [todo] Owner: `TBD`  
g3) [todo] Status: `not started`  
g4) [todo] Enforce one plain-language message per critical failure class across major surfaces.
g5) [todo] Required classes:
- insufficient credits
- transcript unavailable
- rate limited
- generic retry
g6) [todo] Pass criteria:
- no raw/internal/dev payload text is exposed in user-facing toasts/cards

### P0-6 Terms/Privacy Baseline
h1) [todo] Risk: `high`  
h2) [todo] Owner: `TBD`  
h3) [todo] Status: `not started`  
h4) [todo] Auth footer references Terms/Privacy; those pages/routes must exist and be reachable.
h5) [todo] Pass criteria:
- links resolve in production and contain non-placeholder baseline content

## Near-Term Hardening (P1)

### P1-1 Notifications MVP
i1) [todo] Risk: `medium`  
i2) [todo] Owner: `TBD`  
i3) [todo] Status: `not started`  
i4) [todo] Scope locked for MVP:
- reply to your comment
- generated blueprint posted/failed
i5) [todo] In-app only first (no push/email required for launch).
i6) [todo] Pass criteria:
- unread badge + list + mark-read path works with dedupe and deep links

### P1-2 CI Gate on Main
j1) [todo] Risk: `medium`  
j2) [todo] Owner: `TBD`  
j3) [todo] Status: `not started`  
j4) [todo] Require checks before merge to `main`:
- `npm run test`
- `npm run build`
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`
j5) [todo] Pass criteria:
- no merge to main without green required checks

### P1-3 Mobile OAuth Callback Matrix
k1) [todo] Risk: `medium`  
k2) [todo] Owner: `TBD`  
k3) [todo] Status: `not started`  
k4) [todo] Validate connect/import callback reliability on mobile browsers.
k5) [todo] Pass criteria:
- user returns to intended onboarding/subscription context consistently

## Follow-Up Improvements (P2)
l1) [todo] Risk: `medium`  
l2) [todo] Owner: `TBD`  
l3) [todo] Status: `not started`  
l4) [todo] Modularization and maintainability:
- split `server/index.ts` route domains
- extract heavy page orchestration into focused hooks/components
l5) [todo] Performance and observability polish:
- tune high-traffic query paths
- add clearer SLO trend views for queue/unlock latency
l6) [todo] Reliability automation refinements:
- expand sweep diagnostics and long-horizon anomaly checks

## Execution Process (Phased Checklist)

### Phase 0 — Preflight
m1) [todo] Freeze release candidate SHA for frontend and backend.
m2) [todo] Record migration watermark and env snapshot.
m3) [todo] Confirm service tokens and required secrets are present.
m4) [todo] Confirm `/api/health` and service-auth health endpoints are reachable.

### Phase 1 — Execute P0 in Order
n1) [todo] Complete P0-1 through P0-6 in strict order.
n2) [todo] After each item, run targeted smoke checks immediately.
n3) [todo] Log evidence links (commands, output snippets, timestamps).

### Phase 2 — Launch Smoke Suite
o1) [todo] Run functional smoke matrix:
- auth/login redirect to `/wall`
- YouTube connect/import
- unlock success/fail paths
- publish success/fail paths
o2) [todo] Run ops smoke matrix:
- queue depth and stale lease checks
- service trigger auth checks
- intake toggle behavior

### Phase 3 — Controlled Rollout
p1) [todo] Launch to small cohort.
p2) [todo] Monitor first 24h against launch metrics thresholds.
p3) [todo] Trigger incident branch if thresholds are breached.

### Phase 4 — Post-Launch Stabilization
q1) [todo] Execute P1 items (notifications MVP, CI gates, mobile OAuth matrix).
q2) [todo] Update checklist statuses and attach evidence.
q3) [todo] Rebaseline launch metrics after first cohort period.

## Verification Matrix
r1) [todo] `Release parity`
- Command: `ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git rev-parse HEAD"`
- Expected: SHA equals release target SHA on GitHub `main`.
- Pass: exact match.
r2) [todo] `Migrations parity`
- Command: `npx supabase migration list`
- Expected: latest required migrations applied.
- Pass: no pending required migration for release.
r3) [todo] `Tests`
- Command: `npm run test`
- Expected: all tests green.
- Pass: zero failing test files.
r4) [todo] `Build`
- Command: `npm run build`
- Expected: production build completes.
- Pass: non-error completion.
r5) [todo] `Docs freshness`
- Command: `npm run docs:refresh-check -- --json`
- Expected: `status=pass`.
- Pass: no missing doc updates.
r6) [todo] `Docs links`
- Command: `npm run docs:link-check`
- Expected: link check passed.
- Pass: zero broken links.
r7) [todo] `Queue health`
- Command: `curl -sS https://bapi.vdsai.cloud/api/ops/queue/health -H "x-service-token: $INGESTION_SERVICE_TOKEN"`
- Expected: healthy response with bounded queue/stale lease counts.
- Pass: no blocking anomalies.

## Important APIs / Interfaces / Types to Track
s1) [have] Existing health/ops interfaces:
- `GET /api/health`
- `GET /api/ops/queue/health` (service token)
- `GET /api/ingestion/jobs/latest` (service token)
- `GET /api/ingestion/jobs/latest-mine` (user auth)
s2) [todo] Notifications MVP planning-only interfaces:
- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`
s3) [todo] Notifications planning type (minimal):
- `NotificationItem { id, type, title, body, link_path, is_read, created_at, dedupe_key }`
s4) [todo] Error-code contract table for launch-critical flows:
- insufficient credits
- transcript unavailable
- rate-limited
- generic retry

## Test Cases and Scenarios
t1) [todo] Release parity tests:
- Oracle service SHA matches `main`
- required migrations applied
t2) [todo] Core functional tests:
- auth/login lands on `/wall`
- import/subscription flows stable
- unlock/generation terminal resolution within expected window
t3) [todo] Failure-path tests:
- transcript unavailable handling
- provider/circuit degraded behavior
- refund/idempotency under retries
t4) [todo] Ops tests:
- queue depth threshold behavior
- stale lease recovery path
- intake pause/resume drill
t5) [todo] Launch metric checks:
- unlock success rate
- queue wait p95
- refund anomaly count
- notification delivery/read rates (after P1 notifications scope lands)

## Ownership and Cadence
u1) [todo] Assign owner per checklist item before launch window.
u2) [todo] Track target date and status for each item:
- `not started`
- `in progress`
- `done`
u3) [todo] Require evidence link per `done` item (command output, dashboard, or PR).
u4) [todo] Hold a daily 10-minute launch-readiness review until all P0 items are complete.

## Assumptions and Defaults
v1) [have] Source of truth is this file: `docs/ops/mvp-launch-readiness-checklist.md`.
v2) [have] Process depth is phased checklist (not full incident runbook).
v3) [have] Notification scope is intentionally narrow for MVP:
- reply to your comment
- generated blueprint posted/failed
v4) [have] No architecture/product-direction pivot is included in this checklist.

