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
- 2026-02-17 note: dual-feed rollout moved post-generation behavior to a personal-first lane; current runtime surfaces that lane through Home `For You`, while legacy `/my-feed` remains compatibility-only. This does not alter the YT2BP request/response envelope.
- 2026-02-17 note: optional AI review is executed as a separate post-generation step in UI (`/api/analyze-blueprint`) so core YT2BP latency is lower; banner generation remains outside the core YT2BP envelope.
- 2026-02-18 note: subscription ingestion (`/api/source-subscriptions*`, `/api/ingestion/jobs/trigger`) and pending-card accept/skip (`/api/my-feed/items/:id/accept|skip`) are separate flows and do not alter this endpoint envelope.
- 2026-02-18 note: subscription create path now uses auto-only behavior (incoming `mode` is compatibility-only and treated as `auto`); first subscribe sets checkpoint and inserts a `subscription_notice` feed card. This remains outside this endpoint envelope.
- 2026-02-18 note: debug simulation endpoint (`/api/debug/subscriptions/:id/simulate-new-uploads`) is env-gated (`ENABLE_DEBUG_ENDPOINTS`) and service-auth only (`x-service-token`, no user bearer required); this also remains outside the YT2BP envelope.
- 2026-02-18 note: YouTube subscription channel resolution now includes `browseId` fallback parsing for handle pages where direct `channelId` metadata is unavailable.
- 2026-02-17 note: ingestion reliability visibility adds service-auth endpoint `GET /api/ingestion/jobs/latest`; this is an ops path and does not alter the YT2BP envelope.
- 2026-02-17 note: auth-only YouTube discovery endpoint `GET /api/youtube-search` is additive and does not alter the YT2BP envelope.
- 2026-03-15 note: the auth-only `/search` video flow now treats `GET /api/youtube-search` as bounded single-video lookup (`URL/id first, helper-backed title fallback second`) rather than broad paginated discovery; the route returns one confident hit or no hit and remains outside the YT2BP envelope.
- 2026-02-17 note: auth-only YouTube creator lookup endpoint `GET /api/youtube-channel-search` is additive and does not alter the YT2BP envelope.
- 2026-03-15 note: creator lookup on `GET /api/youtube-channel-search` now prefers exact channel URL / handle / channel id inputs, accepts bare handles without requiring `@`, and uses helper-backed bounded name lookup only; this remains outside the YT2BP envelope.
- 2026-03-15 note: known-channel video-library routes (`GET /api/youtube/channels/:channelId/videos`, `GET /api/source-pages/:platform/:externalId/videos`) now use the low-cost uploads-playlist path (`channels.list -> playlistItems.list`) instead of `search.list`; this remains outside the YT2BP envelope.
- 2026-02-17 note: `GET /api/source-subscriptions` now includes optional `source_channel_avatar_url` from stored `source_pages` metadata for UI; this remains outside the YT2BP envelope.
- 2026-02-17 note: subscription auto-ingest generation now enables review-by-default while keeping banner disabled; this remains outside the YT2BP endpoint envelope.
- 2026-02-18 note: subscription notice cards may use `source_items.metadata.channel_banner_url`, and unsubscribe now removes user-scoped notice rows from the personal lane (including legacy `My Feed` compatibility views); this remains outside the YT2BP endpoint envelope.
- 2026-02-18 note: async auto-banner queue endpoints (`/api/auto-banner/jobs/trigger`, `/api/auto-banner/jobs/latest`) and cap fallback policy are additive ops paths and remain outside the YT2BP endpoint envelope.
- 2026-02-18 note: Search->YouTube route handoff now includes channel context (`channel_id`, `channel_title`, `channel_url`) so save-to-feed can persist source channel metadata; YT2BP endpoint envelope remains unchanged.
- 2026-02-18 note: save-to-feed now preserves channel-title metadata across source upserts so personal-lane subtitle mapping stays stable (including legacy `My Feed` compatibility views); YT2BP endpoint envelope remains unchanged.
- 2026-02-18 note: `/youtube` UI forces core endpoint calls with `generate_review=false` and `generate_banner=false`; optional review runs as async post-step and can attach after save when available.
- 2026-02-18 note: endpoint timeout is now env-configurable via `YT2BP_CORE_TIMEOUT_MS` (default `120000`, bounded server-side).
- 2026-02-18 note: banner prompt hardening now enforces visual-only imagery and explicitly blocks readable text/typography/logos/watermarks in generated backgrounds.
- 2026-03-19 note: save-time blueprint persistence now writes additive `blueprints.preview_summary` teaser text for cheap Wall/Explore/Channel/Search cards, with legacy `My Feed` compatibility support retained; this does not alter the YT2BP request/response envelope.
- 2026-03-19 note: ingestion status route tightening (`GET /api/ingestion/jobs/latest-mine` single-read selection and narrower `active-mine` queue-position scans) is additive backend hardening and does not alter the YT2BP request/response envelope.
- 2026-03-19 note: manual YouTube comments refresh now reuses existing refresh-state rows when present, and scheduler pending-refresh checks are batched by refresh kind/candidate set; this is backend bookkeeping only and does not alter the YT2BP request/response envelope.
- 2026-03-19 note: queued ingestion worker lease heartbeats now use a lease-aware cadence floor (`30s` on the default `90s` lease); this is backend bookkeeping only and does not alter the YT2BP request/response envelope.
- 2026-03-19 note: durable generation trace writes now reuse a per-run `seq` cursor and skip returning row payloads on writes when callers do not consume them; this is backend bookkeeping only and does not alter the YT2BP request/response envelope.
- 2026-03-22 note: subscription sync persistence now skips unchanged successful writes to `user_source_subscriptions` unless checkpoint/title/error state changes, while repeated identical error writes remain bounded by the `30m` backend heartbeat; this is additive backend behavior outside the YT2BP request/response envelope.
- 2026-03-22 note: low-priority idle queue claim sweeps now back off more aggressively than the default worker idle cadence, reducing `claim_ingestion_jobs` chatter without altering lease ownership or the YT2BP request/response envelope.
- 2026-03-22 note: YouTube refresh bookkeeping now skips unchanged `source_items.metadata.view_count` writes and no-op `blueprint_youtube_refresh_state` upserts; this is additive backend bookkeeping only and does not alter the YT2BP request/response envelope.
- 2026-03-23 note: service-cron subscription ingestion still triggers `/api/ingestion/jobs/trigger` every `3m`, but backend enqueue now gates `all_active_subscriptions` to an effective `10m` minimum interval by default; this is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-03-23 note: the default one-step prompt template is now `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v4.md`; this keeps the same `draft.sectionsJson` schema and endpoint envelope, but makes `Takeaways` lighter/plain-English and requires `Storyline` to stay `2-3` substantial paragraphs/slides.
- 2026-03-23 note: in `llm_native` mode, YT2BP retries now stay reserved for blocking structure/shape misses; `TAKEAWAYS_TOO_LONG` and `OPEN_QUESTIONS_NOT_QUESTIONS` remain logged on `generation_runs` as soft quality telemetry but no longer trigger regeneration by themselves.
- 2026-03-23 note: queue-backed source-video generation now records active ingestion-job ownership on `source_item_blueprint_variants`, reclaims stale in-progress variants after a bounded timeout only when `active_job_id` is missing, resumes same-job unlock preflight instead of treating owned variants as generic `in_progress`, and persists terminal `generation_runs` status outside best-effort trace-event writes; this is additive backend reliability hardening and remains outside the YT2BP request/response envelope.
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
- 2026-02-19 note: source-page video-library endpoints (`GET /api/source-pages/:platform/:externalId/videos`, `POST /api/source-pages/:platform/:externalId/videos/unlock`) are additive and do not alter the YT2BP endpoint envelope.
- 2026-02-19 note: source-page video-library listing now supports `kind=full|shorts` with shorts threshold `<=60s`; additive and outside the YT2BP envelope.
- 2026-02-19 note: source-page video-library list now uses dual rate-limit guards (burst+sustained) and frontend cache/focus-refetch tuning; additive and outside the YT2BP envelope.
- 2026-02-20 note: source-page unlock endpoint (`POST /api/source-pages/:platform/:externalId/videos/unlock`) is additive and outside this endpoint envelope.
- 2026-02-21 note: source-linked YouTube banners now use thumbnail-first assignment/backfill and source-generation paths bypass auto-banner enqueue; additive and outside this endpoint envelope.
- 2026-02-20 note: source-page unlock route guard is soft-limited (`8/10s` burst + `120/10m` sustained) and no longer uses hard unlock cooldown; additive and outside this endpoint envelope.
- 2026-03-06 note: daily-credit wallet model (`user_credit_wallets`, `credit_ledger`, `/api/credits` daily grant/reset fields) is additive and outside this endpoint envelope.
- 2026-03-06 note: admin entitlement bypass now applies to concrete wallet reservation paths and shared auto-unlock funding, and no longer depends on wallet balance alone; additive and outside this endpoint envelope.
- 2026-03-06 note: queue realism hardening adds weighted queue admission and additive `queue_work_items` queue-health fields; this is additive and outside the YT2BP endpoint envelope.
- 2026-03-06 note: credit-refresh hardening makes `/api/credits` lazy/on-demand from header UI instead of background polling; this is additive and outside the YT2BP endpoint envelope.
- 2026-02-20 note: subscription new-upload ingest now writes unlockable feed rows (`my_feed_unlockable`) before generation; this lifecycle change is outside this endpoint envelope.
- 2026-03-06 note: subscription rows now include `auto_unlock_enabled` (default `true`) and new-upload auto-attempt flow uses canonical shared-cost auto intents with funded-participant snapshots and bounded retries; additive and outside this endpoint envelope.
- 2026-03-06 note: backend OpenAI SDK loading is lazy at call time to keep Oracle startup independent from top-level `openai` ESM imports; additive and outside this endpoint envelope.
- 2026-02-20 note: unlock reliability sweeps (expired/stale/orphan recovery) run in source-video routes and service cron trigger path; additive and outside this endpoint envelope.
- 2026-02-20 note: unlock/generate responses now include additive `trace_id` and unlock lifecycle logs propagate the same correlation ID; additive and outside this endpoint envelope.
- 2026-02-20 note: ingestion worker hardening adds queue lease/retry metadata on `ingestion_jobs` and service queue-health endpoint `GET /api/ops/queue/health`; additive and outside this endpoint envelope.
- 2026-02-21 note: permanent no-transcript unlock failures normalize to `NO_TRANSCRIPT_PERMANENT` (legacy `NO_CAPTIONS` compatibility), and associated unlockable feed cards are suppressed; additive and outside this endpoint envelope.
- 2026-02-21 note: transcript truth hardening in source unlock flows now treats `NO_CAPTIONS` as retryable/ambiguous until bounded confirmation retries mark permanent `NO_TRANSCRIPT_PERMANENT`; historical permanent rows are revalidated asynchronously. This remains additive and outside this endpoint envelope.
- 2026-03-05 note: credit backend fail-safe hardening adds explicit `CREDITS_UNAVAILABLE` handling (HTTP `503`) for credit-dependent YT2BP attempts; this is additive to the existing error envelope.
- 2026-03-05 note: source-page search uptime fix (opportunistic asset-sweep dependency wiring) is outside this endpoint and does not alter the YT2BP contract envelope.
- 2026-03-06 note: backend maintainability refactor extracted shared generation preflight helpers for Search/source-page/manual-refresh flows into `server/services/generationPreflight.ts`; additive and outside the YT2BP envelope.
- 2026-03-06 note: backend composition cleanup extracted runtime mode resolution, queued worker lifecycle, and YouTube refresh scheduler lifecycle into dedicated services; additive and outside the YT2BP endpoint envelope.
- 2026-03-06 note: Home feed semantics now treat `Joined` as the canonical joined-channel discovery lane, keep `For You` as the only source-driven locked/unlocked lane, and restrict `All`/channel scopes to published-channel blueprints only; additive and outside the YT2BP endpoint envelope.
- 2026-03-07 note: Oracle MVP production runtime now treats combined mode (`agentic-backend.service` with `RUN_INGESTION_WORKER=true`) as the canonical queue/scheduler keep-alive path; split worker topology remains deferred and this does not alter the YT2BP endpoint envelope.
- 2026-03-07 note: backend env bootstrap now uses repo-root `.env` only as a non-systemd local/dev fallback and no longer reads `.env.production`; Oracle production uses `/etc/agentic-backend.env` as the canonical backend app-config source. This is additive runtime bootstrap policy and outside the YT2BP endpoint envelope.
- 2026-03-19 note: queue helper tightening now treats explicit `scope`/`scopes` filters as first-class for queue depth/work-item reads; this narrows refresh/ops admission checks without altering the YT2BP endpoint envelope.
- 2026-03-20 note: auth-only `GET /api/my-feed` now provides a backend-shaped hydrated read for the legacy personal-lane compatibility surface; this is additive and does not alter the YT2BP request/response envelope.
- 2026-03-08 note: shared Webshare transcript proxying for opted-in providers now uses an explicit-endpoint-only runtime contract; legacy selector/list envs and direct-proxy-list lookup are removed from active runtime. Historical transport metadata remains read-compatible, and this does not alter the YT2BP endpoint envelope.
- 2026-03-08 note: installed-PWA push delivery (`notification_push_subscriptions`, `notification_push_dispatch_queue`, `/api/notifications/push-subscriptions*`) is additive notification-channel infrastructure and does not alter the YT2BP endpoint envelope.
- 2026-03-09 note: installed-PWA push runtime remains rollout-gated until backend startup validation and device delivery proof are complete; Oracle control-plane recovery for that rollout is documented separately in `docs/ops/oracle-cli-access.md`.
- 2026-03-14 note: the current default is `TRANSCRIPT_PROVIDER=youtube_timedtext`; if YouTube captions are unavailable, the same seam falls through to `videotranscriber_temp`, a wrapper around the browser-facing `videotranscriber.ai` flow with provider-local timeout/session envs. This is additive and does not change the production endpoint envelope.
- 2026-03-19 note: subscription sync persistence now throttles no-op success/error writes to `user_source_subscriptions` behind a `15m` backend heartbeat to reduce Supabase churn; this is additive backend behavior outside the YT2BP request/response envelope.
- 2026-03-15 note: the v0 success envelope still returns a `draft` object, but the canonical blueprint content inside that envelope is now `draft.sectionsJson` with schema `blueprint_sections_v1`. Legacy `draft.steps`, `draft.summaryVariants`, and `draft.notes` remain compatibility fields during cutover and should not be used as the target shape for new downstream work.

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
    "sectionsJson": {
      "schema_version": "blueprint_sections_v1",
      "summary": { "text": "string" },
      "takeaways": { "bullets": ["string"] },
      "storyline": { "text": "string" },
      "deep_dive": { "bullets": ["string"] },
      "practical_rules": { "bullets": ["string"] },
      "open_questions": { "bullets": ["string"] },
      "tags": ["string"]
    },
    "steps": [
      { "name": "string", "notes": "string", "timestamp": "string|null" }
    ],
    "summaryVariants": {
      "default": "string",
      "eli5": "string"
    },
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

## Blueprint content contract (current truth)
- Canonical blueprint content for current runtime work lives in `draft.sectionsJson`.
- `draft.sectionsJson.schema_version` must be `blueprint_sections_v1`.
- `draft.steps`, `draft.summaryVariants`, and `draft.notes` remain compatibility-era fields in the v0 envelope during cutover.
- New gate/render/storage work should treat `draft.sectionsJson` as the authoritative blueprint shape, not the legacy compatibility fields.

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
- `TRANSCRIPT_PROVIDER` (current default `youtube_timedtext`; built-in fallback `videotranscriber_temp` when captions are unavailable)
- `TRANSCRIPT_USE_WEBSHARE_PROXY`, `WEBSHARE_PROXY_URL`, `WEBSHARE_PROXY_HOST`, `WEBSHARE_PROXY_PORT`, `WEBSHARE_PROXY_USERNAME`, `WEBSHARE_PROXY_PASSWORD` (shared transport config for opted-in transcript providers)
- `VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS` (local/dev-only, default `180000`, bounded provider-local timeout)
- `VIDEOTRANSCRIBER_TEMP_FORCE_NEW_SESSION` (local/dev-only anonymous-session rotation toggle)
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
- YouTube creator lookup (`/api/youtube-channel-search`) is intentionally outside this endpoint contract.
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
- Source-page video-library listing/queue flow (`GET /api/source-pages/:platform/:externalId/videos`, `POST /api/source-pages/:platform/:externalId/videos/unlock`) is intentionally outside this endpoint contract.
- Transcript-unavailable cooldown/retry behavior in source unlock flows is intentionally outside this endpoint contract.
- Silent auto transcript retry/feed suppression behavior and Source Page `+Add`-only speech warning scope are intentionally outside this endpoint contract.
- Notifications inbox flows (`/api/notifications*`) and event emission for replies/generation terminal outcomes are intentionally outside this endpoint contract.
- Installed-PWA push subscription/config routes (`/api/notifications/push-subscriptions*`) and push delivery queue processing are intentionally outside this endpoint contract.
- Service queue operations (`POST /api/ingestion/jobs/trigger`, `GET /api/ingestion/jobs/latest`, `GET /api/ops/queue/health`) are intentionally outside this endpoint contract.
- Daily-credit wallet and source-unlock persistence (`user_credit_wallets`, `credit_ledger`, `source_item_unlocks`, `/api/credits`) are intentionally outside this endpoint contract.
- Queue-work-item budgeting and queue-health work-size reporting (`queue_work_items`, `running_work_items`, per-scope work-item fields) are intentionally outside this endpoint contract.
- Backend runtime bootstrap composition (`server/services/runtimeConfig.ts`, queued worker controller, YouTube refresh scheduler controller) is intentionally outside this endpoint contract.
- Backend env-source selection (`server/loadEnv.ts`, `/etc/agentic-backend.env`, local repo `.env` fallback) is intentionally outside this endpoint contract.
- Oracle single-service combined runtime policy for queue/scheduler keep-alive is intentionally outside this endpoint contract.
- Read limiter policy for `/api/credits` and `/api/ingestion/jobs/latest-mine` is intentionally outside this endpoint contract.
- Subscription `auto_unlock_enabled` toggle and shared-cost auto-unlock intent billing/retry behavior for new-upload shared unlock are intentionally outside this endpoint contract.
- Unlock reliability sweep behavior and unlock trace correlation (`trace_id`) are intentionally outside this endpoint contract.
- Subscription pre-release premiere filtering/checkpoint hold behavior is intentionally outside this endpoint contract.

## Retry and timeout policy (v0)
- Endpoint timeout target: env-controlled via `YT2BP_CORE_TIMEOUT_MS` (default `120s`).
- Quality retries: controlled by `YT2BP_QUALITY_MAX_RETRIES`.
- Content safety retries: controlled by `YT2BP_CONTENT_SAFETY_MAX_RETRIES`.
- Transcript fetch uses provider-level retry behavior.
- `videotranscriber_temp` also expands the transcript-stage provider timeout to its provider-local timeout budget before the endpoint-level YT2BP timeout applies.

## Current non-goals
- Playlist support.
- Multi-video merge.
- Instruction-security runtime checks (`llm_instruction_security_v0` is planned only).
- Contract-breaking schema changes.
- Direct channel publication from YT2BP call path.

## Related Endpoint Addendum (2026-03-05)
- This contract still excludes comments-refresh control endpoints.
- Manual YouTube source-comment refresh is handled by `POST /api/blueprints/:id/youtube-comments/refresh`; it is owner-only and guarded by cooldown/backpressure controls.
