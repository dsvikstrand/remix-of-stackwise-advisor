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

## Latest Measurement Snapshot
e0) [have] Fresh lagged request-history export was regenerated at `2026-03-19T11:42:38.888Z`.
e00) [have] Freshest `15m` top normalized paths are now:
- `925` :: `/rest/v1/user_source_subscriptions?id=eq.:long`
- `155` :: `/rest/v1/rpc/claim_ingestion_jobs`
- `104` :: `/auth/v1/user`
- `57` :: `/rest/v1/ingestion_jobs?limit=:int&order=created_at.desc&requested_by_user_id=eq.:long&select=:long&status=in.(queued,running)`
- `32` :: `/rest/v1/user_feed_items?source_item_id=:long`
- `32` :: `/rest/v1/user_feed_items?blueprint_id=is.null&select=id&source_item_id=in.(...)&state=in.(...)`
e01) [have] Freshest `60m` top normalized paths are now:
- `3700` :: `/rest/v1/user_source_subscriptions?id=eq.:long`
- `1542` :: `/rest/v1/rpc/claim_ingestion_jobs`
- `484` :: `/rest/v1/source_item_unlocks?limit=:int&order=updated_at.asc&select=:long&status=eq.processing`
- `484` :: `/rest/v1/source_item_unlocks?limit=:int&or=:long&order=updated_at.desc&select=source_item_id,transcript_status,last_error_code,updated_at`
- `481` :: `/rest/v1/user_feed_items?source_item_id=:long`
- `481` :: `/rest/v1/user_feed_items?blueprint_id=is.null&select=id&source_item_id=in.(...)&state=in.(...)`
e02) [have] Fresh `60m` top request families are now:
- `3737` subscription checks
- `1542` unlock queue claim
- `1009` unlock state reads
- `1002` feed suppression writes
e03) [have] The long-window `24h` and `6h` snapshots are still dominated by feed suppression because they include a large amount of pre-Phase-1b history.
e04) [have] In the freshest measured windows, `user_source_subscriptions?id=...` writes are now the dominant hotspot.
e05) [have] Feed suppression remains present, but it is no longer the dominant short-window family after the Phase 1b suppression cooldown + sweep cadence change.
e06) [have] `claim_ingestion_jobs` remains materially noisy and is still above feed suppression in the fresh `60m` window, but it is now clearly behind subscription writes.
e07) [have] The newest hotspot order suggests the next safest high-value code phase is a narrow Phase 2b on subscription write reduction, not another broad feed-suppression rewrite.

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
f4) [todo] Phase 4: reduce queue-maintenance chatter around leases and queue-depth checks.
- primary files:
  - `server/services/ingestionQueue.ts`
  - `server/index.ts`
- target functions:
  - `touchIngestionJobLease(...)`
  - queue depth / queued-work counting helpers
- implementation direction:
  - slow lease-heartbeat frequency if current safety margin allows
  - avoid repeated queue-depth/count queries when no caller actually needs fresh values
- acceptance:
  - fewer background queue-maintenance requests without increasing stale-lease failures
f5) [todo] Phase 5: keep frontend list surfaces lean and verify no UX regressions after the recent slimming pass.
- primary files:
  - `src/hooks/useBlueprintSearch.ts`
  - `src/hooks/useExploreSearch.ts`
  - `src/hooks/useMyFeed.ts`
  - `src/hooks/useChannelFeed.ts`
  - `server/services/wallFeed.ts`
- implementation direction:
  - treat the recent `preview_summary`/lean-query changes as the frontend baseline
  - only reintroduce heavy fields if a specific UX dependency is proven
  - visually verify Wall/Search/Explore/My Feed/Channel still look the same
- acceptance:
  - list surfaces remain visually stable
  - frontend does not regress back toward full `sections_json` list payloads
f6) [todo] Phase 6: add lightweight proof and tracking for the reduction.
- primary files:
  - `docs/exec-plans/active/tail/mvp-launch-proof-tail.md` if ongoing proof needs to be carried forward
  - Supabase SQL/ops notes only if needed
- implementation direction:
  - compare before/after request-history hotspots
  - inspect `public.blueprint_generation_daily` and recent Supabase usage panel trends
  - record the new steady-state request patterns after each major backend reduction
- acceptance:
  - the repo has a durable record of which change reduced which hot path
  - follow-up work is driven by observed remaining hotspots, not guesswork

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

g5) [todo] Re-measure after Phase 2b, then choose between Phase 4 queue-maintenance chatter reduction and any narrower feed-suppression cleanup.
Reason:
- fresh measurement now matters more than the original ranking

g6) [todo] Keep Phase 5 and Phase 6 running alongside the backend phases as verification/guardrails.

## Validation Boundaries
h1) [todo] After each phase, verify the affected hot path volume with the same Supabase history workflow used for the initial inspection.
h2) [todo] Do not mark a phase complete based only on code review; require a before/after request-pattern check.
h3) [todo] If a phase proves lower-impact than expected, keep the evidence and move to the next ranked hotspot rather than widening scope.
h4) [todo] If any reduction changes user-visible behavior, capture that explicitly and either revert or carry the UX change as a separately approved follow-up.

## Working Rule
i1) [have] This file is the current tracked implementation plan for egress reduction.
i2) [todo] Before each code phase, restate the focused implementation plan for that phase and wait for approval.
i3) [todo] Keep the proof tail and registry current as this plan moves from active to completed.
