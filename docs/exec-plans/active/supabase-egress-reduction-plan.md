# Supabase Egress Reduction Plan

Status: `active`

## Goal
a1) [todo] Reduce Supabase egress materially without degrading the current product UX or weakening the YouTube-to-blueprint runtime.

## Current Baseline
b1) [have] Recent Supabase usage shows roughly `10.68 GB` of egress, which is too high for the current solo-dev usage pattern.
b2) [have] Recent list-surface overfetch has already been reduced by moving Wall/Search/Explore/Channel/My Feed list rendering toward lean preview payloads.
b3) [have] Recent Supabase request-history inspection suggests the biggest current driver is backend automation traffic, not only frontend browsing.
b4) [have] The hottest recent request families were:
- repeated `user_feed_items` patch/update traffic
- repeated `user_source_subscriptions` count/check/update traffic
- aggressive `claim_ingestion_jobs` polling
b5) [have] The strongest current code-path suspects are:
- `runTranscriptFeedSuppressionSweep(...)` in `server/index.ts`
- `suppressUnlockableFeedRowsForSourceItem(...)` in `server/index.ts`
- `countActiveSubscribersForSourcePage(...)` in `server/services/sourceUnlocks.ts`
- subscription checkpoint/update flow in `server/services/sourceSubscriptionSync.ts`
- queue claim/lease functions in `server/services/ingestionQueue.ts`

## Scope Lock
c1) [todo] Keep this plan focused on egress reduction and request-churn control.
c2) [todo] Do not widen scope to product redesign, queue architecture replacement, or broader Supabase migrations unless directly required by one of the egress-reduction phases.
c3) [todo] Preserve user-visible UX unless a specific change is explicitly called out, reviewed, and accepted.
c4) [todo] Prefer reducing redundant reads/writes and polling before introducing new persistence structures.

## Findings To Carry Forward
d1) [have] Long-window snapshots still show feed suppression as a major historical contributor, but the freshest windows after the Phase 1b pass no longer show it as the dominant path.
d2) [have] The current hottest normalized path in the freshest lagged windows is now:
- `PATCH /rest/v1/user_source_subscriptions?id=...`
d3) [have] Feed suppression is still present in the short windows, but the remaining traffic is now split between a shared single-item path and a bulk `source_item_id=in.(...)` path rather than one overwhelming sweep-only pattern.
d4) [have] `claim_ingestion_jobs` remains a meaningful background contributor, but it no longer dominates the freshest measured windows.
d5) [have] Frontend overfetch still matters, but it no longer looks like the dominant current source after the recent list-payload slimming pass.
d6) [have] The freshest post-Phase-2b reads show `user_source_subscriptions?id=...` down by roughly `80%` versus the earlier hot `60m` snapshot, so the subscription-write throttling materially helped.
d7) [have] The remaining short-window egress is now spread across queue claim traffic, queue-read helpers, refresh bookkeeping, and generation trace writes rather than one overwhelming backend loop.
d8) [have] Several queue/read helpers still look broader than needed:
- `countQueueDepth(...)` currently only supports a single `scope`, even though some callers pass `scopes: [...]`
- `countQueueWorkItems(...)` still selects full `scope, payload` rows and reduces them in app code
d9) [have] The YouTube refresh path still has avoidable churn:
- `hasPendingRefreshJob(...)` scans queued/running refresh jobs by reading payloads
- `listDueRefreshCandidates(...)` does multiple passes over refresh state and blueprints
- `upsertRefreshState(...)` always writes `updated_at` with the patch payload
d10) [have] Generation trace writes are still chatty:
- `appendGenerationEvent(...)` reads latest `seq` before every event insert
- several generation-run writes still use returning `.select(...)` payloads even when the caller only needs success/failure

## Latest Measurement Snapshot
e0) [have] Fresh lagged request-history exports were regenerated on `2026-03-19` after the Phase 2b write-throttling deploy.
e00) [have] Freshest current `60m` snapshot:
- window: `2026-03-19T12:23:00.000Z` -> `2026-03-19T13:23:00.000Z`
- total sampled requests: `3780`
- top normalized paths:
  - `666` :: `/rest/v1/user_source_subscriptions?id=eq.:long`
  - `621` :: `/rest/v1/rpc/claim_ingestion_jobs`
  - `261` :: `/rest/v1/generation_run_events?select=id,run_id,seq,level,event,payload,created_at`
  - `147` :: `/rest/v1/ingestion_jobs?select=id`
  - `141` :: `/rest/v1/ingestion_jobs?select=id&status=in.(queued,running)`
  - `115` :: `/rest/v1/blueprint_youtube_refresh_state?on_conflict=blueprint_id`
e01) [have] Fresh `60m` request families now look like:
- `704` subscription checks
- `621` unlock queue claim
- `582` ingestion job reads
- `522` generation trace writes
- `213` unlock state reads
- `66` feed suppression writes
e02) [have] Freshest current `24h` snapshot still looks historically feed-heavy because it includes a large amount of pre-fix traffic:
- `459155` :: `/rest/v1/user_feed_items?blueprint_id=is.null&select=id&source_item_id=eq.:long&state=in.(...)`
- `77503` :: `/rest/v1/user_source_subscriptions?id=eq.:long`
- `65902` :: `/rest/v1/user_source_subscriptions?is_active=eq.true&select=id&source_page_id=eq.:long`
- `18211` :: `/rest/v1/rpc/claim_ingestion_jobs`
e03) [have] Same-shape short-window comparison against the earliest non-empty prior `60m` bucket in the last day shows:
- `user_source_subscriptions?id=...` down from `3204` -> `666`
- total sampled requests down from `24498` -> `3780`
- `claim_ingestion_jobs` roughly flat/slightly up from `554` -> `621`
e04) [have] The current short-window hotspot order is now:
- `user_source_subscriptions?id=...`
- `claim_ingestion_jobs`
- `generation_run_events`
- `ingestion_jobs` queue reads
- `blueprint_youtube_refresh_state` writes
e05) [have] Feed suppression is no longer a top short-window driver after the Phase 1 and Phase 1b reductions.
e06) [have] The next tightening wave should focus on queue helpers, refresh queue bookkeeping, and generation trace chattiness rather than another broad feed-suppression rewrite.

## Phases
f1) [todo] Phase 1: collapse transcript/feed suppression into bulk updates.
- primary files:
  - `server/index.ts`
- target functions:
  - `runTranscriptFeedSuppressionSweep(...)`
  - `suppressUnlockableFeedRowsForSourceItem(...)`
- implementation direction:
  - dedupe `source_item_id`s before patching
  - replace per-item `user_feed_items` updates with bulk/chunked updates where possible
  - avoid `.select('id')` on updates unless the returned ids are actually required
 - acceptance:
  - the sweep produces far fewer Supabase `user_feed_items` update requests
  - transcript/no-speech suppression behavior remains unchanged for users
 - progress note:
   - bulk/chunked suppression is shipped
   - count-only update responses are shipped
   - Phase 1b same-item suppression cooldown + less-frequent worker-triggered sweeps are shipped
   - fresh `15m`/`60m` windows show feed suppression materially reduced, but not fully eliminated
f2) [todo] Phase 2: eliminate repeated subscription-count and subscription-existence churn inside backend loops.
- primary files:
  - `server/services/sourceUnlocks.ts`
  - `server/services/sourceSubscriptionSync.ts`
  - `server/index.ts` if shared run-local caching is needed
- target functions:
  - `countActiveSubscribersForSourcePage(...)`
  - subscription sync/checkpoint flows
- implementation direction:
  - memoize active-subscriber counts per `source_page_id` inside a sync/sweep run
  - avoid repeated reads for the same source page inside a single execution path
  - skip writes when checkpoint/subscription fields are unchanged
- acceptance:
  - fewer `user_source_subscriptions` reads/writes during source sync and unlock flows
  - no behavior drift in subscription state, source eligibility, or feed insertion
 - progress note:
   - the redundant active-subscriber count reads were removed from the hot subscription sync and auto-unlock retry paths
   - the remaining `PATCH ...id=...` traffic is now the top fresh-window hotspot
   - Phase 2b success/error write throttling is now shipped
   - the proof step for Phase 2b is still pending a fresh post-deploy request-history export
f3) [todo] Phase 3: make ingestion-job claiming much more conservative while idle.
- primary files:
  - `server/services/ingestionQueue.ts`
  - `server/index.ts` scheduler/caller paths for queue workers
- target functions:
  - `claimQueuedIngestionJobs(...)`
  - any loop/timer calling the claim path
- implementation direction:
  - add longer idle backoff when no jobs are claimed
  - add jitter so concurrent workers do not synchronize
  - keep fast claim cadence only when real work is present
- acceptance:
  - `claim_ingestion_jobs` request volume drops materially during idle periods
  - queue pickup latency remains acceptable when work arrives
 - progress note:
   - idle backoff + jitter are shipped
   - fresh windows still show claim traffic as the second-largest short-window family, so more queue work may still be worth doing after Phase 2b
f4) [todo] Phase 4: tighten queue helpers and scoped queue reads.
- primary files:
  - `server/services/ingestionQueue.ts`
  - `server/services/generationPreflight.ts`
  - `server/handlers/opsHandlers.ts`
  - `server/index.ts`
- target functions:
  - `countQueueDepth(...)`
  - `countQueueWorkItems(...)`
  - queue guard/read call sites that currently expect multi-scope filtering
- implementation direction:
  - make queue depth checks truly support multi-scope filtering where callers pass `scopes: [...]`
  - reduce broad `ingestion_jobs` reads for queue work-item counting
  - verify queue admission / refresh guards still reflect the intended queue slice rather than the full queue
- acceptance:
  - fewer `ingestion_jobs?select=id...` and related queue-read requests
  - queue guards become both cheaper and more accurate
f5) [todo] Phase 5: reduce refresh queue bookkeeping and refresh-state churn.
- primary files:
  - `server/services/blueprintYoutubeComments.ts`
  - `server/index.ts`
- implementation direction:
  - tighten `hasPendingRefreshJob(...)` so it stops scanning queued/running refresh payloads more than necessary
  - review `listDueRefreshCandidates(...)` for extra passes that can be collapsed
  - skip no-op `blueprint_youtube_refresh_state` upserts where safe
- acceptance:
  - lower `blueprint_youtube_refresh_state` and refresh-related `ingestion_jobs` read traffic
  - no regression in manual/auto refresh scheduling semantics
- progress note:
  - scheduler pending-refresh detection is now batched by refresh kind + candidate blueprint set instead of one read per candidate
  - manual comments refresh now reads existing refresh state first and only registers a row when the blueprint lacks an enabled refresh record
  - fresh post-deploy request-history proof is still pending
f6) [todo] Phase 6: slim generation trace writes and reads.
- primary files:
  - `server/services/generationTrace.ts`
  - `server/services/youtubeBlueprintPipeline.ts`
- implementation direction:
  - remove returning `.select(...)` payloads where callers do not need them
  - review whether per-event `seq` lookup can be avoided or collapsed
  - trim low-value trace events only if the first two changes are not enough
- acceptance:
  - lower `generation_run_events` read/write volume without losing the tracing needed for support/debugging
f7) [todo] Phase 7: reduce remaining queue-maintenance chatter around leases and worker health once queue-helper correctness is tightened.
- primary files:
  - `server/services/ingestionQueue.ts`
  - `server/services/queuedIngestionWorkerController.ts`
  - `server/index.ts`
- target functions:
  - `touchIngestionJobLease(...)`
  - stale-job recovery / worker-health read paths
- implementation direction:
  - revisit lease-heartbeat cadence once queue helper/guard reads are cheaper
  - avoid maintenance reads/writes that do not materially change worker safety
- acceptance:
  - fewer background queue-maintenance requests without increasing stale-lease failures
- progress note:
  - worker lease heartbeats now use a lease-aware cadence floor, so the default `90s` lease refreshes every `30s` instead of every `10s`
  - fresh post-deploy request-history proof is still pending
f8) [todo] Phase 8: keep frontend list surfaces lean and maintain proof after each backend pass.
- primary files:
  - `src/hooks/useBlueprintSearch.ts`
  - `src/hooks/useExploreSearch.ts`
  - `src/hooks/useMyFeed.ts`
  - `src/hooks/useChannelFeed.ts`
  - `server/services/wallFeed.ts`
  - `docs/exec-plans/active/tail/mvp-launch-proof-tail.md` if ongoing proof needs to be carried forward
- implementation direction:
  - treat the recent `preview_summary`/lean-query changes as the frontend baseline
  - only reintroduce heavy fields if a specific UX dependency is proven
  - keep recording before/after hotspot snapshots after each backend phase
- acceptance:
  - list surfaces remain visually stable
  - the repo has a durable record of which change reduced which hot path

## Execution Order
g1) [have] Phase 1 core bulk suppression is shipped.
Reason:
- the original feed-suppression sweep was the biggest observed request family when this plan started

g2) [have] Phase 1b same-item suppression cooldown + less-frequent worker-triggered sweeps are shipped.
Reason:
- the remaining feed traffic looked like repeated same-item suppression and overly frequent sweep invocation rather than only the original bulk path

g3) [have] Phase 2 count-read reduction is shipped and Phase 3 idle queue-claim backoff is shipped.
Reason:
- those were the next safest backend multipliers to reduce without touching UX

g4) [have] Phase 2b success/error write throttling is shipped.
Reason:
- `user_source_subscriptions?id=...` dominated the freshest `15m` and `60m` windows before the current write-throttling pass

g5) [have] Fresh post-Phase-2b measurement is now captured.
Reason:
- it showed subscription-write traffic down materially and re-ranked the remaining hotspots

g6) [have] Phase 4 queue helper tightening is shipped.
Reason:
- queue-read helpers were the cleanest remaining low-risk win
- multi-scope callers now honor the intended queue slice

g7) [have] Phase 5 first slice is shipped.
Reason:
- refresh state + refresh job scans were the next clearest avoidable bookkeeping churn

g7a) [todo] Re-measure the fresh `60m` / `24h` windows after the Phase 5 slice and decide whether refresh-state upsert narrowing or generation-trace slimming is the next better win.
Reason:
- the batched pending-check reduction is live, but the proof step is still pending

g8) [todo] Execute Phase 6 generation trace slimming after the queue/refresh tightenings.
Reason:
- trace writes are now visible in the fresh `60m` top paths, but they are less operationally sensitive than queue correctness

g9) [have] Phase 7 first slice is shipped.
Reason:
- the worker lease heartbeat is now materially less chatty by default while preserving the same lease-expiry model

g9a) [todo] Re-measure fresh `60m` / `24h` windows after the Phase 7 slice and decide whether more queue-maintenance narrowing or Phase 6 trace slimming is the better next win.
Reason:
- `touch_ingestion_job_lease` was still a visible hotspot before this heartbeat-cadence cut

g10) [todo] Keep Phase 8 running alongside the backend phases as verification/guardrails.

## Validation Boundaries
h1) [todo] After each phase, verify the affected hot path volume with the same Supabase history workflow used for the initial inspection.
h2) [todo] Do not mark a phase complete based only on code review; require a before/after request-pattern check.
h3) [todo] If a phase proves lower-impact than expected, keep the evidence and move to the next ranked hotspot rather than widening scope.
h4) [todo] If any reduction changes user-visible behavior, capture that explicitly and either revert or carry the UX change as a separately approved follow-up.

## Working Rule
i1) [have] This file is the current tracked implementation plan for egress reduction.
i2) [todo] Before each code phase, restate the focused implementation plan for that phase and wait for approval.
i3) [todo] Keep the proof tail and registry current as this plan moves from active to completed.
