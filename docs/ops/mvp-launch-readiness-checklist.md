# bleuV1 MVP Launch Readiness Checklist

Status: `active`  
Scope: launch-critical and near-term useful hardening for MVP release safety.

## Source of Truth
a1) [have] This file is the single execution board for MVP launch readiness.
a2) [todo] Keep only `P0` and `P1` items active here.
a3) [have] `P2` does not live here. The completed implementation program is `docs/exec-plans/completed/mvp-readiness-review-followup.md`, the remaining active proof tail is `docs/exec-plans/active/mvp-launch-proof-tail.md`, and durable debt lives in `docs/exec-plans/tech-debt-tracker.md`.
a4) [todo] Any launch-related PR must update this file in the same change set.
a5) [todo] A checklist item can be marked `done` only when all four fields are filled:
- `Owner`
- `Target date`
- `Status`
- `Evidence`
a6) [todo] Evidence must be concrete:
- command output
- PR link
- timestamped runbook note
- dashboard screenshot link

## Launch Gate Snapshot (Update Daily)
b1) [todo] Release candidate backend SHA: `set per release`
b2) [todo] Release candidate frontend SHA: `set per release and verify via /release.json`
b3) [have] Latest migration watermark: `20260306143000`
b4) [todo] P0 open count: `0`
b5) [todo] P1 open count: `2`
b6) [todo] Current launch recommendation: `GO (P0 cleared)`.

## P0 Critical (Must Complete Before Launch)

### P0-1 Deployment Parity Guard
c1) [have] Risk: `blocking`
c2) [have] Owner: `david`
c3) [have] Target date: `2026-03-06`
c4) [have] Status: `done`
c5) [have] Scope:
- backend and frontend release SHAs must match planned release commit set
- no deploy drift between Oracle and GitHub `main`
c6) [have] Verification:
- `ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git rev-parse HEAD"`
- `curl -sS https://dsvikstrand.github.io/remix-of-stackwise-advisor/release.json`
- compare with release SHA recorded in this file
c7) [have] Pass criteria:
- exact SHA match
- frontend `release.json.release_sha` matches the backend release SHA
- smoke routes return expected status
c8) [have] Evidence: `Final parity evidence captured in Evidence Log (o14-o17).`

### P0-2 Migration Parity Guard
d1) [have] Risk: `blocking`
d2) [have] Owner: `david`
d3) [have] Target date: `2026-03-06`
d4) [have] Status: `done`
d5) [have] Scope:
- production DB schema matches required migration level for release
d6) [have] Verification:
- `npx supabase migration list`
- confirm latest required migration IDs are applied in production
d7) [have] Pass criteria:
- no pending required migration for release
- no runtime schema errors on critical flows
d8) [have] Evidence: `Final migration parity evidence captured in Evidence Log (o16, o41-o42).`

### P0-3 Credit Fail-Safe (No Silent Fail-Open)
e1) [have] Risk: `blocking`
e2) [have] Owner: `david`
e3) [have] Target date: `2026-03-07`
e4) [have] Status: `done`
e5) [have] Scope:
- production must not silently operate in credit fallback/bypass mode
- missing DB/service-role path must be visible and actionable
e6) [have] Verification:
- startup/runtime validation check recorded in release notes
- `/api/credits` verified with real DB-backed values on production
e7) [have] Pass criteria:
- DB-backed credits confirmed in production
- explicit operator signal on credit path failure
e8) [have] Evidence: `Sidecar outage drill completed with production non-impact evidence (o25-o28).`

### P0-4 Incident Toggle Drill (Pause/Recover)
f1) [have] Risk: `high`
f2) [have] Owner: `david`
f3) [have] Target date: `2026-03-08`
f4) [have] Status: `done`
f5) [have] Scope:
- rehearse intake pause and safe recovery under realistic queue load
f6) [have] Drill sequence:
- set `UNLOCK_INTAKE_ENABLED=false`
- verify deterministic rejection code for new intake
- recover queue health
- set `UNLOCK_INTAKE_ENABLED=true`
f7) [have] Pass criteria:
- full pause/recover run completed within `15` minutes
- no data loss, no stuck-running growth
f8) [have] Evidence: `Pause/recover rerun captured with deterministic paused-endpoint rejection and recovery proof (o29-o31).`

### P0-5 User-Facing Error Copy Normalization
g1) [have] Risk: `high`
g2) [have] Owner: `david`
g3) [have] Target date: `2026-03-09`
g4) [have] Status: `done`
g5) [have] Scope:
- one plain-language message per critical failure class across launch surfaces
g6) [have] Required classes:
- insufficient credits
- transcript unavailable
- rate limited
- queue backpressure / generic retry
g7) [have] Pass criteria:
- no raw internal payload text in user-facing toasts/cards
- same code class maps to same user copy across key pages
g8) [have] Evidence: `Canonical mapper usage verified across Search/SourcePage/Wall/MyFeedTimeline + dedicated test pass (o32-o33).`

### P0-6 Terms/Privacy Baseline
h1) [have] Risk: `high`
h2) [have] Owner: `david`
h3) [have] Target date: `2026-03-09`
h4) [have] Status: `done`
h5) [have] Scope:
- Terms and Privacy pages/routes exist and are reachable from auth surface
h6) [have] Verification:
- route checks in production build
- links on `/auth` resolve correctly
h7) [have] Pass criteria:
- non-placeholder legal baseline content is live
h8) [have] Evidence: `Browser deep-link proof captured via Playwright for /terms, /privacy, /auth (o36-o38).`

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
i7) [todo] Evidence: `Baseline command bundle + workflow implementation evidence captured (o7-o10, o23-o24), and public GitHub Actions page confirms CI Gate workflow is active on main (o61); authenticated ruleset / PR merge-block proof is still pending.`
i8) [have] Runbook:
- `docs/ops/p1-1-p1-2-verification-runbook.md` now captures the exact GitHub settings / PR proof steps and evidence template needed to close this item.

### P1-2 Mobile OAuth Callback Matrix
j1) [todo] Risk: `medium`
j2) [todo] Owner: `david`
j3) [todo] Target date: `2026-03-11`
j4) [todo] Status: `in progress`
j5) [todo] Scope:
- validate connect/import callback reliability on mobile browsers
j6) [todo] Pass criteria:
- returns to intended context consistently for tested browsers
j7) [todo] Evidence: `Playwright callback-evidence suite is now captured for /subscriptions on iPhone/Android emulation and recorded in o58; real-device iPhone Safari is now confirmed in o59, and Android Chrome remains the only open matrix row before closure.`
j8) [have] Runbook:
- `docs/ops/p1-1-p1-2-verification-runbook.md` defines the minimum device/browser matrix, the `/subscriptions` and `/welcome` callback flows, and the exact evidence fields to record.
j9) [todo] Final required rows:
- Android Chrome success + error on `/subscriptions`

### P1-3 Queue and Incident Visibility Bundle
k1) [todo] Risk: `medium`
k2) [todo] Owner: `david`
k3) [todo] Target date: `2026-03-11`
k4) [have] Status: `done`
k5) [todo] Scope:
- establish launch-day command bundle and thresholds used by operators, now including row-count and work-item queue visibility
k6) [todo] Required checks:
- queue depth and stale lease via `/api/ops/queue/health`
- latest ingestion states via `/api/ingestion/jobs/latest`
- transcript/provider failure distribution via metrics scripts
k7) [todo] Pass criteria:
- operator can classify load state in under `5` minutes
k8) [have] Evidence: `Baseline + refreshed queue/ingestion/metrics evidence captured (o11-o13, o18-o20). Weighted queue-health implementation evidence captured (o45-o46). Live production weighted queue drill evidence captured after deploy/hotfix and worker_running fix verification captured (o50-o52). Timed operator classification drill closed in under 5 minutes (o53).`

### P1-4 Feed Query Load Drill
l1) [todo] Risk: `medium`
l2) [todo] Owner: `david`
l3) [todo] Target date: `2026-03-12`
l4) [have] Status: `done`
l5) [todo] Scope:
- run one realistic front-end traffic burst against Home/Wall/My Feed query paths and keep background read load low while those surfaces are active
l6) [todo] Pass criteria:
- no critical DB/API saturation during drill window
- clear tuning actions captured if saturation appears
l7) [have] Evidence: `Drill script implemented and initial public probe captured (o22); lazy credit-refresh implementation evidence captured (o47-o48); production credit-path hotfix restored /api/credits after deploy regression (o49); authenticated API drill, browser lazy-refresh proof, and authenticated frontend burst evidence captured (o54-o56).`

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
- `export RELEASE_SHA="$(git rev-parse HEAD)"`
- `ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git rev-parse HEAD"`
- `curl -sS https://dsvikstrand.github.io/remix-of-stackwise-advisor/release.json`
n2) [todo] Migration parity:
- `npx supabase migration list`
n3) [todo] Health:
- `curl -sS https://bapi.vdsai.cloud/api/health`
n4) [todo] Queue health:
- `curl -sS https://bapi.vdsai.cloud/api/ops/queue/health -H "x-service-token: $INGESTION_SERVICE_TOKEN"`
n4a) [todo] Release smoke:
- `npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://dsvikstrand.github.io/remix-of-stackwise-advisor --release-sha "$RELEASE_SHA"`
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
o25) [have] `2026-03-05T14:55:35Z` - `P0-3` - `preflight health before sidecar drill` - `systemctl is-active agentic-backend.service agentic-worker.service => active/active; curl https://bapi.vdsai.cloud/api/health => {"ok":true}` - `david`
o26) [have] `2026-03-05T14:55:35Z` - `P0-3` - `credits fail-safe sidecar proof` - `sidecar on :18787 with blank SUPABASE_SERVICE_ROLE_KEY returned /api/credits => error_code=CREDITS_UNAVAILABLE and /api/generate-banner => error_code=CREDITS_UNAVAILABLE` - `david`
o27) [have] `2026-03-05T14:55:35Z` - `P0-3` - `production non-impact during sidecar outage simulation` - `public /api/health => {"ok":true}; public /api/credits remained DB-backed (credits_backend_mode=db, credits_backend_ok=true)` - `david`
o28) [have] `2026-03-05T14:55:35Z` - `P0-3` - `sidecar teardown` - `killed sidecar pid 576003; sidecar log retained expected 503 credit responses only` - `david`
o29) [have] `2026-03-05T14:55:35Z` - `P0-4` - `pause drill deterministic rejection proof` - `UNLOCK_INTAKE_ENABLED=false + service restart; POST /api/source-pages/.../videos/generate => error_code=QUEUE_INTAKE_DISABLED` - `david`
o30) [have] `2026-03-05T14:55:35Z` - `P0-4` - `queue-health snapshot during pause` - `local /api/ops/queue/health => ok=true, queue_depth=0, running_depth=0, no stale lease growth` - `david`
o31) [have] `2026-03-05T14:55:35Z` - `P0-4` - `recover drill proof` - `UNLOCK_INTAKE_ENABLED=true + restart; same generate endpoint returned background unlock generation started (job_id=7fac6886-ae0e-4ddf-a645-5e0c1b4bd0bb)` - `david`
o32) [have] `2026-03-05T14:55:35Z` - `P0-5` - `cross-surface canonical error-copy wiring proof` - `rg confirms getLaunchErrorCopy imports/calls in Search.tsx, SourcePage.tsx, Wall.tsx, MyFeedTimeline.tsx` - `david`
o33) [have] `2026-03-05T14:55:35Z` - `P0-5` - `copy normalization behavior proof` - `npm run test -- src/test/launchErrorCopy.test.ts => 1 file passed, 2 tests passed` - `david`
o34) [have] `2026-03-05T14:55:35Z` - `P0-6` - `transport-level deep-link check context` - `HEAD https://dsvikstrand.github.io/remix-of-stackwise-advisor/{terms,privacy,auth} => HTTP/2 404 (GitHub Pages SPA fallback path)` - `david`
o35) [have] `2026-03-05T14:55:35Z` - `P0-6` - `root frontend host is reachable` - `HEAD https://dsvikstrand.github.io/remix-of-stackwise-advisor/ => HTTP/2 200` - `david`
o36) [have] `2026-03-05T15:22:09Z` - `P0-6` - `browser deep-link proof /terms` - `npx playwright screenshot --wait-for-selector "text=Terms of Service" https://dsvikstrand.github.io/remix-of-stackwise-advisor/terms /tmp/bleu-p0-6-proof/terms.png => selector matched, screenshot captured` - `david`
o37) [have] `2026-03-05T15:22:09Z` - `P0-6` - `browser deep-link proof /privacy` - `npx playwright screenshot --wait-for-selector "text=Privacy Policy" https://dsvikstrand.github.io/remix-of-stackwise-advisor/privacy /tmp/bleu-p0-6-proof/privacy.png => selector matched, screenshot captured` - `david`
o38) [have] `2026-03-05T15:22:09Z` - `P0-6` - `browser deep-link proof /auth` - `npx playwright screenshot --wait-for-selector "text=Sign in to create blueprints" https://dsvikstrand.github.io/remix-of-stackwise-advisor/auth /tmp/bleu-p0-6-proof/auth.png => selector matched, screenshot captured` - `david`
o39) [have] `2026-03-05T15:28:54Z` - `P1-1` - `CI Gate rerun passed after docs-link fix` - `GitHub Actions CI Gate #5 for commit b31c663 completed with conclusion=success` - `david`
o40) [todo] `2026-03-05T15:28:54Z` - `P1-1` - `branch-protection required-check evidence pending` - `Need repository-settings proof that required checks block merge to main` - `david`
o41) [have] `2026-03-06T08:13:00Z` - `P0-2` - `migration parity advanced to shared auto-unlock schema` - `npx supabase db push applied 20260306113000_auto_unlock_shared_cost_v1.sql to project qgqqavaogicecvhopgan` - `david`
o42) [have] `2026-03-06T08:14:00Z` - `P0-2` - `post-push migration/schema verification` - `npx supabase migration list => local/remote watermark 20260306113000 matches; supabase gen types --linked shows source_auto_unlock_intents, source_auto_unlock_participants, auto_unlock_intent_id, reserve_source_auto_unlock_intent` - `david`
o43) [have] `2026-03-06T09:18:00Z` - `Provider Safety` - `atomic YouTube quota consume migration applied` - `npx supabase db push applied 20260306143000_youtube_quota_atomic_consume_v1.sql; npx supabase migration list now shows local/remote watermark 20260306143000` - `david`
o44) [have] `2026-03-06T09:18:00Z` - `Provider Safety` - `hot subscription/source-page reads moved off live asset fetches` - `GET /api/source-subscriptions now serves stored source_pages avatars and source-page reads trigger only bounded background sweep; npm run test => 50 files / 195 tests passed` - `david`
o45) [have] `2026-03-06T11:40:00Z` - `P1-3` - `weighted queue admission landed` - `Search/source-page/manual-refresh queue admission now enforces row depth plus work-item limits (hard=250, per-user=40); ops queue health now exposes queue_work_items and per-scope queued_work_items/running_work_items; npm run test => 52 files / 202 tests passed` - `david`
o46) [have] `2026-03-06T11:40:00Z` - `P1-3` - `interactive queue caps reduced to launch-safe defaults` - `SEARCH_GENERATE_MAX_ITEMS=20, SOURCE_UNLOCK_GENERATE_MAX_ITEMS=20, REFRESH_GENERATE_MAX_ITEMS=10; weighted backpressure tests added for Search and manual refresh` - `david`
o47) [have] `2026-03-06T11:40:00Z` - `P1-4` - `global credits polling removed from always-mounted user menu` - `useAiCredits now defaults to one-shot fetch with no interval; UserMenu fetches only while menu is open; Search remains one-shot plus explicit invalidation; npm run build => exit 0 (chunk size warning only)` - `david`
o48) [have] `2026-03-06T11:40:00Z` - `P1-4` - `background credit-load estimate reduced` - `steady-state /api/credits background volume changed from about 100/500/1000 requests per minute at 100/500/1000 signed-in users (60s global menu poll) to 0 steady-state requests per minute with menu-closed lazy loading` - `david`
o49) [have] `2026-03-06T14:30:00Z` - `P1-4` - `production credit-path hotfix deployed and verified` - `pushed/deployed 13e9da13590335046bad9f0c0db16e2ac7d53046; curl /api/credits with two real bearer tokens => 200 with remaining=3, daily_grant=3, capacity=3, credits_backend_mode=db, credits_backend_ok=true` - `david`
o50) [have] `2026-03-06T14:37:00Z` - `P1-3` - `live weighted queue drill proved running work-item visibility` - `two authenticated POST /api/search/videos/generate requests with 3 items each => 202 responses with queue_work_items=3/user_queue_work_items=3; immediate /api/ops/queue/health => queue_depth=0, running_depth=2, running_work_items=6, search_video_generate.running_work_items=6` - `david`
o51) [have] `2026-03-06T15:24:00Z` - `P1-3` - `worker_running health semantics fixed` - `queue health now computes worker_running from fresh running-job lease/heartbeat state and exposes additive local_worker_running/runtime_mode; targeted ops handler tests + typecheck + build passed before deploy` - `david`
o52) [have] `2026-03-06T15:24:00Z` - `P1-3` - `production queue health now reports running workers correctly` - `pushed/deployed 6df22ceb8c1905726c390bacccdf7b40317c8785; during live all_active_subscriptions run, /api/ops/queue/health => worker_running=true, local_worker_running=true, runtime_mode=web_only, running_depth=1, running_work_items=1; after completion => worker_running=false and running_depth=0` - `david`
o53) [have] `2026-03-06T10:28:56Z` - `P1-3` - `timed operator classification drill completed under 5 minutes` - `triggered /api/ingestion/jobs/trigger => queued job 96fb2e5c-7ee4-40ae-834a-fe3d8a65defe; reviewed /api/ops/queue/health, /api/ingestion/jobs/latest, and npm run metrics:queue on Oracle; classified state as healthy/low backlog with no stale leases, latest job succeeded in ~14s, queue metrics median=13253ms p95=19018ms, failure bucket limited to ASYNC_JOB_FAILED=2 historical jobs` - `david`
o54) [have] `2026-03-06T10:34:24Z` - `P1-4` - `authenticated API feed/auth drill completed without critical saturation` - `npm run drill:feed -- --base-url https://bapi.vdsai.cloud --urls /api/credits,/api/profile/09d58bdd-0bd8-40e1-9c9f-0429049d9c16/feed --requests 120 --concurrency 8 --auth-token <fresh-account1-token> --json => requests_succeeded=119, requests_failed=1, latency_p95_ms=1038, status_distribution: 200=119/429=1` - `david`
o55) [have] `2026-03-06T10:40:44Z` - `P1-4` - `browser lazy-credit-refresh proof captured on deployed frontend` - `headless Playwright login on https://dsvikstrand.github.io/remix-of-stackwise-advisor => wall menu-closed idle 70s observed 0 /api/credits requests; opening UserMenu triggered 1 /api/credits request (200); navigating to /search triggered 1 /api/credits request; subsequent 70s search idle observed 0 additional /api/credits requests` - `david`
o56) [have] `2026-03-06T10:43:00Z` - `P1-4` - `authenticated frontend burst across Home/Wall/My Feed stayed clean` - `headless Playwright reused signed-in session for 6 concurrent visits across /, /wall, /my-feed on deployed frontend; observed 32 backend API responses with status_distribution 200=32, api_non_ok_count=0, page_error_count=0` - `david`
o57) [have] `2026-03-06T16:35:00Z` - `P1-1/P1-2` - `verification runbook prepared and runtime paths reviewed` - `A dedicated runbook now captures the GitHub ruleset/PR proof steps plus the mobile callback matrix; current shell still lacks GitHub settings access (gh unavailable), while the YouTube OAuth start/callback flow and frontend callback consumers were reviewed before device-matrix execution` - `david`
o58) [have] `2026-03-06T18:20:00Z` - `P1-2` - `Playwright callback evidence suite passed for subscriptions path` - `npm run test:playwright:p1-oauth => 6 passed, 1 skipped in 44.1s; iPhone and Android emulation both proved /subscriptions callback param cleanup and success/error UI states, while /welcome recorded an explicit skip because the test account was not in a stable onboarding-visible state` - `david`
o59) [have] `2026-03-06T19:05:00Z` - `P1-2` - `real-device iPhone Safari subscriptions callback flows passed` - `Manual device validation confirmed success and denied /subscriptions YouTube OAuth flows both passed on iPhone Safari; landing route stayed /subscriptions, session remained present, and callback params were cleared after return` - `david`
o60) [todo] `P1-2` - `real-device Android Chrome matrix row pending` - `Need one successful and one denied /subscriptions callback run on Android Chrome with screenshot/recording evidence` - `david`
o61) [have] `2026-03-06T19:20:00Z` - `P1-1` - `public GitHub Actions surface confirms CI Gate workflow is active on main` - `Public Actions page for dsvikstrand/remix-of-stackwise-advisor shows workflow "CI Gate" and recent successful runs on main for commits 4ef5f9f, 78ead6c, and b8b94a3; however, this shell still lacks authenticated ruleset / PR merge-block access needed for final branch-protection proof` - `david`

## Deferred (Not Launch Gate)
p1) [have] P2 modularization and post-launch optimizations are intentionally out of launch gate.
p2) [have] Active P2 sequencing lives in:
- `docs/exec-plans/completed/mvp-readiness-review-followup.md`
- `P2-A Coverage -> P2-B Shared Preflight -> P2-C Hygiene`
- remaining active proof-only tail: `docs/exec-plans/active/mvp-launch-proof-tail.md`
p3) [have] Durable post-launch debt lives in:
- `docs/exec-plans/tech-debt-tracker.md`
p4) [have] The first P2 pass is implemented; only long-tail post-launch debt remains in the tracker.
p5) [have] Older launch phase files are historical reference only:
- `docs/exec-plans/completed/mvp-launch-hardening-phases.md`
