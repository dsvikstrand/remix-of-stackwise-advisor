# bleuV1 Refactor a3 — Parity Checklist

Status
p01) [have] Baseline commit captured at `63420eb`.
p02) [have] Backend route inventory captured from `server/index.ts`.
p03) [todo] Preserve API path/method inventory during route modularization.
p04) [todo] Preserve auth + limiter ordering/behavior.
p05) [todo] Preserve response envelope patterns (`ok`, `error_code`, `message`, `data`).
p06) [todo] Preserve active MVP flows (`/youtube`, search generate, source-page unlock/generate, notifications, generation trace).

No-Behavior-Change Invariants
p07) [todo] No endpoint path additions/removals in refactor phases.
p08) [todo] No intentional response payload contract drift.
p09) [todo] No DB schema changes in refactor phases.
p10) [todo] No UI/UX behavior changes in backend-first phases.

Validation Gates (Per PR)
p11) [todo] `npm run build`
p12) [todo] `npm run test`
p13) [todo] Route parity diff against `bleuv1-refactor-a3-route-map-baseline.txt`.
p14) [todo] Smoke-check representative endpoints for envelope/shape parity.

Representative Endpoint Shape Checks
p15) [todo] `GET /api/health` -> `{"ok": true}`
p16) [todo] `GET /api/generation-runs/:runId` -> envelope with `data.run_id`, `data.model`, `data.quality`, `data.events`.
p17) [todo] `GET /api/blueprints/:id/generation-trace` -> envelope with `data.source` and trace payload.
p18) [todo] `GET /api/notifications` -> envelope with list payload.
p19) [todo] `POST /api/ingestion/jobs/trigger` -> queue response with `data.job_id`.
p20) [todo] `POST /api/my-feed/items/:id/accept` -> publish response with `data.blueprint_id`.
