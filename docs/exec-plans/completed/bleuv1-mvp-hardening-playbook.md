# bleuV1 MVP Hardening Playbook

Status: `on-pause`

## Goal
Convert the current feature-complete MVP into a stable, clear, and scalable product surface by hardening UX trust, runtime reliability, and engineering foundations.

## Canonical Launch Checklist
a0) [have] Canonical launch-readiness and phased fix process is maintained in `docs/ops/mvp-launch-readiness-checklist.md`.
a00) [have] Use this playbook for strategic priority framing and use the ops checklist for execution evidence/status tracking.
a000) [have] Later cleanup/scalability follow-ups have since been reclassified; use `docs/exec-plans/index.md` for the current active plan.
a0000) [have] Current runtime/deploy truth does not live here; use `docs/architecture.md` and `docs/ops/yt2bp_runbook.md` for the live Oracle contract.

## Current State Snapshot
a1) [have] Core source-first loop is live: source subscriptions -> unlock/generate -> blueprint -> channel/home visibility.
a2) [have] Source Pages, Source Video Library, shared unlock, daily credit wallets, onboarding, and Explore source search are implemented.
a3) [have] Canonical docs and active plan registry are in good shape and checks are passing.
a4) [have] Primary architecture risk remains concentrated in a few large files, but recent cleanup has already extracted the runtime bootstrap plus the main `Subscriptions` and `Wall` page orchestrators into dedicated controller modules/hooks.
a4j) [have] Home/feed product semantics are now locked in `docs/app/mvp-feed-and-channel-model.md`: `For You` is source-driven and may contain locked items, `Joined` is the joined-channel published discovery lane, and `All` is the global published-blueprint lane.
a4b) [have] Launch gate execution board is active at `docs/ops/mvp-launch-readiness-checklist.md` (P0/P1 with owner/date/status/evidence).
a4c) [have] Launch hardening now includes explicit credit-backend fail-safe semantics (`CREDITS_UNAVAILABLE`), shared error-copy mapping, and baseline legal routes (`/terms`, `/privacy`).
a4d) [have] Runtime hotfix applied: source-page search no longer crashes backend when opportunistic asset-sweep wiring is present in route deps.
a4e) [have] Shared auto-unlock schema is now applied on the linked Supabase project (`qgqqavaogicecvhopgan`, migration watermark `20260306113000`).
a4f) [have] Queue admission now uses weighted work-item limits in addition to row depth, and ops queue health reports both row counts and work-item backlog.
a4g) [have] Credit refresh is now lazy by default: the header user menu fetches credits only while open, and Search relies on one-shot reads plus explicit invalidation after billable actions.
a4h) [have] Oracle runtime hardening now also depends on lazy backend OpenAI loading; startup-critical modules should not use top-level `openai` ESM imports.
a4h) [have] Backend maintainability pass extracted shared generation preflight helpers and expanded regression coverage around source-page policy, shared auto billing, and quota degraded paths.
a4i) [have] Admin entitlement bypass now applies to concrete credit reservation and shared auto-unlock funding, preventing auto rows from remaining `unlockable` solely due to zero wallet balance.
a4k) [have] Oracle MVP production runtime is now intentionally single-service combined mode (`agentic-backend.service` with HTTP + background work together); dedicated split worker topology is deferred beyond the current MVP load target.
a4l) [have] Oracle backend config source is now conceptually locked to `/etc/agentic-backend.env`; repo-root `.env` is local-only fallback for non-systemd runs and `.env.production` is no longer part of backend bootstrap.
a4m) [have] Shared transcript proxy runtime for opted-in providers is now locked to one explicit Webshare endpoint; legacy selector/list modes are removed from active runtime and docs/tests should not reintroduce them.
a4n) [have] `youtube_timedtext` is now the current default transcript path; `videotranscriber_temp` is the built-in second fallback and `transcriptapi` is the built-in third fallback when YouTube captions are unavailable, while the temporary provider remains intentionally excluded from production runtime truth.
a4n1) [have] `videotranscriber_temp` now does one bounded local key/session renew attempt on early service failures before the outer provider fallback continues; this keeps the recovery local to the adapter instead of widening pipeline retry logic.
a4o) [have] Supabase schema history still contains the older `transcript_requests` Oracle/Paperspace bridge tables; treat that as historical parity only, not as current MVP transcript-runtime truth.
a4p) [have] Known-channel video-library routes now use the low-cost uploads-playlist path (`channels.list -> playlistItems.list`) instead of `search.list`; broad YouTube discovery remains the quota-heavy area to constrain.
a4q) [have] Queue helper tightening now treats explicit `scope`/`scopes` filters as first-class so refresh guards, queue admission, and queue-health reads do not silently fall back to whole-queue scans.
a4q) [have] Current runtime video behavior on `/search` is now bounded single-video lookup (`URL/id first, helper-backed title fallback second`) rather than broad paginated discovery.
a4s) [have] Current runtime creator lookup is now also bounded: exact channel URL / handle / channel id first, bare handles work without requiring `@`, helper-backed name lookup stays second, and only a tiny candidate set is returned instead of broad paginated channel discovery.
a4r) [have] Source Page `Video Library` is now loaded on explicit user request instead of auto-fetching on page open, which reduces background YouTube API usage on normal source-page reads.
a4t) [have] Active Supabase egress-reduction work now skips unchanged successful subscription sync writes (`user_source_subscriptions`) unless checkpoint/title/error state changes, while repeated identical error writes remain bounded by a `30m` backend heartbeat and `all_active_subscriptions` enqueue is gated through the Oracle cadence window (`ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS`, default `60m`); treat that as current runtime truth even though detailed proof/next steps live in the active egress plan.
a4u) [have] Card/list teaser copy is now expected to come from stored `blueprints.preview_summary`, keeping Wall/Explore/Channel/Search previews summary-like without list-surface `sections_json` loads; legacy `My Feed` compatibility support remains additive only.
a4v) [have] User-scoped ingestion status routes are now part of the egress-hardening baseline: `latest-mine` avoids redundant double reads and `active-mine` narrows queue-position scans to requested/visible scopes.
a4v) [have] YouTube refresh bookkeeping now avoids per-candidate pending-job reads and skips redundant manual refresh-state registration when an enabled row already exists.
a4w) [have] Current runtime YouTube refresh bookkeeping also skips unchanged source-item `view_count` metadata writes and no-op refresh-state upserts when persisted fields would remain identical.
a4x) [have] Low-priority idle queue claim polling now backs off more aggressively than the default worker idle cadence, reducing `claim_ingestion_jobs` chatter without changing lease ownership semantics.
a4x) [have] Queue maintenance is now less chatty by default: worker lease heartbeats use a lease-aware cadence (`30s` on the default `90s` lease) instead of the older `10s` default.
a4xb) [have] Queue lease writes are now trimmed further for fast maintenance scopes: retry/enrichment jobs defer their first heartbeat to `45s` on the default `90s` lease, so short-lived control-plane work often finishes without any lease-touch write at all.
a4xbc) [have] Current runtime now also keeps Oracle job-activity mirrors warm from the queued worker’s known rows: claimed jobs upsert immediately, failure transitions reuse the in-hand `attempts` count, and lease-heartbeat refreshes update Oracle locally instead of forcing another Supabase reread for queue-health/job-status mirrors.
a4xbd) [have] Current runtime now also centralizes the remaining ingestion status/sweep fallbacks on those Oracle-aware helpers: user job detail/status routes no longer keep inline Supabase fallback branches, and orphan unlock-job recovery now fails running jobs through the same mirror-aware path instead of direct sweep-local updates.
a4xa) [have] Current follow-up backend egress trimming also keeps `/api/ingestion/jobs/trigger` skinny on suppressed runs: the route no longer force-runs unlock sweeps, source-page asset sweeps, or transcript revalidate seeding before enqueue eligibility is known, and manual refresh no longer depends on persisted `refresh_video_attempts` cooldown rows.
a4xb) [have] Medium-impact queue egress tuning now also time-gates worker maintenance (`15m` default), caps each `all_active_subscriptions` pass to the stalest `75` rows first, and further softens passive `latest-mine` restore churn by shrinking the recent-row read and relaxing the shared source-unlock tracker cadence.
a4xc) [have] Current runtime groundwork now also includes an Oracle control-plane subscription-scheduler path (`ORACLE_CONTROL_PLANE_*`) that can initialize local SQLite scheduler state, bootstrap active YouTube subscriptions, persist shadow scheduler decisions, and in `primary` own `all_active_subscriptions` enqueue admission, cadence timing, external-trigger ownership, and batch selection, while Supabase remains the durable queue truth in MVP.
a4xd) [have] Current runtime now also lets Oracle `primary` drain a larger due batch per run through `ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT` (current default `150`), shifting the next subscription-freshness bottleneck away from the old fixed `75`-row hybrid cap without moving durable queue truth off Supabase.
a4xe) [have] Current runtime now also allows bounded multi-batch drain inside one Oracle-primary `all_active_subscriptions` job through `ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN` (current default `2`), improving backlog clearance without introducing extra concurrent scope jobs or changing the durable queue contract.
a4xf) [have] Current runtime now also supports Oracle-local queue/claim cooldown governance behind `ORACLE_QUEUE_*` envs, so repeated empty claim attempts can back off by priority tier on Oracle without moving durable queue rows, claim truth, lease truth, or retries off Supabase.
a4xg) [have] Current runtime now also supports Oracle-local queued-worker sweep ownership behind `ORACLE_QUEUE_SWEEP_*` envs, so Oracle can choose which priority tiers are due, what batch size each tier uses, and when the worker should wake for the next due sweep, while Supabase still performs durable claim RPCs and stores queue truth.
a4xh) [have] Current runtime now also supports Oracle-local queue-admission mirror state behind `ORACLE_QUEUE_ADMISSION_*` envs, so hot admission/preflight/backpressure reads can reuse Oracle-local active queue counts instead of re-reading those same queue-depth snapshots from Supabase on every request, while Supabase still remains authoritative for durable queued/running rows, claims, leases, and retries.
a4xi) [have] Current runtime now also supports Oracle-local job-activity mirror state behind `ORACLE_JOB_ACTIVITY_*` envs, so stale-running recovery, manual-refresh duplicate guards, and user-scoped `latest-mine` / `active-mine` reads can reuse Oracle-local job activity first while Supabase still remains the durable queue ledger.
a4xj) [have] Current runtime now also uses that Oracle-local job-activity mirror for retry/refresh pending-job dedupe, unlock-reliability job lookups, and ops/latest ingestion-status reads, while Supabase still remains the durable queue ledger and write path.
a4xk) [have] Current runtime now also uses that Oracle-local job-activity mirror for active `all_active_subscriptions` duplicate guards, owner-scoped `GET /api/ingestion/jobs/:id`, and Oracle-backed queue-position reads for `GET /api/ingestion/jobs/active-mine`, while Supabase still remains the durable queue ledger and write path.
a4xl) [have] Current runtime now also updates that Oracle-local job-activity mirror directly from enqueue/claim/terminal/stale lifecycle transitions when the durable `ingestion_jobs` row is already in hand, trimming another Supabase read-after-write refresh without moving durable queue ownership off Supabase.
a4xm) [have] Current runtime now also routes the remaining user-triggered ingestion writes through centralized Oracle-aware enqueue/finalize helpers, so manual refresh, source-page unlock generation, search generation, and foreground subscription sync no longer keep inline `ingestion_jobs` insert/update branches in handler code.
a4xn) [have] Current runtime now also routes service/debug ingestion control through that same centralized Oracle-aware lifecycle path, so `/api/ingestion/jobs/trigger` and debug subscription simulation no longer keep their own direct `ingestion_jobs` write branches in the ops handler.
a4xo) [have] Current runtime now also centralizes service ops ingestion reads and Blueprint refresh pending-job dedupe on Oracle-first helpers, so latest-job / queue-health / refresh pending checks no longer depend on handler/service-local Supabase fallback logic in the normal runtime path.
a4xp) [have] Current runtime now also centralizes the queue-ledger bridge one layer deeper in `ingestionQueue`: claim, fail, and lease-touch transitions expose Oracle-aware hooks so worker/controller paths can keep mirror updates aligned from known durable rows without re-scattering that bridge logic across runtime callers.
a4xq) [have] Current runtime now also introduces staged Oracle queue-ledger ownership behind `ORACLE_QUEUE_LEDGER_MODE=supabase|dual|primary`, so Oracle can bootstrap/shadow a local durable queue ledger before the live `primary` claim/lease/fail/finalize cutover removes Supabase from the worker-control path.
a4xr) [have] Queue depth/work-item/status reads can now also resolve from that Oracle queue ledger first, so queue-health snapshots, active-job checks, queued ordering, and several latest-job reads no longer need to prefer Supabase in the hot control path.
a4xs) [have] Oracle queue-admission and job-activity mirrors can now also rebuild from that Oracle queue ledger first, so Oracle-local mirror refresh/bootstrap paths stop depending on Supabase once queue-ledger `primary` is live.
a4xt) [have] Once queue-ledger `primary` is live, the normal hot-path queue/job reads can now prefer that Oracle queue ledger directly, reducing Oracle queue-admission and job-activity mirrors to fallback/bootstrap compatibility state instead of the main runtime source.
a4xta) [have] Current runtime now also stages Oracle durable subscription truth behind `ORACLE_SUBSCRIPTION_LEDGER_MODE=supabase|dual|primary`, so `user_source_subscriptions` can bootstrap into a local Oracle ledger, dual-write in `dual`, and become the Oracle-first subscribe/reactivate/unsubscribe/checkpoint/error source in `primary` while Supabase remains the compatibility shadow.
a4xtb) [have] Current runtime now also stages Oracle durable unlock truth behind `ORACLE_UNLOCK_LEDGER_MODE=supabase|dual|primary`, so `source_item_unlocks` can bootstrap into a local Oracle ledger, dual-write in `dual`, and become the Oracle-first unlock reservation/processing/ready/transcript-retry source in `primary` while Supabase remains the compatibility shadow and wallet/generation truth stays there.
a4xtc) [have] Unlock-ledger `dual` rollout now also has a dedicated parity audit (`npm run ops:oracle-unlock-parity -- --json`) plus paginated Supabase bootstrap/sync so Oracle can verify full `source_item_unlocks` coverage before the `primary` flip.
a4xtd) [have] Once unlock-ledger `primary` is live, unlock-specific truth reads and mutation preconditions should use that Oracle durable ledger directly; the older Oracle product unlock mirror remains only compatibility/read-plane support for broader product surfaces.
a4xte) [have] Current runtime now also stages Oracle durable feed truth behind `ORACLE_FEED_LEDGER_MODE=supabase|dual|primary`, so `user_feed_items` can bootstrap into a local Oracle ledger, dual-write in `dual`, and in `primary` let wall/profile/public feed reads plus shared feed mutation paths prefer that Oracle-backed feed row store while Supabase remains the compatibility shadow.
a4xtea) [have] Current runtime now also supports Oracle durable source-item truth behind `ORACLE_SOURCE_ITEM_LEDGER_MODE=supabase|dual|primary`, so `source_items` can bootstrap into a local Oracle ledger, dual-write in `dual`, and in `primary` let source-item upserts, metadata/view-count updates, execution-path source reads, and Oracle-first wall/profile/source-page source-row reads prefer that Oracle-backed source-item store while Supabase remains the compatibility shadow. If the Oracle-first source-item path regresses, live runtime should fall back to `supabase` until the fixed build is redeployed.
a4xteb) [have] Source-page video-library consistency now also requires the read path to overlay queued/running `source_item_blueprint_variants` state, so `GET /videos` mirrors the `POST /videos/unlock` `in_progress` classification immediately instead of briefly showing the same item as `available`.
a4xu) [have] Current runtime now also stages Oracle product-state mirroring behind `ORACLE_PRODUCT_MIRROR_*`, so active subscriptions, recent source items, source-item unlock rows, and recent feed rows can be mirrored into local SQLite for Oracle-first source-page access, blueprint-cooldown decisions, unlock-status checks, and wall/profile feed-history reads when the mirror is sufficiently complete; hot subscription/feed/unlock mutations now also refresh that mirror from known rows or targeted reloads, while Supabase still remains the authoritative product ledger and fallback path.
a4xv) [have] Current runtime now also hardens YouTube subscription feed fetches on the Oracle-cron path: transient feed `5xx/network` failures retry inside one sync, stale `404` channel ids can recover from stored channel URLs, Oracle scheduler backoff now distinguishes transient feed failure from persistent not-found, and `all_active_subscriptions` no longer marks the whole batch failed unless hard failures remain or every attempted creator soft-fails.
a4y) [have] Durable generation trace writes are now slimmer by default: event sequencing reuses a per-run cursor and trace writes skip returned row payloads when the caller does not consume them.
a4ya) [have] Queue-backed source-video generation now also records variant `active_job_id`, reclaims stale queued/running source-item variants after a bounded timeout only when `active_job_id` is missing, resumes same-job unlock preflight instead of treating owned variants as generic `in_progress`, and persists terminal `generation_runs` status outside the best-effort trace-event wrapper so completed work does not remain stuck as `running`.
a4z) [have] Frontend TanStack Query tuning is now in a dedicated active plan; global defaults plus live/semi-live/static-ish overrides are being made explicit so non-live list/detail surfaces stop relying on focus-triggered default refetch churn.
a4za) [have] Current YT2BP one-step prompt default is `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v5.md`, keeping the same `blueprint_sections_v1` runtime shape while writing `Caveats` into the existing `open_questions` field, shifting `Takeaways` toward lighter plain-English skim value, and requiring more substantial `Storyline` paragraphs/slides.
a4zb) [have] Current `llm_native` retry policy now keeps regeneration for blocking structure/shape misses; `TAKEAWAYS_TOO_LONG` remains visible in telemetry, while the old `OPEN_QUESTIONS_NOT_QUESTIONS` soft check was removed for the new Caveats semantics.
a5) [have] Legacy `My Feed` compatibility flow now has an additive backend-shaped auth read path (`GET /api/my-feed`) that collapses browser-side multi-table hydration into one payload while preserving rollback-safe fallback to the earlier client-side stitching path.
a6) [todo] Improve user trust around shared-cost auto billing transitions and async processing visibility.
a7) [todo] Reduce terminology ambiguity between personal stream, followed channels, source pages, and channel taxonomy.

## MVP Priorities

### P0 - Trust and Clarity (user-facing)
b1) [todo] Add one shared card-state legend (`Locked`, `Unlocking`, `Ready`) reused on Home, Source Page, and any remaining legacy `My Feed` compatibility flow.
b2) [todo] Add lightweight recent-activity panel for generation jobs (queued/running/succeeded/failed).
b3) [todo] Improve credit transparency in UI: latest debit event, refill pace, and next refill timer.
b4) [todo] Add first-unlock guided milestone in onboarding so users see a complete success loop quickly.
b5) [todo] Add plain-language tooltip for shared unlock economics and why costs vary.

### P1 - Reliability and Operations
c1) [have] Integrity sweeps now recover stale unlock reservations/processing rows and orphan running unlock jobs with idempotent refund/fail transitions.
c2) [have] Unlock pipeline now emits correlation `trace_id` from request -> queue/job -> item success/failure -> terminal logs.
c3) [todo] Normalize unlock failure reasons to stable user-facing messages and stable internal reason codes.
c4) [have] Added focused backend integration tests for hold/settle/refund idempotency and concurrent unlock reserve semantics.
c5) [todo] Add explicit smoke playbook for mobile OAuth callback edge cases and unlock transitions.
c6) [have] Notifications MVP foundation is live (`comment_reply`, `generation_succeeded`, `generation_failed`) with header bell inbox and read/read-all controls.
c6a) [have] Unlock-generation terminal failures now also surface through the same `generation_failed` notification path from real failed item counts, instead of suppressing retryable transcript/provider misses from `Recent Results`.

### P2 - Maintainability and Scale-readiness
d1) [todo] Split `server/index.ts` into route modules (`source pages`, `subscriptions`, `unlock/credits`, `ingestion jobs`).
d2) [todo] Continue page orchestration cleanup from the new controller-hook baseline, with `BlueprintDetail` and `SourcePage` still the main remaining frontend hotspots.
d3) [todo] Incrementally tighten TypeScript strictness for touched modules.
d4) [todo] Add CI PR gate for `test`, `build`, and docs checks before merge.
d5) [todo] Add runtime health dashboard script for unlock throughput, failure rates, and queue latency.

## Blind Spots To Fix
e1) [todo] Async unlock feedback can still feel uncertain if job visibility is delayed or too hidden.
e2) [todo] Credits can appear "stuck" if debit/refill updates are not immediate and explicit.
e3) [todo] Scope language on Home (`For You` vs `Joined`) can still be misread without concise helper copy.
e4) [todo] Source/channel naming overlap can confuse non-technical users without consistent glossary phrasing.
e5) [todo] Legacy copy traces (`inventory/libraries`) should be removed from high-traffic screens to avoid identity drift.

## Execution Sequence (4 Sprint Track)
f1) [todo] Sprint 1: UX trust pass (`legend`, `job tray`, `credit detail`, `first-unlock onboarding cue`).
f2) [todo] Sprint 2: Reliability pass (`idempotency tests`, `stale sweeps`, `error-code/message normalization`, `correlation IDs`).
f3) [todo] Sprint 3: Refactor pass (`server route modularization`, `page-level hook extraction`, `strict TS increments`).
f4) [todo] Sprint 4: Growth stability pass (`funnel instrumentation`, `activation tuning`, `retention baseline review`).

## Success Metrics
g1) [todo] Activation: `% of new users who complete first unlock within 24h`.
g2) [todo] Reliability: `unlock success rate`, `median unlock-to-ready time`, `refund ratio`.
g3) [todo] Economics: `average credits spent per active user`, `cost-per-unlock distribution`, `shared unlock reuse rate`.
g4) [todo] UX clarity: `% repeated unlock clicks within 30s for same item` (confusion proxy).
g5) [todo] Retention: `D1` and `D7` by cohort (`imported subscriptions` vs `skipped onboarding`).

## Manual Inspection Checklist
h1) [todo] Unlock from Source Page shows immediate state transition and terminal result without page refresh.
h2) [todo] Unlock from Home `For You` mirrors Source Page behavior and card parity.
h3) [todo] Credit display updates immediately after reserve/settle/refund events.
h4) [todo] OAuth connect/import callback on mobile returns user to intended flow reliably.
h5) [todo] New users can understand first action without internal jargon.
h6) [todo] `For You` and `Your channels` behavior matches their labels.
h7) [todo] Source search in Explore returns valid Source Pages and routes correctly.

## Decision Log (Lock)
i1) [have] Keep source-first identity and shared unlock economics.
i2) [have] Keep credits as primary throttle with soft anti-abuse request limits.
i3) [have] Keep Source Pages platform-agnostic for future adapters.
i4) [have] Prioritize feed usage over adding large new discovery surfaces in current MVP phase.
i5) [have] Optimize trust/reliability before expansion features.

## Validation Commands
j1) [todo] `npm run test`
j2) [todo] `npm run build`
j3) [todo] `npm run docs:refresh-check -- --json`
j4) [todo] `npm run docs:link-check`

## Snapshot Note (2026-03-05)
k1) [have] YouTube comments refresh moved to bootstrap+manual model:
- auto `+15m`
- auto `+24h`
- owner-triggered manual endpoint is available immediately with per-blueprint cooldown
k2) [have] Manual generation billing now uses reserve -> settle/release semantics against the daily credit wallet, and shared-cost auto billing is active for funded auto-enabled subscribers.
k3) [have] Queue realism hardening is in place: weighted queue-work-item limits gate interactive multi-item jobs and `GET /api/ops/queue/health` now reports work-item backlog.
k4) [have] Credit-load hardening is in place: `useAiCredits` no longer polls globally, the always-mounted user menu is lazy-on-open, and post-action wallet freshness is event-driven.
k5) [have] Oracle product-state mirroring now also covers public wall/source-page blueprint reads: recent feed/source rows can be served Oracle-first for public Wall cards and Source Page blueprint scans, while Supabase remains the durable product ledger and fallback path.
