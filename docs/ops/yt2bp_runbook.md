# YT2BP Runbook

## Supabase REST Attribution Check
- Use `npm run ops:supabase-rest-attribution -- --json` when Supabase request/egress cost needs attribution by endpoint family before removing more compatibility/shadow traffic.
- Use `npm run ops:supabase-rest-attribution -- --json --full-range` when you want a slower broader crawl across the whole window; default mode is the latest matching `100` logs because the Supabase management logs API is rate-limited and capped.
- The report pulls official Supabase analytics/logs API data for the last `24h` by default and summarizes:
  - total request mix from `usage.api-counts`
  - top REST paths
  - top normalized REST endpoints
  - actor split (`backend_service_role`, `frontend_authenticated`, etc.)
  - family split (`queue`, `subscriptions`, `unlocks`, `feed`, `source_items`, `generation_state`, ...)
- Current operational interpretation:
  - `backend_service_role` heavy traffic usually means Oracle backend compatibility/shadow/fallback/ops traffic
  - browser-auth/anon traffic usually means direct frontend Supabase usage
  - use the top path list first, then map those tables/RPCs back to repo callers before trimming traffic

## Ready-Duplicate Feed Attach Check
- If a user reports `Generate` says `No new generation queued` or `skipped_existing`, but Home/For You still shows `Unlock available`, inspect whether that user already has a locked `user_feed_items` row for the same `user_id + source_item_id`.
- Expected fixed behavior: search/manual ready handling should upsert that feed row with the discovered `blueprint_id` and published state, so the user wall stops rendering the item as locked.

## Wall Timestamp Check
- If a user reports that a Home `For You` card jumped back to the top after later generation/attach work, inspect whether the feed row was recreated versus upgraded in place.
- Expected current behavior: Home `For You` uses two wall clocks. Locked/unlockable rows keep their original `created_at`, while the first locked -> generated/published promotion stamps `generated_at_on_wall` so the usable blueprint resurfaces once at generation completion time. Later blueprint-side updates should not refresh that generated wall timestamp again.
- Ordering rule: Home `For You` is still one mixed latest-first feed by effective display time. Generated rows use `generated_at_on_wall || created_at`; locked rows use `created_at`. If older generated cards stay above newer locked cards solely because they are generated, treat that as a feed-order regression.

## Short-Transcript Cooldown Check
- If a source-page/wall unlock request really queues but the resulting generation fails with `TRANSCRIPT_INSUFFICIENT_CONTEXT`, verify the transcript is genuinely below the live minimum word count before treating it as a pipeline bug.
- Expected fixed behavior after that failure:
  - repeat unlock attempts should resolve through blueprint-availability cooldown (`VIDEO_BLUEPRINT_UNAVAILABLE`) instead of immediately requeueing
  - Home/Profile locked-card readers should stop showing that item as normal `Unlock available`
  - Source Page follow-up reads should only show `processing` when the linked variant is truly `queued` or `running`, not when variant resolution falls back to `needs_generation`

## Generation-State Dual Parity Check
- If `npm run ops:oracle-generation-state-parity -- --json` fails during `ORACLE_GENERATION_STATE_MODE=dual`, classify the failure before considering rollback.
- Expected non-blocking parity noise:
  - sub-second `*_at` skew between Oracle and Supabase shadow writes
  - normalized empty `quality_issues` represented as `[]` vs prior nullish storage
- Treat as blocking drift:
  - missing variant rows by logical key (`source_item_id + generation_tier`)
  - mismatched variant `status`, `blueprint_id`, `active_job_id`, `last_error_code`
  - mismatched run `status`, `blueprint_id`, `error_code`, or materially different summary payloads

## Doc Role
- Supporting operational runbook only; not a primary MVP planning surface.
- Launch gate status lives in `docs/ops/mvp-launch-readiness-checklist.md`.
- Active proof-only tail lives in `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`; completed implementation sequencing lives in `docs/exec-plans/completed/mvp-readiness-review-followup.md`.
- Post-launch debt lives in `docs/exec-plans/tech-debt-tracker.md`.

## Purpose and ownership
- Service: YouTube to Blueprint (`/api/youtube-to-blueprint`)
- Runtime host: Oracle (`oracle-free`)
- Service unit: `agentic-backend.service`
- Primary owner: app backend maintainers
- Oracle CLI/control-plane access: `docs/ops/oracle-cli-access.md`
- Launch gate source of truth: `docs/ops/mvp-launch-readiness-checklist.md` (P0/P1 owner/date/status/evidence board).
- Runtime import note:
  - backend OpenAI SDK usage is lazy-loaded at call time; avoid reintroducing top-level `import OpenAI from "openai"` in backend startup files because Oracle `tsx` can stall before the HTTP listener binds.

## Current Production Contract
- One backend service: `agentic-backend.service`
- Runtime mode: single-service `combined`
- Keep-alive background work switch: `RUN_INGESTION_WORKER=true`
- Live backend config source: `/etc/agentic-backend.env`
- Current queue cutover posture:
  - `ORACLE_QUEUE_LEDGER_MODE=primary` is expected for the active Oracle-owned queue runtime.
  - normal queue runtime should now be Oracle-only by default.
  - the old Supabase queue compatibility rollback lever has been removed from normal runtime; queue incidents now require fix-forward or an explicit follow-up code rollback.
- Current unlock cutover posture:
  - `ORACLE_UNLOCK_LEDGER_MODE=primary` is expected for the active Oracle-owned unlock runtime.
  - Oracle unlock bootstrap/runtime should no longer rehydrate or normally reread Supabase `source_item_unlocks`.
  - leftover Supabase unlock rows are historical/compatibility residue only and should not be treated as the normal runtime input for unlock status or unlock settlement.
- Current source-item cutover posture:
  - `ORACLE_SOURCE_ITEM_LEDGER_MODE=primary` is expected for the active Oracle-owned source-item runtime.
  - current Pass 1 removes Supabase `source_items` from Oracle restart/bootstrap input.
  - Oracle product/source mirrors should now rebuild recent source rows from `source_item_ledger_state`, not from Supabase `source_items`.
  - current Pass 2 removes normal-runtime Supabase `source_items` writes from Oracle-primary mutation paths.
  - current Pass 3 removes the main normal-runtime Supabase `source_items` reads from Oracle-primary feed/profile/detail source hydration paths.
- Node runtime contract:
  - local repo baseline is Node `20.20.0` from `.nvmrc`
  - Oracle systemd is pinned to `/home/ubuntu/.nvm/versions/node/v20.20.0/bin/node`
  - do not rely on bare `node` in local shells or one-shot Oracle SSH commands unless you have explicitly switched to Node 20
- Release order: deploy backend for one explicit SHA, run smoke checks, then manually publish the frontend for that same SHA
- Frontend PWA contract: normal frontend releases now default to `pwa_runtime_v1=true` and `pwa_install_cta_v1=true` unless explicitly overridden for rollback
- Installed-PWA push remains rollout-gated:
  - frontend flag `pwa_push_v1`
  - backend flag `WEB_PUSH_ENABLED`
  - required backend envs: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`
- Preferred non-store install path: `https://bleup.app` as an installable online-first PWA (same backend/auth model as the browser app)
- `agentic-worker.service` is deferred and should remain disabled in the current MVP production contract
- Local/dev-only transcript fallback:
  - `youtube_timedtext` is the current default behind `TRANSCRIPT_PROVIDER=youtube_timedtext`.
  - `videotranscriber_temp` is the built-in second fallback provider when YouTube captions are unavailable.
  - `transcriptapi` is the built-in third fallback provider in lean text-only mode (`format=text`, `include_timestamp=false`) when `TRANSCRIPTAPI_APIKEY` is configured.
  - it is not part of Oracle runtime truth and should not be enabled in `/etc/agentic-backend.env`.
  - provider-local envs: `VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS`, `VIDEOTRANSCRIBER_TEMP_FORCE_NEW_SESSION`, `TRANSCRIPTAPI_APIKEY`
  - `videotranscriber_temp` now does one bounded local key/session renew attempt on early service failures (`runtime_config`, `url_info`, `start`) before returning the failure to the outer fallback chain.

## bleuV1 source-first integration context
- YT2BP remains the ingestion/generation entrypoint only.
- Home/feed contract now follows the canonical model in `docs/app/mvp-feed-and-channel-model.md`:
  - `For You` is the only source-driven lane and the only lane that may contain locked items.
  - `Joined` is auth-only and shows only published blueprints from Bleu channels the viewer has joined.
  - `All` is the global published-blueprint lane across all Bleu channels.
- Personal-first routing is now expected:
  - generated draft is saved into Home `For You`; backing personal-lane row states still use legacy names (`user_feed_items.state = my_feed_published` for direct/manual paths, `my_feed_unlockable` for new subscription uploads).
  - channel visibility is handled by auto-channel pipeline when enabled.
  - `/youtube` runs core generation first and executes optional AI review asynchronously after core success.
  - `Save to Home` is non-blocking while optional review completes and attaches later.
  - default one-step prompt contract is `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v6.md`; it preserves the same `draft.sectionsJson` shape while making `Takeaways` more plain-English, keeping `Storyline` at `2-3` substantial paragraphs/slides, treating long transcript pruning as normal runtime shaping rather than a caveat trigger, and using the existing `open_questions` field for a more reader-useful `Caveats` section built around balancing nuance instead of repetitive evidence-policing.
  - display/render surfaces now label that final section as `Caveats`, while runtime/storage keys stay `open_questions` and legacy `Open Questions` titles remain accepted as compatibility aliases.
  - `llm_native` quality retries now stay focused on blocking structure/shape misses; `TAKEAWAYS_TOO_LONG` still appears in logs/trace output, but it no longer triggers regeneration on its own.
  - save-time blueprint persistence also writes `blueprints.preview_summary` as the cheap teaser field for Wall/Explore/Channel/Search cards.
  - YouTube-source banners are thumbnail-first (`source_items.thumbnail_url` or deterministic `ytimg` fallback).
  - banner prompts are visual-only by policy (no readable text/typography/logos/watermarks).
- Gate runtime mode:
  - legacy manual candidate flow uses `CHANNEL_GATES_MODE` (`bypass|shadow|enforce`).
  - auto-channel flow uses `AUTO_CHANNEL_GATE_MODE` (`enforce` default recommendation).
- Legacy candidate lifecycle endpoints (same backend service, rollback path):
  - `POST /api/channel-candidates`
  - `GET /api/channel-candidates/:id`
  - `POST /api/channel-candidates/:id/evaluate`
  - `POST /api/channel-candidates/:id/publish`
  - `POST /api/channel-candidates/:id/reject`
- Auto-channel endpoint:
  - `GET /api/my-feed`
  - `POST /api/my-feed/items/:id/auto-publish`
  - current compatibility expectation: `GET /api/my-feed` remains available for legacy flows, but the active user-facing lane is Home `For You` on `/wall`
  - browser-side no-API fallback is now cache-only; it should not reconstruct unlock state from direct Supabase `source_item_unlocks` reads
- Source-page endpoints:
  - `GET /api/source-pages/:platform/:externalId` (public read)
  - `GET /api/source-pages/:platform/:externalId/blueprints` (public source-page feed, deduped by source video, cursor-paginated, includes additive `source_thumbnail_url`)
  - `GET /api/source-pages/:platform/:externalId/videos` (auth source-page video-library list, supports `kind=full|shorts`; UI loads it only on explicit user request)
    - rate policy: burst `4/15s` + sustained `40/10m` per user/IP.
    - follow-up consistency note: this read now also overlays queued/running `source_item_blueprint_variants` state, so an item returned as `in_progress` by `POST /videos/unlock` should immediately come back as `unlock_in_progress=true` / `unlock_status=processing` on the next library refresh.
  - `POST /api/source-pages/:platform/:externalId/videos/unlock` (auth shared unlock + async generation queue for selected source videos)
    - rate policy: burst `8/10s` + sustained `120/10m` per user/IP.
    - additive response field: `data.trace_id` for unlock tracing.
    - failure semantics: if unlock preparation fails before queue insert, the route should return an explicit prepare-failed result instead of reporting `in_progress`; impossible `in_progress` responses with an `available` unlock row are a bug and should be rejected the same way. Oracle-primary unlock mutation errors should fall back to the base Supabase mutation path and then resync Oracle shadows from the known durable row, and that fallback path now normalizes legacy `transcript_probe_meta = null` rows back to `{}` before reserve/ensure updates.
  - `POST /api/source-pages/:platform/:externalId/subscribe` (auth)
  - `DELETE /api/source-pages/:platform/:externalId/subscribe` (auth)
  - `GET /api/source-subscriptions`
    - compatibility/default behavior: returns the full active+inactive subscription array for older callers.
    - paginated behavior: `GET /api/source-subscriptions?limit=<1..50>&offset=<0..>` returns `{ items, next_offset }` for the subscriptions management page load-more flow.
  - Frontend trust status now resumes unlock jobs via `GET /api/ingestion/jobs/latest-mine?scope=source_item_unlock_generation` after reload.
  - Subscription sync persistence is intentionally coarse-grained:
    - unchanged successful writes to `user_source_subscriptions` are skipped unless checkpoint/title/error state changed
    - repeated identical error writes remain bounded by the `30m` poll heartbeat
    - this is an egress-control measure only; frontend subscription health still evaluates on a `60m` window
    - Oracle cron may still hit `/api/ingestion/jobs/trigger` every `3m`, but in the current live rollout Oracle-primary now owns `all_active_subscriptions` cadence with a `5m` override (`ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS=300000`)
    - current live discovery tuning also uses `ORACLE_SUBSCRIPTION_REVISIT_ACTIVE_MS=300000`, so subscriptions with fresh new-item outcomes get rechecked on a tighter `5m` loop while normal/quiet channels stay on the wider revisit windows
    - the same trigger path no longer force-runs unlock sweeps, source-page asset sweeps, or transcript revalidate seeding before enqueue eligibility is known
    - each `all_active_subscriptions` worker run now prioritizes Oracle-local due rows, caps each due batch to `150` subscriptions, and may drain up to `2` batches in one job before yielding
  - Blueprint YouTube refresh bookkeeping is also egress-conscious:
    - scheduler pending checks batch by refresh kind + candidate blueprint set instead of reading queued job payloads once per candidate
    - manual comments refresh reads existing refresh state first and only registers a row when refresh state is missing or uninitialized
    - unchanged `source_items.metadata.view_count` fetches no longer rewrite metadata just to bump a fetch timestamp
    - unchanged `blueprint_youtube_comments` snapshots now skip the delete/reinsert rewrite entirely and emit explicit changed/skipped refresh logs
    - queue-ledger primary compatibility writes now update existing `ingestion_jobs` rows by durable id first and only insert on a real miss, reducing `on_conflict` queue shadow churn
    - no-op `blueprint_youtube_refresh_state` upserts are skipped when the persisted refresh fields would remain unchanged
  - Queue lease maintenance is also coarsened:
    - worker lease heartbeats now refresh at a lease-aware cadence (`30s` on the default `90s` lease) instead of the older `10s` default
    - fast retry/enrichment scopes now defer their first heartbeat to `45s` on that default `90s` lease, so short-lived maintenance jobs often finish without any lease-touch write
    - this is an egress-control change only; lease ownership still uses the same DB RPC and expiry semantics
  - Low-priority queue claim polling is also coarsened:
    - idle low-priority claim sweeps now back off more aggressively than the default worker idle cadence
    - claimed-work reschedules remain fast, and lease-heartbeat behavior is unchanged
  - High-priority manual generation now has an expedite path:
    - fresh `source_item_unlock_generation`, `search_video_generate`, and `manual_refresh_selection` enqueues clear their own Oracle-local high-priority sweep/claim cooldowns before waking the worker
    - if manual generation starts feeling slow again, inspect `queued_ingestion_expedited` and `queued_job_claim_started` logs first to compare queue wait before/after claim
  - Combined-worker maintenance is also coarsened:
    - unlock sweeps and stale-job recovery remain enabled, but the worker only runs that maintenance once per coarse interval (`15m` default) instead of every idle keep-alive cycle
  - Source-video generation claim state is now self-healing:
    - queue-backed `createBlueprintFromVideo(...)` claims record the owning ingestion `jobId` on `source_item_blueprint_variants`
    - stale queued/running variant rows are reclaimed after a bounded timeout only when `active_job_id` is missing
    - unlock-generation preflight now resumes current-job-owned variants instead of treating them as generic `already in progress` skips
    - terminal `generation_runs` status writes now persist outside the best-effort trace-event wrapper so source-page/library jobs do not remain stuck as `running` when event append fails
  - User ingestion-status routes are also narrower:
    - `GET /api/ingestion/jobs/latest-mine` now resolves from one recent-row read instead of separate active/latest queries
    - the route now caps that recent-row read to `2` rows for the requested user/scope
    - `GET /api/ingestion/jobs/active-mine` queue-position scans now narrow to requested or visible queued scopes instead of every queued ingestion scope
    - shared source-unlock trust restore now uses a slower baseline (`5m` poll / `30m` stale window), and Home `For You` no longer forces an extra resume refetch on mount
    - Oracle job-activity mirror now also serves owner-scoped `GET /api/ingestion/jobs/:id`, Oracle-first active `all_active_subscriptions` duplicate guards, and Oracle-backed queue-position reads for `GET /api/ingestion/jobs/active-mine` before Supabase fallback
    - ingestion user-status routes now consume centralized Oracle-first readers end-to-end, so `:id`, `latest-mine`, `active-mine`, and queued-position ordering no longer keep their own inline Supabase fallback branches in the route file
    - service ops reads now follow that same pattern: latest-ingestion-job and queue-health snapshot reads resolve through centralized Oracle-first helpers, with any durable Supabase fallback kept in runtime helpers rather than the ops handler
    - hot enqueue/worker lifecycle transitions now update that Oracle job-activity mirror directly from the inserted/claimed/finalized/recovered `ingestion_jobs` rows in hand, instead of doing a second Supabase read just to refresh mirror state
    - queued-worker lease heartbeats now also refresh the Oracle job-activity mirror from the already-claimed job row, so long-running queue health stays warm locally without another Supabase mirror-read round trip
    - Oracle queue-ledger ownership is now staged behind `ORACLE_QUEUE_LEDGER_MODE=supabase|dual|primary`: `dual` bootstraps and shadows a local durable queue ledger, while `primary` is the live mode where claim/lease/fail/finalize run from that ledger with Supabase kept as compatibility shadow
    - queue depth/work-item/status reads can now also resolve from the Oracle queue ledger first once that mode is live, so queue-health snapshots, active-scope checks, queued ordering, and several latest-job reads no longer need to prefer Supabase in normal runtime
    - Oracle queue-admission and job-activity mirror bootstrap/refresh now also rebuild from that Oracle queue ledger first once it is live, and in `primary` the normal hot-path reads now prefer the queue ledger directly while those mirrors are mainly fallback/bootstrap compatibility state
    - queue claim-to-`running` transitions now also skip the Supabase `ingestion_jobs` compatibility upsert in queue-ledger `primary`; Oracle remains the live worker-state truth and Supabase shadowing resumes on later queued/retry/terminal transitions only
    - Oracle-primary retry requeues may now also stay Oracle-local: when a claimed job is rescheduled back to `queued`, runtime no longer patches Supabase just to mirror the retry-state transition
    - the remaining queue compatibility patches are now also lifecycle-aware: terminal vs retry/claim/lease classes are identified explicitly and any surviving `PATCH /ingestion_jobs` shadow now sends only the fields needed for that class rather than restamping the full queue row
    - queue fallback logging now also covers latest-for-user, active-for-user, refresh-pending dedupe, unlock-job lookup, and retry-dedupe reads, so egress audits can attribute the remaining hidden Supabase queue reads precisely
    - Oracle durable subscription truth is now also staged behind `ORACLE_SUBSCRIPTION_LEDGER_MODE=supabase|dual|primary`: `dual` bootstraps and shadows a local SQLite ledger for `user_source_subscriptions`, while `primary` lets Oracle-backed subscription rows drive subscribe/unsubscribe/checkpoint/error writes and Oracle-first source-page subscription/count/list reads with Supabase kept as compatibility shadow
    - in subscription-ledger `primary`, empty Oracle results for hot subscription lookups are now authoritative and should not trigger a normal-path Supabase reread
    - unchanged compatibility shadow rows now skip no-op `user_source_subscriptions` patch writes when the meaningful persisted fields already match, and normal compatibility updates should hit the durable subscription `id` directly before any user/channel fallback read
    - any remaining Supabase subscription reads in that mode now log `subscription_fallback_read`
    - Oracle-backed subscription helpers now also cover batch hydration by subscription `id` plus active-user fan-out by source page/channel, so due-batch sync selection, manual refresh checkpoint writes, shared blueprint attach, and auto-unlock eligibility should stay on Oracle before any compatibility fallback
    - Oracle durable feed truth is now also staged behind `ORACLE_FEED_LEDGER_MODE=supabase|dual|primary`: `dual` bootstraps and shadows a local SQLite ledger for `user_feed_items`, while `primary` now lets wall/profile/public feed readers and shared feed mutation paths prefer Oracle-backed feed rows with Supabase reduced to migration residue instead of the normal feed write target
    - Oracle durable source-item truth is now also staged behind `ORACLE_SOURCE_ITEM_LEDGER_MODE=supabase|dual|primary`: `dual` bootstraps and shadows a local SQLite ledger for `source_items`, while `primary` lets Oracle-backed source rows drive source-item upserts, metadata/view-count writes, and Oracle-first wall/profile/source-page source reads with Supabase kept as compatibility shadow
    - in source-item-ledger `primary`, empty Oracle results for hot source-item lookups are now authoritative and should not trigger a normal-path Supabase reread
    - unchanged compatibility shadow rows now skip no-op `source_items` writes when the meaningful persisted fields already match, `updated_at`-only source-item churn should stay Oracle-local instead of triggering a Supabase compatibility patch, and normal compatibility writes now update by durable `id` before any canonical-key conflict fallback instead of eagerly rereading Supabase by `id` + `canonical_key`; the shared update/insert seam should reuse the same mapped payload helper on both paths
    - any remaining Supabase source-item reads in that mode should now log `source_item_fallback_read`
    - manual creator lookup now also accepts explicit `mode=handle|creator_name|channel_url_or_id`; handle mode should prefer official YouTube `forHandle` resolution before any HTML fallback when diagnosing lookup misses
    - queue-ledger bridge helpers now wrap claim / fail / lease-touch transitions centrally in `ingestionQueue`, so queued-worker/controller paths share one Oracle-aware seam for mirror updates instead of each call site carrying bespoke bridge logic
    - subscription sync now also favors earlier Home `For You` arrival for newly detected creator uploads: if a reusable ready blueprint already exists for the source item, attach that published row immediately; otherwise insert the unlockable row before slower auto-unlock work finishes so later completion can upgrade the same feed item
    - unlock reliability orphan-job recovery now also uses the same Oracle-aware failure path, so stale running unlock jobs no longer bypass mirror updates when they are forced terminal
    - user-triggered generation/sync handlers now also stay on that centralized Oracle-aware path: manual refresh, source-page unlock generation, search generation, and foreground subscription sync enqueue/finalize through shared helpers rather than inline `ingestion_jobs` writes
    - service/debug control now does the same: `/api/ingestion/jobs/trigger` and debug subscription simulation both enqueue/finalize through the shared Oracle-aware helpers instead of direct handler-local `ingestion_jobs` writes
    - Blueprint YouTube refresh pending-job dedupe now also goes through a centralized Oracle-first helper in runtime, so the refresh service does not own a separate hot-path `ingestion_jobs` fallback query during normal production operation
    - ops trigger scope-latest checks now also route through a centralized runtime helper, so `all_active_subscriptions` suppression logic no longer depends on a handler-local direct `ingestion_jobs` query in the normal path
    - subscription feed fetch failures are now classified/hardened on the Oracle-primary path: transient YouTube feed `5xx/network` errors retry inside the sync before being downgraded to soft per-subscription outcomes, `404` feed failures try stale-channel recovery from the stored channel URL and may fall back once to a creator-title channel lookup when there is one strong canonical winner before backing off to a progressively quieter revisit interval for repeated misses (`1x` -> `2x` -> `4x` -> `8x`, capped at `24h`), and soft per-subscription feed failures no longer poison an otherwise healthy `all_active_subscriptions` batch
    - subscription cron hard failures now also persist readable `last_sync_error` and terminal `PARTIAL_FAILURE` samples (`message`, plus `code/details/hint` when present) and emit structured `subscription_sync_hard_failed` logs; `[object Object]` in these fields should now be treated as a regression
    - fresh `source_item_unlocks` rows and Oracle-primary/shared unlock row builders must now initialize `transcript_status='unknown'`; if subscription cron starts surfacing `23502 ... transcript_status ... violates not-null constraint`, treat that as a live unlock-row initialization regression
  - Durable generation trace writes are also slimmer:
    - generation run/event writes no longer request returned row payloads when callers do not consume them
    - event sequencing now reuses a per-run in-process cursor instead of re-reading the latest `seq` from Supabase before every event insert
  - Legacy generation compatibility endpoints (auth):
    - `GET /api/generation/tier-access`
    - `GET /api/blueprints/:id/variants`
  - Notification inbox endpoints (auth):
    - `GET /api/notifications`
    - `POST /api/notifications/:id/read`
    - `POST /api/notifications/read-all`
    - `GET /api/notifications/push-subscriptions/config`
    - `POST /api/notifications/push-subscriptions`
    - `DELETE /api/notifications/push-subscriptions`
    - emitted event families: `comment_reply`, `generation_succeeded`, `generation_failed`.
    - `generation_started` should now appear once per queued job; if rapid multi-job enqueue only shows one start item while completions appear per job, treat that as a regression.
    - terminal unlock-generation failures now emit `generation_failed` from actual failed item counts, even when transcript/provider retry policy still treats the underlying outage as retryable.
    - rapid manual/search/source-page generation bursts should now log `interactive_queue_refill_requested` and, when capacity exists, `interactive_queue_refill_claimed`; if later burst jobs still wait roughly a full prior job duration before claim, treat that as a refill regression.
  - Search-page video behavior:
    - `/search` video mode is now single-video lookup, not broad paginated discovery.
    - preferred inputs are direct YouTube URL or video id; title lookup is a bounded helper fallback that returns either one confident hit or no hit.
- Profile feed read endpoint:
  - `GET /api/profile/:userId/feed` (optional auth; public profiles readable, private profiles owner-only)
- Subscription auto-unlock policy:
  - `user_source_subscriptions.auto_unlock_enabled` now defaults to `false` for new subscriptions; reactivating an existing row preserves the prior saved value.
  - runtime policy is funded-subscriber shared-cost auto generation: one `1.00` credit event per source video, split across the funded auto-enabled subscriber snapshot for that release.
  - funded subset selection uses deterministic fixed-point recomputation at reservation time; remainder cents go to the lowest stable user ids.
  - admin entitlement users participate as bypass-funded users and should not be excluded solely due to wallet balance.
  - if eligible users fail credit reserve, backend enqueues bounded `source_auto_unlock_retry` jobs so unlock can complete after credit refill.
  - if no eligible/funded users can reserve credits, item remains `my_feed_unlockable` for manual unlock.

## Health checks
- Local service health:
```bash
ssh oracle-free 'curl -sS http://localhost:8787/api/health'
```
- Public health:
```bash
curl -sS https://api.bleup.app/api/health
```
- Latest ingestion job (service auth):
```bash
curl -sS https://api.bleup.app/api/ingestion/jobs/latest \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```
- Queue health snapshot (service auth):
```bash
curl -sS https://api.bleup.app/api/ops/queue/health \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```
- Queue-health fields to inspect first:
  - `queue_depth` / `running_depth`
  - `queue_work_items` / `running_work_items`
  - per-scope `queued` vs `queued_work_items`
  - per-scope `running` vs `running_work_items`
  - queue helper reads now honor explicit `scope`/`scopes` filters; when refresh/ops guards are meant to inspect the queued ingestion scopes, they should not rely on implicit full-queue reads.

### YouTube metadata refresh scheduler (combined runtime)
- Purpose: periodically refresh stored `view_count` and YouTube comment snapshots without calling YouTube from page loads.
- Current runtime note: this scheduler runs from the combined backend service when `RUN_INGESTION_WORKER=true`; it does not require a separate worker service in MVP production.
- Current production override: `YOUTUBE_REFRESH_ENABLED=false`, so the automatic scheduler is disabled on Oracle right now.
- Queue scope: `blueprint_youtube_refresh` (low-priority, budgeted).
- Default cadence when enabled: every `120` minutes.
- Comments policy:
  - auto refresh once at `+60m` after blueprint registration
  - auto refresh once again at `+48h` after blueprint registration
  - owner-triggered manual refresh is available immediately via `POST /api/blueprints/:id/youtube-comments/refresh`
  - manual refresh uses per-blueprint `60m` cooldown, still respects pending-job + queue-depth guards, and now queues both `comments` and `view_count`
- Default per-cycle budget:
  - view refresh jobs: `15`
  - comments refresh jobs: `5`
  - total: `20`
- Queue safety guard: if queue depth is `>= 100`, scheduler skips enqueueing for that cycle.
- Current egress-hardening note: scheduler/manual refresh queue guards now depend on scoped queue-helper reads so the guard checks the intended queued-ingestion scope set instead of a broader whole-queue count.
- Disable quickly:
```bash
# in /etc/agentic-backend.env
YOUTUBE_REFRESH_ENABLED=false
```
- If the migration for `blueprint_youtube_refresh_state` has not been applied yet, scheduler operations no-op safely.
- Source-page search stability note:
  - `/api/source-pages/search` may run opportunistic source-page asset sweep.
  - if this route ever causes process restarts, verify route dependency wiring for `runSourcePageAssetSweep` in source-page route registration.
- Latest auto-banner queue snapshot (service auth):
```bash
curl -sS https://api.bleup.app/api/auto-banner/jobs/latest \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```
- Public YT2BP endpoint basic probe:
```bash
curl -sS -X POST https://api.bleup.app/api/youtube-to-blueprint \
  -H 'Content-Type: application/json' \
  --data '{"video_url":"https://www.youtube.com/watch?v=16hFQZbxZpU","generate_review":false,"generate_banner":false,"source":"youtube_mvp"}'
```

### Experimental Codex rollout (safe sequence)
1. Deploy code with `USE_CODEX_FOR_GENERATION=false`.
2. Set Codex envs (`CODEX_*`) on Oracle and restart service.
3. Verify Codex is reachable on host:
```bash
ssh oracle-free 'codex --version'
```
4. Enable `USE_CODEX_FOR_GENERATION=true`, restart service, then run YT2BP smoke.
5. Watch logs for:
   - `codex_generation_attempt` (`codex_success` vs `codex_fallback_openai`)
   - `codex_generation_circuit_open`
6. Roll back instantly by setting `USE_CODEX_FOR_GENERATION=false` and restarting.

- Notification inbox probe (auth):
```bash
curl -sS "https://api.bleup.app/api/notifications?limit=5" \
  -H "Authorization: Bearer $USER_TOKEN"
```

## Service lifecycle
- Status:
```bash
ssh oracle-free 'sudo systemctl status --no-pager agentic-backend.service'
```
- Restart:
```bash
ssh oracle-free 'sudo systemctl restart agentic-backend.service'
```
- Tail logs:
```bash
ssh oracle-free 'sudo journalctl -u agentic-backend.service -n 200 --no-pager'
```
- Canonical runtime config:
```bash
ssh oracle-free 'sudo ls -l /etc/agentic-backend.env'
```
- Runtime source-of-truth rule:
  - live backend app config comes from `/etc/agentic-backend.env`
  - repo-root `.env` / `.env.production` are local/dev-only and must not be used for Oracle production boot
  - the only expected remaining backend systemd drop-in is the Node path helper
- Current service topology rule:
  - `agentic-backend.service` is the only production backend service
  - `agentic-worker.service` should remain disabled in the MVP runtime
  - `agentic-backend.service` is already pinned to Node `20.20.0` through explicit `ExecStart` and PATH drop-in; keep that invariant

## Release contract (backend first)
- Release rule:
  - push code to `main`
  - capture one explicit `release_sha`
  - deploy Oracle backend to that SHA first
  - run backend smoke checks
  - publish the frontend for that same `release_sha`
  - verify parity with backend `HEAD` and frontend `/release.json`
- Capture the release SHA locally:
```bash
export RELEASE_SHA="$(git rev-parse HEAD)"
```
- Backend deploy to the expected SHA:
```bash
ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git fetch origin main && git checkout main && git pull --ff-only origin main && test \"\$(git rev-parse HEAD)\" = \"$RELEASE_SHA\" && sudo systemctl restart agentic-backend.service"
```
- Backend smoke on Oracle:
```bash
ssh oracle-free 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.20.0 >/dev/null; set -a; . /etc/agentic-backend.env; set +a; cd /home/ubuntu/remix-of-stackwise-advisor && npm run smoke:release -- --api-base-url http://127.0.0.1:8787 --service-token "$INGESTION_SERVICE_TOKEN"'
```
- Frontend publish:
  - GitHub -> `Actions` -> `Deploy Frontend Release`
  - choose branch `main`
  - set `release_sha=$RELEASE_SHA`
  - default workflow values already publish with `pwa_runtime_v1=true` and `pwa_install_cta_v1=true`
  - only override those flags when doing an emergency rollback-style publish
  - run the workflow manually
- Public parity check after the frontend publish finishes:
```bash
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://bleup.app --release-sha "$RELEASE_SHA"
```
- Frontend parity proof endpoint:
```bash
curl -sS https://bleup.app/release.json
```

## PWA Release Validation Bundle
- Automated release smoke is now expected to prove all of these in one command:
  - API health
  - public preview auth-guard
  - frontend `release.json` parity
  - `manifest.webmanifest`, `sw.js`, and `offline.html` all return `200`
  - the published `sw.js` contains the current runtime markers (`bleup-nav-v1`, `SKIP_WAITING`)
  - no `release.json` precache entry appears in the published service worker artifact
- Canonical production smoke:
```bash
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://bleup.app --release-sha "$RELEASE_SHA"
```
- Emergency rollback-style smoke (for a manual publish with PWA runtime intentionally disabled):
```bash
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://bleup.app --release-sha "$RELEASE_SHA" --expect-pwa-runtime false
```
- Required manual release evidence before treating the PWA rollout as fully closed:
  1. Android Chrome install CTA + native install prompt + standalone launch
  2. installed update-prompt validation after a newer frontend publish
  3. final CTA validation across intended mobile browser surfaces

## Environment checklist
Required runtime variables:
- `OPENAI_API_KEY`
- `YOUTUBE_DATA_API_KEY` (required for channel discovery/search and other official YouTube Data API reads; direct `/api/youtube-search` video lookup now uses helper providers first)
- Known-channel video-library routes (`/api/youtube/channels/:channelId/videos`, `/api/source-pages/:platform/:externalId/videos`) now use the low-cost uploads-playlist path (`channels.list -> playlistItems.list`) rather than `search.list`; broad keyword and channel discovery remain the main quota-heavy surfaces.
- `GOOGLE_OAUTH_CLIENT_ID` (required for `/api/youtube/connection*`)
- `GOOGLE_OAUTH_CLIENT_SECRET` (required for `/api/youtube/connection*`)
- `YOUTUBE_OAUTH_REDIRECT_URI` (must match Google OAuth client redirect URI exactly)
- `YOUTUBE_OAUTH_SCOPES` (default `https://www.googleapis.com/auth/youtube.readonly`)
- `TOKEN_ENCRYPTION_KEY` (base64 32-byte key for encrypted OAuth tokens at rest)
- `YOUTUBE_IMPORT_MAX_CHANNELS` (default `2000`)
- `YOUTUBE_OAUTH_STATE_TTL_SECONDS` (default `600`)
- `TRANSCRIPT_PROVIDER` (current default `youtube_timedtext`; built-in fallback chain `videotranscriber_temp` then `transcriptapi` when available)
- Webshare proxying is shared transport config for opted-in transcript providers (currently local/dev `videotranscriber_temp`) and remains explicit-endpoint-only when enabled (`WEBSHARE_PROXY_URL` or split host/port/username/password); selector/list envs are no longer part of the active runtime contract.
- `VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS` (local/dev-only timeout override for `videotranscriber_temp`; default `180000`)
- `VIDEOTRANSCRIBER_TEMP_FORCE_NEW_SESSION` (local/dev-only anonymous-session rotation toggle)
- `YT2BP_ENABLED`
- `YT2BP_QUALITY_ENABLED`
- `YT2BP_CONTENT_SAFETY_ENABLED`
- `YT2BP_ANON_LIMIT_PER_MIN`
- `YT2BP_AUTH_LIMIT_PER_MIN`
- `YT2BP_IP_LIMIT_PER_HOUR`
- `YT2BP_CORE_TIMEOUT_MS` (default `120000`)
- `YT2BP_TRANSCRIPT_PRUNE_ENABLED` (default `true`)
- `YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS` (default `5000`)
- `YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS` (default `5000,9000,16000`)
- `YT2BP_TRANSCRIPT_PRUNE_WINDOWS` (default `1,4,6,8`)
- `GENERATION_DURATION_CAP_ENABLED` (default `false`; enable max video length guard)
- `GENERATION_MAX_VIDEO_SECONDS` (default `2700`)
- `GENERATION_BLOCK_UNKNOWN_DURATION` (default `true`)
- `GENERATION_DURATION_LOOKUP_TIMEOUT_MS` (default `8000`)
- `CHANNEL_GATES_MODE` (`bypass` | `shadow` | `enforce`)
- `AUTO_CHANNEL_PIPELINE_ENABLED` (`true|false`)
- `AUTO_CHANNEL_DEFAULT_SLUG` (default `general`)
- `AUTO_CHANNEL_CLASSIFIER_MODE` (`deterministic_v1|llm_labeler_v1|general_placeholder`)
- `AUTO_CHANNEL_FALLBACK_SLUG` (default `general`)
- `AUTO_CHANNEL_GATE_MODE` (`bypass|shadow|enforce`)
- `AUTO_CHANNEL_LEGACY_MANUAL_FLOW_ENABLED` (`true` default)
- `SUPABASE_SERVICE_ROLE_KEY` (required for cron ingestion trigger path)
- `INGESTION_SERVICE_TOKEN` (shared secret for `/api/ingestion/jobs/trigger`)
- `ENABLE_DEBUG_ENDPOINTS` (`false` by default; must be `true` to enable debug simulation endpoint)
- `INGESTION_MAX_PER_SUBSCRIPTION` (default `5`)
- `REFRESH_SCAN_COOLDOWN_MS` (default `30000`)
- `REFRESH_GENERATE_COOLDOWN_MS` (default `120000`)
- `REFRESH_GENERATE_MAX_ITEMS` (default `10`)
- `REFRESH_FAILURE_COOLDOWN_HOURS` (default `6`)
- `INGESTION_STALE_RUNNING_MS` (default `1800000`)
- `SUBSCRIPTION_AUTO_BANNER_MODE` (`off|async|sync`, compatibility/non-source paths)
- `SUBSCRIPTION_AUTO_BANNER_CAP` (default `1000`)
- `SUBSCRIPTION_AUTO_BANNER_MAX_ATTEMPTS` (default `3`)
- `SUBSCRIPTION_AUTO_BANNER_TIMEOUT_MS` (default `12000`)
- `SUBSCRIPTION_AUTO_BANNER_BATCH_SIZE` (default `20`)
- `SUBSCRIPTION_AUTO_BANNER_CONCURRENCY` (default `1`)
- `AUTO_BANNER_STALE_RUNNING_MS` (default `1200000`)
- `CREDIT_WALLET_CAPACITY` (default `10`)
- `CREDIT_WALLET_INITIAL_BALANCE` (default `10`)
- `CREDIT_REFILL_SECONDS_PER_CREDIT` (default `360`)
- `SOURCE_UNLOCK_RESERVATION_SECONDS` (default `300`)
- `SOURCE_UNLOCK_GENERATE_MAX_ITEMS` (default `100`)
- `SOURCE_AUTO_UNLOCK_RETRY_DELAY_SECONDS` (default `90`)
- `SOURCE_AUTO_UNLOCK_RETRY_MAX_ATTEMPTS` (default `3`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_SECONDS` (default `300`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT1_SECONDS` (default `300`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT2_SECONDS` (default `900`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT3_SECONDS` (default `2700`)
- `SOURCE_TRANSCRIPT_MAX_ATTEMPTS` (default `3`)
- `TRANSCRIPT_FAIL_FAST_ENABLED` (default `true`; terminal transcript provider errors do not enter retry loops)
- `SOURCE_UNLOCK_TRANSCRIPT_COOLDOWN_HOURS` (deprecated; explicit retry-after controls cooldown)
- `SOURCE_UNLOCK_EXPIRED_SWEEP_BATCH` (default `100`)
- `SOURCE_UNLOCK_SWEEPS_ENABLED` (default `true`)
- `SOURCE_UNLOCK_SWEEP_BATCH` (default `100`)
- `SOURCE_UNLOCK_PROCESSING_STALE_MS` (default `600000`)
- `SOURCE_UNLOCK_SWEEP_MIN_INTERVAL_MS` (default `300000`)
- `SOURCE_UNLOCK_SWEEP_DRY_LOGS` (default `true`)
- `SOURCE_VIDEO_UNLOCK_BURST_WINDOW_MS` (default `10000`)
- `SOURCE_VIDEO_UNLOCK_BURST_MAX` (default `8`)
- `SOURCE_VIDEO_UNLOCK_SUSTAINED_WINDOW_MS` (default `600000`)
- `SOURCE_VIDEO_UNLOCK_SUSTAINED_MAX` (default `120`)
- `CREDITS_READ_WINDOW_MS` (default `60000`)
- `CREDITS_READ_MAX_PER_WINDOW` (default `180`)
- `CREDIT_WALLET_FREE_DAILY_GRANT` (default `3.00`; daily grant for free users at `00:00 UTC`)
- `CREDIT_WALLET_PLUS_DAILY_GRANT` (default `20.00`; daily grant for plus users at `00:00 UTC`)
- `CREDIT_WALLET_ADMIN_DAILY_GRANT` (default `20.00`; admin grant/bypass baseline)
- `CREDIT_WALLET_INITIAL_BALANCE` (default follows free daily grant for new rows)
- `AI_CREDITS_BYPASS` (default `false`; if true, credit-dependent routes fail open for billing but still return wallet-shaped responses)
- `INGESTION_LATEST_MINE_WINDOW_MS` (default `60000`)
- `INGESTION_LATEST_MINE_MAX_PER_WINDOW` (default `180`)
- `UNLOCK_INTAKE_ENABLED` (default `true`, fast pause for new unlock intake)
- `RUN_HTTP_SERVER` (default `true`; enable HTTP server in the current process)
- `RUN_INGESTION_WORKER` (default `true`; enable queued ingestion worker in the current process)
- `ORACLE_CONTROL_PLANE_ENABLED` (default `false`; enables local Oracle control-plane bootstrap/state)
- `ORACLE_SUBSCRIPTION_SCHEDULER_MODE` (default `supabase`; accepted values: `supabase`, `shadow`, `primary`)
- `ORACLE_CONTROL_PLANE_SQLITE_PATH` (default `.runtime/control-plane.sqlite`; local SQLite path for Oracle control-plane state)
- `ORACLE_SUBSCRIPTION_BOOTSTRAP_BATCH` (default `250`; active YouTube subscriptions fetched per bootstrap page)
- `ORACLE_SUBSCRIPTION_SCHEDULER_TICK_MS` (default `60000`; cadence reference for Oracle-local scheduler state and fallback retry windows)
- `ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS` (default `300000`; Oracle-primary per-scope cadence window for `all_active_subscriptions` enqueue, independent of the legacy Supabase latest-job gate)
- `ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT` (default `150`; Oracle-primary due-batch cap for each `all_active_subscriptions` run)
- `ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN` (default `2`; Oracle-primary cap on how many due batches one `all_active_subscriptions` job may drain before yielding)
- `ORACLE_SUBSCRIPTION_SHADOW_BATCH_LIMIT` (default `75`; max local due-subscription sample evaluated per shadow decision)
- `ORACLE_SUBSCRIPTION_SHADOW_LOOKAHEAD_MS` (default `60000`; lookahead window for considering subscriptions due in shadow mode)
- `ORACLE_SUBSCRIPTION_REVISIT_ACTIVE_MS` (default `300000`; next-due interval after Oracle sees newly inserted subscription content)
- `ORACLE_SUBSCRIPTION_REVISIT_NORMAL_MS` (default `1800000`; normal next-due interval after a no-new-items check)
- `ORACLE_SUBSCRIPTION_REVISIT_QUIET_MS` (default `5400000`; quieter next-due interval after repeated no-op checks)
- `ORACLE_SUBSCRIPTION_RETRY_ERROR_MS` (default `900000`; next-due retry interval after subscription sync failure)
- `ORACLE_QUEUE_CONTROL_ENABLED` (default `false`; enables Oracle-local claim/backoff control for the queued worker while Supabase still stores durable queue truth)
- `ORACLE_QUEUE_LEDGER_MODE` (default `supabase`; accepted values: `supabase`, `dual`, `primary`; stages local Oracle durable queue-ledger ownership for claim/lease/fail/finalize while Supabase remains compatibility shadow until later cutover)
- `ORACLE_QUEUE_LEDGER_BOOTSTRAP_LIMIT` (default `1000`; number of recent durable `ingestion_jobs` rows loaded into the local Oracle queue ledger during bootstrap)
- `ORACLE_SUBSCRIPTION_LEDGER_MODE` (default `supabase`; accepted values: `supabase`, `dual`, `primary`; stages local Oracle durable `user_source_subscriptions` ownership so subscribe/unsubscribe/checkpoint/error writes and Oracle-first subscription reads can move onto local SQLite while Supabase remains compatibility shadow)
- In `ORACLE_SUBSCRIPTION_LEDGER_MODE=primary`, sync/checkpoint/error-only subscription patches may now stay Oracle-local when only `last_polled_at`, `last_seen_*`, or `last_sync_error` changed; Supabase compatibility writes should still appear for identity/activation changes and explicit fallback/user-facing compatibility paths.
- `ORACLE_SUBSCRIPTION_LEDGER_BOOTSTRAP_LIMIT` (default `10000`; number of recent `user_source_subscriptions` rows loaded into the local Oracle subscription ledger during bootstrap)
- `ORACLE_UNLOCK_LEDGER_MODE` (default `supabase`; accepted values: `supabase`, `dual`, `primary`; stages local Oracle durable `source_item_unlocks` ownership so unlock reservation/processing/ready/transcript-retry writes and Oracle-first unlock reads can move onto local SQLite while Supabase remains compatibility shadow)
- `ORACLE_UNLOCK_LEDGER_BOOTSTRAP_LIMIT` (default `10000`; used for pre-primary parity/bootstrap flows; once `ORACLE_UNLOCK_LEDGER_MODE=primary` is live, Oracle unlock bootstrap should not repopulate from Supabase `source_item_unlocks`)
- Oracle-only unlock runtime note: once `ORACLE_UNLOCK_LEDGER_MODE=primary` is live, normal unlock reservation/processing/fail/ready mutations, stale-hold scans, transcript suppression/revalidate seed reads, and server-side legacy `GET /api/my-feed` unlock hydration should stay on Oracle-owned unlock state; Oracle-primary misses should not silently reread Supabase `source_item_unlocks`.
- Oracle-only queue compatibility note: once queue runtime is Oracle-only, Supabase `source_item_unlocks` compatibility rows must leave queue `job_id` null; the real unlock job ownership remains on Oracle unlock/product state because Supabase `source_item_unlocks.job_id` still foreign-keys to Supabase `ingestion_jobs`.
- `ORACLE_FEED_LEDGER_MODE` (default `supabase`; accepted values: `supabase`, `dual`, `primary`; stages local Oracle durable `user_feed_items` ownership so feed insert/update/delete transitions and Oracle-first wall/profile/public feed reads plus shared feed-state mutations can move onto local SQLite while Supabase remains compatibility shadow)
- `ORACLE_FEED_LEDGER_BOOTSTRAP_LIMIT` (default `10000`; legacy pre-primary bootstrap limit for durable `user_feed_items`; once `ORACLE_FEED_LEDGER_MODE=primary` is live, Oracle feed bootstrap should not repopulate from Supabase `user_feed_items`)
- Oracle-only feed read note: once `ORACLE_FEED_LEDGER_MODE=primary` is live, normal wall/public/my-feed/product feed reads should stay on Oracle feed ledger + Oracle product-feed mirror state; ordinary feed misses should not silently reread Supabase `user_feed_items`, and browser-side existing-feed-item checks should prefer the backend-shaped `/api/my-feed` payload first.
- `ORACLE_SOURCE_ITEM_LEDGER_MODE` (default `supabase`; accepted values: `supabase`, `dual`, `primary`; stages local Oracle durable `source_items` ownership so source-item upserts, metadata/view-count updates, execution-path source lookups, and Oracle-first wall/profile/source-page source-row reads can move onto local SQLite while Supabase remains compatibility shadow; if Oracle-first source-item reads regress, set this back to `supabase` before redeploying a fix)
- `ORACLE_SOURCE_ITEM_LEDGER_BOOTSTRAP_LIMIT` (default `10000`; number of recent durable `source_items` rows loaded into the local Oracle source-item ledger during bootstrap)
- `ORACLE_GENERATION_STATE_MODE` (default `supabase`; accepted values: `supabase`, `dual`, `primary`; stages local Oracle durable execution-state ownership for `source_item_blueprint_variants` and `generation_runs`, so variant claim/ready/failed state plus generation run summaries can move onto local SQLite while Supabase remains compatibility shadow)
- `ORACLE_GENERATION_STATE_BOOTSTRAP_LIMIT` (default `10000`; number of recent durable `source_item_blueprint_variants` and `generation_runs` rows loaded into the local Oracle generation-state ledger during bootstrap)
- In `primary`, normal source-item by-id and by-video reads should resolve from the Oracle source-item ledger first; the older product-source-item mirror is compatibility/bootstrap state, not the steady-state source-item reader.
- In `primary`, normal variant ownership/ready-state checks and generation-run summary reads should resolve from Oracle generation state first; `generation_run_events` remain on Supabase for now.
- Source-page follow-up trust note: if `POST /api/source-pages/:platform/:externalId/videos/unlock` returns `in_progress`, the next `GET /videos` should now reflect that same running variant state even before `source_item_unlocks` changes.
- Once `ORACLE_UNLOCK_LEDGER_MODE=primary` is live, unlock-specific truth reads and unlock mutation preconditions should come from the Oracle unlock ledger directly; the older Oracle product unlock mirror is compatibility/read-plane support only.
- `ORACLE_QUEUE_SWEEP_CONTROL_ENABLED` (default `false`; enables Oracle-local sweep cadence/tier selection for the queued worker while Supabase still performs durable claim RPCs)
- `ORACLE_QUEUE_ADMISSION_MIRROR_ENABLED` (default `false`; enables Oracle-local mirrored active queue counts; once `ORACLE_QUEUE_LEDGER_MODE=primary`, normal admission reads prefer the Oracle queue ledger directly and this mirror becomes fallback/bootstrap compatibility state)
- `ORACLE_QUEUE_ADMISSION_REFRESH_STALE_MS` (default `15000`; maximum tolerated age for Oracle-local mirrored queue-admission counts before the backend refreshes them from Supabase)
- `ORACLE_JOB_ACTIVITY_MIRROR_ENABLED` (default `false`; enables Oracle-local mirrored ingestion job activity for stale-running recovery, manual-refresh duplicate guards, retry/refresh pending-job dedupe, unlock-reliability job lookups, and user/ops latest-job reads; once `ORACLE_QUEUE_LEDGER_MODE=primary`, normal reads prefer the Oracle queue ledger and this mirror becomes fallback/bootstrap compatibility state instead of the main hot-path store)
- `ORACLE_JOB_ACTIVITY_BOOTSTRAP_LIMIT` (default `1000`; number of recent durable ingestion jobs loaded into the local Oracle job-activity mirror during bootstrap)
- `ORACLE_PRODUCT_MIRROR_ENABLED` (default `false`; enables Oracle-local mirrored product-state rows for subscriptions, source items, Oracle-owned unlock rows, and recent feed rows so source-page access, blueprint-cooldown, unlock-status/trust checks, public wall/source-page blueprint feeds, and wall/profile feed-history reads can prefer Oracle-local reads when the mirror is sufficiently complete, with Supabase fallback underneath)
- `ORACLE_PRODUCT_BOOTSTRAP_LIMIT` (default `2000`; number of recent `source_items` rows loaded from Supabase into the Oracle product mirror during bootstrap, while active subscriptions are merged in full, unlock rows rebuild from the Oracle unlock ledger, and feed rows rebuild from the Oracle feed ledger)
- `ORACLE_QUEUE_SWEEP_HIGH_INTERVAL_MS` (default `5000`; Oracle-local due interval for high-priority queue sweeps)
- `ORACLE_QUEUE_SWEEP_MEDIUM_INTERVAL_MS` (default `15000`; Oracle-local due interval for medium-priority queue sweeps)
- `ORACLE_QUEUE_SWEEP_LOW_INTERVAL_MS` (default `60000`; Oracle-local due interval for low-priority queue sweeps)
- `ORACLE_QUEUE_SWEEP_HIGH_BATCH` (default `8`; Oracle-local high-priority queued-worker batch size)
- `ORACLE_QUEUE_SWEEP_MEDIUM_BATCH` (default `3`; Oracle-local medium-priority queued-worker batch size)
- `ORACLE_QUEUE_SWEEP_LOW_BATCH` (default `1`; Oracle-local low-priority queued-worker batch size)
- `ORACLE_QUEUE_SWEEP_MAX_SWEEPS_PER_RUN` (default `3`; Oracle-local cap on due tier sweeps the worker may run before yielding)
- `ORACLE_QUEUE_EMPTY_BACKOFF_MIN_MS` (default `15000`; minimum Oracle-local cooldown after an empty claim attempt)
- `ORACLE_QUEUE_EMPTY_BACKOFF_MAX_MS` (default `180000`; maximum Oracle-local cooldown after repeated empty claim attempts)
- `ORACLE_QUEUE_MEDIUM_PRIORITY_BACKOFF_MULTIPLIER` (default `2`; multiplier applied to empty-claim cooldown for medium-priority queue tiers)
- `ORACLE_QUEUE_LOW_PRIORITY_BACKOFF_MULTIPLIER` (default `4`; multiplier applied to empty-claim cooldown for low-priority queue tiers)
- `YOUTUBE_REFRESH_ENABLED` (default `true`; enables low-priority YouTube metadata refresh scheduler on worker)
- `YOUTUBE_REFRESH_INTERVAL_MINUTES` (default `60`)
- `YOUTUBE_REFRESH_QUEUE_DEPTH_GUARD` (default `100`; scheduler skips enqueueing when queue depth is high)
- `YOUTUBE_REFRESH_VIEW_MAX_PER_CYCLE` (default `15`)
- `YOUTUBE_REFRESH_COMMENTS_MAX_PER_CYCLE` (default `5`)
- `YOUTUBE_REFRESH_VIEW_INTERVAL_HOURS` (default `12`)
- `YOUTUBE_COMMENTS_AUTO_FIRST_DELAY_MINUTES` (default `15`)
- `YOUTUBE_COMMENTS_AUTO_SECOND_DELAY_HOURS` (default `24`)
- `YOUTUBE_COMMENTS_MANUAL_COOLDOWN_HOURS` (default `24`)
- `YOUTUBE_SEARCH_CACHE_ENABLED` (default `true`; enables cache-first behavior for `/api/youtube-search` and `/api/youtube-channel-search`)
- `YOUTUBE_SEARCH_CACHE_TTL_SECONDS` (default `600`; fresh TTL for video search cache)
- `YOUTUBE_CHANNEL_SEARCH_CACHE_TTL_SECONDS` (default `900`; fresh TTL for channel search cache)
- `YOUTUBE_SEARCH_STALE_MAX_SECONDS` (default `86400`; max stale age served during degrade mode)
- `YOUTUBE_SEARCH_DEGRADE_ENABLED` (default `true`; enables stale-first fallback when global quota is constrained)
- `YOUTUBE_GLOBAL_LIVE_CALLS_PER_MIN` (default `60`; shared live YouTube call budget per minute)
- `YOUTUBE_GLOBAL_LIVE_CALLS_PER_DAY` (default `20000`; shared live YouTube call budget per UTC day)
- `YOUTUBE_GLOBAL_COOLDOWN_SECONDS` (default `600`; cooldown window after provider quota pressure)
- `QUEUE_DEPTH_HARD_LIMIT` (default `1000`)
- `QUEUE_DEPTH_PER_USER_LIMIT` (default `50`)
- `QUEUE_PRIORITY_ENABLED` (default `true`; worker claims high/medium/low scopes in priority order)
- `QUEUE_SWEEP_HIGH_BATCH` (default `10`)
- `QUEUE_SWEEP_MEDIUM_BATCH` (default `5`)
- `QUEUE_SWEEP_LOW_BATCH` (default `2`)
- `QUEUE_LOW_PRIORITY_SUPPRESSION_DEPTH` (default `100`; suppresses enqueue for low-priority scopes when queue depth is elevated)
- `WORKER_CONCURRENCY` (default `2`)
- `WORKER_BATCH_SIZE` (default `10`)
- `WORKER_LEASE_MS` (default `90000`)
- `WORKER_HEARTBEAT_MS` (default `10000`)
- `JOB_EXECUTION_TIMEOUT_MS` (default `180000`)
- `TRANSCRIPT_MAX_ATTEMPTS` (default `2`)
- `TRANSCRIPT_TIMEOUT_MS` (default `25000`)
- `INTERACTIVE_TRANSCRIPT_MAX_ATTEMPTS` (default `1`; cap interactive transcript retries below background)
- `INTERACTIVE_TRANSCRIPT_TIMEOUT_MS` (default `15000`; cap interactive transcript timeout below background)
- `TRANSCRIPT_THROTTLE_ENABLED` (default `false`, transcript single-lane governor)
- `TRANSCRIPT_THROTTLE_TIERS_MS` (default `3000,10000,30000,60000`)
- `TRANSCRIPT_THROTTLE_JITTER_MS` (default `500`)
- `TRANSCRIPT_THROTTLE_INTERACTIVE_MAX_WAIT_MS` (default `2000`)
- `GENERATION_TIER_TEST_MODE_ENABLED` (default `false`)
- `GENERATION_TIER_TIER_USER_IDS` (csv user ids that can request `tier`)
- `GENERATION_TIER_FREE_USER_IDS` (legacy compatibility only; runtime generation no longer branches on free vs tier quality)
- `GENERATION_TIER_FREE_MODEL` (legacy compatibility only; runtime uses the canonical tier profile)
- `GENERATION_TIER_FREE_FALLBACK_MODEL` (legacy compatibility only)
- `GENERATION_TIER_FREE_REASONING_EFFORT` (legacy compatibility only)
- `GENERATION_TIER_TIER_MODEL` (default `gpt-5.2`; canonical generation model profile)
- `GENERATION_TIER_TIER_FALLBACK_MODEL` (default follows `OPENAI_GENERATION_FALLBACK_MODEL`)
- `GENERATION_TIER_TIER_REASONING_EFFORT` (default `low`)
- `USE_CODEX_FOR_GENERATION` (default `false`; experimental Codex-first generation path for YT2BP stages)
- `CODEX_EXEC_PATH` (default `codex`)
- `CODEX_EXEC_TIMEOUT_MS` (default `90000`)
- `CODEX_EXEC_LANE_CONCURRENCY` (forced to `1` in MVP)
- `CODEX_EXEC_REASONING_EFFORT` (default `low`)
- `CODEX_EXEC_REASONING_EFFORT_FREE` (optional; defaults to `CODEX_EXEC_REASONING_EFFORT`)
- `CODEX_EXEC_REASONING_EFFORT_TIER` (optional; defaults to `CODEX_EXEC_REASONING_EFFORT`)
- `CODEX_FREE_MODEL` (default `gpt-5-mini`)
- `CODEX_TIER_MODEL` (default `gpt-5.2`)
- `CODEX_FALLBACK_ENABLED` (default `true`; immediate API fallback on Codex errors)
- `CODEX_CIRCUIT_FAILURE_THRESHOLD` (default `5`)
- `CODEX_CIRCUIT_COOLDOWN_MS` (default `300000`)
- `LLM_MAX_ATTEMPTS` (default `2`)
- `LLM_TIMEOUT_MS` (default `60000`)
- `INTERACTIVE_LLM_MAX_ATTEMPTS` (default `1`; cap interactive LLM retries below background)
- `INTERACTIVE_LLM_TIMEOUT_MS` (default `45000`; cap interactive LLM timeout below background)
- `INTERACTIVE_YT2BP_QUALITY_MAX_RETRIES` (default `0`; cap interactive post-processing quality reruns)
- `INTERACTIVE_YT2BP_CONTENT_SAFETY_MAX_RETRIES` (default `0`; cap interactive content-safety reruns)
- `PROVIDER_CIRCUIT_FAILURE_THRESHOLD` (default `5`)
- `PROVIDER_CIRCUIT_COOLDOWN_SECONDS` (default `60`)
- `PROVIDER_FAIL_FAST_MODE` (default `false`)

Safe defaults:
- `YT2BP_ENABLED=true`
- `YT2BP_QUALITY_ENABLED=true`
- `YT2BP_CONTENT_SAFETY_ENABLED=true`
- current local/dev transcript default:
  - `TRANSCRIPT_PROVIDER=youtube_timedtext`
  - `VIDEOTRANSCRIBER_TEMP_TIMEOUT_MS=180000`
  - `VIDEOTRANSCRIBER_TEMP_FORCE_NEW_SESSION=false`
- `YT2BP_ANON_LIMIT_PER_MIN=6`
- `YT2BP_AUTH_LIMIT_PER_MIN=20`
- `YT2BP_IP_LIMIT_PER_HOUR=30`
- `YT2BP_CORE_TIMEOUT_MS=120000`
- `YT2BP_TRANSCRIPT_PRUNE_ENABLED=true`
- `YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS=5000`
- `YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS=5000,9000,16000`
- `YT2BP_TRANSCRIPT_PRUNE_WINDOWS=1,4,6,8`
- `GENERATION_DURATION_CAP_ENABLED=false`
- `GENERATION_MAX_VIDEO_SECONDS=2700`
- `GENERATION_BLOCK_UNKNOWN_DURATION=true`
- `GENERATION_DURATION_LOOKUP_TIMEOUT_MS=8000`
- `CHANNEL_GATES_MODE=bypass`
- `AUTO_CHANNEL_PIPELINE_ENABLED=false`
- `AUTO_CHANNEL_DEFAULT_SLUG=general`
- `AUTO_CHANNEL_CLASSIFIER_MODE=deterministic_v1`
- `AUTO_CHANNEL_FALLBACK_SLUG=general`
- `AUTO_CHANNEL_GATE_MODE=enforce`
- `AUTO_CHANNEL_LEGACY_MANUAL_FLOW_ENABLED=true`
- `ENABLE_DEBUG_ENDPOINTS=false`
- `INGESTION_MAX_PER_SUBSCRIPTION=5`
- `REFRESH_SCAN_COOLDOWN_MS=30000`
- `REFRESH_GENERATE_COOLDOWN_MS=120000`
- `REFRESH_GENERATE_MAX_ITEMS=10`
- `REFRESH_FAILURE_COOLDOWN_HOURS=6`
- `INGESTION_STALE_RUNNING_MS=1800000`
- `SUBSCRIPTION_AUTO_BANNER_MODE=off`
- `SUBSCRIPTION_AUTO_BANNER_CAP=1000`
- `SUBSCRIPTION_AUTO_BANNER_MAX_ATTEMPTS=3`
- `SUBSCRIPTION_AUTO_BANNER_TIMEOUT_MS=12000`
- `SUBSCRIPTION_AUTO_BANNER_BATCH_SIZE=20`
- `SUBSCRIPTION_AUTO_BANNER_CONCURRENCY=1`
- `AUTO_BANNER_STALE_RUNNING_MS=1200000`
- `CREDIT_WALLET_CAPACITY=10`
- `CREDIT_WALLET_INITIAL_BALANCE=10`
- `CREDIT_REFILL_SECONDS_PER_CREDIT=360`
- `SOURCE_UNLOCK_RESERVATION_SECONDS=300`
- `SOURCE_UNLOCK_GENERATE_MAX_ITEMS=100`
- `SOURCE_AUTO_UNLOCK_RETRY_DELAY_SECONDS=90`
- `SOURCE_AUTO_UNLOCK_RETRY_MAX_ATTEMPTS=3`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_SECONDS=300`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT1_SECONDS=300`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT2_SECONDS=900`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT3_SECONDS=2700`
- `SOURCE_TRANSCRIPT_MAX_ATTEMPTS=3`
- `TRANSCRIPT_FAIL_FAST_ENABLED=true`
- `SOURCE_UNLOCK_TRANSCRIPT_COOLDOWN_HOURS=6` (deprecated)
- `SOURCE_UNLOCK_EXPIRED_SWEEP_BATCH=100`
- `SOURCE_UNLOCK_SWEEPS_ENABLED=true`
- `SOURCE_UNLOCK_SWEEP_BATCH=100`
- `SOURCE_UNLOCK_PROCESSING_STALE_MS=600000`
- `SOURCE_UNLOCK_SWEEP_MIN_INTERVAL_MS=30000`
- `SOURCE_UNLOCK_SWEEP_DRY_LOGS=true`
- `SOURCE_VIDEO_UNLOCK_BURST_WINDOW_MS=10000`
- `SOURCE_VIDEO_UNLOCK_BURST_MAX=8`
- `SOURCE_VIDEO_UNLOCK_SUSTAINED_WINDOW_MS=600000`
- `SOURCE_VIDEO_UNLOCK_SUSTAINED_MAX=120`
- `CREDITS_READ_WINDOW_MS=60000`
- `CREDITS_READ_MAX_PER_WINDOW=180`
- `INGESTION_LATEST_MINE_WINDOW_MS=60000`
- `INGESTION_LATEST_MINE_MAX_PER_WINDOW=180`
- `UNLOCK_INTAKE_ENABLED=true`
- `RUN_HTTP_SERVER=true`
- `RUN_INGESTION_WORKER=true`
- `QUEUE_DEPTH_HARD_LIMIT=1000`
- `QUEUE_DEPTH_PER_USER_LIMIT=50`
- `QUEUE_PRIORITY_ENABLED=true`
- `QUEUE_SWEEP_HIGH_BATCH=10`
- `QUEUE_SWEEP_MEDIUM_BATCH=5`
- `QUEUE_SWEEP_LOW_BATCH=2`
- `QUEUE_LOW_PRIORITY_SUPPRESSION_DEPTH=100`
- `WORKER_CONCURRENCY=2`
- `WORKER_BATCH_SIZE=10`
- `WORKER_LEASE_MS=90000`
- `WORKER_HEARTBEAT_MS=10000`
- `JOB_EXECUTION_TIMEOUT_MS=180000`
- `TRANSCRIPT_MAX_ATTEMPTS=2`
- `TRANSCRIPT_TIMEOUT_MS=25000`
- `INTERACTIVE_TRANSCRIPT_MAX_ATTEMPTS=1`
- `INTERACTIVE_TRANSCRIPT_TIMEOUT_MS=15000`
- `TRANSCRIPT_THROTTLE_ENABLED=false`
- `TRANSCRIPT_THROTTLE_TIERS_MS=3000,10000,30000,60000`
- `TRANSCRIPT_THROTTLE_JITTER_MS=500`
- `TRANSCRIPT_THROTTLE_INTERACTIVE_MAX_WAIT_MS=2000`
- `LLM_MAX_ATTEMPTS=2`
- `LLM_TIMEOUT_MS=60000`
- `INTERACTIVE_LLM_MAX_ATTEMPTS=1`
- `INTERACTIVE_LLM_TIMEOUT_MS=45000`
- `INTERACTIVE_YT2BP_QUALITY_MAX_RETRIES=0`
- `INTERACTIVE_YT2BP_CONTENT_SAFETY_MAX_RETRIES=0`
- `PROVIDER_CIRCUIT_FAILURE_THRESHOLD=5`
- `PROVIDER_CIRCUIT_COOLDOWN_SECONDS=60`
- `PROVIDER_FAIL_FAST_MODE=false`

## Transcript throttle rollout checks
- Deploy phase 1:
  - keep `TRANSCRIPT_THROTTLE_ENABLED=false`.
  - deploy/restart and confirm no behavior change.
- Deploy phase 2:
  - set `TRANSCRIPT_THROTTLE_ENABLED=true` with default tiers and wait cap.
  - restart service and monitor for 24h.
- Verify:
  - concurrent `/api/youtube-to-blueprint` calls should serialize at transcript stage.
  - overloaded interactive calls should return `429 RATE_LIMITED` with `retry_after_seconds`.
  - queued generation should continue progressing (background waits, no fast-fail).
- Fast rollback:
  - set `TRANSCRIPT_THROTTLE_ENABLED=false`.
  - restart `agentic-backend.service`.

## Onboarding rollout checks
- Schema check:
  - `public.user_youtube_onboarding` exists.
  - trigger `on_auth_user_created_youtube_onboarding` exists on `auth.users`.
- Behavior check (new account only):
  1. create a fresh account and sign in.
  2. verify first authenticated navigation is redirected to `/welcome`.
  3. click `Skip for now` and verify redirect to `/wall`.

## Runtime verification
- Current MVP production runtime:
  - `RUN_HTTP_SERVER=true`
  - `RUN_INGESTION_WORKER=true`
  - both values live in `/etc/agentic-backend.env`
  - `agentic-worker.service` remains disabled
- Verify the live contract:
```bash
ssh oracle-free 'sudo systemctl is-active agentic-backend.service'
ssh oracle-free 'sudo systemctl is-enabled agentic-worker.service || true'
ssh oracle-free 'curl -sS http://127.0.0.1:8787/api/health'
ssh oracle-free 'set -a; . /etc/agentic-backend.env; set +a; curl -sS http://127.0.0.1:8787/api/ops/queue/health -H "x-service-token: $INGESTION_SERVICE_TOKEN"'
```
- Deferred scale note:
  - dedicated split web/worker topology is intentionally out of the current runbook
  - if it is ever reintroduced, do it in a separate explicit scale plan rather than by following historical docs

## Failure playbooks

### `PROVIDER_FAIL`
- Meaning: transcript provider failed upstream.
- Action:
  1) Confirm provider setting (`TRANSCRIPT_PROVIDER`).
  2) Run toy transcript probe:
  ```bash
  TRANSCRIPT_PROVIDER=youtube_timedtext node --import tsx scripts/toy_fetch_transcript.ts --url 'https://www.youtube.com/watch?v=16hFQZbxZpU'
  ```
  3) If timedtext has no captions, re-run with `TRANSCRIPT_PROVIDER=videotranscriber_temp`.

### `RATE_LIMITED`
- Meaning: anon/auth/hourly limiter tripped.
- Action:
  1) Check request volume in logs.
  2) Check whether rate limit is endpoint limiter or transcript throttle (`retry_after_seconds` present on YT2BP responses).
  3) Temporarily raise limits only if operationally justified.
  4) Keep hourly cap as abuse guard.

### `INSUFFICIENT_CREDITS`
- Meaning: user has exhausted the current daily credit wallet for their plan or cannot afford the requested new work items.
- Action:
  1) Check `/api/credits` fields (`daily_grant`, `balance`, `capacity`, `next_reset_at`, `plan`, plus compatibility `generation_daily_*` fields if needed).
  2) Confirm wallet grant config in `/etc/agentic-backend.env`:
     - `CREDIT_WALLET_FREE_DAILY_GRANT`
     - `CREDIT_WALLET_PLUS_DAILY_GRANT`
     - `CREDIT_WALLET_ADMIN_DAILY_GRANT`
  3) For admin users, confirm entitlement row first; `AI_CREDITS_BYPASS` is only the global fail-open flag and should not be required for normal admin bypass behavior.

### `CREDITS_UNAVAILABLE`
- Meaning: backend credit service path is unavailable (for example missing/invalid service-role path or credit RPC failure).
- Action:
  1) Check `/api/credits` directly; confirm payload fields:
     - `credits_backend_mode`
     - `credits_backend_ok`
     - `credits_backend_error`
  2) Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present in `/etc/agentic-backend.env`.
  3) Confirm bypass state intentionally:
     - `AI_CREDITS_BYPASS=true` is emergency-only and should not be left on unintentionally.
  4) Restart backend/worker after env correction and re-check `/api/credits`.
  5) Verify generation endpoints now return normal credit outcomes (not `CREDITS_UNAVAILABLE`).

#### Set user generation entitlement (service role SQL)
- Set `admin` (wallet bypass / operator access):
```sql
select * from public.set_generation_plan_by_email('david.vikstrand@gmail.com', 'admin', null);
```
- Set `plus` (uses `CREDIT_WALLET_PLUS_DAILY_GRANT` unless overridden):
```sql
select * from public.set_generation_plan_by_email('user@example.com', 'plus', null);
```
- Set custom override:
```sql
select * from public.set_generation_plan_by_email('user@example.com', 'plus', 100);
```

### `TIMEOUT`
- Meaning: pipeline exceeded max timeout.
- Action:
  1) Confirm `YT2BP_CORE_TIMEOUT_MS` value is sane for current load.
  2) Keep `/youtube` in core-first mode (review/banner async) for user flows.
  3) Validate transcript provider latency.
  4) Check OpenAI latency and retries.

### `SAFETY_BLOCKED`
- Meaning: generated output violated content safety policy.
- Action:
  1) Confirm expected for source video category.
  2) Inspect `yt2bp-content-safety` log lines for flagged criteria.
  3) Do not bypass by default; only tune policy with explicit decision.

### `GENERATION_FAIL`
- Meaning: generation/quality stage failed after retries.
- Action:
  1) Inspect `yt2bp-quality` logs for failing criteria.
  2) Verify `OPENAI_API_KEY` and model availability.
  3) If incident pressure: use fallback profile below.

### `JOB_ALREADY_RUNNING`
- Meaning: a manual refresh generation job is already active for this user.
- Action:
  1) Use `GET /api/ingestion/jobs/<job_id>` (user auth) to track completion.
  2) Wait for terminal state (`succeeded|failed`) before launching a new refresh-generate run.
  3) If job appears stuck, inspect stale recovery settings (`INGESTION_STALE_RUNNING_MS`).

### `INSUFFICIENT_CREDITS`
- Meaning: user wallet could not reserve enough credits for source-video unlock.
- Action:
  1) Check `/api/credits` response fields (`balance`, `capacity`, `daily_grant`, `next_reset_at`, `plan`).
  2) Confirm wallet env defaults are set as expected (`CREDIT_WALLET_*`).
  3) Verify user has active subscriptions on the source page.
  4) Verify `credit_ledger` latest rows for the user (`hold/refund/settle`) match expected unlock attempts.

### `UNLOCK_RESERVATION_EXPIRED` or `UNLOCK_GENERATION_FAILED`
- Meaning: unlock reservation expired or queued generation failed; held credits should be refunded.
- Action:
  1) Inspect `source_item_unlocks` row (`status`, `last_error_code`, `last_error_message`, `reservation_expires_at`).
  2) Inspect `credit_ledger` for matching `hold` and `refund` entries via `unlock_id`.
  3) Correlate unlock logs via `trace_id` from unlock response (`unlock_request_received` -> `unlock_item_*` -> `unlock_job_terminal`).
  4) Retry unlock from source page after verifying provider health.

### `NO_TRANSCRIPT_PERMANENT`
- Meaning: video was confirmed as no-speech/no-usable-transcript after bounded retries, so it should not remain unlockable.
- Also covers terminal transcript provider outcomes when fail-fast is enabled (`VIDEO_UNAVAILABLE`, `ACCESS_DENIED`).
- Action:
  1) Inspect `source_item_unlocks` (`last_error_code`, `transcript_status`, `transcript_attempt_count`, `transcript_no_caption_hits`).
  2) Confirm `transcript_status='confirmed_no_speech'` before treating as permanent.
  3) Confirm locked-card suppression on Home `For You`, profile feed, Source Page Video Library, and any exercised legacy `My Feed` compatibility view.
  4) Do not enqueue retry jobs for confirmed permanent rows; only transient transcript errors should retry.

### `candidate_pending_manual_review` growth
- Meaning: gate pipeline is producing warn outcomes (fit/quality) and routing to manual review.
- Action:
  0) Confirm runtime mode first (`CHANNEL_GATES_MODE`).
     - if `bypass`, this state should be rare/unexpected and likely indicates fallback/no-backend path.
     - if `enforce`, continue with the checks below.
  1) Inspect `channel_gate_decisions` for dominant `reason_code`.
  2) Verify candidate inputs (channel slug, tags, step_count) are mapped correctly.
  3) If noisy channel-fit warns dominate, tune fit policy before enabling broader auto paths.

### Misclassification / too many `general` publishes
- Meaning: channel labeling is falling back too often or classifier signal quality dropped.
- Action:
  1) Verify classifier env: `AUTO_CHANNEL_CLASSIFIER_MODE` is expected for this rollout (`deterministic_v1` or `llm_labeler_v1`).
  2) Verify fallback slug is valid: `AUTO_CHANNEL_FALLBACK_SLUG=general` (or another curated slug that exists).
  3) Inspect auto-publish response/log metadata (`classifier_reason`) to split:
     - deterministic mode: `tag_match|alias_match|fallback_general`
     - llm mode: `llm_valid|llm_retry_valid|fallback_general`
  4) If emergency rollback needed, temporarily set `AUTO_CHANNEL_CLASSIFIER_MODE=general_placeholder`.

### `channel_rejected` spike
- Meaning: block outcomes (safety/PII/quality) are increasing and channel publish throughput drops.
- Action:
  0) Confirm runtime mode first (`CHANNEL_GATES_MODE`).
     - in `bypass`, reject spikes should come from explicit manual reject paths, not automated gate blocks.
  1) Inspect `channel_gate_decisions.reason_code` distribution.
  2) Confirm reject path is preserving personal visibility (Home `For You` should remain visible; legacy `My Feed` compatibility view should still align if exercised).
  3) Escalate only after checking for source-content drift (e.g., different incoming topic mix).

## Rollback / fallback controls
Incident profile (temporary):
- Keep endpoint up, reduce strictness first:
  - `YT2BP_QUALITY_ENABLED=false`
  - `YT2BP_CONTENT_SAFETY_ENABLED=true`
- If provider instability dominates:
  - keep endpoint enabled but switch transcript provider.
- Full stop (hard off):
  - `YT2BP_ENABLED=false`

After env change:
```bash
ssh oracle-free 'sudo systemctl restart agentic-backend.service'
```

## Post-deploy confidence checks
- Release smoke:
```bash
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://bleup.app --release-sha "$RELEASE_SHA"
```
- Oracle primary soak snapshot (expects the `oracle-free` SSH alias from the local Codex environment):
```bash
npm run ops:oracle-primary-check -- --json
```
- Oracle unlock-ledger parity snapshot during `ORACLE_UNLOCK_LEDGER_MODE=dual`:
```bash
npm run ops:oracle-unlock-parity -- --json
```
  - Good `dual` verdict for `source_item_unlocks`:
    - `ORACLE_UNLOCK_LEDGER_MODE=dual`
    - `missing_in_oracle_count=0`
    - `missing_in_supabase_count=0`
    - `mismatched_row_count=0`
    - no duplicate `source_item_id` rows on either side
- After the `dual -> primary` flip, rerun the same command and confirm:
  - `ORACLE_UNLOCK_LEDGER_MODE=primary`
  - parity still `PASS`
- Oracle feed-ledger parity snapshot during `ORACLE_FEED_LEDGER_MODE=dual`:
```bash
npm run ops:oracle-feed-parity -- --json
```
  - Good `dual` verdict for `user_feed_items`:
    - `ORACLE_FEED_LEDGER_MODE=dual`
    - `missing_in_oracle_count=0`
    - `missing_in_supabase_count=0`
    - `mismatched_row_count=0`
  - Oracle/Supabase row counts still match exactly
  - After the `dual -> primary` flip, rerun the same command and confirm:
    - `ORACLE_FEED_LEDGER_MODE=primary`
    - parity still `PASS`
    - shared feed transitions (`/api/my-feed`, channel-candidate state changes, auto-channel publish/reject, suppression-driven skips) stay on the Oracle feed ledger path with zero parity drift
- Oracle source-item-ledger parity snapshot during `ORACLE_SOURCE_ITEM_LEDGER_MODE=dual`:
```bash
npm run ops:oracle-source-item-parity -- --json
```
  - Good `dual` verdict for `source_items`:
    - `ORACLE_SOURCE_ITEM_LEDGER_MODE=dual`
    - `missing_in_oracle_count=0`
    - `missing_in_supabase_count=0`
    - `mismatched_row_count=0`
    - duplicate canonical-key counts stay `0` on both sides
    - live canary also stays clean:
      - wall keeps receiving new feed rows
      - `POST /api/source-pages/:platform/:externalId/videos/unlock` followed by `GET /api/source-pages/:platform/:externalId/videos` keeps the same item in `unlock_status=processing` / `unlock_in_progress=true` when work is already running
  - After the `dual -> primary` flip, rerun the same command and confirm:
    - `ORACLE_SOURCE_ITEM_LEDGER_MODE=primary`
    - parity still `PASS`
    - source-item upserts, source-item execution reads, and metadata/view-count updates stay on the Oracle source-item ledger path with zero parity drift
  - If live wall posts or source-page unlock generation start failing with `source_item_ledger_failed`, roll back immediately:
    - set `ORACLE_SOURCE_ITEM_LEDGER_MODE=supabase`
    - restart `agentic-backend.service`
    - redeploy the fixed build before re-staging `dual`
  - During `supabase|dual`, Oracle-first source-item read failures should now degrade to Supabase-backed reads; if user-facing wall/source-page traffic still breaks, treat that as a blocker and do not promote to `primary`.
- Oracle generation-state parity snapshot during `ORACLE_GENERATION_STATE_MODE=dual`:
```bash
npm run ops:oracle-generation-state-parity -- --json
```
  - Good `dual` verdict for generation state:
    - `ORACLE_GENERATION_STATE_MODE=dual`
    - variant counts match
    - recent run counts match
    - `missing_in_oracle_count=0`
    - `missing_in_supabase_count=0`
    - `mismatched_row_count=0`
  - After the `dual -> primary` flip, rerun the same command and confirm:
    - `ORACLE_GENERATION_STATE_MODE=primary`
    - parity still `PASS`
    - interactive generate/unlock canaries still show the expected queued/running/ready variant state
  - Keep scope explicit:
    - `generation_runs` summary truth moves in this chapter
    - `generation_run_events` still stay on Supabase until a later trace-events chapter
- YT2BP repro smoke:
```bash
npm run smoke:yt2bp -- --base-url https://api.bleup.app
```
- Metrics summary (Oracle logs):
```bash
ssh oracle-free 'cd /home/ubuntu/remix-of-stackwise-advisor && npm run metrics:yt2bp -- --source journalctl --json'
```

## Source-page migration verification
- Confirm schema objects exist:
```sql
select to_regclass('public.source_pages') as source_pages_table,
       to_regclass('public.user_source_subscriptions') as subscriptions_table,
       to_regclass('public.source_items') as source_items_table;
```
- Confirm backfill linkage counts are non-zero:
```sql
select
  (select count(*) from public.source_pages where platform = 'youtube') as source_pages_youtube,
  (select count(*) from public.user_source_subscriptions where source_page_id is not null) as subscriptions_linked,
       (select count(*) from public.source_items where source_page_id is not null) as source_items_linked;
```
- Visual hydration check (legacy rows):
  - open `GET /api/source-pages/youtube/<channel_id>` for a known backfilled channel.
  - if `avatar_url`/`banner_url` were null, first read now attempts YouTube asset hydration and persists filled values.

## Candidate lifecycle smoke (auth required)
Use a valid bearer token and existing `user_feed_item_id`.
```bash
curl -sS -X POST https://api.bleup.app/api/channel-candidates \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"user_feed_item_id":"<uuid>","channel_slug":"skincare"}'
```

```bash
curl -sS -X POST https://api.bleup.app/api/channel-candidates/<candidate_id>/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json'
```

## Subscription + ingestion smoke
YouTube search smoke (auth required):
```bash
curl -sS "https://api.bleup.app/api/youtube-search?q=skincare%202026%20best&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

YouTube creator lookup smoke (auth required; bare handle or `@handle` both work):
```bash
curl -sS "https://api.bleup.app/api/youtube-channel-search?q=%40DoctorMike&limit=3" \
  -H "Authorization: Bearer $TOKEN"
```

YouTube OAuth status (auth required):
```bash
curl -sS "https://api.bleup.app/api/youtube/connection/status" \
  -H "Authorization: Bearer $TOKEN"
```

YouTube OAuth start (auth required; open returned `auth_url` in browser):
```bash
curl -sS -X POST https://api.bleup.app/api/youtube/connection/start \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"return_to":"https://bleup.app/subscriptions"}'
```

YouTube import preview (auth required):
```bash
curl -sS "https://api.bleup.app/api/youtube/subscriptions/preview" \
  -H "Authorization: Bearer $TOKEN"
```

YouTube import selected channels (auth required):
```bash
curl -sS -X POST https://api.bleup.app/api/youtube/subscriptions/import \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"channels":[{"channel_id":"UC_x5XG1OV2P6uZZ5FSM9Ttw","channel_url":"https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw","channel_title":"Google for Developers"}]}'
```

Disconnect YouTube OAuth link (auth required; imported app subscriptions remain):
```bash
curl -sS -X DELETE https://api.bleup.app/api/youtube/connection \
  -H "Authorization: Bearer $TOKEN"
```

Create a subscription (MVP auto-only behavior):
```bash
curl -sS -X POST https://api.bleup.app/api/source-subscriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"channel_input":"https://www.youtube.com/@AliAbdaal"}'
```
Expected behavior:
- first subscribe sets the ongoing checkpoint and inserts one `subscription_notice` feed item for this user/channel.
- if Home `For You` currently has fewer than `20` visible cards, subscribe/reactivate may also backfill up to the latest `5` creator videos.
- historical backfill prefers an already-ready reusable blueprint row when available; otherwise it inserts a locked `my_feed_unlockable` card and does not auto-generate that historical item.
- future uploads are ingested automatically.
- subscription rows returned by `GET /api/source-subscriptions` may include `source_channel_avatar_url` from stored `source_pages` metadata; missing avatars return `null` and should not trigger live YouTube asset fetches on the request path.
- `subscription_notice` source metadata may include `channel_banner_url` for notice-card backgrounds.
- unsubscribing (`DELETE /api/source-subscriptions/:id`) deactivates the subscription; current runtime no longer spends request-path work removing the legacy notice card immediately.
- subscription auto-ingest generation runs with review enabled and banner disabled by default.

Manual refresh scan (auth required):
```bash
curl -sS -X POST https://api.bleup.app/api/source-subscriptions/refresh-scan \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"max_per_subscription":5,"max_total":50}'
```
Expected behavior:
- response includes candidate rows; `cooldown_filtered` is no longer expected now that failed-item retry cooldown persistence has been removed.
- rate-limited retries return `RATE_LIMITED`.

Manual refresh enqueue (auth required):
```bash
curl -sS -X POST https://api.bleup.app/api/source-subscriptions/refresh-generate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"items":[{"subscription_id":"<uuid>","source_channel_id":"<channel_id>","video_id":"<video_id>","video_url":"https://www.youtube.com/watch?v=<video_id>","title":"<title>"}]}'
```
Expected behavior:
- request returns quickly with `job_id` and `queued_count`
- generation continues asynchronously in background
- progress is visible via `ingestion_jobs` (scope `manual_refresh_selection`) and resulting personal-lane inserts
- successful generation advances subscription checkpoint forward (`last_seen_published_at` / `last_seen_video_id`) for touched subscriptions
- route guardrails:
  - max selected items per run = `20` (`MAX_ITEMS_EXCEEDED`)
  - one active manual refresh job per user (`JOB_ALREADY_RUNNING`)
  - per-user cooldown (`REFRESH_GENERATE_COOLDOWN_MS`)

Manual refresh job status (user auth):
```bash
curl -sS https://api.bleup.app/api/ingestion/jobs/<job_id> \
  -H "Authorization: Bearer $TOKEN"
```

Latest manual refresh job for current user (user auth):
```bash
curl -sS "https://api.bleup.app/api/ingestion/jobs/latest-mine?scope=manual_refresh_selection" \
  -H "Authorization: Bearer $TOKEN"
```

User-triggered sync (operator/debug path):
```bash
curl -sS -X POST https://api.bleup.app/api/source-subscriptions/<subscription_id>/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Service cron trigger:
```bash
curl -sS -X POST https://api.bleup.app/api/ingestion/jobs/trigger \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Latest ingestion job snapshot:
```bash
curl -sS https://api.bleup.app/api/ingestion/jobs/latest \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```

Staleness guidance:
- If latest `finished_at` is older than 90 minutes, treat ingestion as delayed and start triage.
- If latest `status` is `failed` or `error_code` is `PARTIAL_FAILURE`, inspect per-subscription `last_sync_error`.
- If latest endpoint reports no jobs, verify Oracle cron registration first.

Debug simulation trigger (single subscription, non-prod only):
```bash
curl -sS -X POST https://api.bleup.app/api/debug/subscriptions/<subscription_id>/simulate-new-uploads \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"rewind_days":30}'
```
Notes:
- endpoint returns `404` unless `ENABLE_DEBUG_ENDPOINTS=true`.
- endpoint uses service-token auth only; do not send/require a user bearer token.
- endpoint rewinds checkpoint for one subscription, then runs one sync cycle.
- this can generate blueprints and consume tokens/credits.
- source YouTube generation paths are thumbnail-first and bypass auto-banner enqueue; async auto-banner jobs only apply to compatibility/non-source paths when enabled.

Auto-banner worker trigger (service auth):
```bash
curl -sS -X POST https://api.bleup.app/api/auto-banner/jobs/trigger \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Subscription input note:
- Handle URLs may resolve via `browseId` fallback parsing when direct `channelId` metadata is absent in YouTube page HTML.

Pending card actions (compatibility path for legacy pending items):
```bash
curl -sS -X POST https://api.bleup.app/api/my-feed/items/<user_feed_item_id>/accept \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

```bash
curl -sS -X POST https://api.bleup.app/api/my-feed/items/<user_feed_item_id>/skip \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

## Oracle cron setup
Example cron entry:
```bash
*/3 * * * * curl -sS -X POST https://api.bleup.app/api/ingestion/jobs/trigger -H \"x-service-token: ${INGESTION_SERVICE_TOKEN}\" -H 'Content-Type: application/json' --data '{}' >> /var/log/bleuv1-ingestion-cron.log 2>&1
```
Notes:
- in `primary`, Oracle-local scheduler ticks own `all_active_subscriptions` triggering; external cron hits to `/api/ingestion/jobs/trigger` for that scope now no-op with `oracle_primary_scheduler_owned`
- Oracle may still keep the `*/3m` trigger cadence as a lightweight compatibility path, but the live owner for `all_active_subscriptions` is the local Oracle scheduler tick plus the Oracle cadence window (`ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS`)
- each Oracle-primary run may now drain up to `ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT` due subscriptions from local SQLite state instead of the older fixed `75`-row cap
- Oracle-primary runs may also drain more than one due batch per job when backlog remains, bounded by `ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN`
- queued-worker sweep cadence may now also be owned by Oracle-local queue-sweep state through `ORACLE_QUEUE_SWEEP_*`: Oracle decides which priority tiers are due, what batch size each tier uses, and when the worker should wake for the next due sweep, while Supabase still stores queued/running rows, claims, leases, and retries
- repeated empty queued-worker claim attempts may still be backstopped by Oracle-local queue-control cooldown state through `ORACLE_QUEUE_*`, especially for medium/low-priority tiers
- hot admission/backpressure reads may now also be served from Oracle-local queue-admission mirror state through `ORACLE_QUEUE_ADMISSION_*`, so search/manual-refresh/source-page/subscription enqueue guards can reuse one local active-count snapshot instead of re-reading active queue counts from Supabase on each request
- stale-running recovery, manual-refresh duplicate detection, retry/refresh pending-job dedupe, unlock-reliability job lookups, and user/ops `latest-mine` / `active-mine` status reads may now also be served from Oracle-local job-activity mirror state through `ORACLE_JOB_ACTIVITY_*`, and the hot enqueue/claim/terminal/stale transitions now update that mirror directly from known durable rows instead of rereading the same job from Supabase; Supabase still remains the durable queue ledger
- repeated identical subscription sync errors now refresh `last_polled_at` / `last_sync_error` at `30m` instead of `15m`

Auto-banner worker cron example (every 5 minutes):
```bash
*/5 * * * * curl -sS -X POST https://api.bleup.app/api/auto-banner/jobs/trigger -H \"x-service-token: ${INGESTION_SERVICE_TOKEN}\" -H 'Content-Type: application/json' --data '{}' >> /var/log/bleuv1-auto-banner-cron.log 2>&1
```

## Ingestion reliability triage
1. Confirm cron is running and writing logs:
```bash
ssh oracle-free 'sudo crontab -l | grep ingestion/jobs/trigger'
ssh oracle-free 'tail -n 100 /var/log/bleuv1-ingestion-cron.log'
```
2. Check latest ingestion snapshot:
```bash
curl -sS https://api.bleup.app/api/ingestion/jobs/latest -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```
3. Capture bounded queue metrics on Oracle:
```bash
ssh oracle-free 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.20.0 >/dev/null; cd /home/ubuntu/remix-of-stackwise-advisor && npm run metrics:queue -- --source journalctl --lines 800 --json'
```
- use `--lines 800` on Oracle to avoid the current `ENOBUFS` failure risk from the default `4000`-line window
4. If delayed/failed, inspect backend logs:
```bash
ssh oracle-free 'sudo journalctl -u agentic-backend.service -n 200 --no-pager'
```
5. Spot-check subscription rows in app UI (`/subscriptions`) via `Sync issue`, `Last polled`, and health detail text.

## Traceability keys and expected logs
Required IDs for triage:
- `run_id`
- `source_item_id`
- `user_feed_item_id`
- `candidate_id`
- `channel_slug`
- `reason_code` (when applicable)

Expected structured server log markers:
- `[candidate_gate_result]`
- `[candidate_manual_review_pending]`
- `[candidate_published]`
- `[candidate_rejected]`
- `[subscription_skip_upcoming_premiere]` (pre-release YouTube premiere filtered during sync)
- `[subscription_auto_unlock_not_queued]` with `reason=PERMANENT_NO_TRANSCRIPT` (non-retryable no-transcript auto-unlock skip)

Useful `mvp_events.event_name` chain for YT2BP split flow:
- `source_pull_requested`
- `source_pull_succeeded`
- `youtube_review_started|youtube_review_succeeded|youtube_review_failed`
- `youtube_banner_started|youtube_banner_succeeded|youtube_banner_failed`
- `my_feed_publish_succeeded`
- `candidate_submitted`
- `candidate_gate_result`
- `channel_publish_succeeded|channel_publish_rejected`
