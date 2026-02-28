# Repo Cleanup Baseline (c1) - 2026-02-28

## Scope
a1) [have] This baseline captures current state only (no debloat removals yet).  
a2) [have] Target phase: `c1` from cleanup plan (snapshot + build + route map + smoke checklist).  
a3) [todo] Start code removal/debloat in `c2+` only after this baseline is accepted.

## Snapshot
b1) [have] Timestamp (UTC): `2026-02-28T09:30:03Z`.  
b2) [have] Branch: `main`.  
b3) [have] HEAD at snapshot: `4ad0a5c`.  
b4) [have] Local workspace was dirty before baseline:
- `D bp_example.md`
- `?? docs/golden_blueprint/prompt_logs/`
b5) [have] These pre-existing local changes were intentionally left untouched in this baseline pass.

## Build Baseline
c1) [have] `npm run build` succeeded.  
c2) [have] Build emits non-blocking chunk-size warnings (`>500kB`) and Browserslist staleness warning.

## Frontend Route Map (Current)
d1) [have] Source of truth: `src/App.tsx`.  
d2) [have] Public/auth routes currently registered:
- `/`
- `/explore`
- `/blueprints` (redirect -> `/wall`)
- `/youtube`
- `/channels`
- `/search` (auth)
- `/b/:channelSlug`
- `/my-feed` (auth)
- `/subscriptions` (auth)
- `/s/:platform/:externalId`
- `/welcome` (auth)
- `/wall`
- `/wall/:postId` (auth)
- `/auth`
- `/inventory`
- `/inventory/create` (auth)
- `/inventory/:inventoryId`
- `/inventory/:inventoryId/build`
- `/blueprint/:blueprintId/edit` (auth)
- `/blueprint/:blueprintId`
- `/blueprint/:blueprintId/remix` (auth)
- `/settings` (auth)
- `/u/:userId`
- `/tags` (redirect -> `/channels`)
- `/about`
- `*` (NotFound)

## Backend API Map (Current)
e1) [have] Source of truth: `server/index.ts` Express route registrations.  
e2) [have] Health/core generation endpoints:
- `GET /api/health`
- `GET /api/credits`
- `POST /api/generate-inventory`
- `POST /api/analyze-blueprint`
- `POST /api/generate-blueprint`
- `POST /api/youtube-to-blueprint`
- `POST /api/generate-banner`

e3) [have] YouTube search/connection endpoints:
- `GET /api/youtube-search`
- `POST /api/search/videos/generate`
- `GET /api/youtube-channel-search`
- `GET /api/youtube/channels/:channelId/videos`
- `GET /api/youtube/connection/status`
- `POST /api/youtube/connection/start`
- `GET /api/youtube/connection/callback`
- `GET /api/youtube/subscriptions/preview`
- `POST /api/youtube/subscriptions/import`
- `DELETE /api/youtube/connection`

e4) [have] Source page + subscriptions endpoints:
- `POST /api/source-subscriptions`
- `GET /api/source-pages/search`
- `GET /api/source-pages/:platform/:externalId`
- `GET /api/source-pages/:platform/:externalId/videos`
- `POST /api/source-pages/:platform/:externalId/videos/unlock`
- `POST /api/source-pages/:platform/:externalId/videos/generate`
- `GET /api/source-pages/:platform/:externalId/blueprints`
- `POST /api/source-pages/:platform/:externalId/subscribe`
- `DELETE /api/source-pages/:platform/:externalId/subscribe`
- `GET /api/source-subscriptions`
- `POST /api/source-subscriptions/refresh-scan`
- `POST /api/source-subscriptions/refresh-generate`
- `PATCH /api/source-subscriptions/:id`
- `DELETE /api/source-subscriptions/:id`
- `POST /api/source-subscriptions/:id/sync`

e5) [have] Jobs/trace/ops endpoints:
- `GET /api/ingestion/jobs/:id`
- `GET /api/ingestion/jobs/latest-mine`
- `POST /api/ingestion/jobs/trigger`
- `GET /api/ingestion/jobs/latest`
- `GET /api/generation-runs/:runId`
- `GET /api/blueprints/:id/generation-trace`
- `GET /api/ops/queue/health`
- `POST /api/source-pages/assets/sweep`
- `POST /api/auto-banner/jobs/trigger`
- `GET /api/auto-banner/jobs/latest`

e6) [have] Feed/notifications/channel-candidates endpoints:
- `GET /api/profile/:userId/feed`
- `GET /api/notifications`
- `POST /api/notifications/read-all`
- `POST /api/notifications/:id/read`
- `POST /api/my-feed/items/:id/accept`
- `POST /api/my-feed/items/:id/skip`
- `POST /api/my-feed/items/:id/auto-publish`
- `POST /api/channel-candidates`
- `GET /api/channel-candidates/:id`
- `POST /api/channel-candidates/:id/evaluate`
- `POST /api/channel-candidates/:id/publish`
- `POST /api/channel-candidates/:id/reject`
- `POST /api/debug/subscriptions/:id/simulate-new-uploads`

## Targeted Smoke Checklist (Pre-removal Regression Guard)
f1) [todo] Auth + session: login/logout and route guards (`/search`, `/my-feed`, `/settings`).  
f2) [todo] Blueprint read path: open `/blueprint/:id`, verify summary/takeaways/bleup/interactives render.  
f3) [todo] YouTube direct generation path: trigger from `/youtube`, confirm success + feed insertion.  
f4) [todo] Search generate path: `/search` -> select videos -> generate.  
f5) [todo] Source page path: `/s/:platform/:externalId` list videos + unlock/generate.  
f6) [todo] My Feed decisions: accept/skip/auto-publish actions.  
f7) [todo] Notifications: list + mark read + mark all read.  
f8) [todo] Traceability: `/api/blueprints/:id/generation-trace` for a fresh generation.  
f9) [todo] Subscriptions refresh scan/generate flow.  
f10) [todo] Queue health endpoint sanity (`/api/ops/queue/health`).

## c1 Exit
g1) [have] Baseline snapshot completed and documented.  
g2) [todo] Proceed to `c2` dead-code/deprecated-path inventory and removal plan.
