# Oracle Generation State Full Ownership Cutover Plan

Status: `on-pause`
Owner: `Codex / David`
Last updated: `2026-04-08`

## Purpose

Make Oracle the only normal operational generation-state system for Bleu.

This is not a narrow egress trim and not a permanent Oracle/Supabase balance. It is a direct cutover plan with an explicit end state:
- Oracle owns generation-run truth and source-item variant truth in normal runtime
- Supabase `generation_runs` and `source_item_blueprint_variants` stop participating in normal runtime behavior
- no Oracle generation bootstrap/rehydration should accept stale Supabase generation truth back into runtime
- any remaining Supabase generation-state usage becomes migration residue to delete, not a steady-state dependency

This chapter follows the same learned pattern from queue, unlocks, feed, and source-items:
- dual Oracle/Supabase runtime state is more bug-prone than a clean single-owner model
- the app remains in developer-mode tolerance
- some short-term debug pain is acceptable if it buys simpler long-term ownership

## Explicit End State

a1) [todo] Oracle is the sole normal operational generation-state truth in runtime.

a2) [todo] Normal runtime generation-state behavior no longer depends on Supabase for:
- variant claim / ready / failed / retry state
- generation-run lifecycle reads
- source-page generation in-progress / ready overlays
- duplicate / already-running / already-ready checks
- blueprint-availability and cooldown decisions that currently inspect generation-state truth
- bootstrap / rehydration

a3) [todo] Source Page, search/manual generation, and queued generation behavior remain correct through burn-in.

a4) [todo] Supabase `generation_runs` and `source_item_blueprint_variants` stop doing normal runtime work; any residue is manual/historical only.

## Why This Plan Exists

b1) [have] Queue and unlock ownership are completed Oracle-only chapters.

b2) [have] Feed and source-items have completed the main ownership passes and are now in burn-in / closure mode.

b3) [have] Current 24h sampled Supabase attribution is now led by generation-state traffic:
- `generation_state` `25.3%`

b4) [have] Top residual generation-state-heavy endpoints currently include:
- `GET /rest/v1/generation_runs`
- `GET /rest/v1/source_item_blueprint_variants`

b5) [have] That makes `generation_state` the clearest next ownership chapter if the goal is:
- further Supabase egress reduction
- less dual-state drift
- simpler runtime reasoning around generation ownership

## Current State

c1) [have] Oracle generation-state support already exists and is live behind `ORACLE_GENERATION_STATE_MODE`.

c2) [have] `ORACLE_GENERATION_STATE_MODE=primary` is already available and Oracle-first generation-state reads/writes are partially staged.

c3) [have] Current runtime already routes some variant/run truth through Oracle-first helpers for source-page generation, queued worker ownership, and ready/in-progress checks.

c4) [have] The remaining problem is not “Oracle cannot own generation state.”
- it is that Supabase `generation_runs` and `source_item_blueprint_variants` still participate in enough normal runtime paths to keep egress and dual-state complexity alive

c5) [have] Generation-state cutover risk is product-visible in:
- Source Page `unlock_in_progress` / `ready` overlays
- duplicate generation detection
- already-running ownership recovery
- cooldown / retry decisions
- generation result notification correctness

## Scope Lock

d1) [todo] This plan is generation-state only.

d2) [todo] Do not mix queue, unlocks, feed, or source-items into this chapter except where generation-state reads/writes are a hard dependency.

d3) [todo] Focus on `generation_runs` plus `source_item_blueprint_variants` operational ownership and the read surfaces built on top of them.

## Main Files / Surfaces

e1) [have] Core generation-state ownership seams likely include:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/oracleGenerationState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleGenerationState.ts)
- [server/services/oracleProductState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleProductState.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/blueprintAvailability.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintAvailability.ts)
- [server/services/sourceSubscriptionSync.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts)
- [server/services/queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)
- [src/lib/sourcePagesApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/sourcePagesApi.ts)

e2) [have] Main generation-state behaviors to sever from Supabase:
- bootstrap / rehydration
- variant claim / complete / fail / stale recovery writes
- generation-run lifecycle writes
- source-page / availability / duplicate-check reads
- compatibility rereads and fallback paths

## Fast Cutover Shape

f1) [have] Historical context:
- queue ownership cutover is completed
- unlock ownership cutover is completed
- feed ownership cutover is in burn-in
- source-items ownership cutover is in burn-in
- generation-state is now the next large backend-owned Supabase surface

f2) [todo] This plan aims directly for:
- `Oracle-only operational generation-state path`

f3) [todo] Intermediate “Oracle-first but still normal-runtime Supabase generation-state participation” is only an execution aid, not the desired resting state.

## Phase 0: One Fast Inventory

g1) [have] Enumerated the meaningful `generation_runs` and `source_item_blueprint_variants` touchpoints and classified them as:
- runtime write
- runtime read
- duplicate/in-progress decision dependency
- cooldown / availability dependency
- bootstrap / rehydration dependency
- removable residue

g2) [have] Primary files inspected for the inventory:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/oracleGenerationState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleGenerationState.ts)
- [server/services/oracleProductState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleProductState.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/blueprintAvailability.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintAvailability.ts)
- [server/services/sourceSubscriptionSync.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts)
- [server/services/queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)

g3) [have] Bootstrap / rehydration dependency is explicit and narrow now:
- [syncOracleGenerationStateFromSupabase(...)](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleGenerationState.ts) still rereads Supabase `source_item_blueprint_variants` and `generation_runs`
- [bootstrapOracleControlPlaneState(...)](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts) still calls that sync during startup
- this is the highest-risk dual-state input and should be the first cut

g4) [have] Main runtime write seam still lives in the Oracle-first wrappers in [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts):
- `claimVariantForGeneration(...)` still writes the Supabase shadow after Oracle claim succeeds
- `markVariantReady(...)` still writes Supabase after Oracle ready transition
- `markVariantFailed(...)` still writes Supabase after Oracle failed transition
- `startGenerationRun(...)`, `updateGenerationModelInfo(...)`, `attachBlueprintToRun(...)`, `finalizeGenerationRunSuccess(...)`, and `finalizeGenerationRunFailure(...)` still write Supabase `generation_runs` after Oracle run-state updates

g5) [have] Main runtime read / fallback seam is also concentrated in [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts):
- `resolveVariantOrReady(...)` still falls back to Supabase on Oracle error in `primary`
- `listVariantsForSourceItem(...)`, `findVariantsByBlueprintId(...)`, `getGenerationRunByRunId(...)`, `getLatestGenerationRunByBlueprintId(...)`, and `listFailedGenerationRunsByVideoIdOracleFirst(...)` still retain Supabase fallback/read paths
- these are the shared helpers that keep ordinary generation-state reads partially dual in runtime

g6) [have] Duplicate / already-running / already-ready decision surfaces are generation-state heavy and already routed through those shared wrappers:
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts) uses `resolveVariantOrReady(...)` for source-page `unlock_in_progress` / `ready` overlays
- [server/services/sourceSubscriptionSync.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts) uses `resolveVariantOrReady(...)` to short-circuit on existing ready variants
- queued unlock/generation flows in [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts) depend on the same wrappers

g7) [have] Cooldown / availability dependency still has a direct Supabase read residue:
- [server/services/blueprintAvailability.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintAvailability.ts) still falls back to `.from('generation_runs')` when no injected Oracle-aware reader is provided
- Pass 3 must either inject the Oracle-aware failed-run reader everywhere or remove the direct Supabase branch entirely for normal runtime

g8) [have] Read-only product/browser residue is still present outside the main wrappers:
- [server/services/profileHistory.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/profileHistory.ts) still reads `source_item_blueprint_variants` directly for ready-variant resolution
- [src/hooks/useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts) still reads `source_item_blueprint_variants` directly to resolve liked-blueprint source attribution
- [src/pages/BlueprintDetail.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/pages/BlueprintDetail.tsx) still has a direct `source_item_blueprint_variants` read

g9) [have] Legacy/manual residue exists in service-only utilities and should be treated separately from normal runtime:
- [server/services/blueprintVariants.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintVariants.ts) is still a full Supabase variant service
- [server/services/generationTrace.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts) and [server/services/blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts) still read `generation_runs`
- these should be classified as cleanup/compatibility residue unless later code inspection proves they are on the hot runtime path

g10) [have] Output of Phase 0:
- Pass 1 should cut `syncOracleGenerationStateFromSupabase(...)` and restart/bootstrap input from Supabase
- Pass 2 should cut the shadow writes in the Oracle-first variant/run mutation wrappers
- Pass 3 should cut the ordinary read fallbacks plus the direct profile/detail/availability generation-state reads

## Phase 1: Stop Supabase Generation-State Rehydration / Residual Input

h1) [have] Removed the main Oracle generation-state bootstrap/rehydration input that accepted Supabase generation truth as authoritative runtime input.

h2) [have] Landed in this wave:
- Oracle generation bootstrap keeps durable truth from Oracle generation-state tables
- Oracle product/generation mirrors rebuild from Oracle-owned generation-state rows
- Supabase generation-state stops acting as runtime input during restart/bootstrap

h3) [have] This first decisive cut removes the most dangerous dual-state input before all other severing.

## Phase 2: Oracle-Only Generation-State Writes

i1) [have] Removed the main normal-runtime Supabase generation-state writes from Oracle-primary variant/run mutation seams.

i2) [have] Landed in this wave:
- variant claim / ready / failed / retry writes stay Oracle-only
- generation-run lifecycle writes stay Oracle-only
- stale variant ownership recovery stays Oracle-only
- Oracle-primary mutation helpers stop writing normal-runtime Supabase generation-state shadows

i3) [have] After this phase, Supabase generation-state no longer matters to normal mutation correctness.

## Phase 3: Oracle-Only Generation-State Reads

j1) [have] Removed remaining normal-runtime Supabase generation-state reads and read fallbacks from source-page / availability / duplicate-check surfaces.

j2) [have] Landed in this wave:
- Source Page generation overlays read Oracle generation-state only
- cooldown / availability reads Oracle generation-state only
- duplicate / already-running / already-ready readers stop depending on Supabase generation-state
- browser/server generation-state consumers stop depending on direct Supabase reads

j3) [have] After this phase, Supabase generation-state no longer matters to normal runtime read correctness.

## Phase 4: Short Burn-In / Canary

k1) [todo] Prove Oracle-only generation-state behavior under:
- manual search/manual generation
- source-page unlock generation
- queued background generation
- duplicate / already-running detection
- stale ownership recovery
- cooldown / retry decisions

k2) [todo] Success target:
- no duplicate generation regressions
- no stuck in-progress variants
- no incorrect ready/running overlays
- no hidden Supabase generation-state dependency surfacing in logs or route behavior

## Phase 5: Cleanup And Closure

l1) [todo] Remove the remaining meaningful Supabase generation-state compatibility residue from active runtime surfaces and sync canonical docs to the final Oracle-owned posture.

l2) [todo] Move this plan to `completed/` once:
- Supabase generation-state runtime work is zero or negligible
- no rehydration remains
- burn-in evidence is accepted

## Proof Gates

m1) [todo] Required proof before declaring generation-state cutover complete:
- Oracle primary check green
- public/local health green
- Source Page generation overlays still behave correctly
- no duplicate-generation regressions
- no stuck in-progress generation rows

m2) [todo] Required proof before closing the chapter:
- at least one meaningful burn-in window
- no unresolved generation-state correctness regressions
- Supabase attribution shows generation-state-related work materially reduced

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring dual-state generation-state runtime.

n2) [todo] Any emergency rollback should be an explicit code/env change, not a hidden long-lived compatibility path.

## Success Criteria

o1) [todo] Oracle fully owns normal generation-state operations in runtime.

o2) [todo] Supabase `generation_runs` and `source_item_blueprint_variants` no longer do normal runtime work.

o3) [todo] Source Page, duplicate detection, and cooldown behavior remain correct through burn-in.

o4) [todo] Supabase egress drops materially because the current top generation-state endpoints are removed from normal runtime.

## Relationship To Other Chapters

p1) [have] Source-items remains the current active ownership burn-in / closure chapter:
- [oracle-source-item-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/oracle-source-item-full-ownership-cutover-plan.md)

p2) [have] Feed remains the passive burn-in ownership chapter:
- [oracle-feed-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-feed-full-ownership-cutover-plan.md)

p3) [have] Queue and unlock full-ownership chapters are completed context:
- [oracle-queue-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-queue-full-ownership-cutover-plan.md)
- [oracle-unlock-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-unlock-full-ownership-cutover-plan.md)
