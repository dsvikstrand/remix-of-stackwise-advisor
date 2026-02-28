# bleuV1 Refactor a3 — Parity Checklist

Status
p01) [have] Baseline commit captured at `63420eb`.
p02) [have] Backend route inventory captured from `server/index.ts`.
p03) [have] API path/method inventory preserved during route modularization (`53` total routes before/after).
p04) [have] Auth + limiter ordering/behavior preserved by verbatim route-body extraction into `server/routes/*`.
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
p14) [todo] Smoke-check representative endpoints for envelope/shape parity.

Representative Endpoint Shape Checks
p15) [todo] `GET /api/health` -> `{"ok": true}`
p16) [todo] `GET /api/generation-runs/:runId` -> envelope with `data.run_id`, `data.model`, `data.quality`, `data.events`.
p17) [todo] `GET /api/blueprints/:id/generation-trace` -> envelope with `data.source` and trace payload.
p18) [todo] `GET /api/notifications` -> envelope with list payload.
p19) [todo] `POST /api/ingestion/jobs/trigger` -> queue response with `data.job_id`.
p20) [todo] `POST /api/my-feed/items/:id/accept` -> publish response with `data.blueprint_id`.
