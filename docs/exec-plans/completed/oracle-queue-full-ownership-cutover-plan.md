# Oracle Queue Full Ownership Cutover Plan

Status: `completed`
Owner: `Codex / David`
Last updated: `2026-04-08` (closed after Oracle-only queue burn-in stayed healthy)

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

a1) [have] Oracle is now the sole normal operational queue truth in runtime.

a2) [have] Normal runtime queue behavior no longer performs Supabase `ingestion_jobs` reads or writes:
- no `POST /rest/v1/ingestion_jobs`
- no `PATCH /rest/v1/ingestion_jobs`
- no queue-status fallback reads from Supabase in normal paths

a3) [have] Queue correctness, worker behavior, user-facing job status, and recovery behavior stayed intact through the accepted burn-in window.

a4) [have] The temporary rollback lever has now been removed from normal runtime; closure depends on burn-in confidence rather than dual-path fallback.

## Why This Plan Exists

b1) [have] The broader Oracle-ownership chapter has been paused at:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-deeper-ownership-and-supabase-reduction-plan.md)

b2) [have] That broader chapter established the direction, but it did not make the queue destination explicit enough.

b3) [have] For `queue`, the intended destination is now explicit:
- full Oracle ownership
- not indefinite partial shadowing

## Current State

c1) [have] Oracle queue ledger is already `primary` in live runtime.

c2) [have] Queue Ownership Pass 1 and Pass 2 already landed before cutover:
- explicit queue shadow diffing
- Oracle-local retry/requeue behavior
- narrower lifecycle-aware Supabase queue patch shapes
- continued conservative enqueue + terminal queue shadowing

c3) [have] Live Oracle primary checks remain green after those passes.

c4) [have] Oracle-only queue cutover is now landed in live runtime and remained healthy through later deploys:
- live runtime SHA during closure proof: `7865d961bcb38e26912de1781dab111638fedd01`
- Oracle primary check `PASS`
- queue shadow writes are skipped in logs with `reason:"oracle_primary_oracle_only"`
- queue is no longer a leading Supabase family in the latest burn-in samples

c5) [have] The current chapter question is no longer “can Oracle-only queue work?”
- it is “does the burn-in stay clean enough to close the chapter?”

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

g1) [have] One fast inventory of remaining Supabase queue touchpoints was completed before the cutover wave.

g2) [todo] Inventory buckets:
- normal runtime write
- normal runtime read
- stale-job / retry / dedupe dependency
- user/ops status dependency
- rollback-only dependency

g3) [have] Output:
- one explicit remove/keep-for-rollback decision per remaining Supabase queue touchpoint

g4) [have] This phase stayed short and decisive.

## Phase 1: Oracle-Only Cutover Wave

h1) [have] Normal runtime queue writes and reads were cut over to Oracle in one focused implementation wave.

h2) [have] Landed in that wave:
- remove Supabase queue writes from enqueue/start/lease/retry/terminal
- remove Supabase queue reads from owner/latest/status/health/dedupe paths
- keep only one explicit rollback path if Oracle queue behavior regresses

h3) [have] This was the main chapter event.
It should be treated as a cutover, not as another optimization pass.

## Phase 2: Short Burn-In / Canary

i1) [have] Oracle-only queue proved itself under:
- manual generation
- source-page unlock generation
- search generation
- subscription ingestion
- stale-running recovery
- retry/requeue paths

i2) [have] Burn-in now proceeds without the old rollback lever in runtime; remaining proof comes from health, logs, and attribution.

i3) [have] Burn-in evidence accepted:
- one meaningful burn-in window with queue correctness intact
- no unresolved user-visible queue regressions
- no hidden Supabase queue dependency surfaced in logs

## Phase 3: Cleanup And Closure

j1) [have] Obsolete normal-runtime Supabase queue compatibility code and the rollback env gate have now been removed from the active queue path.

j2) [have] Canonical docs were kept aligned through the closure proof window.

j3) [have] This plan is now moved to `completed/` because:
- Supabase queue runtime work is zero
- rollback is no longer needed
- canary/proof evidence is logged

## Proof Gates

m1) [have] Required proof before declaring queue cutover complete:
- Oracle primary check green
- public/local health green
- queue-specific runtime canaries green
- no unresolved stale-running recovery gaps
- Supabase attribution shows queue queue-work at or near zero in normal runtime

m2) [have] Required proof before closing the chapter:
- at least one meaningful burn-in window on Oracle-only queue
- no unresolved queue correctness incidents
- no hidden queue read/write dependency still found in logs or route behavior

## Rollback Rules

n1) [have] The old rollback lever was intentionally temporary and has now been removed from normal runtime.

n2) [have] Any future emergency rollback would require an explicit follow-up code change, not an environment toggle.

## Success Criteria

o1) [have] Oracle now fully owns normal queue operations in runtime.

o2) [have] Supabase `ingestion_jobs` no longer does normal runtime work.

o3) [have] Queue behavior remained correct and observable through burn-in.

o4) [have] The first backend domain with full Oracle ownership is complete now that burn-in is accepted and the plan is moved to `completed/`.

## Relationship To Paused Chapter

p1) [have] The broader Oracle-ownership chapter is paused as context:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-deeper-ownership-and-supabase-reduction-plan.md)

p2) [have] This queue plan is the sharper child chapter for one explicit destination:
- full Oracle queue ownership
