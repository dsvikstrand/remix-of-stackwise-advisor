# Oracle Queue Full Ownership Cutover Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-07` (rewritten for fast cutover while the app is still in developer-mode tolerance)

## Purpose

Make Oracle the only normal operational queue system for Bleu.

This is not a “deeper ownership” exploration plan. It is a fast cutover plan with an explicit end state:
- Oracle owns enqueue, claim, lease, retry, terminal state, and normal queue reads
- Supabase `ingestion_jobs` stops participating in normal runtime queue behavior
- any remaining Supabase queue usage becomes rollback-only, manual migration tooling, or retired code

This plan intentionally optimizes for speed over maximum caution because the app is still operating in developer-mode tolerance:
- temporary downtime is acceptable
- debugging pain is acceptable
- long incremental soak ladders are not the priority
- the priority is to reach Oracle-only queue ownership quickly

## Explicit End State

a1) [todo] Oracle is the sole operational queue truth in production.

a2) [todo] Normal runtime queue behavior no longer performs Supabase `ingestion_jobs` reads or writes:
- no `POST /rest/v1/ingestion_jobs`
- no `PATCH /rest/v1/ingestion_jobs`
- no queue-status fallback reads from Supabase in normal paths

a3) [todo] Queue correctness, worker behavior, user-facing job status, and recovery behavior remain intact under Oracle-only operation.

a4) [todo] Rollback remains explicit until the Oracle-only queue path survives a short burn-in window.

## Why This Plan Exists

b1) [have] The broader Oracle-ownership chapter has been paused at:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-deeper-ownership-and-supabase-reduction-plan.md)

b2) [have] That broader chapter established the direction, but it did not make the queue destination explicit enough.

b3) [have] For `queue`, the intended destination is now explicit:
- full Oracle ownership
- not indefinite partial shadowing

## Current State

c1) [have] Oracle queue ledger is already `primary` in live runtime.

c2) [have] Queue Ownership Pass 1 and Pass 2 have already landed:
- explicit queue shadow diffing
- Oracle-local retry/requeue behavior
- narrower lifecycle-aware Supabase queue patch shapes
- continued conservative enqueue + terminal queue shadowing

c3) [have] Live Oracle primary checks remain green after those passes.

c4) [have] Recent Supabase attribution is no longer dominated by queue, but queue still exists materially in the sample:
- `queue` family `9.3%`
- `PATCH /rest/v1/ingestion_jobs?id:eq` `5.8%`
- `POST /rest/v1/ingestion_jobs` `3.5%`

c5) [have] That means the system is ready for a real queue cutover question:
- not “can Oracle be queue-primary?”
- but “what still prevents Oracle-only queue?”

c6) [have] The current operating assumption for this plan is:
- the team prefers a fast Oracle-only queue cutover now
- rather than several more small shadow-reduction passes with long verification gaps

## Scope Lock

d1) [todo] This plan is queue-only.

d2) [todo] Do not mix `generation_state`, `source_items`, `unlocks`, or `feed` into this plan.

d3) [todo] Do not treat this as a generic Supabase egress pass.

d4) [todo] Focus only on `ingestion_jobs` operational ownership.

## Main Files / Surfaces

e1) [have] Core queue ownership seams:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/queueShadowPolicy.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queueShadowPolicy.ts)
- [server/services/queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)
- [server/services/oracleQueueClaimGovernor.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleQueueClaimGovernor.ts)
- [server/services/oracleQueueSweepScheduler.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleQueueSweepScheduler.ts)

e2) [have] Main queue operations to sever from Supabase:
- enqueue
- claim/start
- lease/heartbeat
- retry/requeue
- terminal finalize/fail
- owner/latest/status reads

## Fast Cutover Shape

f1) [have] Historical ladder context:
- `primary + full shadow` -> `primary + minimal shadow` has already happened

f2) [todo] This plan now aims directly for:
- `Oracle-only operational path`

f3) [todo] Intermediate `fallback-only` is a temporary execution aid if needed during the cutover, not the desired resting state.

## Phase 0: One Fast Inventory

g1) [todo] Do one fast but complete inventory of every remaining Supabase queue touchpoint.

g2) [todo] Inventory buckets:
- normal runtime write
- normal runtime read
- stale-job / retry / dedupe dependency
- user/ops status dependency
- rollback-only dependency

g3) [todo] Output:
- one explicit remove/keep-for-rollback decision per remaining Supabase queue touchpoint

g4) [todo] This phase should be short and decisive, not a long audit chapter.

## Phase 1: Oracle-Only Cutover Wave

h1) [todo] Cut normal runtime queue writes and reads over to Oracle in one focused implementation wave.

h2) [todo] Target in this wave:
- remove Supabase queue writes from enqueue/start/lease/retry/terminal
- remove Supabase queue reads from owner/latest/status/health/dedupe paths
- keep only one explicit rollback path if Oracle queue behavior regresses

h3) [todo] This is the main chapter event.
It should be treated as a cutover, not as another optimization pass.

## Phase 2: Short Burn-In / Canary

i1) [todo] Prove that Oracle-only queue works under:
- manual generation
- source-page unlock generation
- search generation
- subscription ingestion
- stale-running recovery
- retry/requeue paths

i2) [todo] Keep rollback explicit during this short burn-in window.

i3) [todo] Success target:
- one meaningful burn-in window with queue correctness intact
- no unresolved user-visible queue regressions
- no hidden Supabase queue dependency surfacing in logs

## Phase 3: Cleanup And Closure

j1) [todo] Remove obsolete Supabase queue compatibility code after Oracle-only operation is proven.

j2) [todo] Update canonical docs so queue is documented as Oracle-only operationally.

j3) [todo] Move this plan to `completed/` once:
- Supabase queue runtime work is zero
- rollback is no longer needed
- canary/proof evidence is logged

## Proof Gates

m1) [todo] Required proof before declaring queue cutover complete:
- Oracle primary check green
- public/local health green
- queue-specific runtime canaries green
- no unresolved stale-running recovery gaps
- Supabase attribution shows queue queue-work at or near zero in normal runtime

m2) [todo] Required proof before removing rollback:
- at least one meaningful burn-in window on Oracle-only queue
- no unresolved queue correctness incidents
- no hidden queue read/write dependency still found in logs or route behavior

## Rollback Rules

n1) [todo] Rollback must restore the prior queue shadow/fallback mode only.

n2) [todo] Rollback must not force unrelated Oracle-owned domains backward.

n3) [todo] Rollback trigger examples:
- queue status regressions
- stuck jobs caused by missing Oracle-only handling
- missing user-visible job updates
- failed stale-running recovery

n4) [todo] Rollback should be treated as a short-lived escape hatch, not a permanent dual-system operating mode.

## Success Criteria

o1) [todo] Oracle fully owns queue operations in production.

o2) [todo] Supabase `ingestion_jobs` no longer does normal runtime work.

o3) [todo] Queue behavior remains correct and observable.

o4) [todo] The first backend domain with full Oracle ownership is complete.

## Relationship To Paused Chapter

p1) [have] The broader Oracle-ownership chapter is paused as context:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-deeper-ownership-and-supabase-reduction-plan.md)

p2) [have] This queue plan is the sharper child chapter for one explicit destination:
- full Oracle queue ownership
