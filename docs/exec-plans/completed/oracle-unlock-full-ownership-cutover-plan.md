# Oracle Unlock Full Ownership Cutover Plan

Status: `completed`
Owner: `Codex / David`
Last updated: `2026-04-08`

## Purpose

Make Oracle the only normal operational unlock system for Bleu.

This is not an “egress trim” plan and not a vague “deeper ownership” exploration. It is a direct cutover plan with an explicit end state:
- Oracle owns unlock reservation, processing, retry/failure settlement, ready state, stale-recovery, and normal unlock reads
- Supabase `source_item_unlocks` stops participating in normal runtime behavior
- no Oracle unlock bootstrap/rehydration should accept stale Supabase unlock truth back into runtime
- any remaining Supabase unlock usage becomes temporary migration residue to delete, not a runtime dependency

This plan intentionally optimizes for decisiveness over prolonged incremental caution:
- the app is still in developer-mode tolerance
- short downtime/debugging pain is acceptable
- dual Oracle/Supabase unlock state is now a larger risk than a sharper single-owner cutover

## Explicit End State

a1) [have] Oracle is the sole normal operational unlock truth in runtime.

a2) [have] Normal runtime unlock behavior no longer depends on Supabase `source_item_unlocks` for:
- reservation
- processing transition
- fail/ready settlement
- stale-hold recovery
- wall/source-page unlock status reads
- bootstrap/rehydration

a3) [have] Supabase unlock shadow no longer rehydrates stale state back into Oracle.

a4) [have] Unlock correctness, retry behavior, and user-visible unlock states remained intact through the accepted burn-in window.

## Why This Plan Exists

b1) [have] The broader Oracle-ownership chapter is paused at:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/deserted/oracle-deeper-ownership-and-supabase-reduction-plan.md)

b2) [have] The queue full-ownership chapter is also now completed context:
- [oracle-queue-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-queue-full-ownership-cutover-plan.md)

b3) [have] Recent unlock regressions showed that the main risk is not Oracle itself.
The main risk is dual-state behavior:
- stale Supabase unlock rows can rehydrate bad state into Oracle
- Oracle/runtime fixes can be undermined by lingering compatibility shadow state
- the dual model is currently less stable than a single-owner Oracle model

b4) [have] Fully severing unlocks from Supabase should improve:
- runtime simplicity
- debuggability
- stability
- Supabase egress

## Current State

c1) [have] Oracle unlock ledger is already `primary` in live runtime.

c2) [have] Oracle product unlock mirror is also active, and Oracle is already doing the real operational unlock work.

c3) [have] Recent bugs demonstrated that stale Supabase unlock shadow still leaks back into Oracle bootstrap/rehydration.

c4) [have] A read-path mitigation is now landed so expired stale holds no longer need to render as active:
- SHA `46a220fa588c4c8a02ab840842fe324ce029f42e`

c5) [have] Phase 1 now lands the first decisive cut:
- Oracle bootstrap no longer rehydrates unlock truth from Supabase shadow
- Oracle product unlock bootstrap now rebuilds from Oracle unlock ledger state instead of `source_item_unlocks`

c6) [have] Supabase unlock shadow can still exist as compatibility residue, but it is no longer accepted as authoritative bootstrap input.

c7) [have] The current chapter question is no longer “should Oracle own unlocks operationally?”
- it is “how quickly do we remove Supabase unlock participation entirely?”

c8) [have] Phase 2 now lands the runtime severing wave:
- Oracle-primary unlock mutations no longer mirror `source_item_unlocks`
- Oracle-primary unlock readers no longer reread Supabase on miss
- transcript suppression / transcript revalidate seeding now read Oracle unlock ledger
- server-side `My Feed` unlock status now reads through injected Oracle-aware unlock loaders

c9) [have] Phase 3 burn-in evidence is now accepted:
- Oracle primary checks stayed green after deploy/restart
- unlock generation, transcript-failure settlement, and stale-unlock recovery stayed functional
- Oracle restart no longer rehydrated stale unlock truth from Supabase shadow

c10) [have] Phase 4 cleanup is now landed for the remaining meaningful product/read residue:
- Blueprint Detail source-channel lookup no longer queries `source_item_unlocks`
- liked-blueprint profile cards now resolve source linkage through variants/feed instead of unlock rows
- legacy browser-side `/api/my-feed` fallback no longer reads Supabase unlock rows directly when the backend is unavailable or unset

c11) [have] Remaining `source_item_unlocks` code references are now either:
- non-primary compatibility code paths retained for historical env support
- legacy/manual residue not used by the main server runtime
- tests/type/schema references

## Scope Lock

d1) [todo] This plan is unlock-only.

d2) [todo] Do not mix `queue`, `generation_state`, `source_items`, or `feed` cutovers into this plan.

d3) [todo] Do not treat this as a generic Supabase cost pass.

d4) [todo] Focus only on `source_item_unlocks` operational ownership.

## Main Files / Surfaces

e1) [have] Core unlock ownership seams:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/sourceUnlocks.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceUnlocks.ts)
- [server/services/unlockReliabilitySweeps.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/unlockReliabilitySweeps.ts)
- [server/services/oracleUnlockLedgerState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleUnlockLedgerState.ts)
- [server/services/oracleProductState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleProductState.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [src/lib/myFeedData.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedData.ts)

e2) [have] Main unlock behaviors to sever from Supabase:
- unlock row bootstrap/rehydration
- unlock shadow writes
- fallback unlock reads
- stale reservation recovery that still assumes Supabase shadow truth
- frontend/product reads that still route through Supabase unlock rows

## Fast Cutover Shape

f1) [have] Historical context:
- Oracle unlock runtime already became primary before this plan
- the remaining problem is compatibility residue, not lack of Oracle capability

f2) [todo] This plan aims directly for:
- `Oracle-only operational unlock path`

f3) [todo] Intermediate “ignore Supabase as input but still shadow as output” is acceptable only as a temporary execution aid, not the final resting state.

## Phase 0: One Fast Inventory

g1) [have] Enumerated the main remaining Supabase unlock touchpoints.

g2) [have] Inventory buckets:
- normal runtime write
- normal runtime read
- bootstrap/rehydration dependency
- stale-recovery dependency
- frontend/product reader dependency
- removable residue

g3) [have] Output:
- one explicit remove/replace decision per remaining `source_item_unlocks` touchpoint

## Phase 1: Stop Supabase Rehydration

h1) [have] Oracle unlock bootstrap/runtime is now authoritative.

h2) [have] Landed in this wave:
- stop Oracle unlock bootstrap from accepting stale Supabase unlock rows as input
- stop Oracle product unlock bootstrap from sourcing unlock rows from `source_item_unlocks`
- keep Oracle unlock ledger + Oracle product state as the only accepted bootstrap/runtime inputs

h3) [have] This is the first decisive cut because it removes the most harmful dual-state behavior immediately.

## Phase 2: Oracle-Only Unlock Runtime

i1) [have] Removed remaining normal-runtime Supabase unlock writes and Oracle-primary fallback reads from the main unlock mutation/read seams.

i2) [have] Landed in this wave:
- reservation/processing/fail/ready transitions stay Oracle-only
- stale-hold sweeps stay Oracle-only
- wall/source-page unlock reads no longer depend on Supabase unlock rows in the main server runtime
- transient/permanent transcript failure handling remains correct

i3) [have] After this phase, Supabase unlock shadow no longer matters to the main server runtime correctness path.

## Phase 3: Short Burn-In / Canary

j1) [have] Proved Oracle-only unlock behavior under:
- manual unlock
- source-page unlock generation
- transcript temporary failure + retry
- transcript permanent failure
- stale reservation cleanup
- wall/source-page unlock state refresh

j3) [have] Confirmed the remaining Supabase `source_item_unlocks` touchpoints are non-runtime/manual residue or compatibility/test references rather than the main server runtime path.

j2) [have] Success target:
- no unresolved stuck unlock rows
- no Supabase rehydration/drift
- no hidden Supabase unlock dependency surfacing in logs

## Phase 4: Cleanup And Closure

k1) [have] Removed the remaining meaningful Supabase unlock compatibility/product-read residue from the active runtime surfaces and synced canonical docs to the final Oracle-owned posture.

k2) [have] This plan is now moved to `completed/` because:
- Supabase unlock runtime work is zero
- no rehydration remains
- burn-in evidence is accepted

k3) [have] The unlock cutover chapter is complete and archived.

## Proof Gates

m1) [have] Required proof before declaring cutover complete:
- Oracle primary check green
- public/local health green
- unlock generation still works
- transcript-failure paths still settle correctly
- stale unlock recovery still works
- no stale Supabase unlock state reappears in Oracle after restart

m2) [have] Required proof before closing the chapter:
- at least one meaningful burn-in window
- no unresolved unlock correctness regressions
- Supabase attribution shows unlock-related work materially reduced

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring dual-state unlock runtime.

n2) [todo] Any emergency rollback should be an explicit code change, not a hidden long-lived compatibility toggle.

## Success Criteria

o1) [have] Oracle fully owns normal unlock operations in runtime.

o2) [have] Supabase `source_item_unlocks` no longer does normal runtime work.

o3) [have] Unlock state no longer rehydrates from stale Supabase shadow.

o4) [have] Unlock behavior remained correct and observable through burn-in.

## Relationship To Paused Chapters

p1) [have] The broader Oracle-ownership chapter remains paused as context:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/deserted/oracle-deeper-ownership-and-supabase-reduction-plan.md)

p2) [have] The queue full-ownership chapter also remains completed context:
- [oracle-queue-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/oracle-queue-full-ownership-cutover-plan.md)

p3) [have] This unlock plan is the next explicit child chapter for one sharper destination:
- full Oracle unlock ownership
