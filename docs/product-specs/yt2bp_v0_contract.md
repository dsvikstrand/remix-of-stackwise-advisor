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
- 2026-04-05 note: new subscriptions now default `auto_unlock_enabled=false`, while reactivating an existing subscription preserves the prior saved toggle value; `mode` remains a legacy compatibility field and stored rows may still contain `manual` or `auto`. This remains outside this endpoint envelope.
- 2026-04-07 note: unlock-ledger `primary` now also keeps normal unlock reservation/processing/fail/ready mutations, transcript suppression/revalidate seed reads, and server-side legacy `My Feed` unlock hydration on Oracle-owned unlock state rather than rereading or rewriting Supabase `source_item_unlocks`. This is additive backend behavior outside the YT2BP request/response envelope.
- 2026-04-08 note: source-item-ledger `primary` now also keeps `/api/my-feed` source hydration plus feed accept/source lookup helpers on Oracle-aware source readers, and browser-side blueprint/profile source attribution can resolve through the backend Oracle-owned source lookup path instead of direct Supabase `source_items` reads. This is additive backend/frontend integration behavior outside the YT2BP request/response envelope.
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
- 2026-02-18 note: subscription notice cards may use `source_items.metadata.channel_banner_url`; current unsubscribe paths no longer spend request-path work removing notice rows, and this remains outside the YT2BP endpoint envelope.
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
- 2026-04-05 note: in subscription-ledger `primary`, sync/checkpoint/error-only `user_source_subscriptions` patches may now stop at the Oracle ledger when they only touch operational fields (`last_polled_at`, `last_seen_*`, `last_sync_error`), instead of forcing the Supabase compatibility row to mirror every one of those hot updates. Identity/activation changes still shadow through Supabase as before. This is additive backend egress reduction and does not alter the YT2BP request/response envelope.
- 2026-03-22 note: low-priority idle queue claim sweeps now back off more aggressively than the default worker idle cadence, reducing `claim_ingestion_jobs` chatter without altering lease ownership or the YT2BP request/response envelope.
- 2026-03-22 note: YouTube refresh bookkeeping now skips unchanged `source_items.metadata.view_count` writes and no-op `blueprint_youtube_refresh_state` upserts; this is additive backend bookkeeping only and does not alter the YT2BP request/response envelope.
- 2026-03-23 note: service-cron subscription ingestion still triggers `/api/ingestion/jobs/trigger` every `3m`, but backend enqueue now gates `all_active_subscriptions` through the Oracle cadence window (`ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS`, current default `5m`); this is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-03-30 note: service-cron trigger trimming now keeps `/api/ingestion/jobs/trigger` enqueue-focused: it no longer force-runs unlock sweeps, source-page asset sweeps, or transcript revalidate seeding on the hot path, while conflict-focused stale-running recovery remains additive backend control-plane behavior outside the YT2BP envelope.
- 2026-03-30 note: manual refresh scans no longer rely on failed-video cooldown persistence in `refresh_video_attempts`; this is additive backend behavior and does not alter the YT2BP request/response envelope.
- 2026-03-30 note: combined-worker maintenance is now time-gated (`15m` default), `all_active_subscriptions` runs prioritize the stalest `last_polled_at` rows and cap each pass to `75` subscriptions by default, and passive `GET /api/ingestion/jobs/latest-mine` restore reads are thinner (`2` recent rows plus slower shared tracker polling); all of this is additive backend control-plane hardening outside the YT2BP request/response envelope.
- 2026-03-30 note: fast retry/enrichment queue scopes now defer their first lease heartbeat deeper into the lease window (`45s` on the default `90s` lease), trimming pure control-plane writes without altering the YT2BP request/response envelope.
- 2026-03-31 note: Oracle control-plane subscription-scheduler groundwork now allows local SQLite bootstrap, shadow observation, and `primary` ownership of `all_active_subscriptions` enqueue admission, cadence timing, and batch selection via `ORACLE_CONTROL_PLANE_*` envs; Supabase still remains authoritative for durable queue truth and user-facing writes outside the YT2BP request/response envelope.
- 2026-04-01 note: Oracle `primary` now also owns the live trigger path for `all_active_subscriptions`: external `POST /api/ingestion/jobs/trigger` requests for that scope may return additive `oracle_primary_scheduler_owned` suppression while the local Oracle scheduler tick re-enters the same route with internal service headers; Oracle-primary drain breadth is separately tunable via `ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT`, and one run may drain multiple due batches through `ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN`. This is additive control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: Oracle queue-control may now also throttle repeated empty queued-worker claim attempts through `ORACLE_QUEUE_*` envs with Oracle-local cooldown state, especially for medium/low-priority tiers; Supabase still remains authoritative for durable queue rows, claims, leases, and retries. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: Oracle queue-sweep control may now also own queued-worker tier cadence, due-sweep selection, and tier batch sizing through `ORACLE_QUEUE_SWEEP_*` envs, while Supabase still executes durable claim RPCs and remains authoritative for queue rows, claims, leases, and retries. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-03 note: fresh user-triggered high-priority generation (`source_item_unlock_generation`, `search_video_generate`, `manual_refresh_selection`) may now clear its own Oracle-local sweep/claim cooldowns before waking the queued worker, so interactive generation does not wait behind empty-sweep backoff intended for idle/background queue control. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-03 note: queued manual generation now also preserves interactive request class through the worker path, so search/manual/source-page YT2BP runs may use tighter transcript/LLM retry budgets than background ingestion and emit additive per-stage timing logs (`duration policy`, `transcript fetch`, `LLM generate`, `quality`, `safety`, `review`, `banner`, `total`) without changing the request/response envelope.
- 2026-04-01 note: Oracle queue-admission mirror state may now also serve hot active queue-count reads through `ORACLE_QUEUE_ADMISSION_*` envs for search/manual-refresh/source-page/subscription enqueue guards, while Supabase still remains authoritative for durable queued/running rows, claims, leases, and retries. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: queued-worker claim/failure/lease-heartbeat paths now refresh Oracle job-activity mirrors directly from the already-known `ingestion_jobs` row in hand, so Oracle queue-health and active-job mirrors stay fresh without an extra Supabase reread. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: Oracle job-activity mirror state may now also serve Oracle-first stale-running recovery, manual-refresh duplicate guards, and user-scoped `GET /api/ingestion/jobs/latest-mine` / `GET /api/ingestion/jobs/active-mine` reads through `ORACLE_JOB_ACTIVITY_*` envs, while Supabase still remains authoritative for durable queued/running rows, claims, leases, retries, and user-facing writes. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: Oracle job-activity mirror state may now also serve owner-scoped `GET /api/ingestion/jobs/:id`, active `all_active_subscriptions` duplicate guards in the trigger path, and Oracle-backed queue-position reads for `GET /api/ingestion/jobs/active-mine` before Supabase fallback. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-04 note: queue-ledger `primary` hot-path queue lookups (`owner job detail`, `latest`, `active by scope`) now treat an empty Oracle result as authoritative instead of automatically rereading Supabase, lease-heartbeat-only queue touches no longer emit a full Supabase `ingestion_jobs` shadow upsert on every refresh, and Oracle-only queue bypasses now log explicitly instead of silently falling through. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-04 note: queue-ledger `primary` now also skips the Supabase `ingestion_jobs` compatibility upsert for claim-to-`running` transitions, and the remaining queue fallback logging now covers latest-for-user, active-for-user, refresh-pending dedupe, unlock-job lookup, and retry-dedupe paths as well. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: Oracle job-activity mirror lifecycle writes now update directly from enqueue, claim/start, terminal success/failure, and stale-running recovery transitions when the backend already has the durable `ingestion_jobs` row in hand, instead of doing a second Supabase read-after-write refresh for that same row. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: ingestion user-status routes now resolve through centralized Oracle-first readers end-to-end, and unlock orphan-job recovery now uses the same Oracle-aware running-job failure path, so those route/sweep layers no longer keep their own direct `ingestion_jobs` fallback/update branches. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: user-triggered generation/sync handlers now also use the centralized Oracle-aware enqueue/finalize helpers for manual refresh, source-page unlock generation, search generation, and foreground subscription sync instead of inline `ingestion_jobs` writes in handler code. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: service/debug ingestion control now also uses that centralized Oracle-aware lifecycle path: `/api/ingestion/jobs/trigger` and debug subscription simulation enqueue/finalize through shared helpers instead of direct handler-level `ingestion_jobs` writes. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: Oracle product-mirror envs may now also bootstrap/mirror active subscriptions, recent source items, source-item unlock rows, and recent feed rows into Oracle-local SQLite so source-page subscription/access checks, blueprint-cooldown decisions, unlock-status lookups, public wall/source-page blueprint feeds, and wall/profile feed-history reads can prefer Oracle-local reads first when the mirror is sufficiently complete. Hot subscription/feed/unlock mutations now also refresh that mirror from known rows or targeted reloads, while Supabase still remains the authoritative product ledger and fallback path. This is additive backend behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: service ops latest-job / queue-health reads and Blueprint YouTube refresh pending-job dedupe now also resolve through centralized Oracle-first helpers, with durable Supabase fallback kept under runtime helpers rather than in handler/service-local branches. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: queue-ledger claim / fail / lease-touch operations now also expose centralized Oracle-aware hook seams in `ingestionQueue`, so queued-worker/controller paths can refresh Oracle mirrors from already-known durable rows without adding another Supabase reread or per-caller bridge wrapper. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: Oracle queue-ledger ownership may now also be staged behind `ORACLE_QUEUE_LEDGER_MODE=supabase|dual|primary`, with `dual` bootstrapping/shadowing a local durable queue ledger and `primary` now serving the live claim/lease/fail/finalize path while Supabase remains compatibility shadow. Queue depth/work-item/status reads may also resolve from that Oracle ledger first. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: Oracle queue-admission and job-activity mirror refreshes may now also rebuild from the live Oracle queue ledger first, so those Oracle-local mirrors no longer need to treat Supabase as their normal bootstrap source once queue-ledger `primary` is live. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-01 note: once Oracle queue-ledger `primary` is live, the normal hot-path queue/job reads may now also prefer that Oracle queue ledger directly, reducing Oracle queue-admission and job-activity mirrors to fallback/bootstrap compatibility state rather than the main runtime source. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-06 note: Oracle-primary queue retry requeues may now stay Oracle-local when a claimed job is rescheduled back to `queued`; Supabase `ingestion_jobs` is no longer patched just to mirror that retry-state transition. This is additive backend control-plane behavior and does not alter the YT2BP request/response envelope.
- 2026-04-02 note: Oracle durable subscription truth may now also be staged behind `ORACLE_SUBSCRIPTION_LEDGER_MODE=supabase|dual|primary`, with `dual` bootstrapping/shadowing `user_source_subscriptions` into a local Oracle ledger and `primary` letting subscribe/reactivate/unsubscribe/checkpoint/error flows read/write that Oracle ledger first while Supabase remains the compatibility shadow. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-04 note: subscription-ledger `primary` hot-path subscription lookups (`by id`, `by user + channel`, source-page access checks, per-user active/list reads, subscriber counts) now treat an empty Oracle result as authoritative instead of automatically rereading Supabase, unchanged compatibility shadow rows skip no-op `user_source_subscriptions` patch writes, normal compatibility updates prefer direct `id` writes before any user/channel reread, and any remaining subscription compatibility reads now log `subscription_fallback_read`. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-04 note: subscription-ledger `primary` now also uses Oracle-first batch hydration by subscription `id` for due-batch sync and manual-refresh checkpoint flows, and Oracle-first active-user fan-out for source-page/channel subscriber attach plus auto-unlock eligibility before any Supabase fallback. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-02 note: Oracle durable feed truth may now also be staged behind `ORACLE_FEED_LEDGER_MODE=supabase|dual|primary`, with `dual` bootstrapping/shadowing `user_feed_items` into a local Oracle ledger and `primary` now letting wall/profile/public feed readers plus shared feed mutation paths prefer Oracle-backed feed rows while Supabase remains the compatibility shadow. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: feed ownership Pass 1 now also removes Supabase feed rehydration from Oracle bootstrap in `primary`; Oracle restart/bootstrap should keep feed truth from `feed_ledger_state`, and Oracle product-feed bootstrap should rebuild recent feed rows from that Oracle ledger instead of rereading Supabase `user_feed_items`. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: source-item ownership Pass 1 now also removes Supabase `source_items` from Oracle bootstrap in `primary`; Oracle restart/bootstrap should keep source truth from `source_item_ledger_state`, and Oracle product bootstrap should rebuild recent source rows from that Oracle ledger instead of rereading Supabase `source_items`. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: source-item ownership Pass 2 now also removes normal-runtime Supabase `source_items` writes in `primary`; shared source-item insert/upsert and metadata/view-count updates now write Oracle source-item ledger + Oracle product-source mirror only. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: feed ownership Pass 2 also removes the main Oracle-primary `user_feed_items` insert/upsert shadow writes; shared feed mutations now persist to Oracle `feed_ledger_state` + `product_feed_state`, and server-side personal/channel feed readers that would otherwise miss those rows use Oracle-aware feed loaders. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: feed ownership Pass 3 also removes the main Oracle-primary `user_feed_items` read fallbacks; wall/public/my-feed/product feed reads now treat Oracle feed ledger + Oracle product-feed mirror as the normal runtime read path, and browser-side existing-feed-item checks prefer the backend-shaped `/api/my-feed` payload before any legacy Supabase fallback. This is additive backend/product-read behavior and does not alter the YT2BP request/response envelope.
- 2026-04-06 note: feed-row blueprint attachment now preserves the existing `user_feed_items.created_at` when a locked/unlockable wall row upgrades to a generated blueprint, so Home `For You` ordering reflects first wall arrival instead of later enrichment time. This is additive backend feed semantics and does not alter the YT2BP request/response envelope.
- 2026-04-02 note: Oracle durable source-item truth may now also be staged behind `ORACLE_SOURCE_ITEM_LEDGER_MODE=supabase|dual|primary`, with `dual` bootstrapping/shadowing `source_items` into a local Oracle ledger and `primary` letting source-item upserts, metadata/view-count updates, execution-path source lookups, and Oracle-first wall/profile/source-page source-row reads prefer Oracle-backed source rows while Supabase remains the compatibility shadow. If that Oracle-first source-item path regresses, runtime should fall back to `supabase` until the fixed build is redeployed. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-04 note: source-item-ledger `primary` hot-path source-item lookups (`by id`, `by canonical_key`, `by source_native_id`, and batch source-row hydration) now treat an empty Oracle result as authoritative instead of automatically rereading Supabase, unchanged compatibility shadow rows skip no-op `source_items` updates, `updated_at`-only source-item churn stays Oracle-local instead of triggering a Supabase compatibility patch, normal compatibility writes update by durable `id` before any canonical-key conflict fallback, the shared update/insert shadow seam reuses one mapped payload helper, and any remaining source-item compatibility reads should log `source_item_fallback_read`. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-05 note: manual creator lookup now supports explicit `mode=handle|creator_name|channel_url_or_id` on `GET /api/youtube-channel-search`, and explicit handle mode prefers official YouTube `forHandle` resolution before legacy handle-page scraping fallback. This is additive backend lookup behavior and does not alter the YT2BP request/response envelope.
- 2026-04-03 note: Oracle durable generation execution truth may now also be staged behind `ORACLE_GENERATION_STATE_MODE=supabase|dual|primary`, with `dual` bootstrapping/shadowing `source_item_blueprint_variants` plus `generation_runs` into local Oracle state and `primary` letting shared variant ownership/readiness plus generation-run summaries prefer Oracle-backed execution rows while Supabase remains the compatibility shadow. `generation_run_events` were intentionally deferred to a follow-up trace chapter. This is additive backend execution-state behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: generation-state Pass 1 now also removes Supabase generation-state rehydration from Oracle bootstrap in `primary`; restart/bootstrap should keep execution truth from Oracle `generation_variant_state` and `generation_run_state`, and startup count reporting should come from those Oracle-owned tables rather than rereading Supabase `source_item_blueprint_variants` or `generation_runs`. This is additive backend execution-state behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: generation-state Pass 2 now also removes normal-runtime Supabase generation-state shadow writes in `primary`; variant claim/ready/failed transitions plus generation-run lifecycle writes should stay Oracle-only, with Supabase `source_item_blueprint_variants` and `generation_runs` no longer needed for normal mutation correctness. This is additive backend execution-state behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: generation-state Pass 3 now also removes the main normal-runtime Supabase generation-state read fallbacks in `primary`; shared variant/run readers, blueprint-availability cooldown checks, and profile/detail generation attribution now treat Oracle execution state as the normal runtime read source, while direct browser `source_item_blueprint_variants` reads are replaced with backend Oracle-aware lookups. This is additive backend execution-state behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: generation-trace Pass 2 now also removes normal-runtime Supabase `generation_run_events` writes in `primary`; shared milestone/terminal event appends plus per-run event sequencing now stay Oracle-only. This is additive backend execution-state behavior and does not alter the YT2BP request/response envelope.
- 2026-04-08 note: generation-trace Pass 3 now also removes the main normal-runtime Supabase `generation_run_events` reads in `primary`; trace detail routes and shared event pagination now resolve Oracle event state instead of rereading Supabase on ordinary runtime misses. This is additive backend execution-state behavior and does not alter the YT2BP request/response envelope.
- 2026-04-04 note: generation-state `dual` parity now compares variants by logical key (`source_item_id + generation_tier`) and normalizes empty `quality_issues` plus small shadow timestamp skew, while preserving Oracle variant ids on future Supabase shadow creates. This is additive backend migration hardening and does not alter the YT2BP request/response envelope.
- 2026-04-02 note: during `supabase|dual` source-item rollout, Oracle-first source-item lookup failures should degrade to Supabase-backed source reads instead of surfacing route errors on wall/profile/source-page flows. This is additive backend resilience and does not alter the YT2BP endpoint envelope.
- 2026-04-03 note: once `ORACLE_SOURCE_ITEM_LEDGER_MODE=primary` is live, by-id and by-video source-item lookups should prefer the durable Oracle source-item ledger directly; the older product-source-item mirror remains compatibility/bootstrap state rather than the steady-state source-item reader. This is additive backend runtime behavior and does not alter the YT2BP endpoint envelope.
- 2026-04-02 note: source-page video-library follow-up reads now also reflect queued/running `source_item_blueprint_variants` state, so `GET /api/source-pages/:platform/:externalId/videos` stays consistent with `POST /api/source-pages/:platform/:externalId/videos/unlock` when a source video is already in progress. This is additive and outside the YT2BP endpoint envelope.
- 2026-04-02 note: source-page variant overlay must ignore `needs_generation` states, and short-transcript failures (`TRANSCRIPT_INSUFFICIENT_CONTEXT`) now also participate in blueprint-unavailable cooldown and locked-card suppression so failed low-context videos do not immediately bounce back to normal `Unlock available` UX. This is additive backend/product-state hardening and remains outside the YT2BP endpoint envelope.
- 2026-04-02 note: source-page unlock preparation failures should now surface as explicit prepare-failed outcomes rather than being reported back as generic `in_progress`, including impossible cases where the returned unlock row is still `available`; Oracle-primary unlock mutation wrapper failures should fall back to the durable Supabase unlock mutation path plus Oracle shadow resync, and legacy `transcript_probe_meta = null` unlock rows should be normalized back to `{}` during reserve/ensure writes so fallback updates remain schema-valid. This is additive backend resilience and outside the YT2BP endpoint envelope.
- 2026-04-02 note: Oracle-cron subscription ingestion now classifies YouTube RSS feed failures more precisely: transient `5xx/network` feed misses retry inside the sync, stale `404` channel ids may recover from the stored channel URL, repeated `404` misses now back off progressively (`1x` -> `2x` -> `4x` -> `8x`, capped at `24h`), and soft per-subscription feed failures no longer automatically make an otherwise healthy `all_active_subscriptions` batch terminal state fail. This is additive backend control-plane hardening and does not alter the YT2BP request/response envelope.
- 2026-04-02 note: subscription cron hard failures now also persist readable `last_sync_error` / terminal batch text (`message`, plus `code/details/hint` when available) and emit structured `subscription_sync_hard_failed` logs instead of collapsing object-shaped failures to `[object Object]`. This is additive backend observability hardening and does not alter the YT2BP request/response envelope.
- 2026-04-02 note: fresh `source_item_unlocks` rows plus Oracle-primary/shared unlock row builders now also initialize `transcript_status='unknown'` so subscription sync and other unlock-creation paths do not violate the durable unlock contract with null transcript truth. This is additive backend hardening and does not alter the YT2BP request/response envelope.
- 2026-04-02 note: auth-only search/manual generation duplicate-ready handling now upgrades an existing per-user locked `user_feed_items` row via feed-row upsert when the backend finds a reusable ready blueprint for that source item, preventing `No new generation queued` responses from leaving Home/For You stuck on a locked card. This is additive backend behavior and does not alter the YT2BP request/response envelope.
- 2026-04-05 note: the default one-step prompt template is now `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v6.md`; this keeps the same `draft.sectionsJson` schema and endpoint envelope, but makes `Takeaways` lighter/plain-English, requires `Storyline` to stay `2-3` substantial paragraphs/slides, treats long transcript pruning as normal runtime shaping rather than a caveat trigger, and uses the existing `open_questions` field for a more reader-useful `Caveats` section built around balancing nuance instead of repetitive evidence-policing.
- 2026-04-05 note: subscribe/reactivate may now backfill sparse Home `For You` walls (`<20` visible cards) with up to the latest `5` creator videos. Historical backfill rows stay locked by default and do not auto-generate solely because `auto_unlock_enabled=true`, but a reusable ready blueprint for the same source item should attach as the ready feed row instead of a locked placeholder. This is additive backend feed behavior and does not alter the YT2BP request/response envelope.
- 2026-04-06 note: Home `For You` wall ordering now uses additive `user_feed_items.generated_at_on_wall` metadata so locked cards keep original wall-arrival time while the first locked -> generated blueprint promotion can resurface once at generation completion time. This is additive feed behavior and does not alter the YT2BP request/response envelope.
- 2026-04-07 note: mixed Home `For You` ordering now follows one effective wall-display timestamp across card kinds (`generated_at_on_wall || created_at` for generated rows, `created_at` for locked rows) instead of giving generated rows blanket priority over newer locked cards. This is additive feed behavior and does not alter the YT2BP request/response envelope.
- 2026-04-07 note: Oracle-cron subscription ingestion now also allows one bounded creator-title fallback after stale-channel URL recovery fails on `FEED_FETCH_FAILED:404`; the subscription is only repaired when creator-name search yields one strong canonical winner, otherwise the row remains a quiet soft failure. This is additive backend resilience and does not alter the YT2BP request/response envelope.
- 2026-03-27 note: display/render surfaces now label that final section as `Caveats`, while runtime/storage keys stay `open_questions` and legacy `Open Questions` titles remain accepted as compatibility aliases.
- 2026-03-27 note: in `llm_native` mode, YT2BP retries now stay reserved for blocking structure/shape misses; `TAKEAWAYS_TOO_LONG` remains logged on `generation_runs` as soft quality telemetry but no longer triggers regeneration by itself.
- 2026-03-23 note: queue-backed source-video generation now records active ingestion-job ownership on `source_item_blueprint_variants`, reclaims stale in-progress variants after a bounded timeout only when `active_job_id` is missing, resumes same-job unlock preflight instead of treating owned variants as generic `in_progress`, and persists terminal `generation_runs` status outside best-effort trace-event writes; this is additive backend reliability hardening and remains outside the YT2BP request/response envelope.
- 2026-02-18 note: subscription manual-refresh endpoints (`/api/source-subscriptions/refresh-scan`, `/api/source-subscriptions/refresh-generate`) are additive and do not alter the YT2BP endpoint envelope.
- 2026-02-18 note: refresh hardening (`GET /api/ingestion/jobs/:id`, refresh endpoint rate caps, `MAX_ITEMS_EXCEEDED`, `JOB_ALREADY_RUNNING`) is additive and does not alter the YT2BP endpoint envelope.
- 2026-02-18 note: refresh hardening follow-up (`GET /api/ingestion/jobs/latest-mine`, manual-refresh checkpoint-forward updates) is additive and does not alter the YT2BP endpoint envelope.
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
- 2026-03-14 note: the current default is `TRANSCRIPT_PROVIDER=youtube_timedtext`; if YouTube captions are unavailable, the same seam falls through first to `videotranscriber_temp`, then to `transcriptapi` in lean text-only mode (`format=text`, `include_timestamp=false`) when `TRANSCRIPTAPI_APIKEY` is configured. This is additive and does not change the production endpoint envelope.
- 2026-03-24 note: `videotranscriber_temp` now performs one bounded local key/session renew attempt on early service failures (`runtime_config`, `url_info`, `start`) before the outer transcript fallback policy continues. This is additive and does not alter the YT2BP endpoint envelope.
- 2026-03-19 note: subscription sync persistence now throttles no-op success/error writes to `user_source_subscriptions` behind a `15m` backend heartbeat to reduce Supabase churn; this is additive backend behavior outside the YT2BP request/response envelope.
- 2026-04-01 note: Oracle job-activity mirror reads now also cover retry/refresh pending-job dedupe, unlock-reliability job lookups, and ops/latest ingestion-status reads under `ORACLE_JOB_ACTIVITY_*`; durable queued/running rows, claims, and retries still remain in Supabase. This is additive backend behavior outside the YT2BP request/response envelope.
- 2026-04-05 note: deterministic transcript pruning now defaults to `YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS=5000` with threshold buckets `5000,9000,16000`; long transcripts still use the same evenly spaced excerpt sampler before the final cap is enforced. This is additive backend behavior outside the YT2BP request/response envelope.
- 2026-04-05 note: `GET /api/source-subscriptions` now supports additive `limit`/`offset` pagination for the subscriptions-management `Load more` flow, returning `{ items, next_offset }` when paging params are supplied; callers without paging params keep the legacy full-array response shape. This is additive backend behavior outside the YT2BP request/response envelope.
- 2026-04-06 note: blueprint YouTube comments refresh now skips the `blueprint_youtube_comments` rewrite entirely when the normalized fetched snapshot is unchanged, and emits explicit changed/skipped refresh logs. This is additive backend behavior outside the YT2BP request/response envelope.
- 2026-04-09 note: blueprint YouTube comments ownership is now moving onto Oracle-backed comment state for normal runtime refresh/delete-reseed writes and backend comment reads; the request/response envelope for YT2BP itself is unchanged.
- 2026-04-10 note: main backend blueprint-tag ownership now writes tag joins into Oracle `blueprint_tag_state` for blueprint creation and channel publish flows, while coupled backend tag reads (classification/channel feed/auto-banner) prefer Oracle rows and only fall back per-blueprint to Supabase for older residue. This is additive backend product-ledger behavior and does not alter the YT2BP request/response envelope.
- 2026-04-06 note: queue-ledger `primary` compatibility writes now update existing `ingestion_jobs` rows by durable id before falling back to insert-on-miss, reducing queue shadow `on_conflict` churn without changing queue outcomes. This is additive backend behavior outside the YT2BP request/response envelope.
- 2026-04-06 note: the remaining queue-ledger `primary` compatibility patches are now lifecycle-aware: terminal vs retry/claim/lease shadows are classified explicitly and any surviving `PATCH /ingestion_jobs` shadow now sends only the fields needed for that class instead of rewriting the full queue row. This is additive backend behavior outside the YT2BP request/response envelope.
- 2026-04-07 note: queue-ledger `primary` now runs Oracle-only for normal queue runtime. Normal queue writes and normal queue read misses stay Oracle-local by default, and the old Supabase queue compatibility lever is no longer part of steady-state runtime. This is additive backend control-plane behavior outside the YT2BP request/response envelope.
- 2026-04-07 note: Oracle-only queue runtime also requires Supabase `source_item_unlocks` compatibility rows to stop mirroring queue `job_id` values; Oracle unlock/product mirrors retain the real job ownership so unlock processing no longer depends on a Supabase `ingestion_jobs` foreign key. This is additive backend control-plane behavior outside the YT2BP request/response envelope.
- 2026-04-07 note: unlock-ownership follow-up now also stops Oracle unlock bootstrap from rehydrating `source_item_unlocks` shadow back into runtime; once unlock-ledger `primary` is live, Oracle product-unlock bootstrap should rebuild from the Oracle unlock ledger instead of re-importing stale Supabase unlock rows. This is additive backend control-plane behavior outside the YT2BP request/response envelope.
- 2026-04-08 note: the later unlock-ownership closure also removed the remaining meaningful active-runtime product/browser reads of `source_item_unlocks`: Blueprint Detail source attribution, liked-blueprint profile linkage, and the browser-side legacy `/api/my-feed` fallback no longer read Supabase unlock rows directly. This is additive backend/product-read behavior outside the YT2BP request/response envelope.
- 2026-04-06 note: subscription sync now prefers earlier Home `For You` arrival for new creator uploads by attaching a reusable ready blueprint row immediately when available, or otherwise inserting the unlockable feed row before slower auto-unlock work completes. This is additive backend behavior outside the YT2BP request/response envelope.
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
- When compatibility render blocks or legacy `draft.steps` are shown, the final section should now display as `Caveats` even though the canonical stored field name remains `open_questions`.
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
- `TRANSCRIPT_PROVIDER` (current default `youtube_timedtext`; built-in fallback chain `videotranscriber_temp` then `transcriptapi` when available)
- `TRANSCRIPTAPI_APIKEY` (enables the `transcriptapi` third-fallback adapter)
- `TRANSCRIPT_USE_WEBSHARE_PROXY`, `WEBSHARE_PROXY_URL`, `WEBSHARE_PROXY_HOST`, `WEBSHARE_PROXY_PORT`, `WEBSHARE_PROXY_USERNAME`, `WEBSHARE_PROXY_PASSWORD` (shared transport config for opted-in transcript providers)
- `VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS` (local/dev-only, default `180000`, bounded provider-local timeout)
- `VIDEOTRANSCRIBER_TEMP_FORCE_NEW_SESSION` (local/dev-only anonymous-session rotation toggle)
- `YT2BP_CONTENT_SAFETY_ENABLED`
- `YT2BP_ANON_LIMIT_PER_MIN`
- `YT2BP_AUTH_LIMIT_PER_MIN`
- `YT2BP_IP_LIMIT_PER_HOUR`
- `YT2BP_CORE_TIMEOUT_MS` (default `120000`, bounded `30000..300000`)
- `TRANSCRIPT_MAX_ATTEMPTS`, `TRANSCRIPT_TIMEOUT_MS`, `LLM_MAX_ATTEMPTS`, `LLM_TIMEOUT_MS` (bounded provider retry budgets used by this endpoint)
- `INTERACTIVE_TRANSCRIPT_MAX_ATTEMPTS`, `INTERACTIVE_TRANSCRIPT_TIMEOUT_MS`, `INTERACTIVE_LLM_MAX_ATTEMPTS`, `INTERACTIVE_LLM_TIMEOUT_MS` (interactive queued-generation retry/timeout caps layered under the same provider seam)
- `INTERACTIVE_YT2BP_QUALITY_MAX_RETRIES`, `INTERACTIVE_YT2BP_CONTENT_SAFETY_MAX_RETRIES` (interactive queued-generation retry caps for quality/content-safety rerun loops)
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
- Additive note: `generation_started` inbox rows now emit per queued job again, with dedupe limited to repeated emits for the same `jobId`.
- Additive note: rapid interactive generate bursts now also use an in-flight queue-refill path for queued manual/search/source-page jobs; this remains runtime behavior outside the endpoint envelope.
- 2026-03-23 note: terminal `source_item_unlock_generation` failures now emit `generation_failed` notifications from actual failed item counts even when transcript/provider retry policy remains active; additive and outside this endpoint envelope.
- Installed-PWA push subscription/config routes (`/api/notifications/push-subscriptions*`) and push delivery queue processing are intentionally outside this endpoint contract.
- Service queue operations (`POST /api/ingestion/jobs/trigger`, `GET /api/ingestion/jobs/latest`, `GET /api/ops/queue/health`) are intentionally outside this endpoint contract.
- Daily-credit wallet and source-unlock persistence (`user_credit_wallets`, `credit_ledger`, `source_item_unlocks`, `/api/credits`) are intentionally outside this endpoint contract.
- Oracle durable unlock-ledger staging (`ORACLE_UNLOCK_LEDGER_MODE`, local `source_item_unlocks` ownership/shadowing behavior, paginated parity/bootstrap before `primary`, Oracle-ledger-first unlock truth reads once `primary` is live, and Oracle-only unlock bootstrap that no longer rehydrates from Supabase shadow) is intentionally outside this endpoint contract.
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
