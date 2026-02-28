# bleuV1 Refactor a3 — Parity Checklist

Status
p01) [have] Baseline commit captured at `63420eb`.
p02) [have] Backend route inventory captured from `server/index.ts`.
p03) [have] API path/method inventory preserved during route modularization (`53` total routes before/after).
p04) [have] Auth + limiter ordering/behavior preserved by Phase 2 handler extraction into `server/handlers/*` with thin route delegators.
p05) [have] Response envelope patterns (`ok`, `error_code`, `message`, `data`) preserved in extracted handlers.
p06) [have] Active MVP flows preserved (`/youtube`, search generate, source-page unlock/generate, notifications, generation trace) via build+test pass.

No-Behavior-Change Invariants
p07) [have] No endpoint path additions/removals in this phase.
p08) [have] No intentional response payload contract drift in this phase.
p09) [have] No DB schema changes in this phase.
p10) [have] No UI/UX behavior changes in this backend-first phase.

Validation Gates (Per PR)
p11) [have] `npm run build`
p12) [have] `TMPDIR=/tmp npm run test`
p13) [have] Route parity diff confirmed (`53` total route registrations before/after).
p14) [have] Targeted smoke-checks executed locally via `TMPDIR=/tmp npx -y tsx server/index.ts` (partial env-limited results captured).

Representative Endpoint Shape Checks
p15) [have] `GET /api/health` -> `200` with `{"ok":true}`.
p16) [todo] `GET /api/generation-runs/:runId` -> local smoke blocked by missing Supabase runtime config in this environment (`500 CONFIG_ERROR`).
p17) [todo] `GET /api/blueprints/:id/generation-trace` -> not executed in this pass.
p18) [todo] `GET /api/notifications` -> local smoke blocked by missing Supabase runtime config in this environment (`500 CONFIG_ERROR` before auth envelope).
p19) [have] `POST /api/ingestion/jobs/trigger` (no service token) -> `401 SERVICE_AUTH_REQUIRED`.
p20) [todo] `POST /api/my-feed/items/:id/accept` -> not executed in this pass.
p21) [have] `POST /api/youtube-to-blueprint` invalid payload -> `400 INVALID_URL`.
p22) [have] `GET /api/source-pages/search?q=a` -> `400 INVALID_QUERY`.
