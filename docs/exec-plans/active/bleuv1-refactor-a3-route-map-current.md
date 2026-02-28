# bleuV1 Refactor a3 Route Map (Current)

Generated at: 2026-02-28

Status
c01) [have] Total registered API routes across backend: `53`
c02) [have] `server/index.ts` direct `app.*` route registrations: `0`
c03) [have] Phase 2 extraction moved heavy route callback logic into `server/handlers/*` for YouTube + Source Pages while preserving route registration parity.

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
- targeted local smoke run executed (env-limited for Supabase-backed auth flows)
