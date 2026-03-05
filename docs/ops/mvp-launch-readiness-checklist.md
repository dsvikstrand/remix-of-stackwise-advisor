# bleuV1 MVP Launch Readiness Checklist

Status: `active`  
Scope: launch-critical and near-term useful hardening for MVP release safety.

## Source of Truth
a1) [have] This file is the single execution board for MVP launch readiness.
a2) [todo] Keep only `P0` and `P1` items active here.
a3) [todo] Any launch-related PR must update this file in the same change set.
a4) [todo] A checklist item can be marked `done` only when all four fields are filled:
- `Owner`
- `Target date`
- `Status`
- `Evidence`
a5) [todo] Evidence must be concrete:
- command output
- PR link
- timestamped runbook note
- dashboard screenshot link

## Launch Gate Snapshot (Update Daily)
b1) [have] Release candidate backend SHA: `bc309d095678d7193e756078cfd02bd108965b89`
b2) [have] Release candidate frontend SHA: `bc309d095678d7193e756078cfd02bd108965b89`
b3) [have] Latest migration watermark: `20260305174500`
b4) [todo] P0 open count: `4`
b5) [todo] P1 open count: `4`
b6) [todo] Current launch recommendation: `NO-GO` until all P0 items are `done`.

## P0 Critical (Must Complete Before Launch)

### P0-1 Deployment Parity Guard
c1) [todo] Risk: `blocking`
c2) [todo] Owner: `david`
c3) [todo] Target date: `2026-03-06`
c4) [have] Status: `done`
c5) [todo] Scope:
- backend and frontend release SHAs must match planned release commit set
- no deploy drift between Oracle and GitHub `main`
c6) [todo] Verification:
- `ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git rev-parse HEAD"`
- compare with release SHA recorded in this file
c7) [todo] Pass criteria:
- exact SHA match
- smoke routes return expected status
c8) [have] Evidence: `Final parity evidence captured in Evidence Log (o14-o17).`

### P0-2 Migration Parity Guard
d1) [todo] Risk: `blocking`
d2) [todo] Owner: `david`
d3) [todo] Target date: `2026-03-06`
d4) [have] Status: `done`
d5) [todo] Scope:
- production DB schema matches required migration level for release
d6) [todo] Verification:
- `npx supabase migration list`
- confirm latest required migration IDs are applied in production
d7) [todo] Pass criteria:
- no pending required migration for release
- no runtime schema errors on critical flows
d8) [have] Evidence: `Final migration parity evidence captured in Evidence Log (o16).`

### P0-3 Credit Fail-Safe (No Silent Fail-Open)
e1) [todo] Risk: `blocking`
e2) [todo] Owner: `david`
e3) [todo] Target date: `2026-03-07`
e4) [todo] Status: `in progress`
e5) [todo] Scope:
- production must not silently operate in credit fallback/bypass mode
- missing DB/service-role path must be visible and actionable
e6) [todo] Verification:
- startup/runtime validation check recorded in release notes
- `/api/credits` verified with real DB-backed values on production
e7) [todo] Pass criteria:
- DB-backed credits confirmed in production
- explicit operator signal on credit path failure
e8) [todo] Evidence: `Implementation evidence captured (o24-o25); production outage drill and deployed closure evidence pending.`

### P0-4 Incident Toggle Drill (Pause/Recover)
f1) [todo] Risk: `high`
f2) [todo] Owner: `david`
f3) [todo] Target date: `2026-03-08`
f4) [todo] Status: `in progress`
f5) [todo] Scope:
- rehearse intake pause and safe recovery under realistic queue load
f6) [todo] Drill sequence:
- set `UNLOCK_INTAKE_ENABLED=false`
- verify deterministic rejection code for new intake
- recover queue health
- set `UNLOCK_INTAKE_ENABLED=true`
f7) [todo] Pass criteria:
- full pause/recover run completed within `15` minutes
- no data loss, no stuck-running growth
f8) [todo] Evidence: `Pause/recover toggle execution captured (o21), but endpoint-level deterministic rejection proof is still pending for final closure.`

### P0-5 User-Facing Error Copy Normalization
g1) [todo] Risk: `high`
g2) [todo] Owner: `david`
g3) [todo] Target date: `2026-03-09`
g4) [todo] Status: `in progress`
g5) [todo] Scope:
- one plain-language message per critical failure class across launch surfaces
g6) [todo] Required classes:
- insufficient credits
- transcript unavailable
- rate limited
- queue backpressure / generic retry
g7) [todo] Pass criteria:
- no raw internal payload text in user-facing toasts/cards
- same code class maps to same user copy across key pages
g8) [todo] Evidence: `Shared mapper + tests landed (o24-o25); production UI verification screenshots pending.`

### P0-6 Terms/Privacy Baseline
h1) [todo] Risk: `high`
h2) [todo] Owner: `david`
h3) [todo] Target date: `2026-03-09`
h4) [todo] Status: `in progress`
h5) [todo] Scope:
- Terms and Privacy pages/routes exist and are reachable from auth surface
h6) [todo] Verification:
- route checks in production build
- links on `/auth` resolve correctly
h7) [todo] Pass criteria:
- non-placeholder legal baseline content is live
h8) [todo] Evidence: `Routes/pages/links implemented and validated in build/tests (o24-o25); production route checks pending.`

## P1 Useful (Strongly Recommended Before Launch)

### P1-1 CI Gate On Main
i1) [todo] Risk: `high`
i2) [todo] Owner: `david`
i3) [todo] Target date: `2026-03-10`
i4) [todo] Status: `in progress`
i5) [todo] Required checks:
- `npm run test`
- `npm run build`
- `npx tsc --noEmit`
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`
i6) [todo] Pass criteria:
- merge to `main` is blocked on required checks
i7) [todo] Evidence: `Baseline command bundle + workflow implementation evidence captured (o7-o10, o23-o24); branch-protection merge-block evidence pending.`

### P1-2 Mobile OAuth Callback Matrix
j1) [todo] Risk: `medium`
j2) [todo] Owner: `david`
j3) [todo] Target date: `2026-03-11`
j4) [todo] Status: `not started`
j5) [todo] Scope:
- validate connect/import callback reliability on mobile browsers
j6) [todo] Pass criteria:
- returns to intended context consistently for tested browsers
j7) [todo] Evidence: `Pending mobile callback matrix run records (browser/device table).`

### P1-3 Queue and Incident Visibility Bundle
k1) [todo] Risk: `medium`
k2) [todo] Owner: `david`
k3) [todo] Target date: `2026-03-11`
k4) [todo] Status: `in progress`
k5) [todo] Scope:
- establish launch-day command bundle and thresholds used by operators
k6) [todo] Required checks:
- queue depth and stale lease via `/api/ops/queue/health`
- latest ingestion states via `/api/ingestion/jobs/latest`
- transcript/provider failure distribution via metrics scripts
k7) [todo] Pass criteria:
- operator can classify load state in under `5` minutes
k8) [todo] Evidence: `Baseline + refreshed queue/ingestion/metrics evidence captured (o11-o13, o18-o20). 5-minute timed operator classification drill evidence still pending.`

### P1-4 Feed Query Load Drill
l1) [todo] Risk: `medium`
l2) [todo] Owner: `david`
l3) [todo] Target date: `2026-03-12`
l4) [todo] Status: `in progress`
l5) [todo] Scope:
- run one realistic front-end traffic burst against Home/Wall/My Feed query paths
l6) [todo] Pass criteria:
- no critical DB/API saturation during drill window
- clear tuning actions captured if saturation appears
l7) [todo] Evidence: `Drill script implemented and initial public probe captured (o22); auth-surface drill and saturation decision log pending.`

## Execution Cadence
m1) [todo] Daily (10 min):
- review only P0/P1 status, blockers, and owner/date changes
- no deep implementation discussion inside this meeting
m2) [todo] Weekly go/no-go snapshot:
- P0 open count
- latest load drill outcome
- latest incident drill outcome
- parity + migration status
m3) [todo] Governance rule:
- if any P0 is not `done`, launch stays `NO-GO`

## Verification Command Bundle
n1) [todo] Release parity:
- `ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git rev-parse HEAD"`
n2) [todo] Migration parity:
- `npx supabase migration list`
n3) [todo] Health:
- `curl -sS https://bapi.vdsai.cloud/api/health`
n4) [todo] Queue health:
- `curl -sS https://bapi.vdsai.cloud/api/ops/queue/health -H "x-service-token: $INGESTION_SERVICE_TOKEN"`
n5) [todo] Tests:
- `npm run test`
n6) [todo] Build:
- `npm run build`
n7) [todo] Typecheck:
- `npx tsc --noEmit`
n8) [todo] Docs freshness:
- `npm run docs:refresh-check -- --json`
n9) [todo] Docs links:
- `npm run docs:link-check`

## Evidence Log (Append-Only)
o1) [have] `2026-03-05T13:18:13Z` - `P0-1` - `oracle ssh connectivity and backend SHA parity baseline captured` - `ssh -o BatchMode=yes -o ConnectTimeout=10 oracle-free "echo ok" => ok` - `david`
o2) [have] `2026-03-05T13:18:13Z` - `P0-1` - `oracle backend SHA captured` - `ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git rev-parse HEAD" => bc309d095678d7193e756078cfd02bd108965b89` - `david`
o3) [have] `2026-03-05T13:18:13Z` - `P0-1` - `local release SHA captured` - `git rev-parse HEAD => bc309d095678d7193e756078cfd02bd108965b89` - `david`
o4) [have] `2026-03-05T13:18:13Z` - `P0-2` - `migration parity snapshot captured` - `npx supabase migration list => local/remote watermark 20260305174500 matches` - `david`
o5) [have] `2026-03-05T13:18:13Z` - `P1-3` - `public health baseline captured` - `curl -sS https://bapi.vdsai.cloud/api/health => {"ok":true}` - `david`
o6) [todo] `2026-03-05T13:18:13Z` - `P1-3` - `queue health check blocked by missing service token` - `ssh oracle-free 'source /etc/agentic-backend.env; curl .../api/ops/queue/health -H "x-service-token: $INGESTION_SERVICE_TOKEN"' => SERVICE_AUTH_REQUIRED; token state check => MISSING` - `david`
o7) [have] `2026-03-05T13:18:13Z` - `P1-1` - `typecheck baseline passed` - `npx tsc --noEmit => exit 0` - `david`
o8) [have] `2026-03-05T14:19:28Z` - `P1-1` - `test baseline passed` - `npm run test => 43 files passed, 166 tests passed` - `david`
o9) [have] `2026-03-05T13:18:13Z` - `P1-1` - `build baseline passed` - `npm run build => exit 0 (chunk size warning only)` - `david`
o10) [have] `2026-03-05T13:18:13Z` - `P1-1` - `docs checks baseline passed` - `npm run docs:refresh-check -- --json => pass; npm run docs:link-check => PASSED` - `david`
o11) [have] `2026-03-05T13:30:57Z` - `P1-3` - `service token source resolved for ops endpoints` - `ssh oracle-free "sudo systemctl cat agentic-backend.service" => token is set via drop-in /etc/systemd/system/agentic-backend.service.d/10-ingestion-token.conf` - `david`
o12) [have] `2026-03-05T13:30:57Z` - `P1-3` - `queue health baseline captured with service auth` - `curl local/public /api/ops/queue/health with token from systemd show => ok=true, worker_running=false, queue_depth=1, scope source_auto_unlock_retry queued=1` - `david`
o13) [have] `2026-03-05T13:30:57Z` - `P1-3` - `latest ingestion status baseline captured with service auth` - `curl /api/ingestion/jobs/latest with token => ok=true, latest scope=all_active_subscriptions, status=succeeded` - `david`
o14) [have] `2026-03-05T13:56:08Z` - `P0-1` - `release SHA parity recaptured` - `local git rev-parse HEAD and oracle git rev-parse HEAD both => bc309d095678d7193e756078cfd02bd108965b89` - `david`
o15) [have] `2026-03-05T13:56:15Z` - `P0-2` - `migration parity recaptured` - `npx supabase migration list => local/remote watermark 20260305174500 matches` - `david`
o16) [have] `2026-03-05T13:56:18Z` - `P0-1` - `public health recaptured` - `curl -sS https://bapi.vdsai.cloud/api/health => {\"ok\":true}` - `david`
o17) [have] `2026-03-05T13:58:40Z` - `P1-3` - `queue health refreshed with service auth` - `curl /api/ops/queue/health => ok=true; queue_depth=1; oldest_queued_age_ms=6224255; worker_concurrency=4` - `david`
o18) [have] `2026-03-05T13:58:41Z` - `P1-3` - `latest ingestion status refreshed` - `curl /api/ingestion/jobs/latest => ok=true; scope=all_active_subscriptions; status=succeeded` - `david`
o19) [have] `2026-03-05T13:59:49Z` - `P1-3` - `queue metrics refreshed` - `npm run metrics:queue -- --source journalctl --json => finished=150 failed=2 median_ms=13218 p95_ms=19045` - `david`
o20) [have] `2026-03-05T14:01:52Z` - `P0-4` - `incident pause/recover env toggle exercised` - `UNLOCK_INTAKE_ENABLED set false->true with backend/worker restarts; services active after recovery; deterministic rejection evidence still pending endpoint proof` - `david`
o21) [have] `2026-03-05T14:02:37Z` - `P1-4` - `feed load drill script baseline executed` - `npm run drill:feed ... => requests_total=90, latency_p95_ms=643, statuses: 200=30/401=60 (auth endpoints need bearer-token matrix)` - `david`
o22) [have] `2026-03-05T14:05:40Z` - `P0-3/P0-5/P0-6` - `implementation validation pass` - `npx tsc --noEmit; targeted vitest suite (credits/coreHandlers/launchErrorCopy/youtubeHandlers); npm run build => all pass` - `david`
o23) [have] `2026-03-05T14:06:20Z` - `P1-1` - `CI workflow added` - `.github/workflows/ci.yml includes npm ci, tsc, test, build, docs refresh check, docs link check` - `david`
o24) [have] `2026-03-05T14:09:40Z` - `P1-1` - `full validation pass` - `npm run test => 47 files / 174 tests passed; npm run docs:refresh-check -- --json => status pass; npm run docs:link-check => PASSED` - `david`

## Deferred (Not Launch Gate)
p1) [have] P2 modularization and post-launch optimizations are intentionally out of launch gate.
p2) [have] Track those in:
- `docs/exec-plans/tech-debt-tracker.md`
- `docs/exec-plans/active/mvp-launch-hardening-phases.md` (phases 7/8 and later)
