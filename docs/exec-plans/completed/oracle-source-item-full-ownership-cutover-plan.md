# Oracle Source Item Full Ownership Cutover Plan

Status: `completed`
Owner: `Codex / David`
Last updated: `2026-04-09`

## Purpose

Make Oracle the only normal operational source-item system for Bleu.

This is not a generic egress trim and not a partial Oracle-first balancing pass. It is a direct cutover plan with an explicit end state:
- Oracle owns source-item insertion, metadata updates, source-page linkage, thumbnail/channel attribution, and normal source-item reads
- Supabase `source_items` stops participating in normal runtime source-item behavior
- no Oracle source-item bootstrap/rehydration should accept stale Supabase source-item truth back into runtime
- any remaining Supabase `source_items` usage becomes migration residue to delete, not a steady-state dependency

This chapter follows the same lesson learned from queue, unlocks, and feed:
- dual Oracle/Supabase runtime state is more bug-prone than a clean single-owner model
- the app is still in developer-mode tolerance
- short debug pain is acceptable when it buys simpler long-term runtime ownership

## Explicit End State

a1) [have] Oracle is the sole normal operational source-item truth in runtime.

a2) [have] Normal runtime source-item behavior no longer depends on Supabase `source_items` for:
- source-item insert/upsert
- metadata/view-count/thumbnail updates
- source-page feed and video-library hydration
- wall/profile/blueprint-detail source attribution
- bootstrap/rehydration

a3) [have] Source attribution, thumbnails, and source-page consistency remained intact through burn-in.

a4) [have] Supabase `source_items` stopped doing normal runtime work; any residue is manual/historical only.

## Why This Plan Exists

b1) [have] Queue and unlocks are completed Oracle-only ownership chapters.

b2) [have] Feed is now in burn-in after the main Oracle-only write/read cutover.

b3) [have] Current 24h sampled Supabase attribution is still heavily backend-driven by source-item traffic:
- `source_items` remains one of the top remaining families

b4) [have] Current top residual source-item-heavy endpoints include:
- `PATCH /rest/v1/source_items?id:eq`
- `POST /rest/v1/source_items`
- `GET /rest/v1/source_items`

b5) [have] That makes `source_items` the clearest next ownership chapter if the goal is:
- further Supabase egress reduction
- less dual-state drift
- simpler source attribution/runtime reasoning

## Current State

c1) [have] Oracle source-item ledger already exists and is live behind `ORACLE_SOURCE_ITEM_LEDGER_MODE`.

c2) [have] `ORACLE_SOURCE_ITEM_LEDGER_MODE=primary` is already available and Oracle-first source-item reads/writes are partially staged.

c3) [have] Current runtime already treats empty Oracle results as authoritative for several hot source-item lookups and skips many no-op Supabase compatibility writes.

c4) [have] The remaining problem is not “Oracle cannot own source items.”
- it is that Supabase `source_items` still participates in enough normal runtime paths to keep egress and dual-state complexity alive

c5) [have] Source-item cutover risk is product-visible in:
- wall/source-page/profile source attribution
- thumbnail and source-channel metadata
- blueprint detail source linkage
- duplicate/in-progress source-page video-library behavior

## Scope Lock

d1) [todo] This plan is source-items only.

d2) [todo] Do not mix queue, unlocks, or feed ownership into this chapter except where source-item reads/writes are a hard dependency.

d3) [todo] Do not treat this as a general frontend query cleanup pass.

d4) [todo] Focus on `source_items` operational ownership and the read surfaces built on top of it.

## Main Files / Surfaces

e1) [have] Core source-item ownership seams likely include:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/oracleSourceItemLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleSourceItemLedgerState.ts)
- [server/services/oracleProductState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleProductState.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/profileHistory.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/profileHistory.ts)
- [server/services/blueprintAvailability.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintAvailability.ts)
- [src/lib/myFeedData.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedData.ts)
- [src/lib/myFeedApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedApi.ts)
- [src/hooks/useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)
- [src/pages/BlueprintDetail.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/pages/BlueprintDetail.tsx)

e2) [have] Main source-item behaviors to sever from Supabase:
- source-item bootstrap/rehydration
- source-item writes/upserts
- source-item metadata/view-count updates
- wall/profile/source-page/detail source reads
- compatibility rereads and fallback paths

## Fast Cutover Shape

f1) [have] Historical context:
- queue ownership cutover is completed
- unlock ownership cutover is completed
- feed ownership cutover is in burn-in
- source-items are now the next large backend-owned Supabase surface

f2) [todo] This plan aims directly for:
- `Oracle-only operational source-item path`

f3) [todo] Intermediate “Oracle-first but still normal-runtime Supabase source-item participation” is only an execution aid, not the desired resting state.

## Phase 0: One Fast Inventory

g1) [have] Enumerated every meaningful `source_items` touchpoint and classified it as:
- runtime write
- runtime read
- metadata update dependency
- product/UI dependency
- bootstrap/rehydration dependency
- removable residue

g2) [have] Primary files for the inventory:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/oracleSourceItemLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleSourceItemLedgerState.ts)
- [server/services/oracleProductState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleProductState.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/profileHistory.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/profileHistory.ts)
- [src/lib/myFeedData.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedData.ts)
- [src/hooks/useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)
- [src/pages/BlueprintDetail.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/pages/BlueprintDetail.tsx)

g3) [have] Output:
- one explicit remove/replace decision per remaining `source_items` touchpoint

## Phase 1: Stop Supabase Source-Item Rehydration / Residual Input

h1) [have] Removed the main Oracle source-item bootstrap/rehydration input that still accepted Supabase `source_items` as authoritative runtime input.

h2) [have] Landed in this wave:
- Oracle source-item bootstrap keeps durable truth from Oracle source-item ledger state
- product/source mirrors rebuild from Oracle-owned source-item ledger state
- Supabase `source_items` stops acting as runtime input during restart/bootstrap

h3) [have] This is the first decisive cut because it removes the most dangerous dual-state input before all other source-item severing.

## Phase 2: Oracle-Only Source-Item Writes

i1) [have] Removed the main normal-runtime Supabase source-item writes from Oracle-primary insert/update seams.

i2) [have] Land in this wave:
- source-item insert/upsert stays Oracle-only
- metadata/view-count/thumbnail updates stay Oracle-only
- source-page/source attribution write helpers stop writing normal-runtime `source_items` shadows
- Oracle-primary source-item mutations now write Oracle source-item ledger + Oracle product-source mirror only
- Oracle-primary current-row resolution no longer rereads Supabase just to support a removed shadow write

i3) [have] After this phase, Supabase `source_items` no longer matters to normal source-item mutation correctness.

## Phase 3: Oracle-Only Source-Item Reads

j1) [have] Removed the main normal-runtime Supabase source-item reads and primary-mode read fallbacks from wall/profile/source-page/detail surfaces.

j2) [have] Landed in this wave:
- wall reads Oracle source-item state only
- source-page reads Oracle source-item state only
- profile/detail source attribution no longer requires Supabase `source_items`
- browser/server source consumers stop depending on direct Supabase source-item reads

j3) [have] After this phase, Supabase `source_items` no longer matters to normal runtime source-item read correctness.

## Phase 4: Short Burn-In / Canary

k1) [have] Burn-in proved Oracle-only source-item behavior under:
- new source-item insert/upsert
- source-page video-library hydration
- wall/profile/detail source attribution
- source thumbnail/channel metadata updates
- duplicate and in-progress source-page states

k2) [have] Burn-in success:
- no missing/incorrect source attribution
- no source-page regression
- no thumbnail/source-link drift
- no hidden Supabase source-item dependency surfacing in logs or route behavior

## Phase 5: Cleanup And Closure

l1) [have] Removed the remaining meaningful Supabase source-item compatibility residue from active runtime surfaces and synced canonical docs to the final Oracle-owned posture.

l2) [have] This plan is ready to move to `completed/` because:
- Supabase source-item runtime work is zero
- no rehydration remains
- burn-in evidence is accepted

## Proof Gates

m1) [have] Required proof before declaring source-item cutover complete:
- Oracle primary check green
- public/local health green
- wall/source-page/profile/detail still render correct source metadata
- no source attribution regressions
- source-page duplicate/in-progress behavior stays correct

m2) [have] Accepted closure evidence:
- at least one meaningful burn-in window
- no unresolved source-item correctness regressions
- Supabase attribution shows source-item-related work materially reduced

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring dual-state source-item runtime.

n2) [todo] Any emergency rollback should be an explicit code/env change, not a hidden long-lived compatibility path.

## Success Criteria

o1) [have] Oracle fully owns normal source-item operations in runtime.

o2) [have] Supabase `source_items` no longer does normal runtime work.

o3) [have] Source attribution and source-page behavior remained correct through burn-in.

o4) [have] Supabase egress dropped materially because the prior top `source_items` endpoints were removed from normal runtime.

## Relationship To Other Chapters

p1) [have] Feed remains the passive burn-in ownership chapter while source-items becomes the active implementation root:
- [oracle-feed-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-feed-full-ownership-cutover-plan.md)

p2) [have] The broader Oracle-ownership chapter remains paused as context:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/deserted/oracle-deeper-ownership-and-supabase-reduction-plan.md)

p3) [have] Queue and unlock full-ownership chapters are completed context:
- [oracle-queue-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-queue-full-ownership-cutover-plan.md)
- [oracle-unlock-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-unlock-full-ownership-cutover-plan.md)

p4) [have] This source-item plan is the next queued ownership chapter for the same destination:
- full Oracle source-item ownership
