# bleuV1 Refactor a3 Response Shape Baseline

This file captures envelope-level response expectations used during no-behavior-change refactor checks.

Status
s01) [have] Baseline captured before route extraction.
s02) [todo] Re-validate after each phase.

Envelope Pattern
s03) [have] Most endpoints return `{ ok, error_code, message, data }`.
s04) [have] Health route remains special-case `{ ok: true }`.

Representative Shapes
s05) [have] `GET /api/generation-runs/:runId`
- success: `ok=true`, `error_code=null`, `message='generation trace'`, `data.run_id`, `data.status`, `data.model`, `data.quality`, `data.events`, `data.next_cursor`.
- failure: `ok=false`, `error_code in { INVALID_INPUT, AUTH_REQUIRED, CONFIG_ERROR, NOT_FOUND, READ_FAILED }`.

s06) [have] `GET /api/blueprints/:id/generation-trace`
- success: `data.source in { generation_runs, legacy_selected_items }`, `data.blueprint_id`, trace payload.
- failure: `error_code in { AUTH_REQUIRED, CONFIG_ERROR, NOT_FOUND, TRACE_NOT_FOUND, READ_FAILED }`.

s07) [have] `GET /api/notifications`
- success: `data` from notification list service with pagination cursor.

s08) [have] `POST /api/ingestion/jobs/trigger`
- success: `202` with `data.job_id`, `data.queue_depth`, `data.trace_id`.
- failure: `error_code in { SERVICE_AUTH_REQUIRED, CONFIG_ERROR, JOB_ALREADY_RUNNING, QUEUE_BACKPRESSURE, READ_FAILED, WRITE_FAILED }`.

s09) [have] `POST /api/my-feed/items/:id/accept`
- success: `data.user_feed_item_id`, `data.blueprint_id`, `data.state`, `data.reason_code`.
- failure: `error_code in { AUTH_REQUIRED, CONFIG_ERROR, READ_FAILED, NOT_FOUND, SOURCE_MISSING, INVALID_STATE, GENERATION_FAILED }`.
