# bleuV1 Refactor a3 Route Map Baseline

Status: `completed (historical baseline artifact)`

Baseline commit: 63420eb
Generated at: 2026-02-28T10:19:56Z

Total app.* routes in server/index.ts: 53

| line | method | path |
|---:|:---|:---|
| 1118 | GET | `/api/health` |
| 1122 | GET | `/api/profile/:userId/feed` |
| 1365 | GET | `/api/credits` |
| 1374 | POST | `/api/analyze-blueprint` |
| 1444 | POST | `/api/youtube-to-blueprint` |
| 1551 | GET | `/api/youtube-search` |
| 1648:app.post( |  | `` |
| 1770 | GET | `/api/youtube-channel-search` |
| 1843:app.get( |  | `` |
| 1964 | GET | `/api/youtube/connection/status` |
| 2021 | POST | `/api/youtube/connection/start` |
| 2089 | GET | `/api/youtube/connection/callback` |
| 2192 | GET | `/api/youtube/subscriptions/preview` |
| 2275 | POST | `/api/youtube/subscriptions/import` |
| 2492 | DELETE | `/api/youtube/connection` |
| 7693 | POST | `/api/source-subscriptions` |
| 7950 | GET | `/api/source-pages/search` |
| 8029 | GET | `/api/source-pages/:platform/:externalId` |
| 8159:app.get( |  | `` |
| 8882:app.post( |  | `` |
| 8888:app.post( |  | `` |
| 8895 | GET | `/api/source-pages/:platform/:externalId/blueprints` |
| 9248 | POST | `/api/source-pages/:platform/:externalId/subscribe` |
| 9408 | DELETE | `/api/source-pages/:platform/:externalId/subscribe` |
| 9494 | GET | `/api/source-subscriptions` |
| 9541 | POST | `/api/source-subscriptions/refresh-scan` |
| 9586 | POST | `/api/source-subscriptions/refresh-generate` |
| 9737 | PATCH | `/api/source-subscriptions/:id` |
| 9787 | DELETE | `/api/source-subscriptions/:id` |
| 9821 | POST | `/api/source-subscriptions/:id/sync` |
| 9889 | GET | `/api/ingestion/jobs/:id([0-9a-fA-F-]{36})` |
| 9940 | GET | `/api/ingestion/jobs/latest-mine` |
| 10061 | GET | `/api/generation-runs/:runId` |
| 10113 | GET | `/api/blueprints/:id([0-9a-fA-F-]{36})/generation-trace` |
| 10214 | GET | `/api/notifications` |
| 10245 | POST | `/api/notifications/read-all` |
| 10273 | POST | `/api/notifications/:id([0-9a-fA-F-]{36})/read` |
| 10313 | POST | `/api/ingestion/jobs/trigger` |
| 10409 | GET | `/api/ingestion/jobs/latest` |
| 10454 | GET | `/api/ops/queue/health` |
| 10535 | POST | `/api/source-pages/assets/sweep` |
| 10558 | POST | `/api/auto-banner/jobs/trigger` |
| 10639 | GET | `/api/auto-banner/jobs/latest` |
| 10687 | POST | `/api/debug/subscriptions/:id/simulate-new-uploads` |
| 10793 | POST | `/api/my-feed/items/:id/accept` |
| 10933 | POST | `/api/my-feed/items/:id/skip` |
| 10963 | POST | `/api/my-feed/items/:id/auto-publish` |
| 11046 | POST | `/api/channel-candidates` |
| 11090 | GET | `/api/channel-candidates/:id` |
| 11128 | POST | `/api/channel-candidates/:id/evaluate` |
| 11236 | POST | `/api/channel-candidates/:id/publish` |
| 11313 | POST | `/api/channel-candidates/:id/reject` |
| 12960 | POST | `/api/generate-banner` |
