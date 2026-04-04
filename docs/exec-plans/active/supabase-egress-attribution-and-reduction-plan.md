# Supabase Egress Attribution And Reduction Plan

Status: `active`  
Owner: `Codex / David`  
Last updated: `2026-04-04`

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

a5) [have] The latest sample’s top backend REST families are currently:
- queue / `ingestion_jobs`
- `source_items`
- `user_source_subscriptions`
- `source_item_unlocks`
- `user_feed_items`

a6) [have] The latest sample’s actor split is effectively:
- `backend_service_role`: dominant

a7) [todo] We still need fuller attribution over time, but we already have enough signal to start a narrow first reduction wave.

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

c4) [todo] Do not mix frontend read-surface tuning into the first backend wave unless attribution shows browser traffic is a first-order driver again.

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

e1) [todo] **Wave 1: queue / `ingestion_jobs`**

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

e2) [todo] **Wave 2: `source_items` compatibility/fallback/shadow traffic**

Reason:
- likely the next broad backend read surface after queue
- source-item compatibility/fallback reads can be expensive and frequent

Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/oracleSourceItemLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleSourceItemLedgerState.ts)
- [server/services/blueprintAvailability.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintAvailability.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/services/profileHistory.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/profileHistory.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)

Target work:
- narrow remaining Supabase source-item fallback reads
- trim compatibility reads that are no longer needed in Oracle-primary
- keep only explicit recovery/error fallbacks

Acceptance:
- sampled `source_items` family drops
- wall/profile/source-page flows stay correct

e3) [todo] **Wave 3: `user_source_subscriptions` churn**

Reason:
- historically noisy and patch-heavy
- likely still a meaningful backend cost family after queue/source-items

Primary files:
- [server/services/sourceSubscriptionSync.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts)
- [server/services/sourceUnlocks.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceUnlocks.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Target work:
- trim repeated existence/count/checkpoint reads
- skip no-op subscription patches more aggressively
- keep subscription behavior intact while lowering write churn

Acceptance:
- sampled `user_source_subscriptions` read/write share drops
- no subscription freshness/correctness regression beyond accepted tradeoffs

e4) [todo] **Wave 4: `source_item_unlocks` + `user_feed_items` cleanup**

Reason:
- important but narrower than the earlier systemic families
- better handled after queue/source-items/subscription churn are reduced

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
