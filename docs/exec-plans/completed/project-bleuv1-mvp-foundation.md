# Project - bleuV1 MVP Build (Manual Iterative)

Status: `on-pause`

Update note 2026-04-02:
- Personal feed consistency now requires reusable ready blueprints to rebind onto the viewer's existing feed row, not only exist globally, so `Generate` and Home stay aligned for search/manual generation.
- Source-page unlock preparation now also treats Oracle-primary mutation wrapper failures as an explicit fallback case: runtime should fall back to the durable Supabase unlock mutation path, resync Oracle shadows from the known row, and only report `in_progress` when real work was queued or already running rather than an impossible still-`available` unlock row; fallback reserve/ensure writes now also normalize legacy `transcript_probe_meta = null` unlock rows back to `{}` so the Supabase shadow update can succeed.
- Short-transcript generation failures (`TRANSCRIPT_INSUFFICIENT_CONTEXT`) now also need product-state follow-through: repeated requeue attempts should cool down through blueprint availability rather than requeueing forever, Home/Profile locked-card readers should suppress those rows during cooldown, and Source Page follow-up reads must not misreport `needs_generation` variants as `processing`.

## Objective
Deliver the remaining `bleuV1` MVP through a manual iterative build loop with clear checkpoints and low ambiguity.

## Execution Scheme Reference
- Primary sequence and progress tracker:
  - `docs/exec-plans/completed/bleuv1-manual-iteration-scheme.md` (historical sequence)
- Current active implementation reference:
  - `docs/exec-plans/index.md`
- Current runtime/deploy truth:
  - `docs/architecture.md`
  - `docs/ops/yt2bp_runbook.md`

## Active Delivery Protocol
1. User proposes a concrete update.
2. Assistant provides implementation plan (scope, touched files, validation).
3. User approves with `PA`.
4. Assistant implements and validates.
5. Assistant reports outcomes and follow-up options.
6. Launch-critical closeout is tracked in `docs/ops/mvp-launch-readiness-checklist.md` (authoritative P0/P1 board).

## Operating Mode
- Active mode: manual iterative execution.
- Paused mode: multi-agent orchestration automation.
- Agentic docs remain as reference contracts only and are not mandatory for each feature iteration.

## Product Defaults (Locked)
1. YouTube-only adapter scope for MVP.
2. Personal-lane default visibility is personal/private until channel promotion; current runtime now surfaces that lane through Home `For You`, with legacy `My Feed` compatibility retained separately.
3. Channel promotion default mode is classifier-driven auto-publish after checks.
4. User value-add is insight/remix on imported blueprints; no standalone free-form post model in MVP core.
5. Non-pass auto-channel outcomes are blocked from channel and retained in the personal lane (Home `For You`; legacy `My Feed` compatibility only where still exercised).
6. Legacy manual gate runtime remains `CHANNEL_GATES_MODE=bypass`; auto-channel path uses `AUTO_CHANNEL_GATE_MODE`.

## Current Workstreams
### W0 - Runtime Baseline
- Supabase target alignment is corrected to `qgqqavaogicecvhopgan`.
- Shared auto-unlock schema migration watermark is now `20260306113000`.
- Oracle MVP runtime has since been simplified to single-service combined mode (`agentic-backend.service` owns HTTP + background work); any split web/worker assumptions in this paused plan are historical reference only.
- Oracle backend config source is `/etc/agentic-backend.env`; repo-root `.env` remains local-only fallback for non-systemd runs and `.env.production` is no longer part of backend bootstrap.
- Shared transcript proxying for opted-in providers now assumes one explicit Webshare endpoint; selector-based direct-proxy-list flows are historical-only and not part of the current MVP baseline.
- Local/default transcript fetch now starts with `youtube_timedtext` behind the existing provider seam and falls through to `videotranscriber_temp`, then `transcriptapi`, when YouTube captions are unavailable; the temporary provider remains outside the MVP production baseline.
- `videotranscriber_temp` now also does one bounded local key/session renew attempt on early service failures before the provider seam falls through further.
- Historical Supabase migration parity now includes the older Oracle/Paperspace `transcript_requests` bridge tables; that schema is legacy reference only and not part of the active MVP transcript runtime.
- Active follow-up egress work now skips unchanged successful subscription sync writes unless checkpoint/title/error state changes, while repeated identical error writes remain bounded by a `30m` backend heartbeat; `all_active_subscriptions` enqueue is also gated through the Oracle cadence window (`ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS`, default `60m`), so repeated identical success/error writes to `user_source_subscriptions` are no longer expected on every cron tick.
- Active follow-up egress work also backs off low-priority idle queue claim polling more aggressively than the default worker idle cadence, reducing `claim_ingestion_jobs` chatter without changing lease ownership semantics.
- Active follow-up egress work now also defers the first lease heartbeat for fast retry/enrichment scopes (`45s` on the default `90s` lease), so many short-lived maintenance jobs finish without any lease-touch write while heavier scopes keep the baseline cadence.
- Active follow-up egress work now also trims trigger-path maintenance: `/api/ingestion/jobs/trigger` no longer force-runs unlock sweeps, source-page asset sweeps, or transcript revalidate seeding on suppressed runs, manual refresh no longer persists failed-video cooldown rows in `refresh_video_attempts`, and unsubscribe flows no longer spend request-path work on subscription-notice cleanup.
- Active follow-up egress work now also uses a medium-impact cadence pass instead of aggressive disablement: combined worker maintenance is time-gated (`15m` default), `all_active_subscriptions` prioritizes the stalest `last_polled_at` rows and originally capped each run to `75` subscriptions, and passive `latest-mine` restore churn is reduced with a tighter recent-row read plus slower shared tracker polling.
- Current runtime now also includes Oracle control-plane subscription-scheduler groundwork behind `ORACLE_CONTROL_PLANE_*` env flags: local SQLite scheduler state can bootstrap active YouTube subscriptions, record shadow scheduler decisions, and in `primary` own `all_active_subscriptions` enqueue admission, cadence timing, external-trigger ownership, and batch selection, while Supabase still owns durable queue truth in the active MVP contract.
- Current runtime follow-up now also lets Oracle `primary` increase due-batch drain breadth through `ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT` (current default `150`) so backlog clearance can improve without changing the durable queue contract.
- Current runtime follow-up now also lets Oracle `primary` drain multiple due batches inside one `all_active_subscriptions` job through `ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN` (current default `2`), keeping the migration fast while preserving the same durable queue ownership split.
- Current runtime follow-up now also lets Oracle-local queue control (`ORACLE_QUEUE_*`) own repeated empty-claim backoff decisions for the queued worker, reducing claim-loop chatter while Supabase still owns durable queue rows, claims, leases, and retries.
- Current runtime follow-up now also lets Oracle-local queue-sweep control (`ORACLE_QUEUE_SWEEP_*`) own queued-worker tier cadence, due-sweep selection, and tier batch sizing, while Supabase still executes the durable claim RPCs and remains the queue ledger.
- Current runtime follow-up now also lets Oracle-local queue-admission mirror state (`ORACLE_QUEUE_ADMISSION_*`) serve hot active queue-count reads for admission/preflight/backpressure guards, while Supabase still remains authoritative for durable queued/running rows, claims, leases, and retries.
- Current runtime follow-up now also lets Oracle-local job-activity mirror state (`ORACLE_JOB_ACTIVITY_*`) serve Oracle-first stale-running recovery, manual-refresh duplicate guards, and user-scoped `latest-mine` / `active-mine` reads, while Supabase still remains authoritative for durable queued/running rows, claims, leases, retries, and user-facing writes.
- Current runtime follow-up now also lets that Oracle-local job-activity mirror serve retry/refresh pending-job dedupe, unlock-reliability job lookups, and ops/latest ingestion-status reads, while Supabase still remains authoritative for durable queued/running rows, claims, leases, retries, and user-facing writes.
- Current runtime follow-up now also lets that Oracle-local job-activity mirror serve active `all_active_subscriptions` duplicate guards, owner-scoped `GET /api/ingestion/jobs/:id`, and Oracle-backed queue-position reads for `GET /api/ingestion/jobs/active-mine`, while Supabase still remains authoritative for durable queued/running rows, claims, leases, retries, and user-facing writes.
- Current runtime follow-up now also writes that Oracle-local job-activity mirror directly from enqueue/claim/terminal/stale lifecycle transitions when the durable `ingestion_jobs` row is already in hand, trimming another Supabase read-after-write loop without changing durable queue ownership.
- Current runtime follow-up now also routes the remaining user-triggered ingestion writes through centralized Oracle-aware enqueue/finalize helpers, so manual refresh, source-page unlock generation, search generation, and foreground subscription sync no longer depend on inline `ingestion_jobs` insert/update branches in handler code.
- Current runtime follow-up now also routes service/debug ingestion control through that same centralized Oracle-aware lifecycle path, so `/api/ingestion/jobs/trigger` and debug subscription simulation no longer depend on handler-local direct `ingestion_jobs` write branches.
- Current runtime follow-up now also centralizes service ops ingestion reads and Blueprint refresh pending-job dedupe on Oracle-first helpers, so latest-job / queue-health / refresh pending checks no longer depend on handler/service-local Supabase fallback logic in the normal runtime path.
- Current runtime follow-up now also centralizes the queue-ledger bridge inside `ingestionQueue`, so claim / fail / lease-touch transitions expose one Oracle-aware hook seam and queued-worker callers no longer need their own bespoke mirror wrappers around those durable queue operations.
- Current runtime follow-up now also supports Oracle durable source-item truth behind `ORACLE_SOURCE_ITEM_LEDGER_MODE=supabase|dual|primary`, so `source_items` can bootstrap into a local Oracle ledger, dual-write in `dual`, and in `primary` let source-item upserts, metadata/view-count updates, execution-path source reads, and Oracle-first wall/profile/source-page source-row reads prefer that Oracle-backed source-item store while Supabase remains the compatibility shadow; if that Oracle-first source path regresses, live runtime should fall back to `supabase` until the fixed build is redeployed.
- Current runtime follow-up now also treats `supabase|dual` source-item read failures as a safe fallback case: Oracle-first source-item lookup errors should degrade to Supabase-backed source rows so wall/source-page/profile flows stay up while source-item parity and live canaries are revalidated.
- Current runtime follow-up now also keeps source-page video-library reads aligned with unlock preflight by overlaying queued/running `source_item_blueprint_variants` state on `GET /videos`, so an item that `POST /videos/unlock` classifies as already in progress does not immediately fall back to `available` on the next read.
- Current runtime follow-up now also requires browser-called Supabase edge functions to echo the active allowed app origin (`https://bleup.app`, `https://www.bleup.app`, local dev, and any intentional preview origin) instead of defaulting browser CORS responses to the older GitHub preview site.
- Current runtime follow-up now also stages Oracle queue-ledger ownership behind `ORACLE_QUEUE_LEDGER_MODE=supabase|dual|primary`, so Oracle can bootstrap and shadow a local durable queue ledger before the live `primary` worker-control cutover moves claim/lease/fail/finalize authority off Supabase.
- Current runtime follow-up now also lets queue depth/work-item/status reads resolve from that Oracle queue ledger first, so queue-health snapshots, active-job checks, queued ordering, and several latest-job reads no longer need to prefer Supabase once the ledger is live.
- Current runtime follow-up now also lets Oracle queue-admission and job-activity mirrors rebuild from that Oracle queue ledger first, so Oracle-local mirror refresh/bootstrap no longer treats Supabase as the normal source once the queue ledger is live.
- Current runtime follow-up now also lets the normal hot-path queue/job reads prefer that Oracle queue ledger directly once queue-ledger `primary` is live, reducing Oracle queue-admission and job-activity mirrors to fallback/bootstrap compatibility state instead of the main runtime source.
- Current runtime follow-up now also stages Oracle durable subscription truth behind `ORACLE_SUBSCRIPTION_LEDGER_MODE=supabase|dual|primary`, so `user_source_subscriptions` can bootstrap into a local Oracle ledger, dual-write in `dual`, and become the Oracle-first subscribe/reactivate/unsubscribe/checkpoint/error source in `primary` while Supabase remains the compatibility shadow.
- Current runtime follow-up now also stages Oracle durable feed truth behind `ORACLE_FEED_LEDGER_MODE=supabase|dual|primary`, so `user_feed_items` can bootstrap into a local Oracle ledger, dual-write in `dual`, and in `primary` let wall/profile/public feed reads plus shared feed mutation paths prefer Oracle-backed feed rows while Supabase remains the compatibility shadow.
- Current runtime follow-up now also stages Oracle product-state mirroring behind `ORACLE_PRODUCT_MIRROR_*`, so active subscriptions, recent source items, source-item unlock rows, and recent feed rows can be mirrored into local SQLite for Oracle-first source-page access, blueprint-cooldown decisions, unlock-status checks, public wall/source-page blueprint reads, and wall/profile feed-history reads when the mirror is sufficiently complete; hot subscription/feed/unlock mutations now also refresh that mirror from known rows or targeted reloads, while Supabase still remains the authoritative product ledger and fallback path.
- Current runtime follow-up now also hardens YouTube subscription feed fetches on the Oracle-cron path: transient feed `5xx/network` failures retry inside one sync, stale `404` channel ids can recover from the stored channel URL, Oracle scheduler state now distinguishes transient feed failures from progressively quieter persistent-not-found revisits (`1x` -> `2x` -> `4x` -> `8x`, capped at `24h`), and `all_active_subscriptions` no longer marks the whole batch failed unless hard failures remain or every attempted creator soft-fails.
- Current runtime follow-up now also preserves readable subscription cron hard-failure text: `last_sync_error`, Oracle outcome messages, and batch terminal `PARTIAL_FAILURE` samples now keep compact `message/code/details/hint` data and emit structured `subscription_sync_hard_failed` logs instead of collapsing to `[object Object]`.
- Current runtime follow-up now also requires fresh durable unlock rows and Oracle-primary/shared unlock row builders to initialize `transcript_status='unknown'`; subscription sync inserts that leave transcript truth null break the shared `source_item_unlocks` contract and stall new locked-feed creation.
- Current YT2BP one-step prompt default is `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v5.md`; the runtime schema is still `blueprint_sections_v1`, with `Caveats` now written into the existing `open_questions` field while `Takeaways` stay lighter plain-English skim value and `Storyline` stays `2-3` substantial paragraphs/slides.
- Current `llm_native` retry policy now reserves regeneration for blocking structure/shape failures; `TAKEAWAYS_TOO_LONG` remains soft quality telemetry, while the old `OPEN_QUESTIONS_NOT_QUESTIONS` check was removed for the new Caveats semantics.
- Current runtime generation reliability also records `active_job_id` on queue-backed source-video variant claims, reclaims stale queued/running variants after a bounded timeout only when `active_job_id` is missing, resumes same-job unlock preflight instead of treating owned variants as generic `in_progress`, and persists terminal `generation_runs` status outside best-effort trace-event writes so completed source-page/library work does not stay stuck as `running`.
- Current runtime notifications also surface terminal unlock-generation failures through the existing `generation_failed` path from actual failed item counts, so retryable transcript/provider misses no longer disappear from `Recent Results`.
- Active frontend follow-up now also moves TanStack Query usage toward explicit freshness policy: global defaults are conservative, live/semi-live hooks declare their own cadence, and static-ish list/detail surfaces avoid focus-triggered default refetch churn.

### W1 - My Feed As First-Class Surface (Historical / Legacy Context)
- Introduce/finish personal unfiltered feed lane behavior.
- Keep `My Feed` as a profile-oriented workspace surface (profile `Feed` tab) instead of a top-nav primary. Current runtime has since moved `/my-feed` to a compatibility redirect and keeps Home `For You` as the active lane.
- Ensure channel fail does not remove personal access.
- Hide legacy no-blueprint pending/skipped rows during migration cleanup.
- Align legacy `My Feed` card presentation to channel-feed style and show read-only auto-channel status labels.
- Normalize legacy `My Feed` blueprint badges to `Blueprint` and align feed tag chips with Home one-row capped rendering (no `#` prefix).
- Show `Posted to <Channel>` only for channel-published items; held/rejected items remain visible as `In My Feed` in the legacy compatibility surface without technical reason copy.
- Ensure full-card banner fill on legacy `My Feed` blueprint cards (no transparent edge gap).
- Harden Search-generated source channel-title persistence + metadata fallback so legacy `My Feed` subtitle rows consistently show channel name.
- Keep imported blueprint detail attribution source-first (show source channel when present, hide default edit CTA in MVP UI).
- Profile privacy default migration: new profiles default to public (`profiles.is_public=true`), existing profiles unchanged.
- Main nav IA is simplified to `Home / Channels / Explore`, with search/create moved to the header `Create` action.
- Home feed semantics are now locked to `For You / Joined / All`:
  - `For You` is source-driven and may contain locked items.
  - `Joined` is a strict filter of published blueprints from Bleu channels the user has joined.
  - `All` is the global published-blueprint aggregation.
- Core high-traffic copy is harmonized to current source-first behavior (`Home`, `Create`, auto-channel publish) and legacy manual-post phrasing is removed.
- Landing cold-user pass adds value-first hero positioning, proof/use-case blocks, and curated fallback content so front-door sections never render empty.
- Frontend bootstrap now guards missing Supabase env with explicit configuration UX instead of a blank page.
- Card/list teaser copy now belongs on stored `blueprints.preview_summary`; Wall/Explore/Channel/Search should treat canonical `sections_json` as detail-view content, while legacy `My Feed` compatibility support remains additive only.
- Legacy `My Feed` read hydration now also has an additive backend-shaped auth path (`GET /api/my-feed`), with the earlier browser-side stitching retained as rollback-safe fallback during aggregation rollout.
- Blueprint YouTube refresh bookkeeping should batch pending-job checks per refresh kind/candidate set and avoid re-registering an already-enabled refresh-state row on manual refresh entry.
- Blueprint YouTube refresh bookkeeping should also avoid no-op persistence: unchanged source-item `view_count` fetches should not rewrite metadata, and refresh-state rows should only upsert when meaningful persisted fields change.
- Queue worker lease heartbeats should stay lease-aware by default, so background maintenance does not keep hammering Supabase lease RPCs more often than the actual lease window requires.
- Queue-worker lifecycle mirrors should also stay known-row driven: claimed jobs, retry/failure transitions, and lease-heartbeat refreshes should update Oracle from the row already in hand instead of forcing a second `ingestion_jobs` read just to warm queue-health/job-status mirrors.
- User-facing ingestion status routes and unlock orphan-job recovery should also stay on those centralized Oracle-aware readers/writers once they exist, instead of keeping route-local or sweep-local `ingestion_jobs` fallback branches.
- Durable generation trace writes should stay lean by default, avoiding per-event `seq` reads and unnecessary returning payloads on write helpers.

### W2 - Channel Candidate Gating
- Run deterministic auto-channel checks for all source paths.
- Preserve quality/safety/channel-fit constraints while keeping legacy manual endpoints as rollback-safe fallback.
- Use deterministic tag+alias classifier for real channel resolution with `general` fallback, and keep channel-fit gate logic aligned with the same mapper.
- Add rollout-ready `llm_labeler_v1` classifier mode (artifact-only sync labeling with retry-once then `general` fallback) without schema churn.

### W3 - YouTube Pull And Caching
- Keep YouTube-first ingestion flow stable.
- Reuse generated artifacts for duplicate pulls when canonical source id matches.
- Keep optional review enhancement as a separate post-generation step to reduce core latency bottlenecks.
- `/youtube` now forces core-first endpoint payload (`generate_review=false`, `generate_banner=false`) and runs optional review attach asynchronously.
- `Save to Home` is non-blocking during optional post-steps; late review can attach to already-saved blueprints, while legacy `My Feed` naming remains compatibility-only.
- Source YouTube blueprints are thumbnail-first for banners (stored thumbnail or deterministic `ytimg` fallback), including old source-linked rows via backfill.
- Backend timeout budget for core endpoint is configurable via `YT2BP_CORE_TIMEOUT_MS` (default `120000`).
- Banner prompt path is hardened for visual-only output so generated backgrounds avoid readable text overlays.
- Async auto-banner queue path is now available for subscription auto-ingest, preserving ingestion speed and applying banners later.

### W4 - Community Value Layer
- Keep insights/remixes tied to imported blueprints.
- Maintain vote/comment utility on shared channel content.

### W5 - Subscription Intake And Sync
- Support YouTube channel subscriptions with auto-only MVP UX.
- First subscribe sets checkpoint only (new-uploads-only, no historical prefill).
- Insert persistent `subscription_notice` item in the personal lane per subscribed channel; current runtime surfaces it on Home `For You`, with legacy `My Feed` compatibility retained separately.
- Add `/subscriptions` page as first-class management surface (Step 1 foundation + Step 2 simplification).
- Step 2 simplified actions on `/subscriptions`: active-list `Unsubscribe` only (sync/reactivate UI deferred).
- Step 3 reliability pass adds `/subscriptions` health summary/badges and delayed-warning trust signals.
- Step 4 discovery pass adds auth-only creator lookup in `/subscriptions` with per-result `Subscribe` (popup flow, direct creator identifiers preferred, bare handles accepted without requiring `@`; current runtime no longer relies on broad official channel search).
- Known-channel video-library listing now uses the low-cost uploads-playlist path (`channels.list -> playlistItems.list`) rather than `search.list`; broad discovery/search remains the quota-heavy surface.
- Search-page video lookup now prefers exact YouTube URL/video-id resolution and uses helper-backed title fallback only for a single confident hit; it is no longer broad video discovery.
- Step 5 row polish adds optional channel avatars and removes technical row badges from subscription rows.
- Step 6 UX simplification removes aggregate ingestion summary card from `/subscriptions` while keeping unsubscribe and row-level signals.
- Step 7 legacy `My Feed` notice polish adds avatar/banner notice rendering and confirm-gated unsubscribe that removes notice cards from the personal lane.
- Step 8 legacy `My Feed` interaction cleanup adds simpler copy, direct `Add Subscription`, card-click blueprint opening, and compact notice-card actions.
- Step 9 legacy `My Feed` status-row refinement adds subscription details popup and footer-driven post-to-channel actions.
- Step 10 async auto-banner policy adds queue processing (`auto_banner_jobs`) and generated-banner cap fallback with deterministic channel defaults.
- Step 11 manual refresh adds `/subscriptions` scan popup + selected async background generation for new subscription videos.
- Step 12 gotcha hardening adds refresh rate caps, manual-job concurrency lock, failed-video cooldown suppression, and lightweight background job status on `/subscriptions`.
- Step 13 refresh hardening follow-up advances manual refresh checkpoints forward, adds reload-safe latest-user-job restore, and surfaces cooldown-filtered counts in scan UI.
- Step 14 polish pass simplifies subscription popup/list copy and moves channel-open affordance to avatar click.
- Step 15 IA refinement adds `Subscriptions` shortcut in user dropdown and owner-only lightweight `Subscriptions` tab in profile workspace.
- Step 16 YouTube onboarding import adds OAuth connect + bulk subscription import on `/subscriptions` with none-selected default and idempotent reactivation behavior.
- Step 17 optional new-account setup adds `/welcome` first-login onboarding entry with skip path, Home reminder card, and import-success completion state.
- Step 18 source-page foundation adds platform-agnostic `source_pages` identity, dual-write linking (`source_page_id`), additive source-page APIs, and minimal `/s/:platform/:externalId` UI routing from subscription surfaces.
- Step 18 follow-up hardening adds lazy source-page asset hydration on read, so legacy backfilled rows load avatar/banner on first open.
- Step 19 source-page feed activation adds public `GET /api/source-pages/:platform/:externalId/blueprints` and replaces `/s/:platform/:externalId` placeholder text with deduped Home-style read-only blueprint cards (`latest + load more`).
- Step 20 historical source-page Video Library note: auth-only creator backlog listing (`GET /videos`) and async selected generation (`POST /videos/generate`) on `/s/:platform/:externalId` were added at that stage; the generate alias is now retired.
- Step 20 follow-up adds two-tab list filters in Video Library (`Full videos` and `Shorts`), with shorts classified as `<=60s`.
- Current runtime note: Source Page `Video Library` now loads on explicit user request instead of auto-fetching on page open.
- Step 20 safety follow-up tunes source-page list limiter policy to burst+sustained guardrails and frontend caching to avoid normal-flow 429 churn.
- Step 21 shared unlock + daily credit wallet adds wallet/ledger economics (`user_credit_wallets`, `credit_ledger`) plus source-video unlock state (`source_item_unlocks`) for one-generation-per-source-item.
- Current runtime note: durable `source_item_unlocks` ownership is now also staged on Oracle behind `ORACLE_UNLOCK_LEDGER_MODE=supabase|dual|primary`, while wallet and credit-ledger truth remain on Supabase.
- Current rollout note: the Oracle `dual` unlock-ledger stage now uses paginated bootstrap plus `npm run ops:oracle-unlock-parity -- --json` to verify that the local ledger fully covers `source_item_unlocks` before promotion to `primary`.
- Current runtime note: once unlock-ledger `primary` is live, unlock-specific truth reads and mutation preconditions should use the Oracle durable ledger directly rather than the older Oracle product unlock mirror, which remains compatibility/read-plane support only.
- Step 21 source-page generation endpoint shifted to `POST /videos/unlock`; the earlier `/videos/generate` compatibility alias mentioned here was later retired, while subscription new uploads moved to `my_feed_unlockable` cards instead of immediate generation.
- Step 21 follow-up removes strict unlock cooldown in favor of soft request caps (`8/10s` burst + `120/10m` sustained) and immediate credit cache refresh after unlock actions.
- Step 22 Home scope split repurposes `/wall` `For You` to subscribed-source mixed stream (locked + unlocked) and adds `Your channels` as the unchanged followed-channel ranked lane.
- Step 23 trust pass adds shared unlock activity cards (Home/Source Page/legacy `My Feed` compatibility), reload-resume unlock tracking, user-menu credit refill/ledger transparency, and a dismissible Home scope helper strip.
- Step 24 backend hardening adds unlock reliability sweeps (expired/stale/orphan recovery), additive unlock `trace_id` response contract, and service-level idempotency/race tests.
- Step 24 scale follow-up shifts unlock/manual/service generation to enqueue-only worker execution with DB claim+lease heartbeat semantics, queue backpressure controls, provider retry/circuit guards, and service queue health endpoint (`GET /api/ops/queue/health`).
- Step 25 subscription auto-unlock v1 adds per-subscription `auto_unlock_enabled` (default `true`) and bounded `source_auto_unlock_retry` attempts; funded-subscriber shared-cost billing is now active through canonical auto intents and participant snapshots.
- Step 25a admin entitlement bypass now applies to concrete wallet reservation and shared auto-unlock funding, not only to displayed credit status.
- Step 26 queue realism hardening adds weighted queue admission (`queue_work_items` limits) and exposes row-count plus work-item backlog through `GET /api/ops/queue/health`.
- Step 27 credit-load hardening makes `useAiCredits` lazy by default, fetches header credits only while the menu is open, and relies on explicit `['ai-credits']` invalidation after billable actions.
- Step 27a backend runtime hardening keeps OpenAI SDK loading lazy so Oracle startup does not depend on top-level `openai` ESM imports.
- Step 28 thumbnail-first banner cutover sets source YouTube banner rendering to thumbnails across Wall/Feed/Explore/Detail/Source Page, backfills old source-linked blueprints, and bypasses source auto-banner enqueue paths.
- Step 29 notifications MVP adds reply + generation-terminal notification events and ships an auth header bell inbox with read/read-all actions.
- Step 30 maintainability pass expands backend regression coverage and extracts shared generation preflight helpers (`server/services/generationPreflight.ts`) for Search/source-page/manual-refresh flows without changing public route contracts.
- Step 30a queue-helper tightening makes scoped queue depth/work-item reads honor explicit `scope`/`scopes` filters so refresh/ops guards stop silently widening to the full ingestion queue.
- Step 31 frontend orchestration cleanup extracts `/subscriptions` and `/wall` page controllers into dedicated hooks, with `Wall` now consuming backend-hydrated feed responses instead of browser-side Supabase join fan-out.
- Added service-ops endpoint `GET /api/ingestion/jobs/latest` for latest ingestion status checks.
- Added user endpoint `GET /api/ingestion/jobs/:id` for owner-scoped manual refresh progress.
- Added user endpoint `GET /api/ingestion/jobs/latest-mine` for owner-scoped latest refresh-job restore after page reload.
- Follow-up hardening keeps that restore path egress-conscious: `latest-mine` now resolves from one recent-row read, and `active-mine` queue-position scans narrow to requested/visible scopes.
- Keep sync/deactivate and pending accept/skip endpoints as compatibility/operator paths.
- Keep debug simulation endpoint env-gated (`ENABLE_DEBUG_ENDPOINTS`) for non-prod ingestion testing.
- Debug simulation auth contract: `x-service-token` only (no user bearer required).
- Handle resolution hardening: parse YouTube `browseId` fallback for handle URLs that omit explicit `channelId` metadata.
- Run scheduler trigger from Oracle (`/api/ingestion/jobs/trigger` with service auth).

### W6 - Search Discovery (YouTube)
- Historical note: the current runtime video flow on `/search` has since narrowed to single-video lookup (`URL/id first, title fallback second`) rather than broad paginated discovery.
- Add auth-only `/search` route for query-based discovery.
- Use header `Create` action (next to profile menu) as the primary entrypoint to `/search`.
- Add backend endpoint `GET /api/youtube-search` (YouTube Data API provider).
- Keep results transient until explicit `Generate Blueprint`.
- Enable per-result one-click `Subscribe Channel` with existing idempotent subscription API.
- Keep direct URL route `/youtube` as fallback and unchanged baseline.
- Explore now supports source-page discovery via app-managed source search:
  - additive endpoint `GET /api/source-pages/search`
  - `Sources` filter + grouped `Sources` results on `/explore`
  - source cards deep-link to `/s/:platform/:externalId`.
- Source unlock stability hardening:
  - transcript-unavailable unlocks are deterministic and non-charging (`TRANSCRIPT_UNAVAILABLE` + retry guidance).
  - auto-unlock retries transcript-missing videos through bounded `source_auto_unlock_retry` jobs.
  - credits/latest-mine polling reads use dedicated limiter buckets to avoid normal unlock UX 429 collisions.
- MVP UI cleanup:
  - profile tabs simplified to `Feed / Comments / Liked` and share icons removed from blueprint list cards.
  - locked source cards use compact credit labels and no longer show `Open source` in feed contexts.
  - profile refresh flow now returns to profile after subscriptions refresh terminal status.
  - user-menu credits no longer poll in the background; Search is the only page-level surface that intentionally does a one-shot credit read outside the menu.
- Subscription sync premiere guard:
  - unreleased YouTube premieres (`upcoming`) are skipped before lock-card creation.
  - runs that skip upcoming premieres hold checkpoint advance for that run to prevent missing post-release ingestion.
- No-transcript permanence guard:
  - transcript truth model requires bounded confirmation retries before setting permanent `NO_TRANSCRIPT_PERMANENT`.
  - historical permanent rows are revalidated in background and reset to retryable when misclassified.
  - confirmed no-speech rows are hidden from unlockable-card surfaces (feed + source video library).
- Silent auto transcript retry follow-up:
  - auto subscription transcript failures now suppress locked feed cards during retry/permanent states.
  - retry scheduling uses deterministic bounded backoff ladder (`5m -> 15m -> 45m` defaults) with max-attempt terminal skip behavior.
  - speech guidance warning copy remains explicit only for Source Page Video Library `+Add`.

## Acceptance Baseline Per Iteration
1. Scope and behavior align with `docs/app/product-spec.md`.
2. Architecture assumptions remain aligned with `docs/architecture.md`.
3. Docs freshness check passes:
- `npm run docs:refresh-check -- --json`
4. Docs link check passes:
- `npm run docs:link-check`
5. Additional validation is run when change risk requires it.

## Launch Hardening Snapshot
- Explicit credit-backend fail-safe path is active for generation-dependent flows (`CREDITS_UNAVAILABLE`, HTTP `503`).
- Launch-critical error copy is centralized via shared frontend mapper for core generation surfaces.
- Legal baseline routes (`/terms`, `/privacy`) are part of runtime IA.
- Source-page search crash fix landed for opportunistic asset-sweep dependency wiring (`/api/source-pages/search` process safety).
- Baseline CI workflow and feed-load drill script are present:
  - `.github/workflows/ci.yml`
  - `scripts/feed_load_drill.mjs`

## Checkpoint Policy (Manual)
- CP1: identity/scope changes (one-line promise, in/out-of-scope shifts).
- CP2: policy/data/auth boundary changes.
- CP3: milestone close where multiple dependent tasks converge.

## Deferred (On Hold)
- `codex exec` orchestration scripts and role runner wrappers.
- CI workflow implementation for evaluator/integrator automation.
- Automated checkpoint enforcement.
- Production gate enforcement (`CHANNEL_GATES_MODE=enforce`).

## Reference Material (Paused Track)
- `docs/_archive/legacy-ass-agentic/README.md`
- `docs/_archive/legacy-ass-agentic/agentic/foundation/`
- `docs/_archive/legacy-ass-agentic/agentic/executable/`

## Completion Criteria For This Plan
1. Remaining MVP work is shipped through manual iterations without identity drift.
2. Core product contract remains stable and understandable in one sentence.
3. Deferred automation work can be resumed later without blocking MVP delivery.

## Snapshot Note (2026-03-05)
1. Comment freshness for YouTube-backed blueprints now uses bounded bootstrap auto-refresh (`+15m`, `+24h`) plus owner-triggered manual refresh with short cooldown/backpressure guards.
2. Manual generation billing now uses reserve -> settle/release semantics with duplicate/no-charge short-circuiting and affordable-prefix queueing for Search/manual refresh.
3. Queue admission now counts real work size (`queue_work_items`) for interactive multi-item jobs instead of relying on job rows alone.
4. Credit refresh is now lazy/on-demand instead of background polling from always-mounted header UI.
