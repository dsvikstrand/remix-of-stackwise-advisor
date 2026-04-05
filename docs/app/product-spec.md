# Product Spec (`bleuV1` Direction)

## One-Line Product Promise
`bleuV1` is a source-first app that turns favorite media into bite-sized blueprints, enriched by community insights.

## Core Direction Lock
- Canonical identity lock: `docs/app/core-direction-lock.md`.
- Canonical feed model: `docs/app/mvp-feed-and-channel-model.md`.
- Primary MVP journey: source input -> Home `For You` -> auto channel evaluation/publish.
- Library/inventory routes are compatibility-only and not part of the core user journey.

## Reference Status
- Legacy ASS/agentic seeding material is archived for historical reference only:
  - `docs/_archive/legacy-ass-agentic/README.md`
  - `docs/_archive/legacy-ass-agentic/agentic/README.md`
  - `docs/_archive/legacy-ass-agentic/ass_das/ASS_full.mmd`
  - `docs/_archive/legacy-ass-agentic/design-docs/ASS_simple.mmd`
  - `docs/_archive/legacy-ass-agentic/design-docs/seed_ass_spec.md`
  - `docs/_archive/legacy-ass-agentic/schemas/ass_eval_config_schema.md`
- Runtime behavior and roadmap decisions should be based on active/canonical docs, not archived seeding tracks.

## Status Snapshot
a1) [have] YouTube to Blueprint generation is live (`/youtube` + `/api/youtube-to-blueprint`).
a2) [have] Public feed/channel/community primitives are live (`/wall`, `/channels`, `/b/:channelSlug`, likes/comments).
a3) [have] `/my-feed` is now legacy compatibility-only and redirects to `/wall`; Home `For You` is the active personal lane.
a4) [have] Auto-ingestion from followed YouTube channels is available with auto-only UX and new-uploads-only behavior (no initial old-video prefill).
a5) [have] Auto-channel pipeline contract is implemented for all source paths and can auto-publish to channels after deterministic checks.
a6) [have] Auto-channel assignment supports deterministic mapping and post-artifact LLM labeling (`llm_labeler_v1`) with safe fallback to `general` on invalid output.
a7) [have] Legacy pending/skipped feed rows without blueprints are hidden in the legacy `My Feed` compatibility UI to reduce migration noise.
a8) [have] `/subscriptions` is simplified for MVP to two visible actions: `Add Subscription` (popup search) and per-row `Unsubscribe`.
a9) [have] `/subscriptions` hides the aggregate ingestion-health summary box to reduce new-user confusion.
a10) [have] Auth-only `Search` route (`/search`) now treats video lookup as a direct-find flow: paste a YouTube link, video id, or specific title, then generate only when the app finds a confident match.
a11) [have] `/subscriptions` now supports auth-only creator lookup with popup-based subscribe flow: channel URL, handle, and channel id are preferred, while creator-name lookup returns only a tiny helper-backed candidate set.
a11a) [have] Manual `Add Subscription` lookup now uses explicit input modes (`Handle`, `Creator name`, `Channel URL / ID`) instead of guessing user intent from one mixed free-text path.
a11b) [have] Explicit handle-mode lookup now prefers official YouTube `forHandle` resolution before any legacy handle-page scraping fallback, so valid `@handle` input is more stable.
a12) [have] Subscription rows now render channel avatar thumbnails (when available) and hide technical status/mode badges from row UI.
a13) [have] Legacy `My Feed` compatibility blueprint rows retain channel-feed-style visual cards with status-driven auto-channel outcomes.
a14) [have] Manual/search YouTube generation defaults to AI review enabled while banner generation stays off in the current thumbnail-first flow.
a15) [have] Legacy `My Feed` compatibility notice cards support channel avatar rendering and optional profile-banner background (when available from YouTube).
a16) [have] Legacy `My Feed` compatibility notice cards still open a detailed popup with `Unsubscribe` confirmation; current unsubscribe no longer spends request-path work removing the notice row immediately.
a17) [have] Manual `Post to Channel` UI is feature-flagged for rollback and removed from normal auto-channel mode surfaces.
a18) [have] Legacy `My Feed` compatibility blueprint cards open blueprint detail by card click (dedicated `Open blueprint` link removed).
a19) [have] The current transcript default is `youtube_timedtext` first, with `videotranscriber_temp` as the built-in second fallback and `transcriptapi` as the built-in third fallback behind the same YT2BP pipeline seam when YouTube captions are unavailable.
a19a) [have] `videotranscriber_temp` now performs one bounded local key/session renew attempt on early service-related failures before falling through to the broader transcript fallback behavior.
a19) [have] Legacy `My Feed` header shortcuts are compatibility-only; active subscription entrypoints are Home/user-menu + `/subscriptions`.
a20) [have] Auto-banner queue contract is now available for subscription auto-ingest (`/api/auto-banner/jobs/trigger`) with service-auth control and non-blocking ingestion mode.
a21) [have] Banner-cap policy contract is now available globally with generated banner preservation (`blueprints.banner_generated_url`) and deterministic channel-default fallback.
a22) [have] Legacy `My Feed` compatibility card footer still shows read-only auto-channel status (`Posted to <Channel>`, `Publishing...`, or `In My Feed`) and uses a unified `Blueprint` badge for blueprint cards.
a23) [have] Search-generated saves now carry source channel context so legacy `My Feed` compatibility subtitle rows can show channel name instead of duplicated post title.
a24) [have] Legacy `My Feed` subtitle resolution falls back to source metadata channel title when `source_channel_title` is missing, preventing title duplication for search-generated content.
a25) [have] `/youtube` now runs core generation first and performs optional AI review as an async post-step; banner generation is intentionally off and `Save to Home` remains non-blocking.
a25a) [have] Queued manual YT2BP work now preserves interactive request class all the way through the worker path: search/manual/source-page generation can use tighter interactive transcript/LLM retry budgets, emits additive per-stage timing logs for the one-step pipeline, and keeps the slower retry profile for background ingestion.
a25b) [have] Rapid interactive generate bursts now also request in-flight queue refill for `source_item_unlock_generation`, `search_video_generate`, and `manual_refresh_selection`, so later jobs in a burst can claim closer to free worker capacity instead of waiting for the prior claim batch to finish.
a26) [have] Banner generation prompt is now explicitly visual-only (no readable text/typography/logos/watermarks) to keep card backgrounds clean.
a27) [have] `/subscriptions` now includes `Refresh` popup flow: scan new videos from active subscriptions, select videos, and start background blueprint generation async.
a28) [have] Manual refresh endpoints now enforce per-user cooldown limits and background-job concurrency guards to prevent duplicate/overlapping runs.
a29) [have] Failed manual refresh videos no longer enter a persisted retry cooldown table; follow-up scans can reconsider them immediately.
a30) [have] `/subscriptions` now displays lightweight background-generation job status (`Queued/Running/Succeeded/Failed`) with inserted/skipped/failed counts.
a31) [have] Successful manual refresh generation now advances subscription checkpoints forward so those videos are not picked up again by later auto polling.
a32) [have] `/subscriptions` now restores active manual-refresh status on reload via latest user job lookup.
a33) [have] Refresh scan dialog no longer depends on `cooldown_filtered`; failed items are eligible to reappear on later scans without a persisted retry-hold table.
a34) [have] Blueprint detail header now prioritizes source-channel attribution for imported YouTube blueprints (creator-only edit CTA removed from default MVP UI).
a35) [have] Subscription details popup in legacy `My Feed` compatibility UI is simplified (relative added-time + unsubscribe only, no absolute timestamp or open-channel action).
a36) [have] `/subscriptions` rows are simplified to channel identity + unsubscribe, with channel-open behavior moved to avatar click and verbose URL/polling text removed.
a37) [have] New profiles now default to `is_public=true` (public by default); existing profile visibility remains unchanged unless edited.
a38) [have] Signed-in top nav is simplified to `Home / Channels / Explore`; Search is now entered via the header `Create` action near the profile menu.
a39) [have] User dropdown includes `Subscriptions` as the direct link to the full subscription management page.
a40) [have] Profile `Feed` tab is a read-only history surface for generated blueprints and subscribed creators; subscription management stays on the dedicated `/subscriptions` page.
a41) [have] Core high-traffic copy surfaces (Home/About/Explore/Help/Auth/YouTube/Search/Wall) are aligned to current source-first and auto-channel runtime language.
a42) [have] Landing page hero now uses benefit-first, cold-user language with logged-out primary CTA `Try YouTube URL` and a tertiary `See example blueprint` jump.
a43) [have] Landing now includes an above-the-fold proof card (live example when available, curated example fallback when empty).
a44) [have] Landing social-proof sections (`Top Blueprints`, `Trending Topics`) now show curated fallback content instead of disappearing when live data is empty.
a45) [have] Frontend bootstrap now guards missing Supabase env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) and shows a user-facing configuration screen instead of a blank page.
a46) [have] Landing use-case strip is now explicit (`fitness`, `recipes`, `study`, `productivity`) to communicate practical value before sign-in.
a47) [have] New-account onboarding still includes an optional first-login `/welcome` setup path, and it now reuses the same manual-first creator setup flow as `/subscriptions`.
a48) [have] Onboarding completion is gated by joining at least one Bleu channel; creator add/import remains optional and speeds up personalization but does not block continue.
a49) [have] Home now shows a small dismissible YouTube-setup reminder card for skipped/incomplete onboarding users.
a50) [have] Source Pages foundation is active: YouTube channels are now represented as platform-agnostic shared source entities with route `/s/:platform/:externalId`.
a51) [have] Subscription surfaces now deep-link to Source Pages, while legacy `/api/source-subscriptions*` contracts remain active for compatibility.
a52) [have] Source page reads now lazily hydrate missing avatar/banner assets for legacy backfilled rows, so first open can populate visuals without requiring re-subscribe.
a53) [have] Source pages now expose a public, deduped blueprint feed (`latest + load more`) via `GET /api/source-pages/:platform/:externalId/blueprints`, and `/s/:platform/:externalId` renders Home-style read-only blueprint cards.
a54) [have] Source pages now include a subscriber-only, user-triggered `Video Library` section for back-catalog generation (`GET /videos`, `POST /videos/unlock`) with async queue execution and duplicate skip visibility.
a55) [have] Shared source-video unlock model is active for new source-page generation: one generation per source video can be reused across subscribers.
a56) [have] Credit model now uses a daily credit wallet with UTC reset (`free=3.00`, `plus=20.00`, `admin` bypass, no rollover) instead of refill semantics.
a57) [have] Search/manual generation duplicate-ready handling now upgrades an existing personal locked feed row to a blueprint-backed feed row when the backend finds a reusable ready blueprint for that source item, preventing `Generate` from returning `No new generation queued` while Home still shows the item as locked.
a57) [have] Subscription auto-ingestion now writes unlockable personal-lane rows (legacy state name `my_feed_unlockable`) for new uploads instead of immediately generating blueprints.
a58) [have] Subscription sync persistence now skips unchanged successful writes unless checkpoint/title/error state changed, while repeated identical error writes remain throttled behind a `30m` backend heartbeat; this reduces Supabase churn while keeping the user-facing `60m` subscription-health window unchanged.
a59) [have] Deterministic long-transcript pruning for queued/manual YT2BP now defaults to a `5000`-character cap with threshold buckets `5000/9000/16000`; over-budget transcripts still use the same evenly spaced excerpt sampler before the final hard trim.
a58a) [have] Service-cron subscription ingestion still triggers every `3m`, but backend enqueue now gates `all_active_subscriptions` through the Oracle cadence window (`ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS`, default `60m`), reducing background requeue churn without changing active-work queue behavior.
a58b) [have] Low-priority queue claim polling now backs off more aggressively at idle, reducing `claim_ingestion_jobs` churn without changing queue/job UX or lease ownership semantics.
a58c) [have] High-priority user-triggered generation now also expedites its own Oracle queue sweep/claim cooldowns before waking the queued worker, so fresh manual unlock/search/manual-refresh jobs do not inherit multi-minute empty-sweep backoff from earlier idle periods.
a58c) [have] `all_active_subscriptions` processing is now Oracle-bounded on each run: the backend prioritizes Oracle-local due rows first, currently caps each due batch to `150` subscriptions, and may drain up to `2` due batches in one job before yielding.
a58d) [have] Service ops ingestion-status reads and Blueprint YouTube refresh pending-job dedupe now also run through centralized Oracle-first helpers, leaving any durable Supabase fallback under runtime helpers instead of in route/service-local branches.
a58e) [have] Subscription feed fetches are now hardened against noisy YouTube RSS failures: transient `5xx/network` feed errors retry inside the sync, stale `404` channel ids may self-heal from the stored channel URL, repeated `404` misses now back off progressively (`1x` -> `2x` -> `4x` -> `8x`, capped at `24h`) instead of reappearing forever on the base quiet interval, and Oracle-cron batches now treat those feed fetch misses as soft per-subscription outcomes unless the whole attempted batch degrades.
a58f) [have] Subscription cron hard failures now also persist readable `last_sync_error` / batch failure text (`message`, plus `code/details/hint` when available) and emit structured `subscription_sync_hard_failed` logs, so live `PARTIAL_FAILURE` runs no longer collapse to `[object Object]`.
a58g) [have] Durable unlock truth now also requires fresh `source_item_unlocks` rows to initialize `transcript_status='unknown'`; leaving that field null is now treated as a live-breaking bug because both subscription sync inserts and Oracle-primary/shared unlock row builders use the same unlock table contract.
a58h) [have] Source-item durable rollout now also has an explicit live safety rule: before any future `ORACLE_SOURCE_ITEM_LEDGER_MODE=dual -> primary` promotion, parity must pass and a wall/source-page unlock consistency canary must stay healthy on the same build.
a58i) [have] Oracle durable generation execution truth is now also staged behind `ORACLE_GENERATION_STATE_MODE=supabase|dual|primary`, covering `source_item_blueprint_variants` plus `generation_runs` summaries while keeping `generation_run_events` on Supabase for now.
a58k) [have] Generation-state dual hardening now preserves Oracle variant UUIDs on future Supabase shadow creates and evaluates parity by logical variant key plus normalized run payloads, reducing false drift from backend-local row ids, empty-array/null issue encoding, and sub-second shadow timestamp skew.
a58j) [have] Source-video unlock throttling now uses soft request caps (burst+sustained) instead of hard cooldown, and frontend credit meter refreshes immediately after unlock actions.
a59) [have] Feed lane contract is now locked explicitly: `For You` is the personal source-driven lane, `Joined` is the joined-channel published lane, and `All` is the global published blueprint lane.
a60) [have] Explore search now supports `Sources` results (app Source Pages only), with dedicated filter and grouped section in `All` results.
a61) [have] Unlock activity status is now unified across Home `For You` and Source Page `Video Library`, while legacy `My Feed` compatibility behavior still uses the same shared job-resume tracker (`latest-mine` scope: `source_item_unlock_generation`).
a61a) [have] Source-page `GET /api/source-pages/:platform/:externalId/videos` now also overlays queued/running `source_item_blueprint_variants` state, so an item that `POST /videos/unlock` classifies as already in progress is returned back to the UI as `unlock_in_progress=true` / `unlock_status=processing` on the immediate follow-up read instead of briefly falling back to `available`.
a61b) [have] Oracle-first `source_items` reads now also degrade safely to Supabase-backed reads when the Oracle source-item path fails during `supabase|dual` rollout, so wall/profile/source-page surfaces keep serving source metadata instead of returning runtime errors while the source-item ledger slice is being re-staged.
a61c) [have] Once `ORACLE_SOURCE_ITEM_LEDGER_MODE=primary` is live, the durable Oracle source-item ledger is the normal source-item read path for by-id and by-video lookups; the older product-source-item mirror remains compatibility/bootstrap state rather than the steady-state source-item reader.
a61c) [have] Supabase edge functions used directly by the browser now treat `https://bleup.app` and `https://www.bleup.app` as first-class allowed CORS origins and must not default browser requests to the older GitHub preview origin.
a61d) [have] Source-page unlock prepare failures now fail explicitly instead of being misreported as `in_progress`, and the handler now also rejects impossible `in_progress` states where the returned unlock row is still `available`; Oracle-primary unlock mutations must fall back to the proven Supabase unlock path plus Oracle shadow resync when the Oracle mutation wrapper cannot complete, and legacy unlock rows with `transcript_probe_meta = null` now normalize that field back to `{}` during reserve/ensure writes so the shared unlock flow can move again.
a62) [have] Credits dropdown now reads lazily on open, surfaces daily reset timing, and avoids background polling from the always-mounted header UI.
a63) [have] Home scope helper/copy is part of the feed-lane clarity work, but the canonical contract now lives in `docs/app/mvp-feed-and-channel-model.md`.
a64) [have] Unlock backend now runs reliability sweeps (expired/stale/orphan recovery) with structured traceable logs, and unlock/generate responses include additive `trace_id`.
a65) [have] Unlock/manual/service ingestion execution is now enqueue-first with durable DB lease claiming (no in-request `setImmediate` worker path).
a66) [have] Service operations now include `GET /api/ops/queue/health` for queue depth, work-item backlog, stale leases, and provider circuit snapshots.
a67) [have] Subscription rows now support `auto_unlock_enabled` (default `true`) so new uploads can auto-attempt source unlock generation through the funded-subscriber shared-cost billing model.
a68) [have] YouTube-source blueprints now use thumbnail-first banners across cards and detail views; legacy source-linked rows are backfilled to thumbnails and source flows bypass auto-banner enqueue.
a69) [have] Notifications MVP now emits reply and generation-terminal notifications and surfaces them through an auth inbox bell in the app header.
a70) [have] Generation duration policy is available for MVP hardening (default off): max video length gate (`45m`), unknown-duration blocking, no-charge-on-policy-block, and partial-accept batch queueing with blocked-item details.
a71) [have] Manual generation surfaces are now gated by the daily credit wallet, with duplicate/in-progress requests short-circuited before charge and pre-generation failures released automatically.
a72) [have] Launch gate hardening adds explicit credit outage semantics (`CREDITS_UNAVAILABLE`) and `/api/credits` backend-health visibility fields (`credits_backend_mode`, `credits_backend_ok`, `credits_backend_error`).
a73) [have] Launch legal baseline routes are now first-class (`/terms`, `/privacy`) and linked from auth surface.
a74) [have] Launch error-copy normalization is centralized through shared frontend mapping for critical failure classes across Search/Source/Wall and legacy `My Feed` compatibility flows.
a75) [have] Source-page search uptime hardening: opportunistic source-page asset sweep is wired safely so `/api/source-pages/search` cannot crash backend runtime.
a76) [have] Supabase repo target is aligned to project `qgqqavaogicecvhopgan`, and shared auto-unlock schema migration `20260306113000_auto_unlock_shared_cost_v1.sql` is applied remotely.
a77) [have] Search, source-page unlock, and subscription manual-refresh flows now share typed backend preflight helpers for duplicate classification, queue admission, and manual reservation-prefix handling without changing route response contracts.
a77a) [have] Queue depth/work-item helper reads now honor explicit `scope`/`scopes` filters so refresh guards, queue admission, and ops checks use the intended queue slice rather than broad full-queue reads.
a78) [have] `/subscriptions` now composes its OAuth/import/refresh orchestration through a dedicated frontend controller hook instead of keeping that state/query/mutation model inline in the page component.
a79) [have] `/wall` now consumes backend-shaped feed endpoints for both public lanes and `For You`, and its scope/query/mutation orchestration is composed through a dedicated frontend controller hook rather than browser-side multi-table hydration.
a80) [have] Bleup is now installable as an online-first PWA at `https://bleup.app`, and this is the preferred non-store app distribution path for the current MVP.
a81) [have] PWA mode uses the same frontend, backend, and Supabase auth/session model as browser mode; it is not a separate app product.
a82) [have] Current PWA behavior is intentionally conservative: installability, standalone launch, offline fallback, update prompting, and mobile install CTA surfaces are in scope, while authenticated feed/subscription/generation data remains network-only.
a83) [have] Installed-PWA web push is now implemented behind rollout flags and remains opt-in only from notification surfaces; the first eligible push types are `comment_reply`, `generation_succeeded`, and `generation_failed`.
a84) [have] Installed-PWA push remains outside the normal live contract until backend runtime validation and device delivery proof are complete; Oracle control-plane recovery/inspection now uses the standardized OCI CLI workflow instead of repo-local note files.
a85) [have] Wall/Explore/Channel/Search cards now prefer stored `blueprints.preview_summary` teaser text, preserving summary-like previews without loading canonical `sections_json` on list surfaces.
a86) [have] Blueprint YouTube refresh scheduling now batches pending-job detection by refresh kind/candidate set, and manual comments refresh no longer force-writes refresh state before reading an existing enabled row.
a87) [have] Queue worker lease heartbeats are now lease-aware by default, reducing `touch_ingestion_job_lease` frequency without changing visible queue/job UX.
a87a) [have] Fast maintenance/enrichment queue scopes now also defer their first lease heartbeat deeper into the lease window (`45s` on the default `90s` lease), so short-lived retry/refresh jobs often complete without any extra lease write while heavier scopes keep the normal baseline.
a88) [have] Durable generation trace writes are now slimmer: per-event sequencing reuses a per-run in-process cursor and trace writes no longer ask Supabase to return row payloads when the caller does not use them.
a89) [have] User-scoped ingestion status routes are tighter: `latest-mine` now resolves from one recent-row read, and `active-mine` queue-position scans narrow to requested or visible queued scopes instead of broadly scanning all queue scopes.
a89a) [have] The current `latest-mine` restore baseline is intentionally conservative: the backend only reads the latest `2` recent rows for the requested user/scope, and the shared source-unlock tracker now polls less often (`5m` default, `30m` stale window) to reduce passive status churn.
a89b) [have] Home `For You` no longer forces an extra unlock-status resume call on mount when the shared tracker freshness window already covers the current state, further reducing passive restore reads without changing the visible route contract.
a89c) [have] Oracle job-activity mirrors now also stay warm through the queued worker itself: claimed batches, failure transitions with already-known `attempts`, and lease-heartbeat refreshes all update Oracle from the in-hand job row instead of forcing another Supabase read just to keep queue-health and active-job mirrors current.
a89d) [have] Ingestion user-status routes are now fully centralized around those Oracle-first readers: job detail, `latest-mine`, `active-mine`, and queued-position ordering no longer keep their own inline Supabase fallback branches in the route layer.
a90) [have] Frontend query freshness is now explicitly split by surface class: live and semi-live hooks declare their own cadence, while static-ish list/detail reads (`Wall`, `Search`, `Explore`, channel feed, blueprint detail/comments, profile tabs) use conservative stale windows and disable focus-triggered refetch by default.
a91) [have] `GET /api/my-feed` remains available as a legacy compatibility auth read, but it is no longer the active primary surface contract now that `/my-feed` redirects to `/wall`.
a92) [have] YouTube refresh bookkeeping now skips unchanged `source_items.metadata.view_count` writes and no-op `blueprint_youtube_refresh_state` upserts, reducing backend churn without changing manual/auto refresh UX.
a92a) [have] The default one-step YT2BP prompt contract is now `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v6.md`: it preserves the same `draft.sectionsJson` schema, keeps `Takeaways` lighter/plain-English, keeps `Storyline` at `2-3` substantial paragraphs/slides, treats long transcript pruning as normal runtime shaping rather than a caveat trigger, and uses the existing `open_questions` field for a more reader-useful `Caveats` section built around balancing nuance instead of repetitive evidence-policing.
a92b) [have] Display/render surfaces now label that final section as `Caveats`, while the runtime/storage field remains `open_questions` and legacy `Open Questions` labels remain accepted as compatibility aliases.
a92c) [have] In `llm_native` mode, YT2BP retries now stay focused on blocking structure/shape failures; `TAKEAWAYS_TOO_LONG` is still logged for telemetry but no longer triggers regeneration on its own.

## Core Model
b1) `Source Item`
- Media object from an adapter (YouTube v1).
- Canonical identity key (example: `youtube_video_id`) for dedupe/cache.

b2) `Imported Blueprint` (primary content type)
- Generated step-by-step blueprint from a source item.
- Includes source provenance and generation metadata.

b3) `User Insight/Remix` (secondary content type)
- User-added value layered on an imported blueprint.
- Not a standalone free-form post type in `bleuV1` MVP.

b4) Feed surfaces
- `Home` (`/wall`) scopes:
  - `For You` (auth-only): personal source-driven stream, latest-first, includes locked subscribed-source items plus ready blueprint cards for subscribed-source items and personally unlocked items.
  - `Joined` (auth-only): published-blueprint feed filtered to Bleu channels the user has joined.
  - `All` + `b/<slug>` scopes: public published-blueprint feeds across all channels or one channel scope.
- `My Feed` (`/my-feed`): legacy compatibility redirect to `Home` and not a current primary lane.

b5) Subscription behavior (MVP simplified)
- UI behavior is auto-only.
- On subscribe, backend sets a checkpoint (`last_seen_published_at` / `last_seen_video_id`) without ingesting historical uploads.
- Future uploads after checkpoint ingest to unlockable rows (`my_feed_unlockable`) with shared unlock metadata.
- Manual generation pricing is fixed: any explicit new blueprint generation intent costs `1.00` credit.
- Manual debit policy is reserve-first, settle at first OpenAI generation dispatch, and release on pre-generation failure/duplicate short-circuit.
- Backend runtime hardening: OpenAI SDK construction is lazy-loaded at call time so backend startup does not depend on top-level `openai` ESM import success on Oracle.
- Oracle control-plane subscription scheduler migration remains additive:
  - `ORACLE_CONTROL_PLANE_ENABLED=true` may bootstrap local SQLite scheduler state without changing queue authority when scheduler mode stays `supabase`.
  - `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=shadow` may compute and persist Oracle-side subscription scheduling decisions for comparison.
  - `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=primary` now makes Oracle authoritative for `all_active_subscriptions` enqueue admission, cadence timing, external-trigger ownership, and due-batch selection, while Supabase still owns durable queue truth, leases, checkpoints, and user-facing writes.
  - Oracle-primary drain breadth is now separately configurable through `ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT`, and one run may drain multiple due batches through `ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN`; the current live rollout uses `150` rows and `2` batches with a `15m` cadence override, improving backlog clearance without moving queue truth off Supabase.
  - Oracle queue-control envs (`ORACLE_QUEUE_*`) may now also move empty-claim cooldown and tier-aware claim backoff into Oracle-local SQLite/in-process state, Oracle queue-sweep envs (`ORACLE_QUEUE_SWEEP_*`) may now make Oracle authoritative for queued-worker tier cadence, sweep selection, and tier batch sizing, Oracle queue-admission mirror envs (`ORACLE_QUEUE_ADMISSION_*`) may now let hot admission/preflight paths read Oracle-local active queue counts instead of repeatedly querying Supabase for the same queue-depth snapshot, and Oracle job-activity mirror envs (`ORACLE_JOB_ACTIVITY_*`) may now let stale-running recovery, manual-refresh duplicate guards, retry/refresh pending-job dedupe, unlock-reliability job lookups, active `all_active_subscriptions` duplicate guards, owner-scoped `GET /api/ingestion/jobs/:id`, Oracle-backed queue-position reads for `GET /api/ingestion/jobs/active-mine`, and user/ops latest-job status reads use Oracle-local job state first.
  - Oracle job-activity mirror writes now also happen directly from enqueue/claim/terminal/stale lifecycle transitions, so the hot worker/control-plane path no longer needs an extra Supabase read-after-write refresh for the same job row just to keep Oracle mirror state current.
  - Remaining user-triggered enqueue/finalize flows now follow that same centralized path: manual refresh, search generation, source-page unlock generation, and foreground subscription sync should use the Oracle-aware enqueue/finalize helpers rather than inline `ingestion_jobs` writes in handler code.
  - Service/debug ingestion control now follows that same rule too: `/api/ingestion/jobs/trigger` and debug subscription simulation enqueue/finalize through the centralized Oracle-aware helpers instead of direct handler-level `ingestion_jobs` writes.
  - Oracle queue-ledger envs (`ORACLE_QUEUE_LEDGER_MODE`, `ORACLE_QUEUE_LEDGER_BOOTSTRAP_LIMIT`) may now also bootstrap and maintain a local durable queue ledger in SQLite: `dual` mode shadows the Supabase queue row lifecycle on Oracle, while `primary` now lets Oracle own claim/lease/fail/finalize transitions with Supabase retained as compatibility shadow.
  - Queue depth/work-item/status reads can now also reuse that Oracle queue ledger first once it is live, so queue-health snapshots, active-job checks, queued ordering, and several latest-job reads no longer need to prefer Supabase.
  - Oracle queue-admission and job-activity mirror refreshes can now also rebuild from that Oracle queue ledger first once it is live, and in `primary` the normal hot-path reads now prefer the queue ledger directly while those Oracle-local mirrors are treated as fallback/bootstrap compatibility state rather than the main runtime source.
  - Queue-ledger bridge helpers now also wrap claim / fail / lease-touch transitions centrally in `ingestionQueue`, so the worker/controller path updates Oracle mirrors from already-known durable job rows instead of keeping queue-ledger mirror hooks scattered across controller/runtime callers.
  - In queue-ledger `primary`, an empty Oracle result for owner/scoped/latest queue lookups is now authoritative in the normal runtime path; hot-path queue reads should not fall through to Supabase just because Oracle found no matching queued/running row.
  - Queue lease-heartbeat refreshes in queue-ledger `primary` no longer mirror every touch back through a full Supabase `ingestion_jobs` shadow upsert; Oracle still owns the live lease row while Supabase remains compatibility state for non-heartbeat lifecycle writes.
  - Queue claim-to-`running` transitions in queue-ledger `primary` now also skip the Supabase `ingestion_jobs` compatibility upsert; Oracle remains the live worker-state truth while Supabase is only refreshed again on meaningful queued/retry/terminal transitions.
  - Any remaining Supabase queue reads in queue-ledger `primary` are now treated as explicit fallback events and logged (`queue_fallback_read`) so egress audits can separate compatibility reads from the normal Oracle-first path.
  - Those queue fallback logs now also cover Oracle-backed latest-for-user, active-for-user, refresh-pending dedupe, unlock job lookup, and retry-dedupe paths, so queue egress attribution can see the remaining hidden Supabase reads instead of only the obvious route-level fallbacks.
  - Oracle durable subscription envs (`ORACLE_SUBSCRIPTION_LEDGER_MODE`, `ORACLE_SUBSCRIPTION_LEDGER_BOOTSTRAP_LIMIT`) may now also bootstrap and maintain a local SQLite ledger for `user_source_subscriptions`: `dual` shadows subscribe/unsubscribe/checkpoint/error writes on Oracle while still requiring the Supabase row shadow, and `primary` lets Oracle-backed subscription state drive source-page access, follower counts, active subscription lists, and subscription-sync checkpoint/error writes with Supabase retained as compatibility shadow.
  - In subscription-ledger `primary`, empty Oracle results for hot subscription lookups (`by id`, `by user + channel`, per-user active/list reads, source-page access state, subscriber counts) are now authoritative in the normal runtime path; those reads should not fall through to Supabase just because Oracle found no matching subscription row.
  - Supabase subscription shadow writes now also skip no-op updates when the compatibility row already matches the meaningful persisted fields, reducing repeated `PATCH /user_source_subscriptions` churn from unchanged subscription state.
  - Any remaining Supabase subscription reads in subscription-ledger `primary` are now explicit fallback events and logged (`subscription_fallback_read`) so egress audits can separate compatibility reads from the normal Oracle-first path; compatibility shadow updates also prefer direct `id` writes before any user/channel reread.
  - Oracle-first subscription fan-out now also covers source-page/channel subscriber-user collection and auto-unlock eligibility, so shared blueprint attach and subscription auto-unlock paths should read active subscriber user ids from the Oracle ledger before any Supabase fallback.
  - Oracle-primary subscription flows now also hydrate batches by subscription `id` through the ledger for due-batch sync runs and manual refresh checkpoint updates, rather than reloading those rows directly from Supabase in the normal path.
  - Subscription-ledger `primary` now also lets sync/checkpoint/error-only patch churn stay Oracle-local when only operational fields (`last_polled_at`, `last_seen_*`, `last_sync_error`) changed, trimming the remaining hot `PATCH /user_source_subscriptions` traffic without changing user-facing subscription identity or activation semantics.
  - Source-item-ledger `primary` now also treats empty Oracle results as authoritative for hot source-item lookups (`by id`, `by canonical_key`, `by source_native_id`, and batch source-row hydration), so those reads should not fall through to Supabase just because Oracle found no matching source row.
  - Supabase source-item shadow writes now also skip no-op updates when the compatibility row already matches the meaningful persisted fields, and Oracle-primary source-item writes now update the compatibility row by durable `id` before any canonical-key conflict fallback instead of eagerly rereading Supabase `source_items` by `id` + `canonical_key` before every write; that update/insert shadow seam now also reuses one mapped payload helper on both paths.
  - Any remaining Supabase source-item reads in source-item-ledger `primary` should now be treated as explicit fallback events and logged (`source_item_fallback_read`) so egress audits can separate compatibility reads from the normal Oracle-first path.
  - Oracle durable feed envs (`ORACLE_FEED_LEDGER_MODE`, `ORACLE_FEED_LEDGER_BOOTSTRAP_LIMIT`) may now also bootstrap and maintain a local SQLite ledger for `user_feed_items`: `dual` shadows feed insert/update/delete transitions on Oracle while still keeping the Supabase row shadow, and `primary` lets wall/profile/public feed readers plus shared feed mutation paths prefer Oracle-backed feed rows while Supabase remains compatibility shadow.
  - Oracle durable generation-state envs (`ORACLE_GENERATION_STATE_MODE`, `ORACLE_GENERATION_STATE_BOOTSTRAP_LIMIT`) may now also bootstrap and maintain local SQLite execution truth for `source_item_blueprint_variants` plus `generation_runs`: `dual` shadows variant/run writes on Oracle while still keeping the Supabase shadow, and `primary` lets shared variant ownership/readiness and generation-run summary reads prefer Oracle-backed execution state while `generation_run_events` stay on Supabase.
  - Oracle product-mirror envs (`ORACLE_PRODUCT_MIRROR_ENABLED`, `ORACLE_PRODUCT_BOOTSTRAP_LIMIT`) may now also bootstrap/mirror active subscriptions, recent source items, source-item unlock rows, and recent feed rows into Oracle-local SQLite so source-page subscription/access checks, blueprint-cooldown decisions, unlock-status lookups, public wall/source-page blueprint feeds, and wall/profile feed-history reads can prefer Oracle-local reads first when the mirror is sufficiently complete; hot subscription/feed/unlock mutations now also refresh that product mirror from known rows or targeted reloads so those Oracle-first reads stay aligned, while Supabase still remains authoritative for durable product truth and fallback reads.
  - Supabase still owns queued/running rows, claim/lease truth, and retries.
- Auto-unlock toggle defaults to disabled (`auto_unlock_enabled=false`) for new subscriptions; reactivating an existing subscription preserves the prior saved toggle value.
- Locked auto-billing policy is shared-cost:
  - one canonical auto-generation intent per new source video
  - participant snapshot = subscribed + `auto_unlock_enabled=true` users at release-detection time
  - total auto cost is `1.00` credit split across the funded subset using the fixed-point affordability rule and `0.01` wallet precision
  - admin entitlement users count as bypass-funded participants and must not be excluded solely because wallet balance is `0`
  - if no funded subset remains, the video stays locked for later manual generation
- Runtime now uses the shared-cost auto model directly:
  - one canonical auto intent per source video
  - one `1.00` total auto charge split across the funded participant subset
  - participant shares reserve on job acceptance, settle at first OpenAI dispatch, and release on pre-generation failure
  - post-settlement retries are non-billable
- Auto-ingested subscription items run review generation by default.
- YouTube-source generation is thumbnail-first:
  - source flows write `blueprints.banner_url` from source thumbnail (stored or deterministic `ytimg` fallback).
  - source flows bypass auto-banner enqueue by default.
  - `SUBSCRIPTION_AUTO_BANNER_MODE` remains as compatibility control for non-source/legacy banner worker paths.
- A persistent notice card is inserted into the personal lane with state `subscription_notice` and is surfaced on Home `For You` (with legacy `My Feed` compatibility support retained).
- Subscribe/reactivate may also backfill up to the latest `5` creator videos when the user currently has fewer than `20` visible Home `For You` cards; historical backfill rows stay locked (`my_feed_unlockable`) unless the backend already has a reusable ready blueprint for that source item, in which case the feed row is attached/upgraded to the ready blueprint instead.
- Notice cards are visualized with channel avatar and optional banner background when metadata is available.
- API compatibility note: `mode` remains a legacy compatibility field on subscription endpoints and stored rows may still contain `manual` or `auto`, but runtime auto behavior is controlled by `auto_unlock_enabled`.
- Manual refresh reliability policy:
  - `refresh-scan` rate limit: 1 request per 30 seconds per user.
  - `refresh-generate` rate limit: 1 request per 120 seconds per user.
  - max selected items per generation run: `20`.
  - successful generation updates per-subscription checkpoint (`last_seen_published_at` / `last_seen_video_id`) forward.
  - failed selected videos are no longer hidden behind a persisted retry cooldown table and may reappear on later scans immediately.

## MVP Lifecycle Contract
c1) Pull/ingest -> either generate directly or create unlockable source row -> Home `For You`.
c2) Optional user remix/insight.
c3) Auto-channel pipeline runs per item (classifier mode is env-driven: deterministic or post-artifact LLM labeler).
c4) Channel gate contract remains (`channel_fit`, `quality`, `safety`, `pii`); in `llm_labeler_v1`, channel-fit is pass-by-design for the selected label while quality/safety/pii stay enforced.
c5) Result:
- pass -> publish to Home feed (`/wall`)
- fail/warn/block -> remain in Home `For You` (personal-only)
c6) Legacy manual candidate endpoints remain behind rollback controls and are not primary UI flow.
c7) Subscription notice flow:
- successful subscribe/reactivate inserts one persistent notice card per user/channel.
- notice canonical key: `subscription:youtube:<channel_id>`.
- notice cards are informational and have no Accept/Skip or channel submit controls.
- notice cards open details on click and include `Unsubscribe` with confirm; current unsubscribe deactivates the subscription without spending extra request-path work removing the notice card immediately.
c8) Feed lane publication rules:
- `For You` is the only lane that may contain locked items.
- `Joined` contains only generated and published blueprint cards from joined Bleu channels.
- `All` contains only generated and published blueprint cards across all Bleu channels.
- A manually unlocked blueprint from a non-subscribed source appears in that user’s `For You`, but future videos from that source do not appear there unless the user later subscribes.
c9) YT2BP blueprint contract:
- the current canonical blueprint content produced by YT2BP is `draft.sectionsJson` with schema `blueprint_sections_v1`.
- `draft.steps`, `draft.summaryVariants`, and `draft.notes` are compatibility-era carryovers during the cutover and are not the intended current-runtime shape for new gate/render/storage work.
- the endpoint envelope may still carry those compatibility fields for v0 stability, but current product/runtime truth is sections-first.
- the default one-step writing contract is `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v6.md`, which keeps the same output schema while making `Takeaways` lighter, requiring more substantial `Storyline` paragraphs/slides, treating long transcript pruning as normal runtime shaping rather than a caveat trigger, and using the existing `open_questions` field for a more reader-useful `Caveats` section built around balancing nuance instead of repetitive evidence-policing.
- display/render surfaces now show that final section as `Caveats`, while runtime/storage keys stay `open_questions` and older `Open Questions` titles remain accepted during parsing.

## Product Principles
p1) Source-first content supply (not creator-first posting).
p2) Personal-first ownership (Home `For You` is always available).
p3) Community adds interpretation/opinion via insights/remixes.
p4) Channel cleanliness enforced by explicit gates.
p5) Explainable in one sentence.

## MVP Default Policies (Lock)
m1) Adapter scope default: YouTube-only.
m2) Home `For You` default visibility: personal/private lane until channel promotion.
m3) Channel promotion default mode: automatic publish to classifier-resolved channel after checks (default env mode is still `deterministic_v1`).
m4) User contribution default: insights/remixes attached to imported blueprints (no standalone free-form posting in MVP core).
m5) Non-pass auto-channel outcomes default action: blocked from channel, retained in Home `For You`.
m6) Evaluator default mode: all-gates-run with aggregated decision evidence.
m7) Planned mutable interfaces use explicit auth scope + idempotency mode and unified response envelope.
m8) Runtime default for legacy manual gates remains `CHANNEL_GATES_MODE=bypass`; auto-channel path can enforce independently via `AUTO_CHANNEL_GATE_MODE`.

## Primary User Flows (`bleuV1`)
f1) User follows YouTube channels from `/subscriptions` by clicking `Add Subscription`, looking up a creator by channel URL, handle, channel id, or creator name, and clicking `Subscribe`.
f2) User can unsubscribe from active channels directly on `/subscriptions` (unsubscribed rows disappear from the page list).
f3) User enters search/create via header `Create` (which routes to `/search`) and looks up one specific YouTube video by link, video id, or title match (not persisted until generate).
f4) User selects `Generate Blueprint` on a result to generate and save directly into Home `For You`.
f5) User can subscribe to a result’s channel from the same search card.
f6) On subscribe/reactivate, user gets one subscription notice card; sparse Home `For You` walls (`<20` visible cards) may also receive up to the latest `5` creator videos as historical backfill, preferring ready blueprint rows when reusable output already exists and otherwise inserting locked cards only.
f7) Auto-channel pipeline publishes eligible items automatically and labels Home `For You` cards with posted channel outcomes.
f8) User scans, remixes, and adds insights.
f9) Eligible items are promoted to Home feed channels after gates.
f10) Community votes/comments to surface higher-value items.
f11) User can manually refresh subscriptions from `/subscriptions`, preview new videos, and launch async background generation without blocking app usage.
f12) New accounts can optionally complete source setup at `/welcome` before normal usage.

## Route and IA Snapshot
r1) [have] Home: `/`
r2) [have] Home feed: `/wall` (`For You`, `Joined`, `All`)
r3) [have] Explore: `/explore`
r4) [have] Channels index: `/channels`
r5) [have] Channel page: `/b/:channelSlug`
r6) [have] YouTube adapter page (manual v0): `/youtube`
r7) [have] Blueprint detail: `/blueprint/:blueprintId`
r8) [have] Legacy compatibility route: `/my-feed` -> `/wall`
r9) [have] Subscriptions route: `/subscriptions`
r10) [have] Search route: `/search` (auth-only)
r11) [have] Compatibility redirects: `/tags` -> `/channels`, `/blueprints` -> `/wall`
r12) [have] Signed-in primary nav is community-first: `Home / Channels / Explore`.
r13) [have] Personal workspace is profile-first: `/u/:userId` tabs are `Feed / Comments / Liked`, where `Feed` is read-only profile history; `/my-feed` is compatibility-only and redirects to `/wall`.
r14) [have] Header `Create` action (next to profile) is the primary entrypoint to `/search`.
r15) [have] Optional onboarding route: `/welcome` (auth-only, first-login entrypoint for new users only).
r16) [have] Source page route: `/s/:platform/:externalId` (public-readable, subscribe/unsubscribe capable for authenticated users).
r17) [have] `/subscriptions` now preloads `50` rows at a time and appends more with explicit `Load more`, so large subscription libraries do not render the entire list on first paint.

## Scope Boundaries (MVP)
s1) In scope
- YouTube adapter as first and only required adapter.
- Personal feed from pulled media.
- Channel publish gating and moderation-lite rules.
- Community interactions on shared blueprints (likes/comments).

s2) Out of scope
- Multi-adapter rollout in same MVP cut.
- Sync/reactivate user controls in `/subscriptions` are deferred (future “sync specific videos” flow).
- Debug simulation UI exposure remains deferred (operator-only endpoint stays hidden from user UI).
- Fully open free-form blog/social posting model.
- Full moderation platform for user-generated channels.
- Rich offline product behavior, push notifications, background sync, and native app-store packaging remain deferred beyond the current PWA rollout.
- Note: push notifications are now code-complete behind rollout gates, but still deferred from the normal live contract until device validation and flag enablement are complete.

## Data Surfaces (Current + Direction)
d1) [have] `blueprints`, `blueprint_tags`, `blueprint_likes`, `blueprint_comments`.
d1a) [have] `blueprints.preview_summary` is the cheap teaser field for card/list surfaces; canonical long-form blueprint content still lives in `blueprints.sections_json`.
d2) [have] `tag_follows`, `tags`, `profiles`, `mvp_events`.
d3) [have] Source ingestion + feed tables (`source_items`, `user_source_subscriptions`, `user_feed_items`).
d4) [have] Channel candidate + decision logs (`channel_candidates`, `channel_gate_decisions`).
d5) [have] Scheduled/user-triggered ingestion jobs + trace table (`ingestion_jobs`).
d6) [have] Auto-banner policy + queue tables (`channel_default_banners`, `auto_banner_jobs`).
d7) [have] Onboarding state table for new-user YouTube setup (`user_youtube_onboarding`).
d8) [have] Source-page foundation tables/links (`source_pages`, `user_source_subscriptions.source_page_id`, `source_items.source_page_id`).
d9) [have] Daily-credit + unlock tables (`user_credit_wallets`, `credit_ledger`, `source_item_unlocks`).
d9a) [have] Oracle runtime now also stages durable unlock-row truth for `source_item_unlocks` behind `ORACLE_UNLOCK_LEDGER_MODE`, while wallet and credit-ledger truth stay on Supabase.
d9b) [have] Oracle unlock-ledger `dual` soak now also has a required parity check via `npm run ops:oracle-unlock-parity -- --json`; a healthy pre-`primary` result shows full row coverage on both sides plus zero durable-field drift.
d9c) [have] Oracle unlock-ledger bootstrap now pages through recent `source_item_unlocks` rows so the configured `ORACLE_UNLOCK_LEDGER_BOOTSTRAP_LIMIT` can hydrate fully instead of stopping at the first backend page.
d9d) [have] Once `ORACLE_UNLOCK_LEDGER_MODE=primary` is live, unlock-specific truth reads and unlock mutation preconditions should resolve from the durable Oracle unlock ledger first; the older Oracle product unlock mirror stays as compatibility/read-plane support rather than the main unlock-truth source.
d9e) [have] Oracle runtime now also supports staging durable source-item truth for `source_items` behind `ORACLE_SOURCE_ITEM_LEDGER_MODE`, with Oracle-aware source-item upserts, metadata/view-count updates, and Oracle-first execution/feed read paths ready for `dual|primary`; if those Oracle-first source reads regress, live runtime should stay or fall back to `supabase` until the fixed build is redeployed.
d10) [have] Historical transcript-bridge table `transcript_requests` exists in schema history for earlier Oracle/Paperspace experiments; current transcript-provider runtime does not depend on it.

## Subscription Interfaces (MVP)
si1) `POST /api/source-subscriptions` with `{ channel_input, mode? }` (`mode` accepted but ignored/coerced to `auto` in MVP path)
si2) `GET /api/source-subscriptions`
si3) `PATCH /api/source-subscriptions/:id` with `{ mode?, is_active?, auto_unlock_enabled? }` (`mode` accepted for compatibility and coerced to `auto`)
si4) `DELETE /api/source-subscriptions/:id` (soft deactivate)
si5) `POST /api/source-subscriptions/:id/sync` (user sync)
si6) `POST /api/ingestion/jobs/trigger` (service auth for cron)
si7) `POST /api/my-feed/items/:id/accept`
si8) `POST /api/my-feed/items/:id/skip`
si9) debug-only endpoint (service auth + env gate): `POST /api/debug/subscriptions/:id/simulate-new-uploads` (`ENABLE_DEBUG_ENDPOINTS=true` required, authenticated by `x-service-token`, no user bearer token required)
si10) YouTube channel resolver accepts handle/channel URL/channel ID and still keeps `browseId` fallback parsing for legacy handle pages where `channelId` is absent, but explicit creator-search handle mode now prefers official `forHandle` resolution first.
si11) service-ops endpoint: `GET /api/ingestion/jobs/latest` (service auth; latest ingestion health snapshot)
si11b) service-ops endpoint: `GET /api/ops/queue/health` (service auth; queue depth/stale lease/provider circuit state snapshot)
si12) YouTube video lookup endpoint: `GET /api/youtube-search?q=<link|video_id|title>` (single confident-hit semantics via helper-backed title fallback; no broad paging contract)
si13) YouTube creator lookup endpoint: `GET /api/youtube-channel-search?q=<channel_url|handle|channel_id|creator_name>&limit=<1..3>&mode=<auto|handle|creator_name|channel_url_or_id>` (exact identifiers first; explicit handle mode prefers official `forHandle` resolution, bare-handle input is still supported without requiring `@`, helper-backed name lookup returns only a tiny candidate set, and there is no official `search.list` dependency)
si13b) Shared YouTube live-call budgeting now uses an atomic backend quota consume path; when the quota schema is present, retry timing comes from the DB decision rather than app-side best-effort counters.
si13c) Known-channel video-library listing (`GET /api/youtube/channels/:channelId/videos`, `GET /api/source-pages/:platform/:externalId/videos`) now uses the channel uploads-playlist path (`channels.list -> playlistItems.list`) instead of `search.list`, so those routes no longer carry the 100-unit search cost per page.
si14) `GET /api/source-subscriptions` now includes optional `source_channel_avatar_url` per subscription row from stored `source_pages` metadata; normal reads do not block on live YouTube API asset fetches.
si15) service-ops endpoint: `POST /api/auto-banner/jobs/trigger` (service auth; processes queue + cap rebalance)
si16) service-ops endpoint: `GET /api/auto-banner/jobs/latest` (service auth; queue snapshot)
si17) Backend core timeout control: `YT2BP_CORE_TIMEOUT_MS` (applies to `/api/youtube-to-blueprint` request budget).
si18) user endpoint: `POST /api/source-subscriptions/refresh-scan` (scan active subscriptions for new videos; no blueprint generation)
si19) user endpoint: `POST /api/source-subscriptions/refresh-generate` (enqueue selected videos for async background blueprint generation)
si20) user endpoint: `GET /api/ingestion/jobs/:id` (owner-scoped status for manual refresh background jobs)
si21) `POST /api/source-subscriptions/refresh-generate` returns `409 JOB_ALREADY_RUNNING` if a manual refresh job is already active for the user.
si22) `POST /api/source-subscriptions/refresh-generate` returns `400 MAX_ITEMS_EXCEEDED` if selected item count exceeds `10`.
si23) refresh candidate rescans no longer rely on persisted `refresh_video_attempts` cooldown rows; failed manual-refresh items may reappear on later scans immediately.
si24) user endpoint: `GET /api/ingestion/jobs/latest-mine?scope=manual_refresh_selection` (restore active manual-refresh status after page reload).
si24b) job status endpoints now include additive retry/lease metadata (`attempts`, `max_attempts`, `next_run_at`, `lease_expires_at`, `trace_id`).
si25) user endpoint: `POST /api/my-feed/items/:id/auto-publish` (legacy compatibility mutation path for auto-channel publish on a saved personal-lane blueprint).
si26) `POST /api/my-feed/items/:id/auto-publish` returns additive classifier metadata (`classifier_mode`, `classifier_reason`, optional `classifier_confidence`) for audit/debug.
si27) auth read endpoint: `GET /api/my-feed` returns the hydrated legacy `My Feed` compatibility list in one backend-shaped payload (source, blueprint, candidate, tags, unlock state, transcript-hidden filtering) and is additive to the existing mutation endpoints.
si27) `AUTO_CHANNEL_CLASSIFIER_MODE` now supports `llm_labeler_v1` (artifact-only input, sync before publish, retry once on invalid output, fallback to `general`).
si28) user endpoint: `GET /api/youtube/connection/status` (owner-scoped YouTube OAuth link status for `/subscriptions`)
si29) user endpoint: `POST /api/youtube/connection/start` (starts Google OAuth; returns `auth_url`)
si30) callback endpoint: `GET /api/youtube/connection/callback` (consumes one-time state and redirects back to `/subscriptions`)
si31) user endpoint: `GET /api/youtube/subscriptions/preview` (fetches all available YouTube subscriptions for import selection)
si32) user endpoint: `POST /api/youtube/subscriptions/import` (bulk import selected channels; idempotent + inactive reactivation)
si33) user endpoint: `DELETE /api/youtube/connection` (revoke+unlink OAuth connection while preserving existing app subscriptions)
si34) `/subscriptions` is now manual-creator-add first in the public MVP path; it includes a public YouTube subscriptions import guide/placeholder, while the older direct YouTube OAuth connect/import surface remains in code for internal or beta use only.
si35) public/auth endpoint: `GET /api/source-pages/:platform/:externalId` (source header + follower count + viewer subscription state).
si36) auth endpoint: `POST /api/source-pages/:platform/:externalId/subscribe` (idempotent subscribe, source-page auto-create for YouTube).
si37) auth endpoint: `DELETE /api/source-pages/:platform/:externalId/subscribe` (unsubscribe parity; legacy subscription-notice cleanup is no longer on the request path).
si38) compatibility note: legacy `POST/GET/PATCH/DELETE /api/source-subscriptions*` remains live while Source Pages rollout expands.
si39) public/auth endpoint: `GET /api/source-pages/:platform/:externalId/blueprints?limit=<1..24>&cursor=<opaque?>` (public channel-published feed for the source page, deduped by `source_item_id` with `next_cursor` pagination; includes additive `source_thumbnail_url` fallback per item).
si40) auth endpoint: `GET /api/source-pages/:platform/:externalId/videos?page_token=<optional>&limit=<1..25>&kind=<full|shorts>` (source-page video-library listing for subscribed signed-in users, includes duplicate flags per row; shorts threshold is `<=60s`).
si41) auth endpoint: `POST /api/source-pages/:platform/:externalId/videos/unlock` (subscriber-only manual unlock route; reserves `1.00` credit only for new work, starts unlock generation queue, returns `job_id` + ready/in-progress/unaffordable summary buckets + additive `trace_id`).
si42) current source-page manual generation route is `POST /api/source-pages/:platform/:externalId/videos/unlock`, which returns additive `trace_id` for unlock tracing.
si43) `GET /api/source-pages/:platform/:externalId/videos` now includes unlock metadata per row (`unlock_status`, `unlock_cost`, `unlock_in_progress`, `ready_blueprint_id`).
si43a) That video-library read now also reflects queued/running variant state from `source_item_blueprint_variants`, keeping immediate follow-up reads aligned with `POST /api/source-pages/:platform/:externalId/videos/unlock` even when the durable unlock row has not changed yet.
si43aa) `resolveVariantOrReady(...)=needs_generation` must not be surfaced as `unlock_in_progress`; only queued/running variant states may upgrade Source Page rows to `unlock_status=processing`.
si43b) If the Oracle-first source-item reader fails while `ORACLE_SOURCE_ITEM_LEDGER_MODE` is still `supabase` or `dual`, the backend should fall back to Supabase-backed source rows instead of failing the source-page, wall, or profile read outright.
si44) `GET /api/credits` now returns daily-wallet fields (`balance`, `capacity`, `daily_grant`, `next_reset_at`, `seconds_to_reset`, `plan`) alongside compatibility fields (`remaining`, `limit`, `resetAt`).
si44b) `GET /api/credits` keeps additive compatibility fields (`generation_daily_limit`, `generation_daily_used`, `generation_daily_remaining`, `generation_daily_reset_at`, `generation_daily_bypass`) while old daily-cap UI assumptions are phased out.
si44c) frontend credit refresh is now lazy-by-default: the always-mounted user menu fetches only while open, Search performs one initial read for credit-aware generation UI, and post-action freshness comes from explicit `['ai-credits']` invalidation instead of constant polling.
si45) source-page video-library unlock worker scope is `source_item_unlock_generation` (single generation per source video, shared fan-out to subscribed users).
si46) source-page video-library list rate policy: burst `4/15s` plus sustained `40/10m` per user/IP (reduce accidental 429 on normal tab-switch/load-more while keeping abuse guardrails).
si47) source-page video-library unlock/generate rate policy: burst `8/10s` plus sustained `120/10m` per user/IP (credit balance remains the primary generation throttle).
si48) public/auth endpoint: `GET /api/source-pages/search?q=<query>&limit=<1..25>` (Explore source lookup against app `source_pages`; returns minimal source cards and source-page paths).
si49) unlock reliability sweeps run opportunistically on source-page video list/unlock routes; service-cron ingestion trigger no longer force-runs those sweeps on its hot path.
si50) unlock trace propagation contract: `trace_id` is emitted in unlock responses and threaded through unlock queue/job logs and credit-ledger metadata (`hold|settle|refund`).
si51) transcript-unavailable unlock handling is deterministic: manual unlock returns `TRANSCRIPT_UNAVAILABLE` + `retry_after_seconds`, no credit hold is created, and auto-unlock retries are deferred via `source_auto_unlock_retry`.
si52) source-page unlock queue payload now includes additive `unlock_origin` (`manual_unlock|subscription_auto_unlock|source_auto_unlock_retry`) for durable worker/retry semantics.
si53) read endpoints `GET /api/credits` and `GET /api/ingestion/jobs/latest-mine` are protected by dedicated high-ceiling read limiters and are excluded from generic global limiter handling to prevent UI polling collisions.
si53b) `GET /api/ops/queue/health` now reports additive work-size fields (`queue_work_items`, `running_work_items`, per-scope `queued_work_items`, per-scope `running_work_items`) so operator decisions are not based on job rows alone.
si54) profile tabs contract: owner and public profile tabs are `Feed`, `Comments`, `Liked` (subscriptions tab removed from profile surface).
si55) locked source cards use compact credit label format (`<n> cr`) and remove `Open source` action on feed cards.
si56) blueprint list cards in wall/channel/explore remove the share icon action (like/comment remain unchanged).
si57) profile-header refresh entrypoint may launch `/subscriptions?refresh=1&return_to=/u/:id`; after terminal refresh status, user is returned to profile path.
si58) user-menu credits panel remains compact (balance + bar only) without extra refill/activity detail lines in this iteration.
si59) subscription sync now enriches candidate video states via YouTube `videos.list` and skips unreleased premieres (`upcoming`) before source-item/feed insertion.
si60) when one or more upcoming premieres are skipped in a sync run, subscription checkpoint (`last_seen_*`) is held for that run to avoid dropping release-time ingestion.
si61) transcript truth model distinguishes temporary transcript failures from confirmed no-speech outcomes; `NO_CAPTIONS` is retryable until confirmation quorum is reached.
si62) `NO_TRANSCRIPT_PERMANENT` is now set only after bounded confirmation retries, and confirmed no-speech rows are hidden from unlockable feed/video-library surfaces.
si63) auto subscription transcript failures now use silent bounded retries with explicit retry-after ladder; feed-card rows are suppressed during retry/permanent states instead of shown as unlockable locks.
si63a) terminal `source_item_unlock_generation` failures now still emit `generation_failed` notifications from actual failed item counts, so `Recent Results` reflects incomplete generations even when transcript/provider retry policy remains active.
si63b) short-transcript failures (`TRANSCRIPT_INSUFFICIENT_CONTEXT`) now also participate in blueprint-unavailable cooldown for requeue attempts, and wall/profile locked-card readers should suppress those rows during the cooldown instead of bouncing back to `Unlock available`.
si64) transcript speech-guidance warning copy is scoped to explicit Source Page Video Library `+Add` requests; Wall and legacy `My Feed` compatibility unlock actions use generic retry-safe messaging.
si65) auth endpoint: `GET /api/notifications?limit=<1..50>&cursor=<opaque?>` returns inbox rows with `unread_count` and `next_cursor`.
si66) auth endpoint: `POST /api/notifications/:id/read` marks one notification read.
si67) auth endpoint: `POST /api/notifications/read-all` marks all unread notifications read.
si68) comment reply notifications are produced by DB trigger on `wall_comments` reply inserts (self-replies ignored; dedupe key is `comment_reply:<reply_comment_id>`).
si68a) `generation_started` inbox notifications now emit per queued job again; distinct rapid-fire jobs should each surface a start item, while duplicate emits for the same `jobId` still dedupe safely.
si69) auth endpoints: `GET /api/notifications/push-subscriptions/config`, `POST /api/notifications/push-subscriptions`, and `DELETE /api/notifications/push-subscriptions` manage installed-PWA browser push opt-in and subscription lifecycle.
si70) installed-PWA push delivery is derived from the existing `notifications` table via a push-dispatch queue; it is not a separate notification product.
si69) generation surfaces are gated by the daily credit wallet (`free=3.00`, `plus=20.00`, reset `00:00 UTC`, no rollover); manual routes queue only the affordable new-item prefix and return launch-safe credit denial/skip copy.
si69a) admin entitlement bypass applies at actual reservation/settle/refund time for both manual generation and shared auto-unlock paths; admin users are not meant to remain `unlockable` solely because displayed wallet balance is depleted.
si69b) canonical feed-lane semantics are defined in `docs/app/mvp-feed-and-channel-model.md`; implementation should treat `For You` as the only locked lane, `Joined` as joined-channel published discovery, and `All` as the global published blueprint stream.
si70) YouTube comment snapshots for blueprints keep bounded background freshness when the scheduler is enabled: auto refresh targets `+60m` and `+48h`, while owner-triggered manual refresh remains available with per-blueprint cooldown.
si71) manual source-comment refresh endpoint is `POST /api/blueprints/:id/youtube-comments/refresh`; it is owner-only, cooldown denials return `COMMENTS_REFRESH_COOLDOWN_ACTIVE`, and queue backpressure returns `COMMENTS_REFRESH_QUEUE_GUARDED`.
si72) queue-backed source-video generation now records active ingestion-job ownership on `source_item_blueprint_variants`, reclaims stale in-progress variants after a bounded timeout when `active_job_id` is missing, treats same-job unlock preflight as resumable ownership instead of generic `in_progress`, and persists terminal `generation_runs` status independently from best-effort trace-event logging so completed source-page/video-library work does not remain stuck as `running`.

## Next Milestone (Hardening)
n1) Keep legacy manual gate behavior stable with `CHANNEL_GATES_MODE=bypass` while auto-channel path uses `AUTO_CHANNEL_GATE_MODE`.
n2) Iterate YouTube search discovery flow before introducing multi-adapter search.
n3) Harden ingestion reliability visibility (polling freshness + latest job checks) before adding more subscription features.
n4) Keep `SUBSCRIPTION_AUTO_BANNER_MODE=off` for source-first YouTube launch; only revisit async banner workers for non-source/legacy flows if needed.
n5) Reserve `enforce` mode for non-prod verification until dedicated rollout approval.

## Key References
k1) Architecture: `docs/architecture.md`
k2) Feed model: `docs/app/mvp-feed-and-channel-model.md`
k3) Program + project status: `docs/exec-plans/index.md`
k4) Active launch-proof tail: `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`
k5) Completed hardening implementation plan: `docs/exec-plans/completed/mvp-readiness-review-followup.md`
k6) Historical strategy reference: `docs/exec-plans/completed/bleuv1-mvp-hardening-playbook.md`
k7) YT2BP contract: `docs/product-specs/yt2bp_v0_contract.md`
