# Oracle Generation Trace Full Ownership Cutover Plan

Status: `completed`
Owner: `Codex / David`
Last updated: `2026-04-12`

## Purpose

Make Oracle the only normal operational generation-trace system for Bleu.

This is not a narrow egress trim and not a permanent Oracle/Supabase balance. It is a direct cutover plan with an explicit end state:
- Oracle owns normal runtime generation trace event truth
- Supabase `generation_run_events` stops participating in normal runtime behavior
- no normal trace append/read path should depend on Supabase `generation_run_events`
- any remaining Supabase generation-trace usage becomes migration residue to delete, not a steady-state dependency

This chapter follows the same learned pattern from queue, unlocks, feed, source-items, and generation-state:
- dual Oracle/Supabase runtime state is more bug-prone than a clean single-owner model
- the app remains in developer-mode tolerance
- some short-term debug pain is acceptable if it buys simpler long-term ownership

## Explicit End State

a1) [have] Oracle is the sole normal operational generation-trace truth in runtime.

a2) [have] Normal runtime generation-trace behavior no longer depends on Supabase for:
- event append sequencing
- generation trace event reads by `run_id`
- generation trace event pagination for blueprint/run detail views
- event retention/purge behavior needed for runtime correctness

a3) [have] Generation trace append/read behavior remained correct through burn-in.

a4) [have] Supabase `generation_run_events` stopped doing normal runtime work; any residue is manual/historical only.

## Why This Plan Exists

b1) [have] Queue and unlock ownership are completed Oracle-only chapters.

b2) [have] Feed, source-items, and generation-state have completed the main ownership passes and are now in burn-in / closure or passive follow-up mode.

b3) [have] Current 24h sampled Supabase attribution is now materially led by generation trace event traffic:
- `generation_state` `23.9%`
- `POST /rest/v1/generation_run_events` `21.7%`

b4) [have] That makes `generation_run_events` the clearest next backend-owned Supabase surface if the goal is:
- further Supabase egress reduction
- less dual-state drift
- simpler runtime reasoning around generation trace ownership

## Current State

c1) [have] Oracle generation-state ownership now covers:
- `generation_runs`
- `source_item_blueprint_variants`

c2) [have] The remaining adjacent runtime surface still on Supabase is the event stream:
- `generation_run_events`

c3) [have] Current runtime trace behavior is concentrated in:
- [generationTrace.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts)
- route/handler callers wired from [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- trace read endpoints in [tracing.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/tracing.ts)
- event-producing callers in [youtubeBlueprintPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/youtubeBlueprintPipeline.ts) and [blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts)

c4) [have] The remaining problem is not “Oracle cannot own generation trace.”
- it is that Supabase `generation_run_events` still participates in enough normal runtime append/read behavior to keep egress and dual-state complexity alive

c5) [have] The inventory shows this chapter is mostly append/read runtime state, not a bootstrap-heavy domain.
- there is no meaningful `generation_run_events` startup rehydration path comparable to queue, unlocks, feed, source-items, or generation-state
- the main shared write seam is `appendGenerationEvent(...)`
- the main shared read seam is `listGenerationRunEvents(...)`
- the adjacent run readers are already routed through the generation-state chapter, not this trace-event chapter

## Scope Lock

d1) [todo] This plan is generation-trace only.

d2) [todo] Do not mix queue, unlocks, feed, source-items, or the already-landed generation-state run/variant cutover into this chapter except where generation trace is a hard dependency.

d3) [todo] Focus on `generation_run_events` operational ownership and the read surfaces built on top of it.

## Main Files / Surfaces

e1) [have] Core generation-trace ownership seams likely include:
- [server/services/generationTrace.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/handlers/youtubeHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/youtubeHandlers.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts)
- [src/test/generationTraceBackend.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/generationTraceBackend.test.ts)

e2) [have] Main generation-trace behaviors to sever from Supabase:
- append event writes
- per-run event sequence allocation
- event list reads
- trace-by-run / trace-by-blueprint read shaping
- event retention helpers that still assume Supabase runtime truth

## Fast Cutover Shape

f1) [have] Historical context:
- queue ownership cutover is completed
- unlock ownership cutover is completed
- feed ownership cutover is in burn-in
- source-items ownership cutover is in burn-in
- generation-state main runtime cutover is landed
- generation trace is now the next large backend-owned Supabase surface

f2) [have] This plan aimed directly for:
- `Oracle-only operational generation-trace path`

f3) [have] Intermediate “Oracle-first but still normal-runtime Supabase generation trace participation” was only an execution aid, not the resting state.

## Phase 0: One Fast Inventory

g1) [have] Enumerated the meaningful `generation_run_events` touchpoints and classified them as:
- runtime write
- runtime read
- trace/detail view dependency
- retention/purge dependency
- removable residue

g2) [have] Primary files inspected for the inventory:
- [server/services/generationTrace.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/routes/tracing.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/tracing.ts)
- [server/services/youtubeBlueprintPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/youtubeBlueprintPipeline.ts)
- [server/services/blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts)
- [src/test/generationTraceBackend.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/generationTraceBackend.test.ts)

g3) [have] Inventory output:
- there is no meaningful bootstrap/rehydration concern for `generation_run_events`
- the shared append seam to cut first is:
  - `loadNextGenerationEventSeq(...)`
  - `reserveGenerationEventSeq(...)`
  - `appendGenerationEvent(...)`
- the main read seam to cut second is:
  - `listGenerationRunEvents(...)`
  - trace route readers in [tracing.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/tracing.ts)

g4) [have] Runtime write seam map:
- [generationTrace.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts)
  - `loadNextGenerationEventSeq(...)` currently reads Supabase `generation_run_events` to seed per-run sequence allocation
  - `reserveGenerationEventSeq(...)` keeps an in-process cursor after that Supabase seed
  - `appendGenerationEvent(...)` writes milestone/terminal events to Supabase `generation_run_events`
- [youtubeBlueprintPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/youtubeBlueprintPipeline.ts)
  - the main normal-runtime event producer for generation pipeline milestones/failures
- [blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts)
  - an adjacent event producer for YouTube comment fetch/comment-stage trace events

g5) [have] Runtime read seam map:
- [generationTrace.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts)
  - `listGenerationRunEvents(...)` is the shared paginated event reader
- [tracing.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/tracing.ts)
  - `/api/generation-runs/:runId`
  - `/api/blueprints/:id/generation-trace`
  - these are the main normal-runtime trace detail readers
- adjacent run lookup helpers:
  - `getGenerationRunByRunId(...)`
  - `getLatestGenerationRunByBlueprintId(...)`
  - these belong to the already-active generation-state ownership chapter rather than this trace-event chapter

g6) [have] Test coverage map for later cutover passes:
- [generationTraceBackend.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/generationTraceBackend.test.ts)
  - current direct Supabase/mocked coverage for append, sequence ordering, pagination, and latest-run helpers
- [youtubeBlueprintPipelineTranscriptPrune.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/youtubeBlueprintPipelineTranscriptPrune.test.ts)
  - pipeline-level event append wiring coverage through injected trace append helpers

## Phase 1: Stop Any Supabase Trace Bootstrap / Residual Input

h1) [have] There is no meaningful startup/bootstrap dependence on Supabase `generation_run_events` to remove first.

h2) [have] This phase is effectively trivial, so the next real code wave is Oracle-only event writes.

## Phase 2: Oracle-Only Generation Trace Writes

i1) [have] Removed the main normal-runtime Supabase `generation_run_events` writes from append/event-recording paths.

i2) [have] Landed in this wave:
- pipeline milestone writes stay Oracle-only
- terminal/failure event writes stay Oracle-only
- sequence allocation stays Oracle-only

i3) [have] After this phase, Supabase generation trace no longer matters to normal event append correctness.

i4) [have] Primary code seams for Pass 2:
- [generationTrace.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts)
  - replace Supabase-backed event sequencing and append writes with Oracle-backed equivalents
- [youtubeBlueprintPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/youtubeBlueprintPipeline.ts)
- [blueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts)
  - keep callers stable while changing only the event sink

i5) [have] Oracle trace event writes now land in control-plane state while caller contracts remain unchanged.
- `appendGenerationEvent(...)` remains the shared event API
- Oracle-primary wiring now redirects that shared append seam to Oracle event state instead of Supabase `generation_run_events`

## Phase 3: Oracle-Only Generation Trace Reads

j1) [have] Removed remaining normal-runtime Supabase `generation_run_events` reads from trace/detail surfaces.

j2) [have] Landed in this wave:
- run trace reads use Oracle only
- blueprint/run detail event pagination uses Oracle only
- any trace-derived helper stops rereading Supabase in normal runtime

j3) [have] After this phase, Supabase generation trace no longer matters to normal runtime read correctness.

j4) [have] Primary code seams for Pass 3:
- [generationTrace.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts)
- [tracing.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/tracing.ts)
  - move paginated trace reads fully onto Oracle-owned event state

j5) [have] Oracle-primary trace detail reads now stay on Oracle event state through the shared service seam.
- `listGenerationRunEvents(...)` now resolves through Oracle control-plane event state in `primary`
- route contracts stay unchanged while event pagination no longer depends on Supabase `generation_run_events`

## Phase 4: Short Burn-In / Canary

k1) [have] Burn-in evidence accepted on `2026-04-12`:
- Oracle primary check is green
- public/local health are green
- sampled Supabase attribution no longer shows `generation_trace` as a leading family
- `generation_trace_read_failed` count is `0` over the last `24h+`
- `generation_trace_write_failed` count is `0` over the last `24h+`
- sampled Supabase attribution no longer shows `generation_run_events` as a leading endpoint

k2) [have] Burn-in covered Oracle-only generation trace behavior under:
- manual generation
- source-page unlock generation
- queued/background generation
- failure and retry paths
- trace detail reads

k3) [have] Burn-in success targets were satisfied:
- event append still works
- trace detail reads still work
- no missing terminal event sequences
- no fresh `generation_trace_write_failed` events recurred across a full burn-in window
- no hidden Supabase trace dependency resurfaced

## Phase 5: Cleanup And Closure

l1) [have] Remaining meaningful Supabase generation-trace compatibility residue was removed from active runtime surfaces, and canonical docs now reflect the Oracle-owned posture.

l2) [have] This plan is ready to move to `completed/` because:
- Supabase generation-trace runtime work is zero or negligible
- no hidden dependency remains
- burn-in evidence is accepted

## Proof Gates

m1) [have] Required proof before declaring generation-trace cutover complete:
- Oracle primary check green
- public/local health green
- trace append succeeds in normal runtime
- trace read/detail surfaces still return expected event history

m2) [have] Required proof before closing the chapter:
- at least one meaningful burn-in window
- no unresolved trace correctness regressions
- Supabase attribution shows `generation_run_events` materially reduced

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring dual-state generation-trace runtime.

n2) [todo] Any emergency rollback should be an explicit code/env change, not a hidden long-lived compatibility path.

## Success Criteria

o1) [have] Oracle fully owns normal generation-trace operations in runtime.

o2) [have] Supabase `generation_run_events` no longer does normal runtime work.

o3) [have] Trace append/read behavior remained correct through burn-in.
