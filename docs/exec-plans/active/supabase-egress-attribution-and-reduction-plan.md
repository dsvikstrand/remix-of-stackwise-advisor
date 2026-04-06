# Supabase Egress Attribution And Reduction Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-06` (subscription part 4 + source-items part 2 soaked; next targets reordered from live attribution)

## Purpose

Track the next post-migration Supabase egress reduction chapter now that Oracle owns the hot runtime/product truth and the remaining problem is cost attribution plus compatibility/shadow/fallback churn.

This plan is intentionally evidence-first:
- measure current Supabase REST traffic
- reduce the highest-impact backend family one wave at a time
- re-measure after every wave before widening scope

## Current State

a1) [have] Oracle is now primary for the major hot runtime/product surfaces:
- queue ledger
- subscription ledger
- unlock ledger
- feed ledger
- source-item ledger
- generation execution state

a2) [have] The recent Oracle migration chapter is complete enough that the next work is no longer migration correctness.

a3) [have] The latest April 6 live management analytics for the last `24h` now show a much lower steady-state window than the earlier migration-heavy periods:
- total requests: `4,563`
- REST requests: `4,342`
- auth requests: `208`
- storage requests: `13`
- realtime requests: `0`

a4) [have] The attribution chapter has already completed several landed cleanup waves:
- queue reduction wave
- queue follow-up wave
- subscription reduction waves through part 4
- source-item reduction waves through part 2
- product-readwrite attribution split

a5) [have] The latest sampled attribution window is now mixed and no longer dominated by the older subscription hotspot:
- `blueprint_youtube_comments` `10.6%`
- `profiles` `10.6%`
- `source_items` `9.4%`
- `blueprint_comments` `8.2%`

a6) [have] The current actor split is also mixed:
- `backend_service_role` `49.4%`
- `frontend_authenticated` `34.1%`
- `frontend_unknown_role` `7.1%`

a7) [have] The old `product_readwrite` bucket has already been split into narrower families in the attribution tool, so product-facing traffic is now visible as concrete families rather than one catch-all bucket.

a8) [have] The current live read means the plan is still active, but its next-wave order has changed:
- `subscriptions` is no longer the dominant steady-state family
- `source_items` is smaller than before but still visible
- `blueprint_youtube_comments`, `profiles`, and `blueprint_comments` are now the leading candidate families

## Goal

b1) [todo] Reduce Supabase REST traffic materially without regressing the now-stable Oracle-primary runtime.

b2) [todo] Keep user-facing behavior intact:
- interactive generation remains fast
- subscription sync remains functional
- wall/feed/source-page behavior remains stable

b3) [todo] Treat this as a measured cleanup chapter, not a new deep migration chapter.

## Scope Lock

c1) [todo] Focus on Supabase REST attribution and reduction only.

c2) [todo] Prefer shrinking compatibility/shadow/fallback traffic before inventing new storage surfaces or major architecture changes.

c3) [todo] Work one backend family at a time so before/after measurement stays interpretable.

c4) [todo] Do not change mixed frontend/product traffic blindly; split attribution first, then target one clear subfamily.

## Measurement Baseline

d1) [have] The canonical measurement tool for this chapter is:
- [scripts/supabase_rest_attribution_report.mjs](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/scripts/supabase_rest_attribution_report.mjs)

d2) [have] Canonical runbook note is:
- [docs/ops/yt2bp_runbook.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/ops/yt2bp_runbook.md)

d3) [have] Baseline commands:
- `npm run ops:supabase-rest-attribution -- --json`
- `npm run ops:supabase-rest-attribution -- --json --full-range`

d4) [have] Interpretation rules:
- `backend_service_role` heavy traffic usually means Oracle backend compatibility/shadow/fallback/ops traffic
- browser-auth/browser-anon traffic would indicate direct frontend Supabase usage
- top path/family ranking determines wave order

d5) [todo] Re-run the attribution report after each wave and record whether the targeted family actually moved.

## Completed Waves

e1) [have] **Wave 1: queue / `ingestion_jobs`**

Reason:
- top current backend family in the attribution sample
- likely repetitive and high-frequency
- best first before/after signal

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)
- [server/services/oracleQueueClaimGovernor.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleQueueClaimGovernor.ts)
- [server/services/oracleQueueSweepScheduler.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleQueueSweepScheduler.ts)
- [server/routes/ingestion.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/ingestion.ts)
- [server/handlers/opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)

Target work:
- remove redundant Supabase queue reads where Oracle already has the answer
- reduce no-op queue shadow writes
- collapse duplicate queue checks inside one execution path
- add lightweight queue attribution tags in logs

Acceptance:
- sampled `ingestion_jobs` share drops
- no slowdown in interactive queue behavior
- no queue correctness regressions

e2) [have] **Wave 2: `user_source_subscriptions` churn**

Reason:
- subscriptions became the top sampled backend family after the first queue wave
- the remaining hot shapes were mainly `GET` by `user/channel` or `id:in` plus `PATCH /user_source_subscriptions?id:eq`

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/sourceSubscriptionSync.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts)
- [server/services/oracleSubscriptionLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleSubscriptionLedgerState.ts)
- [server/handlers/sourceSubscriptionsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourceSubscriptionsHandlers.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)

Landed scope:
- Oracle-first batch hydration by subscription `id` for due-batch sync and manual refresh paths
- Oracle-first active-user fan-out for source-page/channel subscriber attach and auto-unlock eligibility
- no-op Supabase compatibility writes now skip unchanged material fields and log `subscription_shadow_write_skipped`
- remaining Supabase rereads stay attributable through `subscription_fallback_read`

Acceptance:
- sampled `user_source_subscriptions` share should drop without regressing source-page subscription state, sync, or manual refresh checkpoint behavior

e3) [have] **Wave 3: `source_items` compatibility/fallback/shadow traffic**

Reason:
- likely the next broad backend read surface after queue/subscriptions
- source-item compatibility/fallback reads can still be expensive and frequent

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/oracleSourceItemLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleSourceItemLedgerState.ts)
- [server/services/blueprintAvailability.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintAvailability.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/services/profileHistory.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/profileHistory.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)

Landed scope:
- Oracle-primary source-item reads now treat empty Oracle results as authoritative for hot by-id / by-canonical-key / by-video-id and batch hydration paths
- unchanged Supabase `source_items` compatibility rows now skip no-op updates
- remaining source-item compatibility rereads are attributable through `source_item_fallback_read`

Acceptance:
- sampled `source_items` family drops
- wall/profile/source-page flows stay correct

e4) [have] **Wave 4: `product_readwrite` attribution split**

Reason:
- product-facing reads/writes had become the largest mixed bucket
- it combined frontend-authenticated and backend behavior
- cutting it blindly would have been riskier than the backend-only waves

Primary files:
- [scripts/supabase_rest_attribution_report.mjs](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/scripts/supabase_rest_attribution_report.mjs)
- [src/hooks/useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/hooks/useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)
- [src/hooks/useBlueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintYoutubeComments.ts)

Landed scope:
- split `product_readwrite` into narrower families such as `blueprint_comments`, `blueprints`, `profiles`, `blueprint_likes`, and `blueprint_tags`
- made the attribution output concrete enough to distinguish mixed frontend/product traffic from backend churn
- let later wave-order decisions follow the new family split instead of the old catch-all bucket

Acceptance:
- the attribution report no longer hides top product traffic behind one catch-all family
- the next reduction wave can be chosen from concrete evidence

e5) [have] **Queue follow-up: part 2**

Reason:
- queue remained a top backend service-role family after the first queue + subscription passes

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Landed scope:
- claim-to-`running` queue transitions now skip the Supabase `ingestion_jobs` compatibility upsert in queue-ledger `primary`
- queue fallback logging now also covers latest-for-user, active-for-user, refresh-pending dedupe, unlock-job lookup, and retry-dedupe paths

Verification:
- `npm run typecheck`
- focused Vitest around queue/ops/source-page/unlock paths
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`

e6) [have] **Subscription follow-up waves: parts 3 and 4**

Reason:
- after the first subscription pass, the remaining dominant shape became `PATCH /rest/v1/user_source_subscriptions?id:eq&user_id:eq`
- this required a narrower write-churn cleanup instead of broad subscription reread work

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/sourceSubscriptionSync.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts)
- [server/services/subscriptionShadowPolicy.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/subscriptionShadowPolicy.ts)

Landed scope:
- normal compatibility updates prefer direct `id + user_id` writes before broader rereads
- callers that already have the Oracle/current row pass it through instead of reloading the same subscription again
- Oracle-primary sync/checkpoint/error-only updates now skip the Supabase shadow write when they only change hot operational fields

Acceptance:
- the former `PATCH /rest/v1/user_source_subscriptions?id:eq&user_id:eq` hotspot is no longer the dominant family in the latest soaked sample

e7) [have] **Source-items follow-up: part 2**

Reason:
- after subscription cleanup, `source_items` rose again as the top backend family
- the remaining cost still showed repeated by-id / by-canonical-key read and write-path churn

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/sourceItemShadowPolicy.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceItemShadowPolicy.ts)

Landed scope:
- Oracle-primary source-item writes no longer reread Supabase `source_items` by `id` and `canonical_key` before every shadow write
- compatibility updates now go by durable `id` first
- canonical-key reload is reserved for the conflict fallback path
- no-op source-item shadow writes can skip earlier when Oracle already has the current row

Acceptance:
- `source_items` is still visible, but it is no longer the clear dominant problem family

## Next Candidate Waves

f1) [have] **Candidate 1: `blueprint_youtube_comments` churn**

Reason:
- it is now visible as its own family in recent attribution
- likely driven by refresh delete/reinsert behavior and repeated reads
- easier to isolate than the broader product bucket once Wave 4 lands

Primary files:
- [src/hooks/useBlueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintYoutubeComments.ts)
- [server/services/blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts)
- [server/services/blueprintCreation.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintCreation.ts)

Target work:
- inspect whether comment refresh is rewriting rows unnecessarily
- reduce avoidable delete/reinsert churn if the fetched comment set is unchanged
- preserve current blueprint comment UX and refresh semantics

Acceptance:
- sampled `blueprint_youtube_comments` traffic drops
- comment refresh behavior stays correct

Update:
- unchanged refresh snapshots now skip the `blueprint_youtube_comments` delete/reinsert cycle entirely and emit explicit changed/skipped refresh logs

f1a) [have] **Queue write-churn follow-up**

Reason:
- the post-comments soak now shows queue back on top, with the remaining heat concentrated in `POST /rest/v1/ingestion_jobs?on_conflict` and `POST /rest/v1/ingestion_jobs`

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/queueShadowPolicy.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queueShadowPolicy.ts)

Landed scope:
- queue-ledger primary compatibility writes now update existing `ingestion_jobs` rows by durable `id` first
- Supabase insert is now reserved for real shadow misses instead of every existing-row transition taking the `on_conflict` path

Acceptance:
- sampled `POST /rest/v1/ingestion_jobs?on_conflict` traffic drops
- queue behavior stays unchanged

f2) [todo] **Candidate 2: `profiles` read attribution / reduction**

Reason:
- `profiles` is now tied for the top sampled family
- a meaningful part of it is frontend-authenticated traffic, so it should not be cut blindly
- this is the clearest reader-facing follow-up after the product bucket split

Primary files:
- [src/hooks/useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)
- profile-related readers under [src](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src)

Target work:
- confirm whether the current `profiles` traffic is legitimate page data, duplicate fetches, or avoidable invalidation churn
- only then choose a narrow read-surface reduction

Acceptance:
- the team can distinguish valid profile reads from avoidable repeat traffic before any UI-facing cut is made

f3) [todo] **Candidate 3: residual `source_items` follow-up**

Reason:
- `source_items` remains visible in the current sample
- the top lingering shapes are now smaller, so any further source-item work should be based on a fresh narrow read of the exact remaining endpoints

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/oracleSourceItemLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleSourceItemLedgerState.ts)

Target work:
- re-measure the remaining by-id / by-canonical-key shapes after the latest soak
- only open another source-item wave if they clearly rise back above the new mixed product/comment families

Acceptance:
- any new source-item work is evidence-backed instead of reopening that family by default

f4) [todo] **Candidate 4: `source_item_unlocks` + `user_feed_items` cleanup**

Reason:
- important but narrower than the earlier systemic families
- better handled after the current comments/profile/source-item next-candidate set is clarified

Primary files:
- [server/services/sourceUnlocks.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceUnlocks.ts)
- [server/services/blueprintAvailability.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintAvailability.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/services/profileHistory.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/profileHistory.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Target work:
- reduce repeated unlock-state lookups
- remove avoidable feed-row compatibility churn
- preserve wall/home/profile semantics

Acceptance:
- sampled unlock/feed family traffic drops
- no regressions in unlock state or wall rendering

## Execution Rules

g1) [todo] Always start each wave with a short attribution snapshot and end with a second snapshot.

g2) [todo] Keep each wave narrow; do not mix multiple major families in one implementation pass unless attribution proves they are inseparable.

g3) [todo] Prefer editing existing Oracle-aware helpers before adding new abstractions.

g4) [todo] Preserve already-working runtime behavior unless a tradeoff is explicitly accepted.

g5) [todo] If a wave’s before/after measurement is inconclusive, pause and improve attribution rather than broadening the code changes.

## Verification

h1) [todo] For every wave, run:
- `npm run typecheck`
- targeted Vitest for the touched area
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`

h2) [todo] For every wave, record:
- `npm run ops:supabase-rest-attribution -- --json`
- optional `--full-range` if needed and practical

h3) [todo] For queue/runtime-sensitive waves, also run:
- `npm run ops:oracle-primary-check -- --json`

h4) [todo] Keep user-facing canaries aligned with the touched family:
- generation/queue for queue wave
- wall/source-page/profile for source-item wave
- subscription behavior for subscription wave
- unlock/wall for unlock/feed wave

## Exit Criteria

i1) [todo] This plan is complete when:
- queue, source-items, subscriptions, and unlock/feed waves have each been either reduced or explicitly judged not worth further tuning
- Supabase REST attribution is materially lower than the earlier migration-heavy baseline and the remaining top families are understood
- the remaining Supabase traffic is understood well enough to distinguish intentional compatibility traffic from avoidable churn

i2) [todo] After this plan, the next decision should be one of:
- stop because Supabase cost is now acceptable
- continue with one narrower residual cleanup plan
- or open a brand-new chapter if a different family becomes the dominant cost
