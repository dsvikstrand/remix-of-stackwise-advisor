# bleuV1 Refactor a3 Route Map (Current)

Generated at: 2026-02-28

Status
c01) [have] Total registered API routes across backend: `53`
c02) [have] `server/index.ts` direct `app.*` route registrations: `0`
c03) [have] Phase 2 extraction moved heavy route callback logic into `server/handlers/*` for YouTube + Source Pages while preserving route registration parity.
c04) [have] Phase 4 slice (`b1+b2`) tightened `core + ops` route/handler contracts via `server/contracts/api/*` with no route distribution change.
c05) [have] Phase 4 remaining slice tightened contracts for `youtube`, `sourcePages`, and `sourceSubscriptions` via `server/contracts/api/*` with no route distribution change.

Current Distribution
- `server/routes/core.ts`: 4
- `server/routes/sourceSubscriptions.ts`: 7
- `server/routes/ops.ts`: 7
- `server/routes/channels.ts`: 5
- `server/routes/feed.ts`: 3
- `server/routes/notifications.ts`: 3
- `server/routes/tracing.ts`: 2
- `server/routes/ingestion.ts`: 2
- `server/routes/profile.ts`: 1
- `server/handlers/youtubeHandlers.ts`: 11
- `server/handlers/sourcePagesHandlers.ts`: 8

Validation
- `npm run build` passed
- `TMPDIR=/tmp npm run test` passed
- targeted local smoke run executed (including unauth checks for tracing/notifications/feed accept under mapped Supabase runtime env)
- route recount command confirms `53` registered routes and `0` direct registrations in `server/index.ts`
- targeted Oracle service-token smoke re-verified (`queue/health` `200`, `jobs/latest` `200`, `jobs/trigger` `202`)
