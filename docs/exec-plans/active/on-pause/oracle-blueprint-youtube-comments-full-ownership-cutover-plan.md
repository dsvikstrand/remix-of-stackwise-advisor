# Oracle Blueprint YouTube Comments Full Ownership Cutover Plan

Status: `on-pause`
Owner: `Codex / David`
Last updated: `2026-04-09`

## Purpose

Make Oracle the only normal operational `blueprint_youtube_comments` system for Bleu.

This is not a general frontend/read cleanup and not a dual-write tuning pass. It is a direct cutover plan with an explicit end state:
- Oracle owns normal runtime comment refresh, comment persistence, comment replacement/delete, and comment reads
- Supabase `blueprint_youtube_comments` stops participating in normal runtime behavior
- no normal runtime comment refresh/read/delete path depends on Supabase
- any remaining Supabase `blueprint_youtube_comments` usage becomes migration residue to delete, not a steady-state dependency

This chapter follows the same lesson as queue, unlocks, feed, source-items, generation-state, and generation-trace:
- dual Oracle/Supabase runtime state is more bug-prone than a clean single-owner model
- the app is still in developer-mode tolerance
- short debugging pain is acceptable if it materially simplifies runtime ownership and reduces Supabase egress

## Explicit End State

a1) [have] Oracle is the sole normal operational `blueprint_youtube_comments` truth in runtime when the Oracle control-plane/backend path is enabled.

a2) [have] Normal runtime comment behavior no longer depends on Supabase for:
- comment refresh / reseed
- comment delete-and-replace cycles
- comment reads by `blueprint_id`
- sort-mode-specific comment retrieval
- any backend sync/persistence path tied to blueprint YouTube comments

a3) [todo] Blueprint comment refresh/read behavior remains correct through burn-in.

a4) [todo] Supabase `blueprint_youtube_comments` stops doing normal runtime work; any residue is manual/historical only.

## Why This Plan Exists

b1) [have] Queue, unlocks, feed, source-items, and generation-state now have their main Oracle ownership work completed.

b2) [have] Generation trace is the only currently active ownership chapter and is in burn-in.

b3) [have] The latest 24h sampled Supabase attribution is now led by `blueprint_youtube_comments`:
- `blueprint_youtube_comments` `20.8%`

b4) [have] The hot residual endpoints are narrow and obvious:
- `GET /rest/v1/blueprint_youtube_comments`
- `POST /rest/v1/blueprint_youtube_comments`
- `DELETE /rest/v1/blueprint_youtube_comments`

b5) [have] That makes this the clearest next migration chapter if the goal is:
- further Supabase egress reduction
- less dual-state drift
- simpler reasoning around comment refresh/persistence correctness

## Current State

c1) [have] Runtime comment activity appears to be mostly backend-driven in the current sample:
- `GET /rest/v1/blueprint_youtube_comments?blueprint_id:eq&sort_mode:eq`
- `DELETE /rest/v1/blueprint_youtube_comments?blueprint_id:eq&sort_mode:eq`
- `POST /rest/v1/blueprint_youtube_comments?columns:value`

c2) [have] The current sample suggests the dominant pattern is not passive browsing alone.
- the backend is actively deleting/reseeding comment rows
- the frontend is still reading those rows directly

c3) [have] The remaining problem is not likely “Oracle cannot store comment truth.”
- it is that `blueprint_youtube_comments` is still a live Supabase runtime surface for both write-side refresh and read-side consumption

c4) [have] This cutover is product-visible in:
- blueprint detail comment tabs
- sorted comment view consistency
- refresh timing and stale-comment replacement
- duplicate/missing comment-set behavior after reseed

c5) [have] The local cutover now includes a dedicated Oracle comment-state sink plus a backend comment-reader route.
- Oracle snapshot replace/list lives in [server/services/oracleBlueprintYoutubeCommentsState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleBlueprintYoutubeCommentsState.ts)
- browser comment reads now prefer `GET /api/blueprints/:id/youtube-comments`

## Scope Lock

d1) [todo] This plan is `blueprint_youtube_comments` only.

d2) [todo] Do not mix tags, blueprint tags, general blueprint comments, notifications, or profiles into this chapter except where comment refresh/read paths have a hard dependency.

d3) [todo] Focus on `blueprint_youtube_comments` operational ownership and the read surfaces built on top of it.

## Main Files / Surfaces

e1) [have] Core comment ownership seams likely include:
- [server/services/blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts)
- [server/handlers/youtubeHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/youtubeHandlers.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- any frontend readers that still query `blueprint_youtube_comments` directly

e2) [have] Main comment behaviors to sever from Supabase:
- comment refresh/reseed writes
- comment delete/replace cycles
- comment reads by `blueprint_id` + `sort_mode`
- browser/product direct reads
- compatibility rereads and fallback paths

## Fast Cutover Shape

f1) [have] Historical context:
- queue ownership cutover is completed
- unlock ownership cutover is completed
- feed ownership cutover is completed
- source-items ownership cutover is completed
- generation-state ownership cutover is completed
- generation trace remains the active burn-in chapter

f2) [todo] This plan aims directly for:
- `Oracle-only operational blueprint YouTube comments path`

f3) [todo] Intermediate “Oracle-first but still normal-runtime Supabase comment participation” is only an execution aid, not the desired resting state.

## Phase 0: One Fast Inventory

g1) [have] Enumerated every meaningful `blueprint_youtube_comments` touchpoint and classified it as:
- runtime write
- runtime delete/replace
- runtime read
- refresh/sync dependency
- browser/product residue
- removable legacy residue

g2) [have] Primary files for the inventory:
- [server/services/blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts)
- [server/handlers/youtubeHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/youtubeHandlers.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- relevant frontend comment readers once identified

g3) [have] Output:
- one explicit remove/replace decision per remaining `blueprint_youtube_comments` touchpoint
- no meaningful bootstrap/rehydration phase exists here
- the browser/server read bridge needed to land alongside the write cut so the comment tabs would not strand on empty Supabase reads

## Phase 1: Stop Any Supabase Comment Bootstrap / Residual Input

h1) [have] Verified that `blueprint_youtube_comments` has no meaningful startup/bootstrap dependence.

h2) [have] No bootstrap/input cut was needed here.
- remove that Supabase input first
- make Oracle comment state the only accepted bootstrap/runtime input

h3) [have] This phase is trivial and complete.
- mark this phase trivial
- move directly to Oracle-only writes

## Phase 2: Oracle-Only Comment Writes

i1) [have] Removed the main normal-runtime Supabase `blueprint_youtube_comments` writes from refresh/reseed/update paths.

i2) [have] Landed in this wave:
- comment refresh writes stay Oracle-only
- comment delete/reseed cycles stay Oracle-only
- backend sync/persistence helpers stop writing normal-runtime Supabase comment rows

i3) [have] After this phase, Supabase comment rows no longer matter to normal comment mutation correctness.

## Phase 3: Oracle-Only Comment Reads

j1) [have] Removed the main normal-runtime Supabase comment reads from blueprint detail/comment surfaces when the backend path is available.

j2) [have] Landed in this wave:
- blueprint comment readers use Oracle only
- sort-mode-specific comment retrieval uses Oracle only
- browser/server consumers stop depending on direct Supabase comment reads

j3) [have] After this phase, Supabase comment rows no longer matter to normal runtime read correctness in the Oracle-backed runtime path.

## Phase 4: Short Burn-In / Canary

k1) [todo] Prove Oracle-only comment behavior under:
- comment refresh
- comment delete/reseed
- sorted comment reads
- blueprint detail comment tab use
- repeat refresh without duplicate/stale drift

k2) [todo] Success target:
- no missing comment sets
- no duplicate reseed behavior
- no sort-mode regression
- no hidden Supabase comment dependency surfacing in logs or route behavior

## Phase 5: Cleanup And Closure

l1) [todo] Remove the remaining meaningful Supabase comment compatibility residue from active runtime surfaces and sync canonical docs to the final Oracle-owned posture.

l2) [todo] Move this plan to `completed/` once:
- Supabase comment runtime work is zero or negligible
- no hidden dependency remains
- burn-in evidence is accepted

## Proof Gates

m1) [todo] Required proof before declaring comment cutover complete:
- Oracle primary check green
- public/local health green
- comment refresh succeeds
- comment reads succeed
- no stale/delete drift appears in product behavior

m2) [todo] Required proof before closing the chapter:
- at least one meaningful burn-in window
- no unresolved comment correctness regressions
- Supabase attribution shows `blueprint_youtube_comments` materially reduced

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring dual-state comment runtime.

n2) [todo] Any emergency rollback should be an explicit code/env change, not a hidden long-lived compatibility path.

## Success Criteria

o1) [todo] Oracle fully owns normal `blueprint_youtube_comments` operations in runtime.

o2) [todo] Supabase `blueprint_youtube_comments` no longer does normal runtime work.

o3) [todo] Comment refresh/read behavior remains correct through burn-in.

o4) [todo] Supabase egress drops materially because the current top `blueprint_youtube_comments` endpoints are removed from normal runtime.

## Relationship To Other Chapters

p1) [have] Generation trace remains the current active ownership chapter:
- [oracle-generation-trace-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/oracle-generation-trace-full-ownership-cutover-plan.md)

p2) [have] The broader Oracle-ownership context remains paused:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/deserted/oracle-deeper-ownership-and-supabase-reduction-plan.md)

p3) [have] Feed, source-items, and generation-state ownership chapters are now completed reference context:
- [oracle-feed-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-feed-full-ownership-cutover-plan.md)
- [oracle-source-item-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-source-item-full-ownership-cutover-plan.md)
- [oracle-generation-state-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-generation-state-full-ownership-cutover-plan.md)

p4) [have] This plan is the queued next ownership chapter once generation trace is closed:
- full Oracle blueprint YouTube comments ownership
