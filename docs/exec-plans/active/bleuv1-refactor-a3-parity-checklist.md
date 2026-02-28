# bleuV1 Refactor a3 — Parity Checklist

Status
p01) [have] Baseline commit captured at `63420eb`.
p02) [have] Backend route inventory captured from `server/index.ts`.
p03) [have] API path/method inventory preserved during route modularization (`53` total routes before/after).
p04) [have] Auth + limiter ordering/behavior preserved by Phase 2 handler extraction into `server/handlers/*` with thin route delegators.
p05) [have] Response envelope patterns (`ok`, `error_code`, `message`, `data`) preserved in extracted handlers.
p06) [have] Active MVP flows preserved (`/youtube`, search generate, source-page unlock/generate, notifications, generation trace) via build+test pass.
p07) [have] Phase 3 orchestration extraction completed for all target hotspots from `server/index.ts`:
- `runSourcePageAssetSweep` -> `server/services/sourcePageAssetSweep.ts`
- `processAutoBannerQueue` -> `server/services/autoBannerQueue.ts`
- `syncSingleSubscription` -> `server/services/sourceSubscriptionSync.ts`
- `runYouTubePipeline` -> `server/services/youtubeBlueprintPipeline.ts`
- `createBlueprintFromVideo` -> `server/services/blueprintCreation.ts`
p08) [have] `server/index.ts` remains composition/wiring oriented for extracted orchestration callables (no direct route registrations).

No-Behavior-Change Invariants
p09) [have] No endpoint path additions/removals in this phase.
p10) [have] No intentional response payload contract drift in this phase.
p11) [have] No DB schema changes in this phase.
p12) [have] No UI/UX behavior changes in this backend-first phase.

Validation Gates (Per PR)
p13) [have] `npm run build`
p14) [have] `TMPDIR=/tmp npm run test`
p15) [have] `server/index.ts` direct route registrations remain `0` after Phase 3 extraction.
p16) [have] Route parity diff reconfirmed in this slice (`53` total routes) with route-map refresh evidence.
p17) [have] Local runtime smoke (`TMPDIR=/tmp npx -y tsx server/index.ts` + curl matrix) passes after extraction wiring fixes.
p18) [have] Targeted Oracle service-token smoke-checks passed (`/api/ops/queue/health` `200`, `/api/ingestion/jobs/latest` `200`, `/api/ingestion/jobs/trigger` `202`) after persisting token in `agentic-backend.service` runtime env.

Representative Endpoint Shape Checks
p19) [have] `GET /api/health` -> `200` with `{"ok":true}`.
p20) [todo] `GET /api/generation-runs/:runId` -> local smoke blocked by missing Supabase runtime config in this environment (`500 CONFIG_ERROR`).
p21) [todo] `GET /api/blueprints/:id/generation-trace` -> not executed in this pass.
p22) [todo] `GET /api/notifications` -> local smoke blocked by missing Supabase runtime config in this environment (`500 CONFIG_ERROR` before auth envelope).
p23) [have] `POST /api/ingestion/jobs/trigger` (no service token) -> `401 SERVICE_AUTH_REQUIRED`.
p24) [todo] `POST /api/my-feed/items/:id/accept` -> not executed in this pass.
p25) [have] `POST /api/youtube-to-blueprint` invalid payload -> `400 INVALID_URL`.
p26) [have] `GET /api/source-pages/search?q=a` -> `400 INVALID_QUERY`.
p27) [have] `GET /api/ops/queue/health` (no service token) -> `401 SERVICE_AUTH_REQUIRED`.
p28) [have] `GET /api/credits` unauth returns `401` after local runtime mapping (`SUPABASE_URL <- VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY <- VITE_SUPABASE_PUBLISHABLE_KEY`).

Phase 4 (b1+b2) Core/Ops Contract Tightening
p29) [have] Added canonical contract modules for this slice:
- `server/contracts/api/shared.ts`
- `server/contracts/api/core.ts`
- `server/contracts/api/ops.ts`
p30) [have] `server/routes/core.ts` and `server/handlers/coreHandlers.ts` now consume `CoreRouteDeps` from `server/contracts/api/core.ts`.
p31) [have] `server/routes/ops.ts` and `server/handlers/opsHandlers.ts` now consume `OpsRouteDeps` from `server/contracts/api/ops.ts`.
p32) [have] No endpoint path changes or response-envelope key changes were introduced in the core/ops contract rewiring.
