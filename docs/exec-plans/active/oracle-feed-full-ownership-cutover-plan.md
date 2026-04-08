# Oracle Feed Full Ownership Cutover Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-08`

## Purpose

Make Oracle the only normal operational feed system for Bleu.

This is not an “egress trim” plan and not a vague ownership exploration. It is a direct cutover plan with an explicit end state:
- Oracle owns feed insertion, feed upgrades, wall ordering, visibility state, and normal feed reads
- Supabase `user_feed_items` stops participating in normal runtime feed behavior
- no Oracle feed bootstrap/rehydration should accept stale Supabase feed truth back into runtime
- any remaining Supabase feed usage becomes temporary migration residue to delete, not a runtime dependency

This plan intentionally optimizes for decisiveness over prolonged incremental caution:
- the app is still in developer-mode tolerance
- short downtime/debugging pain is acceptable
- dual Oracle/Supabase feed state is likely a larger risk than a sharper single-owner cutover
- the goal is to materially reduce Supabase egress while simplifying feed correctness

## Explicit End State

a1) [todo] Oracle is the sole normal operational feed truth in runtime.

a2) [todo] Normal runtime feed behavior no longer depends on Supabase `user_feed_items` for:
- feed row insert/upsert
- locked-to-generated promotion
- wall ordering clocks
- wall/my-feed reads
- source-page feed linkage
- bootstrap/rehydration

a3) [todo] Feed correctness, ordering, and user-visible wall behavior remain intact through burn-in.

a4) [todo] Supabase `user_feed_items` stops doing normal runtime work; any residue is manual/historical only.

## Why This Plan Exists

b1) [have] Queue and unlocks are already functionally severed from Supabase normal runtime.

b2) [have] Current 24h sampled Supabase attribution is now dominated by feed and source-item activity:
- `feed` `47.3%`
- `source_items` `23.1%`

b3) [have] The current top feed-heavy endpoints are:
- `POST /rest/v1/user_feed_items?on_conflict`
- `GET /rest/v1/user_feed_items?source_item_id:eq&user_id:eq`
- `POST /rest/v1/user_feed_items`

b4) [have] That makes `feed` the clearest next ownership chapter if the goal is:
- further Supabase egress reduction
- less dual-state drift
- simpler runtime reasoning

## Current State

c1) [have] Oracle feed ledger is already present as a primary-mode Oracle state surface.

c2) [have] Feed behavior is still partially dual-state today:
- Oracle ledger/product state exists
- Supabase `user_feed_items` still drives meaningful runtime writes and reads

c3) [have] Feed is more product-facing than queue/unlocks, so cutover risk is higher in:
- wall ordering
- duplicate/missing cards
- locked vs generated transitions
- source-page/wall consistency

c4) [have] The current chapter question is no longer “should Oracle own another domain?”
- it is “can feed become Oracle-only without breaking the wall experience?”

## Scope Lock

d1) [todo] This plan is feed-only.

d2) [todo] Do not mix queue, unlocks, generation state, or source-item ownership into this chapter except where feed depends on them.

d3) [todo] Do not treat this as a generic Supabase cost pass.

d4) [todo] Focus on `user_feed_items` operational ownership and the read surfaces built on top of it.

## Main Files / Surfaces

e1) [have] Core feed ownership seams likely include:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/services/myFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/myFeed.ts)
- [server/routes/feed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/feed.ts)
- [server/services/oracleFeedLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleFeedLedgerState.ts)
- [server/services/oracleProductState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleProductState.ts)
- [src/lib/myFeedApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedApi.ts)
- [src/hooks/useWallPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useWallPageController.ts)

e2) [have] Main feed behaviors to sever from Supabase:
- feed row bootstrap/rehydration
- feed writes/upserts
- feed read/fallback paths
- wall ordering and timestamp resolution
- wall/my-feed/product reads that still depend on `user_feed_items`

## Fast Cutover Shape

f1) [have] Historical context:
- queue ownership cutover is completed
- unlock ownership cutover is completed
- feed is now the largest visible Supabase-owned operational surface

f2) [todo] This plan aims directly for:
- `Oracle-only operational feed path`

f3) [todo] Intermediate “Oracle-first but still normal-runtime Supabase feed writes/reads” is only an execution aid, not the desired resting state.

## Phase 0: One Fast Inventory

g1) [have] Enumerated every meaningful `user_feed_items` touchpoint and classified it as:
- runtime write
- runtime read
- ordering/display dependency
- product/UI dependency
- bootstrap/rehydration dependency
- removable residue

g2) [have] Primary files for the inventory:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/services/myFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/myFeed.ts)
- [server/routes/feed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/feed.ts)
- [src/lib/myFeedApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedApi.ts)
- [src/hooks/useWallPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useWallPageController.ts)
- [server/services/oracleFeedLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleFeedLedgerState.ts)
- [server/services/oracleProductState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleProductState.ts)

g3) [have] Output:
- one explicit remove/replace decision per remaining `user_feed_items` touchpoint

## Phase 1: Stop Supabase Feed Rehydration

h1) [have] Oracle feed bootstrap/rehydration no longer accepts Supabase `user_feed_items` as authoritative input.

h2) [have] Landed in this wave:
- stop Oracle feed bootstrap from accepting stale Supabase feed rows as input
- stop Oracle product-feed bootstrap from sourcing feed rows from `user_feed_items`
- keep Oracle feed ledger + Oracle product state as the only accepted bootstrap/runtime inputs

h3) [have] This is the first decisive cut because it removes the most harmful dual-state input before all other feed severing.

## Phase 2: Oracle-Only Feed Writes

i1) [todo] Remove remaining normal-runtime Supabase feed writes from the main insert/upsert seams.

i2) [todo] Land in this wave:
- locked feed insert stays Oracle-only
- generated promotion/update stays Oracle-only
- feed ordering timestamps are persisted Oracle-only
- no normal runtime `POST/PATCH /rest/v1/user_feed_items...`

i3) [todo] After this phase, Supabase feed shadow should no longer matter to feed mutation correctness.

## Phase 3: Oracle-Only Feed Reads

j1) [todo] Remove remaining normal-runtime Supabase feed reads and read fallbacks from wall/my-feed/product surfaces.

j2) [todo] Land in this wave:
- wall reads Oracle feed state only
- my-feed reads Oracle feed state only
- product/read shaping no longer requires `user_feed_items`
- browser/server feed consumers stop depending on direct Supabase feed reads

j3) [todo] After this phase, Supabase feed rows should no longer matter to normal runtime feed read correctness.

## Phase 4: Short Burn-In / Canary

k1) [todo] Prove Oracle-only feed behavior under:
- new locked card arrival
- locked-to-generated promotion
- two-clock ordering
- wall refresh
- my-feed refresh
- source-page/wall consistency
- duplicate suppression

k2) [todo] Success target:
- no duplicate or missing feed rows
- no ordering regressions
- no stale locked/generated display drift
- no hidden Supabase feed dependency surfacing in logs or route behavior

## Phase 5: Cleanup And Closure

l1) [todo] Remove the remaining meaningful Supabase feed compatibility/product-read residue from active runtime surfaces and sync canonical docs to the final Oracle-owned posture.

l2) [todo] Move this plan to `completed/` once:
- Supabase feed runtime work is zero
- no rehydration remains
- burn-in evidence is accepted

## Proof Gates

m1) [todo] Required proof before declaring feed cutover complete:
- Oracle primary check green
- public/local health green
- wall/my-feed still render correctly
- locked-to-generated promotion still behaves correctly
- no duplicate feed rows
- source-page and wall remain consistent

m2) [todo] Required proof before closing the chapter:
- at least one meaningful burn-in window
- no unresolved feed correctness regressions
- Supabase attribution shows feed-related work materially reduced

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring dual-state feed runtime.

n2) [todo] Any emergency rollback should be an explicit code change, not a hidden long-lived compatibility toggle.

## Success Criteria

o1) [todo] Oracle fully owns normal feed operations in runtime.

o2) [todo] Supabase `user_feed_items` no longer does normal runtime work.

o3) [todo] Feed ordering and wall behavior remain correct through burn-in.

o4) [todo] Supabase egress drops materially because the current top feed-heavy endpoints are removed from normal runtime.

## Relationship To Paused/Completed Chapters

p1) [have] The broader Oracle-ownership chapter remains paused as context:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-deeper-ownership-and-supabase-reduction-plan.md)

p2) [have] Queue and unlock full-ownership chapters are completed context:
- [oracle-queue-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-queue-full-ownership-cutover-plan.md)
- [oracle-unlock-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-unlock-full-ownership-cutover-plan.md)

p3) [have] This feed plan is the next explicit child chapter for one sharper destination:
- full Oracle feed ownership
