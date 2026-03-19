# Product Spec (`bleuV1` Direction)

## One-Line Product Promise
`bleuV1` is a source-first app that turns favorite media into bite-sized blueprints, enriched by community insights.

## Core Direction Lock
- Canonical identity lock: `docs/app/core-direction-lock.md`.
- Canonical feed model: `docs/app/mvp-feed-and-channel-model.md`.
- Primary MVP journey: source input -> `My Feed` -> auto channel evaluation/publish.
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
a3) [have] `My Feed` personal unfiltered lane is available as `/my-feed` (feature-flagged rollout).
a4) [have] Auto-ingestion from followed YouTube channels is available with auto-only UX and new-uploads-only behavior (no initial old-video prefill).
a5) [have] Auto-channel pipeline contract is implemented for all source paths and can auto-publish to channels after deterministic checks.
a6) [have] Auto-channel assignment supports deterministic mapping and post-artifact LLM labeling (`llm_labeler_v1`) with safe fallback to `general` on invalid output.
a7) [have] Legacy pending/skipped feed rows without blueprints are hidden in `My Feed` UI to reduce migration noise.
a8) [have] `/subscriptions` is simplified for MVP to two visible actions: `Add Subscription` (popup search) and per-row `Unsubscribe`.
a9) [have] `/subscriptions` hides the aggregate ingestion-health summary box to reduce new-user confusion.
a10) [have] Auth-only `Search` route (`/search`) now treats video lookup as a direct-find flow: paste a YouTube link, video id, or specific title, then generate only when the app finds a confident match.
a11) [have] `/subscriptions` now supports auth-only creator lookup with popup-based subscribe flow: channel URL, handle, and channel id are preferred, while creator-name lookup returns only a tiny helper-backed candidate set.
a12) [have] Subscription rows now render channel avatar thumbnails (when available) and hide technical status/mode badges from row UI.
a13) [have] `My Feed` blueprint rows now use channel-feed-style visual cards with status-driven auto-channel outcomes.
a14) [have] Manual/search YouTube generation defaults to AI review enabled while banner generation stays off in the current thumbnail-first flow.
a15) [have] `My Feed` subscription notice cards now support channel avatar rendering and optional profile-banner background (when available from YouTube).
a16) [have] `My Feed` subscription notice cards open a detailed popup with `Unsubscribe` confirmation; successful unsubscribe removes the notice card.
a17) [have] Manual `Post to Channel` UI is feature-flagged for rollback and removed from normal auto-channel mode surfaces.
a18) [have] `My Feed` blueprint cards now open blueprint detail by card click (dedicated `Open blueprint` link removed).
a19) [have] The current transcript default is `youtube_timedtext` first, with `videotranscriber_temp` as the built-in fallback behind the same YT2BP pipeline seam when YouTube captions are unavailable.
a19) [have] `My Feed` header now includes direct `Add Subscription` shortcut in addition to `Manage subscriptions`.
a20) [have] Auto-banner queue contract is now available for subscription auto-ingest (`/api/auto-banner/jobs/trigger`) with service-auth control and non-blocking ingestion mode.
a21) [have] Banner-cap policy contract is now available globally with generated banner preservation (`blueprints.banner_generated_url`) and deterministic channel-default fallback.
a22) [have] `My Feed` card footer now shows read-only auto-channel status (`Posted to <Channel>`, `Publishing...`, or `In My Feed`) and uses a unified `Blueprint` badge for blueprint cards.
a23) [have] Search-generated saves now carry source channel context so `My Feed` subtitle row can show channel name instead of duplicated post title.
a24) [have] `My Feed` source subtitle resolution now falls back to source metadata channel title when `source_channel_title` is missing, preventing title duplication for search-generated content.
a25) [have] `/youtube` now runs core generation first and performs optional AI review as an async post-step; banner generation is intentionally off and `Save to My Feed` remains non-blocking.
a26) [have] Banner generation prompt is now explicitly visual-only (no readable text/typography/logos/watermarks) to keep card backgrounds clean.
a27) [have] `/subscriptions` now includes `Refresh` popup flow: scan new videos from active subscriptions, select videos, and start background blueprint generation async.
a28) [have] Manual refresh endpoints now enforce per-user cooldown limits and background-job concurrency guards to prevent duplicate/overlapping runs.
a29) [have] Failed manual refresh videos enter a 6-hour retry cooldown and are temporarily hidden from follow-up scans.
a30) [have] `/subscriptions` now displays lightweight background-generation job status (`Queued/Running/Succeeded/Failed`) with inserted/skipped/failed counts.
a31) [have] Successful manual refresh generation now advances subscription checkpoints forward so those videos are not picked up again by later auto polling.
a32) [have] `/subscriptions` now restores active manual-refresh status on reload via latest user job lookup.
a33) [have] Refresh scan dialog now shows `cooldown_filtered` count for videos hidden by the 6-hour retry window.
a34) [have] Blueprint detail header now prioritizes source-channel attribution for imported YouTube blueprints (creator-only edit CTA removed from default MVP UI).
a35) [have] Subscription details popup in `My Feed` is simplified (relative added-time + unsubscribe only, no absolute timestamp or open-channel action).
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
a57) [have] Subscription auto-ingestion now writes unlockable My Feed rows (`my_feed_unlockable`) for new uploads instead of immediately generating blueprints.
a58) [have] Subscription sync persistence now throttles no-op success/error writes with a `15m` backend heartbeat, reducing Supabase churn while keeping the user-facing `60m` subscription-health window unchanged.
a58) [have] Source-video unlock throttling now uses soft request caps (burst+sustained) instead of hard cooldown, and frontend credit meter refreshes immediately after unlock actions.
a59) [have] Feed lane contract is now locked explicitly: `For You` is the personal source-driven lane, `Joined` is the joined-channel published lane, and `All` is the global published blueprint lane.
a60) [have] Explore search now supports `Sources` results (app Source Pages only), with dedicated filter and grouped section in `All` results.
a61) [have] Unlock activity status is now unified across Home `For You`, Source Page `Video Library`, and `My Feed` with shared job-resume behavior (`latest-mine` scope: `source_item_unlock_generation`).
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
a74) [have] Launch error-copy normalization is centralized through shared frontend mapping for critical failure classes across Search/Source/Wall/My Feed.
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
a85) [have] Wall/Explore/Channel/Search/My Feed cards now prefer stored `blueprints.preview_summary` teaser text, preserving summary-like previews without loading canonical `sections_json` on list surfaces.
a86) [have] Blueprint YouTube refresh scheduling now batches pending-job detection by refresh kind/candidate set, and manual comments refresh no longer force-writes refresh state before reading an existing enabled row.
a87) [have] Queue worker lease heartbeats are now lease-aware by default, reducing `touch_ingestion_job_lease` frequency without changing visible queue/job UX.
a88) [have] Durable generation trace writes are now slimmer: per-event sequencing reuses a per-run in-process cursor and trace writes no longer ask Supabase to return row payloads when the caller does not use them.
a89) [have] User-scoped ingestion status routes are tighter: `latest-mine` now resolves from one recent-row read, and `active-mine` queue-position scans narrow to requested or visible queued scopes instead of broadly scanning all queue scopes.

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
- `My Feed`: personal timeline for all imported items and auto-channel outcomes.
- `Home` (`/wall`) scopes:
  - `For You` (auth-only): personal source-driven stream, latest-first, includes locked subscribed-source items plus ready blueprint cards for subscribed-source items and personally unlocked items.
  - `Joined` (auth-only): published-blueprint feed filtered to Bleu channels the user has joined.
  - `All` + `b/<slug>` scopes: public published-blueprint feeds across all channels or one channel scope.

b5) Subscription behavior (MVP simplified)
- UI behavior is auto-only.
- On subscribe, backend sets a checkpoint (`last_seen_published_at` / `last_seen_video_id`) without ingesting historical uploads.
- Future uploads after checkpoint ingest to unlockable rows (`my_feed_unlockable`) with shared unlock metadata.
- Manual generation pricing is fixed: any explicit new blueprint generation intent costs `1.00` credit.
- Manual debit policy is reserve-first, settle at first OpenAI generation dispatch, and release on pre-generation failure/duplicate short-circuit.
- Backend runtime hardening: OpenAI SDK construction is lazy-loaded at call time so backend startup does not depend on top-level `openai` ESM import success on Oracle.
- Auto-unlock toggle defaults to enabled (`auto_unlock_enabled=true`) for existing and new subscriptions.
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
- A persistent notice card is inserted into `My Feed` with state `subscription_notice`.
- Notice cards are visualized with channel avatar and optional banner background when metadata is available.
- API compatibility note: `mode` is accepted on subscription endpoints but coerced/treated as `auto`.
- Manual refresh reliability policy:
  - `refresh-scan` rate limit: 1 request per 30 seconds per user.
  - `refresh-generate` rate limit: 1 request per 120 seconds per user.
  - max selected items per generation run: `20`.
  - successful generation updates per-subscription checkpoint (`last_seen_published_at` / `last_seen_video_id`) forward.
  - if generation fails for a selected video, that `(subscription_id, video_id)` is hidden from scan results for `6h` and then automatically retryable.

## MVP Lifecycle Contract
c1) Pull/ingest -> either generate directly or create unlockable source row -> `My Feed`.
c2) Optional user remix/insight.
c3) Auto-channel pipeline runs per item (classifier mode is env-driven: deterministic or post-artifact LLM labeler).
c4) Channel gate contract remains (`channel_fit`, `quality`, `safety`, `pii`); in `llm_labeler_v1`, channel-fit is pass-by-design for the selected label while quality/safety/pii stay enforced.
c5) Result:
- pass -> publish to Home feed (`/wall`)
- fail/warn/block -> remain in `My Feed` (personal-only)
c6) Legacy manual candidate endpoints remain behind rollback controls and are not primary UI flow.
c7) Subscription notice flow:
- successful subscribe/reactivate inserts one persistent notice card per user/channel.
- notice canonical key: `subscription:youtube:<channel_id>`.
- notice cards are informational and have no Accept/Skip or channel submit controls.
- notice cards open details on click and include `Unsubscribe` with confirm; unsubscribe removes the notice card from My Feed for that user/channel.
c8) Feed lane publication rules:
- `For You` is the only lane that may contain locked items.
- `Joined` contains only generated and published blueprint cards from joined Bleu channels.
- `All` contains only generated and published blueprint cards across all Bleu channels.
- A manually unlocked blueprint from a non-subscribed source appears in that user’s `For You`, but future videos from that source do not appear there unless the user later subscribes.
c9) YT2BP blueprint contract:
- the current canonical blueprint content produced by YT2BP is `draft.sectionsJson` with schema `blueprint_sections_v1`.
- `draft.steps`, `draft.summaryVariants`, and `draft.notes` are compatibility-era carryovers during the cutover and are not the intended current-runtime shape for new gate/render/storage work.
- the endpoint envelope may still carry those compatibility fields for v0 stability, but current product/runtime truth is sections-first.

## Product Principles
p1) Source-first content supply (not creator-first posting).
p2) Personal-first ownership (`My Feed` is always available).
p3) Community adds interpretation/opinion via insights/remixes.
p4) Channel cleanliness enforced by explicit gates.
p5) Explainable in one sentence.

## MVP Default Policies (Lock)
m1) Adapter scope default: YouTube-only.
m2) My Feed default visibility: personal/private lane until channel promotion.
m3) Channel promotion default mode: automatic publish to classifier-resolved channel after checks (default env mode is still `deterministic_v1`).
m4) User contribution default: insights/remixes attached to imported blueprints (no standalone free-form posting in MVP core).
m5) Non-pass auto-channel outcomes default action: blocked from channel, retained in My Feed.
m6) Evaluator default mode: all-gates-run with aggregated decision evidence.
m7) Planned mutable interfaces use explicit auth scope + idempotency mode and unified response envelope.
m8) Runtime default for legacy manual gates remains `CHANNEL_GATES_MODE=bypass`; auto-channel path can enforce independently via `AUTO_CHANNEL_GATE_MODE`.

## Primary User Flows (`bleuV1`)
f1) User follows YouTube channels from `/subscriptions` by clicking `Add Subscription`, looking up a creator by channel URL, handle, channel id, or creator name, and clicking `Subscribe`.
f2) User can unsubscribe from active channels directly on `/subscriptions` (unsubscribed rows disappear from the page list).
f3) User enters search/create via header `Create` (which routes to `/search`) and looks up one specific YouTube video by link, video id, or title match (not persisted until generate).
f4) User selects `Generate Blueprint` on a result to generate and save directly into `My Feed`.
f5) User can subscribe to a result’s channel from the same search card.
f6) On subscribe/reactivate, user gets one subscription notice card and future uploads ingest automatically into `My Feed`.
f7) Auto-channel pipeline publishes eligible items automatically and labels My Feed cards with posted channel outcomes.
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
r8) [have] My Feed first-class route: `/my-feed`
r9) [have] Subscriptions route: `/subscriptions`
r10) [have] Search route: `/search` (auth-only)
r11) [have] Compatibility redirects: `/tags` -> `/channels`, `/blueprints` -> `/wall`
r12) [have] Signed-in primary nav is community-first: `Home / Channels / Explore`.
r13) [have] Personal workspace is profile-first: `/u/:userId` tabs are `Feed / Comments / Liked`, where `Feed` is read-only profile history; `/my-feed` remains the operational personal lane and compatibility/direct route.
r14) [have] Header `Create` action (next to profile) is the primary entrypoint to `/search`.
r15) [have] Optional onboarding route: `/welcome` (auth-only, first-login entrypoint for new users only).
r16) [have] Source page route: `/s/:platform/:externalId` (public-readable, subscribe/unsubscribe capable for authenticated users).

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
si10) YouTube channel resolver accepts handle/channel URL/channel ID and uses `browseId` fallback parsing for handle pages where `channelId` is absent.
si11) service-ops endpoint: `GET /api/ingestion/jobs/latest` (service auth; latest ingestion health snapshot)
si11b) service-ops endpoint: `GET /api/ops/queue/health` (service auth; queue depth/stale lease/provider circuit state snapshot)
si12) YouTube video lookup endpoint: `GET /api/youtube-search?q=<link|video_id|title>` (single confident-hit semantics via helper-backed title fallback; no broad paging contract)
si13) YouTube creator lookup endpoint: `GET /api/youtube-channel-search?q=<channel_url|handle|channel_id|creator_name>&limit=<1..3>` (exact identifiers first; bare-handle input is supported without requiring `@`, helper-backed name lookup returns only a tiny candidate set, and there is no official `search.list` dependency)
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
si23) refresh candidate cooldown table is active: `refresh_video_attempts` (tracks failed manual refresh attempts with retry hold window).
si24) user endpoint: `GET /api/ingestion/jobs/latest-mine?scope=manual_refresh_selection` (restore active manual-refresh status after page reload).
si24b) job status endpoints now include additive retry/lease metadata (`attempts`, `max_attempts`, `next_run_at`, `lease_expires_at`, `trace_id`).
si25) user endpoint: `POST /api/my-feed/items/:id/auto-publish` (run auto-channel publish for a saved My Feed blueprint).
si26) `POST /api/my-feed/items/:id/auto-publish` returns additive classifier metadata (`classifier_mode`, `classifier_reason`, optional `classifier_confidence`) for audit/debug.
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
si37) auth endpoint: `DELETE /api/source-pages/:platform/:externalId/subscribe` (unsubscribe parity + subscription notice cleanup).
si38) compatibility note: legacy `POST/GET/PATCH/DELETE /api/source-subscriptions*` remains live while Source Pages rollout expands.
si39) public/auth endpoint: `GET /api/source-pages/:platform/:externalId/blueprints?limit=<1..24>&cursor=<opaque?>` (public channel-published feed for the source page, deduped by `source_item_id` with `next_cursor` pagination; includes additive `source_thumbnail_url` fallback per item).
si40) auth endpoint: `GET /api/source-pages/:platform/:externalId/videos?page_token=<optional>&limit=<1..25>&kind=<full|shorts>` (source-page video-library listing for subscribed signed-in users, includes duplicate flags per row; shorts threshold is `<=60s`).
si41) auth endpoint: `POST /api/source-pages/:platform/:externalId/videos/unlock` (subscriber-only manual unlock route; reserves `1.00` credit only for new work, starts unlock generation queue, returns `job_id` + ready/in-progress/unaffordable summary buckets + additive `trace_id`).
si42) current source-page manual generation route is `POST /api/source-pages/:platform/:externalId/videos/unlock`, which returns additive `trace_id` for unlock tracing.
si43) `GET /api/source-pages/:platform/:externalId/videos` now includes unlock metadata per row (`unlock_status`, `unlock_cost`, `unlock_in_progress`, `ready_blueprint_id`).
si44) `GET /api/credits` now returns daily-wallet fields (`balance`, `capacity`, `daily_grant`, `next_reset_at`, `seconds_to_reset`, `plan`) alongside compatibility fields (`remaining`, `limit`, `resetAt`).
si44b) `GET /api/credits` keeps additive compatibility fields (`generation_daily_limit`, `generation_daily_used`, `generation_daily_remaining`, `generation_daily_reset_at`, `generation_daily_bypass`) while old daily-cap UI assumptions are phased out.
si44c) frontend credit refresh is now lazy-by-default: the always-mounted user menu fetches only while open, Search performs one initial read for credit-aware generation UI, and post-action freshness comes from explicit `['ai-credits']` invalidation instead of constant polling.
si45) source-page video-library unlock worker scope is `source_item_unlock_generation` (single generation per source video, shared fan-out to subscribed users).
si46) source-page video-library list rate policy: burst `4/15s` plus sustained `40/10m` per user/IP (reduce accidental 429 on normal tab-switch/load-more while keeping abuse guardrails).
si47) source-page video-library unlock/generate rate policy: burst `8/10s` plus sustained `120/10m` per user/IP (credit balance remains the primary generation throttle).
si48) public/auth endpoint: `GET /api/source-pages/search?q=<query>&limit=<1..25>` (Explore source lookup against app `source_pages`; returns minimal source cards and source-page paths).
si49) unlock reliability sweeps run opportunistically on source-page video list/unlock routes and force-run on service cron trigger path.
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
si64) transcript speech-guidance warning copy is scoped to explicit Source Page Video Library `+Add` requests; Wall/My Feed unlock actions use generic retry-safe messaging.
si65) auth endpoint: `GET /api/notifications?limit=<1..50>&cursor=<opaque?>` returns inbox rows with `unread_count` and `next_cursor`.
si66) auth endpoint: `POST /api/notifications/:id/read` marks one notification read.
si67) auth endpoint: `POST /api/notifications/read-all` marks all unread notifications read.
si68) comment reply notifications are produced by DB trigger on `wall_comments` reply inserts (self-replies ignored; dedupe key is `comment_reply:<reply_comment_id>`).
si69) auth endpoints: `GET /api/notifications/push-subscriptions/config`, `POST /api/notifications/push-subscriptions`, and `DELETE /api/notifications/push-subscriptions` manage installed-PWA browser push opt-in and subscription lifecycle.
si70) installed-PWA push delivery is derived from the existing `notifications` table via a push-dispatch queue; it is not a separate notification product.
si69) generation surfaces are gated by the daily credit wallet (`free=3.00`, `plus=20.00`, reset `00:00 UTC`, no rollover); manual routes queue only the affordable new-item prefix and return launch-safe credit denial/skip copy.
si69a) admin entitlement bypass applies at actual reservation/settle/refund time for both manual generation and shared auto-unlock paths; admin users are not meant to remain `unlockable` solely because displayed wallet balance is depleted.
si69b) canonical feed-lane semantics are defined in `docs/app/mvp-feed-and-channel-model.md`; implementation should treat `For You` as the only locked lane, `Joined` as joined-channel published discovery, and `All` as the global published blueprint stream.
si70) YouTube comment snapshots for blueprints keep bounded background freshness: auto refresh targets `+15m` and `+24h`, while owner-triggered manual refresh is available immediately with per-blueprint cooldown.
si71) manual source-comment refresh endpoint is `POST /api/blueprints/:id/youtube-comments/refresh`; it is owner-only, cooldown denials return `COMMENTS_REFRESH_COOLDOWN_ACTIVE`, and queue backpressure returns `COMMENTS_REFRESH_QUEUE_GUARDED`.

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
k6) Paused strategy reference: `docs/exec-plans/active/on-pause/bleuv1-mvp-hardening-playbook.md`
k7) YT2BP contract: `docs/product-specs/yt2bp_v0_contract.md`
