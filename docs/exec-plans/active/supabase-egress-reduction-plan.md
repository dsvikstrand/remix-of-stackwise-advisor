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
d1) [have] The current biggest backend egress suspect is the transcript/feed suppression sweep pattern in `server/index.ts`, which appears to patch `user_feed_items` one `source_item_id` at a time.
d2) [have] That pattern lines up with the hottest normalized path observed in the recent Supabase request history:
- `PATCH /rest/v1/user_feed_items?...source_item_id=...`
d3) [have] Repeated active-subscriber counting and subscription lookups appear to be re-asking the same `user_source_subscriptions` questions many times inside backend loops.
d4) [have] `claim_ingestion_jobs` traffic appears too frequent for the amount of real work happening, which suggests idle/backoff behavior needs tightening.
d5) [have] Frontend overfetch still matters, but it no longer looks like the dominant current source after the recent list-payload slimming pass.

## Latest Measurement Snapshot
e0) [have] Fresh short-window request-history export was regenerated at `2026-03-19T10:44:30.683Z`.
e00) [have] Post-deploy `15m` top normalized paths are now:
- `2398` :: `/rest/v1/user_feed_items?blueprint_id=is.null&select=id&source_item_id=:long&state=:long`
- `925` :: `/rest/v1/user_source_subscriptions?id=:long`
- `746` :: `/rest/v1/user_source_subscriptions?is_active=eq.true&select=id&source_page_id=:long`
- `555` :: `/rest/v1/rpc/claim_ingestion_jobs`
e01) [have] Post-deploy `60m` top normalized paths are now:
- `22315` :: `/rest/v1/user_feed_items?blueprint_id=is.null&select=id&source_item_id=:long&state=:long`
- `3696` :: `/rest/v1/user_source_subscriptions?id=:long`
- `3520` :: `/rest/v1/user_source_subscriptions?is_active=eq.true&select=id&source_page_id=:long`
- `1195` :: `/rest/v1/rpc/claim_ingestion_jobs`
e02) [have] The feed-suppression bulk path is definitely live now; the sampled `user_feed_items` request URL shows `source_item_id=in.(...)` rather than only single-item `eq.` updates.
e03) [have] Even after the shipped reductions, `user_feed_items` suppression remains the dominant current hotspot.
e04) [have] `user_source_subscriptions` traffic remains the next largest family, but the remaining `PATCH ...id=...` writes are now likely tied to subscription checkpoint/health semantics rather than the redundant count-read path already removed.
e05) [have] `claim_ingestion_jobs` is still meaningfully noisy, but it is now clearly behind feed suppression and subscription traffic in the short post-deploy windows.

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
   - follow-up is still needed because feed suppression remains the top live hotspot
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
   - the remaining `PATCH ...id=...` traffic still needs a narrower follow-up pass because it is likely coupled to subscription health/checkpoint updates
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
g1) [todo] Implement Phase 1 first.
Reason:
- it targets the hottest current request family and likely offers the biggest single drop

g2) [todo] Implement Phase 2 second.
Reason:
- subscription read/write churn is the next clearest backend multiplier

g3) [todo] Implement Phase 3 third.
Reason:
- queue-claim volume is a strong background contributor and should be easy to prove after Phase 1-2

g4) [todo] Implement Phase 4 fourth.
Reason:
- lease/count chatter matters, but likely less than the first three phases

g5) [todo] Keep Phase 5 and Phase 6 running alongside the backend phases as verification/guardrails.
g6) [have] Based on the latest short-window snapshot, the next safest high-value code phase is still either:
- more targeted feed-suppression reduction
- or queue-claim idle backoff
Reason:
- the remaining `user_source_subscriptions?id=...` writes appear more likely to be tied to intended checkpoint/health behavior and therefore need a narrower design pass before changing them

## Validation Boundaries
h1) [todo] After each phase, verify the affected hot path volume with the same Supabase history workflow used for the initial inspection.
h2) [todo] Do not mark a phase complete based only on code review; require a before/after request-pattern check.
h3) [todo] If a phase proves lower-impact than expected, keep the evidence and move to the next ranked hotspot rather than widening scope.
h4) [todo] If any reduction changes user-visible behavior, capture that explicitly and either revert or carry the UX change as a separately approved follow-up.

## Working Rule
i1) [have] This file is the current tracked implementation plan for egress reduction.
i2) [todo] Before each code phase, restate the focused implementation plan for that phase and wait for approval.
i3) [todo] Keep the proof tail and registry current as this plan moves from active to completed.
