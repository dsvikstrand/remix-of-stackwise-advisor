# Oracle Queue Full Ownership Cutover Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-07`

## Purpose

Make Oracle the only normal operational queue system for Bleu.

This is not a “deeper ownership” exploration plan. It is a cutover plan with an explicit end state:
- Oracle owns enqueue, claim, lease, retry, terminal state, and normal queue reads
- Supabase `ingestion_jobs` stops participating in normal runtime queue behavior
- any remaining Supabase queue usage becomes rollback-only, manual migration tooling, or retired code

## Explicit End State

a1) [todo] Oracle is the sole operational queue truth in production.

a2) [todo] Normal runtime queue behavior no longer performs Supabase `ingestion_jobs` reads or writes:
- no `POST /rest/v1/ingestion_jobs`
- no `PATCH /rest/v1/ingestion_jobs`
- no queue-status fallback reads from Supabase in normal paths

a3) [todo] Queue correctness, worker behavior, user-facing job status, and recovery behavior remain intact under Oracle-only operation.

a4) [todo] Rollback remains explicit until the cutover is fully proven.

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

## Queue Cutover Ladder

f1) [have] Stage 1: `primary + full shadow`
- historical state before the recent queue passes

f2) [have] Stage 2: `primary + minimal shadow`
- current live state after Queue Pass 1 and Pass 2

f3) [todo] Stage 3: `primary + fallback-only`
- Oracle handles all normal queue writes and reads
- Supabase queue access is disabled in normal runtime and retained only behind an explicit rollback/fallback lever

f4) [todo] Stage 4: `Oracle-only operational path`
- Supabase queue codepaths are no longer part of runtime behavior
- rollback is retired after proof closure

## Phase 0: Dependency Inventory

g1) [todo] Inventory every remaining normal-path Supabase queue read/write.

g2) [todo] Classify each as:
- true runtime requirement
- rollback-only dependency
- debug/ops dependency
- stale legacy compatibility

g3) [todo] Output of this phase:
- one concrete inventory of everything that still touches Supabase `ingestion_jobs`
- one keep/remove decision per touchpoint

## Phase 1: Hidden Dependency Audit

h1) [todo] Audit every user/ops/runtime path that may still assume Supabase queue truth exists.

h2) [todo] Required audit buckets:
- user job status reads
- latest active job lookups
- queue-depth / health / position reads
- stale-job recovery
- retry dedupe / pending dedupe
- debug/ops endpoints

h3) [todo] Output of this phase:
- no unresolved “surprise” queue dependency remains before cutover

## Phase 2: Oracle-Only Queue Writes

i1) [todo] Remove Supabase queue writes from normal enqueue/start/lease/retry/terminal flows.

i2) [todo] Keep a temporary rollback lever so the prior shadow mode can be restored quickly if Oracle queue behavior regresses.

i3) [todo] Success target:
- normal runtime queue writes to Supabase fall to zero

## Phase 3: Oracle-Only Queue Reads

j1) [todo] Remove Supabase queue reads from normal runtime paths.

j2) [todo] User-facing and ops-facing queue status should read Oracle-backed queue truth only.

j3) [todo] Any remaining Supabase queue read should be:
- rollback-only
- explicit operator tooling
- or deleted

## Phase 4: Soak, Canary, And Rollback Proof

k1) [todo] Prove that Oracle-only queue works under:
- manual generation
- source-page unlock generation
- search generation
- subscription ingestion
- stale-running recovery
- retry/requeue paths

k2) [todo] Keep rollback explicit during this phase.

k3) [todo] Success target:
- multiple soak windows with queue correctness intact
- no queue-ledger parity regressions
- no user-visible job-state regressions

## Phase 5: Runtime Cleanup And Closure

l1) [todo] Remove obsolete Supabase queue compatibility code after Oracle-only operation is proven.

l2) [todo] Update canonical docs so queue is documented as Oracle-only operationally.

l3) [todo] Move this plan to `completed/` once:
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
- at least one meaningful soak window on Oracle-only queue
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
