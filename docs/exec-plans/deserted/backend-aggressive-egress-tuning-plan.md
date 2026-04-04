# Backend Aggressive Egress Tuning Plan

Status: `on_pause`  
Owner: `Codex / David`  
Last updated: `2026-03-31`

## Purpose

Track the next aggressive-but-still-acceptable backend egress tuning pass now that the broader background cuts and the narrower frontend `P3` status trim are live.

This plan is currently paused while the team evaluates the next architectural direction around Oracle-owned control-plane state and migration-discovery work.

This plan targets the remaining dominant request buckets that still appear after the recent reductions:
- `ingestion_jobs`
- `claim_ingestion_jobs`
- `user_source_subscriptions`

## Current State

a1) [have] The app is still operating acceptably after the recent backend trims and runtime feature-off switches.

a2) [have] The latest `24h` snapshot is materially lower than the prior window:
- total requests: `8,112`
- `ingestion_jobs`: `2,730`
- `claim_ingestion_jobs`: `1,144`
- `user_source_subscriptions`: `665`
- `source_item_unlocks`: `667`

a3) [have] The old broad background churn is much lower now:
- `source_item_unlocks` dropped sharply
- `blueprint_youtube_refresh_state` dropped sharply
- `auto_banner_jobs` is nearly gone

a4) [have] The main remaining cost is now concentrated in queue/control-plane freshness behavior rather than broad optional surfaces.

a5) [have] The remaining strong levers are no longer “safe cleanup”; they are explicit timeliness/freshness tradeoffs.

## Goal

b1) [todo] Reduce the remaining dominant backend request buckets without hard-disabling core product systems.

b2) [todo] Preserve:
- subscription sync correctness
- queue claim correctness
- duplicate-prevention correctness
- basic reload/status restore behavior

b3) [todo] Accept:
- slower subscription freshness
- slower idle wake-up
- more cached admission decisions
- less eager status restore

## Planned Cuts

c1) [todo] **P1: throttle `all_active_subscriptions` breadth harder**
Primary file:
- [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Current behavior:
- `all_active_subscriptions` already prioritizes stale `last_polled_at`
- each run is breadth-limited, but the current cap still produces meaningful recurring reads

Target change:
- reduce the per-run cap below the current default `75`
- skip recently-polled subscriptions more aggressively
- preserve stale-first ordering

Goal:
- reduce `user_source_subscriptions` and related `ingestion_jobs` churn

Expected gain:
- high

Risk:
- medium

UX tradeoff:
- slower subscription freshness
- new content from followed channels may surface later

c2) [todo] **P2: back off `claim_ingestion_jobs` further**
Primary files:
- [queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)
- [ingestionQueue.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/ingestionQueue.ts)
- [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Current behavior:
- claim cadence already backs off at idle
- but `claim_ingestion_jobs` remains one of the largest remaining buckets

Target change:
- increase idle backoff again
- reduce low-priority sweep sizes further
- bias longer waits after repeated empty claim attempts

Goal:
- directly shrink `claim_ingestion_jobs`

Expected gain:
- medium-high

Risk:
- medium

UX tradeoff:
- slower pickup after quiet periods
- less instant wake-up from idle

c3) [todo] **P3: collapse duplicate `all_active_subscriptions` guard reads harder**
Primary files:
- [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [generationPreflight.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationPreflight.ts)

Current behavior:
- recent-job and queued/running guards still show up as the top exact `ingestion_jobs` shapes

Target change:
- replace the paired recent-job + queued/running checks with one more strongly cached admission decision where possible
- widen the guard cache window
- avoid paying both reads repeatedly in the same cadence window

Goal:
- shrink the top remaining `ingestion_jobs` exact shapes

Expected gain:
- high

Risk:
- medium

UX tradeoff:
- more stale duplicate-prevention decisions
- rougher “already running / recently queued” timing

c4) [todo] **P4: soften status restore one more step**
Primary files:
- [useSourceUnlockJobTracker.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSourceUnlockJobTracker.ts)
- [ingestion.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/ingestion.ts)
- [useSubscriptionsPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSubscriptionsPageController.ts)

Current behavior:
- status restore is already trimmed, but some low-steady status churn remains

Target change:
- lengthen stale windows further
- reduce restore/status reads again
- make more restore behavior explicit-only outside known active jobs

Goal:
- trim the remaining status chatter

Expected gain:
- medium

Risk:
- low-medium

UX tradeoff:
- reload/revisit restores less state automatically
- stale intermediate states can persist longer until the user re-engages

## Recommended Order

d1) [have] Best implementation order:
1. `P3` duplicate guard collapse
2. `P1` stronger subscription breadth throttle
3. `P2` claim-loop backoff
4. `P4` status restore softening

d2) [have] This order attacks the biggest exact remaining request shapes first.

d3) [have] This is an aggressive tuning pass, not a hard-disablement pass.

## Verification

e1) [todo] Run:
- `npm run typecheck`
- targeted worker/ingestion/status tests

e2) [todo] After deploy, compare the next `24h` window for:
- `claim_ingestion_jobs`
- `all_active_subscriptions` recent-job guard
- `all_active_subscriptions` queued/running guard
- `user_source_subscriptions`

e3) [todo] Watch product-side for:
- delayed subscription freshness
- slower idle wake-up
- more stale “already running” decisions
- weaker restore after reload

## Exit Criteria

f1) [todo] This plan is complete when:
- the `P1` to `P4` tuning slice lands and is production-verified
- the next `24h` measurement confirms whether the remaining dominant buckets moved materially
- a follow-up decision is made to either stop here, restore some smoothness, or pursue one narrower residual control-plane pass
