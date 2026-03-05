# YT2BP v0 Contract

## Scope
- Endpoint: `POST /api/youtube-to-blueprint`
- Version: `v0`
- Stability rule: v0 changes must be additive or versioned.
- 2026-02-12 note: Project 2 Step 1 feed-summary hygiene changes are UI-only and do not alter this contract.
- 2026-02-12 note: Project 2 Step 2 feed-row shell changes are UI-only and do not alter this contract.
- 2026-02-12 note: Project 2 one-row full-tag rendering changes are UI-only and do not alter this contract.
- 2026-02-12 note: Project 2 one-row tag measurement hotfix is UI-only and does not alter this contract.
- 2026-02-13 note: Project 2 Step 3 wall-to-wall shell tightening and Wall/Explore comment counters are UI-only and do not alter this contract.
- 2026-02-13 note: Explore tag-click lookup hotfix (search-first behavior on feed cards) is UI-only and does not alter this contract.
- 2026-02-13 note: Project 3 Step 1 channel join-state UI wiring and filter-only chip behavior are frontend-only and do not alter this contract.
- 2026-02-13 note: Channels IA/routing phase (`/channels`, `/b/:channelSlug`, curated slug guards, `/tags` redirect) is UI-only and does not alter this contract.
- 2026-02-13 note: Channel-scoped `+ Create` flow routes to `/youtube?channel=<slug>&intent=post` and blocks public publish unless channel is valid and joined; this is UI/product behavior and does not alter this endpoint contract.
- 2026-02-13 note: App-wide wall-to-wall layout migration (Run 1) updates YouTube page framing to a minimal document-like layout; UI-only and does not alter this contract.
- 2026-02-17 note: dual-feed rollout moved post-generation behavior to personal-first (`/my-feed`); this does not alter the YT2BP request/response envelope.
- 2026-02-17 note: optional AI review is executed as a separate post-generation step in UI (`/api/analyze-blueprint`) so core YT2BP latency is lower; banner generation remains outside the core YT2BP envelope.
- 2026-02-18 note: subscription ingestion (`/api/source-subscriptions*`, `/api/ingestion/jobs/trigger`) and pending-card accept/skip (`/api/my-feed/items/:id/accept|skip`) are separate flows and do not alter this endpoint envelope.
- 2026-02-18 note: subscription create path now uses auto-only behavior (incoming `mode` is compatibility-only and treated as `auto`); first subscribe sets checkpoint and inserts a `subscription_notice` feed card. This remains outside this endpoint envelope.
- 2026-02-18 note: debug simulation endpoint (`/api/debug/subscriptions/:id/simulate-new-uploads`) is env-gated (`ENABLE_DEBUG_ENDPOINTS`) and service-auth only (`x-service-token`, no user bearer required); this also remains outside the YT2BP envelope.
- 2026-02-18 note: YouTube subscription channel resolution now includes `browseId` fallback parsing for handle pages where direct `channelId` metadata is unavailable.
- 2026-02-17 note: ingestion reliability visibility adds service-auth endpoint `GET /api/ingestion/jobs/latest`; this is an ops path and does not alter the YT2BP envelope.
- 2026-02-17 note: auth-only YouTube discovery endpoint `GET /api/youtube-search` is additive and does not alter the YT2BP envelope.
- 2026-02-17 note: auth-only YouTube channel discovery endpoint `GET /api/youtube-channel-search` is additive and does not alter the YT2BP envelope.
- 2026-02-17 note: `GET /api/source-subscriptions` now includes optional `source_channel_avatar_url` read-time enrichment for UI; this remains outside the YT2BP envelope.
- 2026-02-17 note: subscription auto-ingest generation now enables review-by-default while keeping banner disabled; this remains outside the YT2BP endpoint envelope.
- 2026-02-18 note: subscription notice cards may use `source_items.metadata.channel_banner_url`, and unsubscribe now removes user-scoped notice rows from My Feed; this remains outside the YT2BP endpoint envelope.
- 2026-02-18 note: async auto-banner queue endpoints (`/api/auto-banner/jobs/trigger`, `/api/auto-banner/jobs/latest`) and cap fallback policy are additive ops paths and remain outside the YT2BP endpoint envelope.
- 2026-02-18 note: Search->YouTube route handoff now includes channel context (`channel_id`, `channel_title`, `channel_url`) so save-to-feed can persist source channel metadata; YT2BP endpoint envelope remains unchanged.
- 2026-02-18 note: save-to-feed now preserves channel-title metadata across source upserts so My Feed subtitle mapping stays stable; YT2BP endpoint envelope remains unchanged.
- 2026-02-18 note: `/youtube` UI forces core endpoint calls with `generate_review=false` and `generate_banner=false`; optional review runs as async post-step and can attach after save when available.
- 2026-02-18 note: endpoint timeout is now env-configurable via `YT2BP_CORE_TIMEOUT_MS` (default `120000`, bounded server-side).
- 2026-02-18 note: banner prompt hardening now enforces visual-only imagery and explicitly blocks readable text/typography/logos/watermarks in generated backgrounds.
- 2026-02-18 note: subscription manual-refresh endpoints (`/api/source-subscriptions/refresh-scan`, `/api/source-subscriptions/refresh-generate`) are additive and do not alter the YT2BP endpoint envelope.
- 2026-02-18 note: refresh hardening (`GET /api/ingestion/jobs/:id`, refresh endpoint rate caps, `MAX_ITEMS_EXCEEDED`, `JOB_ALREADY_RUNNING`, failed-video cooldown via `refresh_video_attempts`) is additive and does not alter the YT2BP endpoint envelope.
- 2026-02-18 note: refresh hardening follow-up (`GET /api/ingestion/jobs/latest-mine`, manual-refresh checkpoint-forward updates, cooldown-filter visibility) is additive and does not alter the YT2BP endpoint envelope.
- 2026-02-18 note: auto-channel publish endpoint (`POST /api/my-feed/items/:id/auto-publish`) is additive and does not alter the YT2BP endpoint envelope.
- 2026-02-18 note: auto-channel publish now uses deterministic real-channel classification (tag+alias mapper with `general` fallback) and may return additive classifier metadata (`classifier_mode`, `classifier_reason`); this remains outside the YT2BP endpoint envelope.
- 2026-02-18 note: auto-channel classifier now also supports `llm_labeler_v1` (artifact-only sync label pass, retry once on invalid output, fallback to `general`) and may return additive `classifier_confidence`; still outside this endpoint envelope.
- 2026-02-18 note: profile workspace feed endpoint (`GET /api/profile/:userId/feed`) is additive and does not alter the YT2BP endpoint envelope.
- 2026-02-18 note: high-traffic wording harmonization (`Home`, `Create`, auto-publish phrasing) is UI-only and does not alter this endpoint envelope.
- 2026-02-19 note: YouTube OAuth connect/import endpoints (`/api/youtube/connection/*`, `/api/youtube/subscriptions/*`) are additive onboarding paths and do not alter the YT2BP endpoint envelope.
- 2026-02-19 note: optional first-login onboarding route (`/welcome`) and onboarding-state table (`user_youtube_onboarding`) are additive product surfaces and do not alter the YT2BP endpoint envelope.
- 2026-02-19 note: `/api/youtube/subscriptions/import` now may mark onboarding complete after successful import, which is outside the YT2BP request/response envelope.
- 2026-02-19 note: Source Pages foundation (`source_pages` table + `/api/source-pages/:platform/:externalId` subscribe/read endpoints + `source_page_id` linkage on subscriptions/source_items) is additive and does not alter the YT2BP endpoint envelope.
- 2026-02-19 note: source-page read-path lazy asset hydration (backfilled avatar/banner fill on `GET /api/source-pages/...`) is additive and does not alter the YT2BP endpoint envelope.
- 2026-02-19 note: source-page public feed endpoint (`GET /api/source-pages/:platform/:externalId/blueprints`, deduped + cursor-paginated) is additive and does not alter the YT2BP endpoint envelope.
- 2026-02-19 note: source-page video-library endpoints (`GET /api/source-pages/:platform/:externalId/videos`, `POST /api/source-pages/:platform/:externalId/videos/generate`) are additive and do not alter the YT2BP endpoint envelope.
- 2026-02-19 note: source-page video-library listing now supports `kind=full|shorts` with shorts threshold `<=60s`; additive and outside the YT2BP envelope.
- 2026-02-19 note: source-page video-library list now uses dual rate-limit guards (burst+sustained) and frontend cache/focus-refetch tuning; additive and outside the YT2BP envelope.
- 2026-02-20 note: source-page unlock endpoint (`POST /api/source-pages/:platform/:externalId/videos/unlock`) is additive; legacy `/videos/generate` remains compatibility alias; both are outside this endpoint envelope.
- 2026-02-21 note: source-linked YouTube banners now use thumbnail-first assignment/backfill and source-generation paths bypass auto-banner enqueue; additive and outside this endpoint envelope.
- 2026-02-20 note: source-page unlock route guard is soft-limited (`8/10s` burst + `120/10m` sustained) and no longer uses hard unlock cooldown; additive and outside this endpoint envelope.
- 2026-02-20 note: refill-credit wallet model (`user_credit_wallets`, `credit_ledger`, `/api/credits` refill fields) is additive and outside this endpoint envelope.
- 2026-02-20 note: subscription new-upload ingest now writes unlockable feed rows (`my_feed_unlockable`) before generation; this lifecycle change is outside this endpoint envelope.
- 2026-02-20 note: subscription rows now include `auto_unlock_enabled` (default `true`) and new-upload auto-attempt flow that prioritizes the current subscriber, then samples up to 3 eligible subscribers with bounded retries for shared unlock generation; additive and outside this endpoint envelope.
- 2026-02-20 note: unlock reliability sweeps (expired/stale/orphan recovery) run in source-video routes and service cron trigger path; additive and outside this endpoint envelope.
- 2026-02-20 note: unlock/generate responses now include additive `trace_id` and unlock lifecycle logs propagate the same correlation ID; additive and outside this endpoint envelope.
- 2026-02-20 note: ingestion worker hardening adds queue lease/retry metadata on `ingestion_jobs` and service queue-health endpoint `GET /api/ops/queue/health`; additive and outside this endpoint envelope.
- 2026-02-21 note: permanent no-transcript unlock failures normalize to `NO_TRANSCRIPT_PERMANENT` (legacy `NO_CAPTIONS` compatibility), and associated unlockable feed cards are suppressed; additive and outside this endpoint envelope.
- 2026-02-21 note: transcript truth hardening in source unlock flows now treats `NO_CAPTIONS` as retryable/ambiguous until bounded confirmation retries mark permanent `NO_TRANSCRIPT_PERMANENT`; historical permanent rows are revalidated asynchronously. This remains additive and outside this endpoint envelope.
- 2026-03-05 note: credit backend fail-safe hardening adds explicit `CREDITS_UNAVAILABLE` handling (HTTP `503`) for credit-dependent YT2BP attempts; this is additive to the existing error envelope.
- 2026-03-05 note: source-page search uptime fix (opportunistic asset-sweep dependency wiring) is outside this endpoint and does not alter the YT2BP contract envelope.

## Request
```json
{
  "video_url": "https://www.youtube.com/watch?v=...",
  "generate_review": false,
  "generate_banner": false,
  "source": "youtube_mvp"
}
```

### Request constraints
- Single YouTube clip only (`youtube.com/watch` or `youtu.be`).
- Playlist URLs are rejected.
- `/youtube` UI path currently sends `generate_review=false` and `generate_banner=false` for core-first latency behavior.

## Success response
```json
{
  "ok": true,
  "run_id": "yt2bp-...",
  "draft": {
    "title": "string",
    "description": "string",
    "steps": [
      { "name": "string", "notes": "string", "timestamp": "string|null" }
    ],
    "notes": "string|null",
    "tags": ["string"]
  },
  "review": { "available": true, "summary": "string|null" },
  "banner": { "available": true, "url": "string|null" },
  "meta": {
    "transcript_source": "string",
    "confidence": "number|null",
    "duration_ms": "number"
  }
}
```

## Error response
```json
{
  "ok": false,
  "error_code": "STRING_BUCKET",
  "message": "User-safe message",
  "run_id": "string|null"
}
```

### Error buckets and status codes
- `SERVICE_DISABLED` -> `503`
- `INVALID_URL` -> `400`
- `NO_CAPTIONS` -> `422`
- `TRANSCRIPT_EMPTY` -> `422`
- `PROVIDER_FAIL` -> `502`
- `PROVIDER_DEGRADED` -> `503`
- `CREDITS_UNAVAILABLE` -> `503`
- `TIMEOUT` -> `504`
- `RATE_LIMITED` -> `429`
- `SAFETY_BLOCKED` -> `422`
- `PII_BLOCKED` -> `422`
- `GENERATION_FAIL` -> `500`

## Runtime controls
- `YT2BP_ENABLED`
- `YT2BP_QUALITY_ENABLED`
- `YT2BP_CONTENT_SAFETY_ENABLED`
- `YT2BP_ANON_LIMIT_PER_MIN`
- `YT2BP_AUTH_LIMIT_PER_MIN`
- `YT2BP_IP_LIMIT_PER_HOUR`
- `YT2BP_CORE_TIMEOUT_MS` (default `120000`, bounded `30000..300000`)
- `TRANSCRIPT_MAX_ATTEMPTS`, `TRANSCRIPT_TIMEOUT_MS`, `LLM_MAX_ATTEMPTS`, `LLM_TIMEOUT_MS` (bounded provider retry budgets used by this endpoint)
- `PROVIDER_CIRCUIT_FAILURE_THRESHOLD`, `PROVIDER_CIRCUIT_COOLDOWN_SECONDS`, `PROVIDER_FAIL_FAST_MODE` (provider fail-fast behavior)
- `CHANNEL_GATES_MODE` (`bypass|shadow|enforce`) for channel-candidate evaluation path outside this endpoint.

## Integration contract (bleuV1)
- This endpoint is responsible for source extraction + draft generation only.
- Persisting personal feed state and auto-channel publication happens in separate app/backend flows.
- Channel publish/reject logic is intentionally out of this endpoint scope.
- Subscription sync and manual pending-card acceptance are intentionally outside this endpoint contract.
- Ingestion health polling (`/api/ingestion/jobs/latest`) is intentionally outside this endpoint contract.
- YouTube query discovery (`/api/youtube-search`) is intentionally outside this endpoint contract.
- YouTube channel discovery (`/api/youtube-channel-search`) is intentionally outside this endpoint contract.
- Profile feed retrieval (`/api/profile/:userId/feed`) is intentionally outside this endpoint contract.
- Subscription row avatar enrichment (`GET /api/source-subscriptions`) is intentionally outside this endpoint contract.
- Auto-banner queue processing and cap rebalance are intentionally outside this endpoint contract.
- Optional review/banner post-processing (`/api/analyze-blueprint`, `/api/generate-banner`) and save-time attach behavior are intentionally outside this endpoint contract.
- Subscription manual scan/enqueue flows are intentionally outside this endpoint contract.
- Manual refresh owner-status endpoint (`GET /api/ingestion/jobs/:id`) is intentionally outside this endpoint contract.
- Manual refresh latest-user-status endpoint (`GET /api/ingestion/jobs/latest-mine`) is intentionally outside this endpoint contract.
- Refresh endpoint concurrency/rate/cooldown controls are intentionally outside this endpoint contract.
- Auto-channel endpoint (`POST /api/my-feed/items/:id/auto-publish`) is intentionally outside this endpoint contract.
- Auto-channel classifier mode/fallback controls (`AUTO_CHANNEL_CLASSIFIER_MODE`, `AUTO_CHANNEL_FALLBACK_SLUG`) are intentionally outside this endpoint contract.
- YouTube OAuth connect/import lifecycle (`/api/youtube/connection/*`, `/api/youtube/subscriptions/*`) is intentionally outside this endpoint contract.
- Optional onboarding state lifecycle (`user_youtube_onboarding`, `/welcome`) is intentionally outside this endpoint contract.
- Source-page lifecycle (`source_pages`, `/api/source-pages/*`, `source_page_id` dual-write links) is intentionally outside this endpoint contract.
- Source-page read-time asset hydration behavior is intentionally outside this endpoint contract.
- Source-page public feed retrieval (`GET /api/source-pages/:platform/:externalId/blueprints`) is intentionally outside this endpoint contract.
- Source-page video-library listing/queue flow (`GET /api/source-pages/:platform/:externalId/videos`, `POST /api/source-pages/:platform/:externalId/videos/unlock`, compatibility alias `/videos/generate`) is intentionally outside this endpoint contract.
- Transcript-unavailable cooldown/retry behavior in source unlock flows is intentionally outside this endpoint contract.
- Silent auto transcript retry/feed suppression behavior and Source Page `+Add`-only speech warning scope are intentionally outside this endpoint contract.
- Notifications inbox flows (`/api/notifications*`) and event emission for replies/generation terminal outcomes are intentionally outside this endpoint contract.
- Service queue operations (`POST /api/ingestion/jobs/trigger`, `GET /api/ingestion/jobs/latest`, `GET /api/ops/queue/health`) are intentionally outside this endpoint contract.
- Refill-credit wallet and source-unlock persistence (`user_credit_wallets`, `credit_ledger`, `source_item_unlocks`, `/api/credits`) are intentionally outside this endpoint contract.
- Read limiter policy for `/api/credits` and `/api/ingestion/jobs/latest-mine` is intentionally outside this endpoint contract.
- Subscription `auto_unlock_enabled` toggle and prioritized/sampled auto-attempt behavior (with bounded retries) for new-upload shared unlock are intentionally outside this endpoint contract.
- Unlock reliability sweep behavior and unlock trace correlation (`trace_id`) are intentionally outside this endpoint contract.
- Subscription pre-release premiere filtering/checkpoint hold behavior is intentionally outside this endpoint contract.

## Retry and timeout policy (v0)
- Endpoint timeout target: env-controlled via `YT2BP_CORE_TIMEOUT_MS` (default `120s`).
- Quality retries: controlled by `YT2BP_QUALITY_MAX_RETRIES`.
- Content safety retries: controlled by `YT2BP_CONTENT_SAFETY_MAX_RETRIES`.
- Transcript fetch uses provider-level retry behavior.

## Current non-goals
- Playlist support.
- Multi-video merge.
- Instruction-security runtime checks (`llm_instruction_security_v0` is planned only).
- Contract-breaking schema changes.
- Direct channel publication from YT2BP call path.
