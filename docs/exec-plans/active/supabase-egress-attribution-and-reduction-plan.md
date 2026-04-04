# Supabase Egress Attribution And Reduction Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-04` (source-items wave landed; next is product attribution split)

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

a3) [have] Current Supabase management analytics for the last `24h` show:
- total requests: `9,510`
- REST requests: `9,074`
- auth requests: `427`
- storage requests: `9`
- realtime requests: `0`

a4) [have] The first attribution sample from `scripts/supabase_rest_attribution_report.mjs` points primarily at backend service-role traffic, not browser traffic.

a5) [have] The latest post-deploy sample has shifted to a more mixed shape:
- `product_readwrite` / product-facing reads-writes are now a top bucket
- `blueprint_youtube_comments` is also separately visible
- `source_items`, `queue`, and `subscriptions` have all become smaller and closer together than before

a6) [have] The latest sample’s actor split is no longer purely backend-dominated:
- `backend_service_role` is still the majority
- but `frontend_authenticated` is now material enough that product-traffic attribution matters

a7) [todo] We now need a finer split of the old `product_readwrite` bucket before choosing the next reduction wave safely.

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

## Wave Order

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

e4) [todo] **Wave 4: `product_readwrite` attribution split**

Reason:
- `product_readwrite` is now the largest mixed bucket
- it combines frontend-authenticated and backend behavior
- cutting it blindly would be riskier than the backend-only waves

Primary files:
- [scripts/supabase_rest_attribution_report.mjs](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/scripts/supabase_rest_attribution_report.mjs)
- [src/hooks/useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/hooks/useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)
- [src/hooks/useBlueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintYoutubeComments.ts)

Target work:
- split `product_readwrite` into narrower families such as `blueprint_comments`, `blueprints`, `profiles`, `blueprint_likes`, and `blueprint_tags`
- map the hottest resulting endpoints back to exact UI/hooks
- choose one narrow reduction wave from that split instead of optimizing broad product traffic

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

e6) [todo] **Wave 5: `blueprint_youtube_comments` churn**

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

e7) [todo] **Wave 6: `source_item_unlocks` + `user_feed_items` cleanup**

Reason:
- important but narrower than the earlier systemic families
- better handled after queue/source-items/subscription churn and product/comment attribution are reduced

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

f1) [todo] Always start each wave with a short attribution snapshot and end with a second snapshot.

f2) [todo] Keep each wave narrow; do not mix multiple major families in one implementation pass unless attribution proves they are inseparable.

f3) [todo] Prefer editing existing Oracle-aware helpers before adding new abstractions.

f4) [todo] Preserve already-working runtime behavior unless a tradeoff is explicitly accepted.

f5) [todo] If a wave’s before/after measurement is inconclusive, pause and improve attribution rather than broadening the code changes.

## Verification

g1) [todo] For every wave, run:
- `npm run typecheck`
- targeted Vitest for the touched area
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`

g2) [todo] For every wave, record:
- `npm run ops:supabase-rest-attribution -- --json`
- optional `--full-range` if needed and practical

g3) [todo] For queue/runtime-sensitive waves, also run:
- `npm run ops:oracle-primary-check -- --json`

g4) [todo] Keep user-facing canaries aligned with the touched family:
- generation/queue for queue wave
- wall/source-page/profile for source-item wave
- subscription behavior for subscription wave
- unlock/wall for unlock/feed wave

## Exit Criteria

h1) [todo] This plan is complete when:
- queue, source-items, subscriptions, and unlock/feed waves have each been either reduced or explicitly judged not worth further tuning
- Supabase REST attribution is materially lower than the current baseline
- the remaining Supabase traffic is understood well enough to distinguish intentional compatibility traffic from avoidable churn

h2) [todo] After this plan, the next decision should be one of:
- stop because Supabase cost is now acceptable
- continue with one narrower residual cleanup plan
- or open a brand-new chapter if a different family becomes the dominant cost
