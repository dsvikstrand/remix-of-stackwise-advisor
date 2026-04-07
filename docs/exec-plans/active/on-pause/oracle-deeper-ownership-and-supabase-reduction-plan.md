# Oracle Deeper Ownership And Supabase Reduction Plan

Status: `paused`
Owner: `Codex / David`
Last updated: `2026-04-06` (new chapter opened after the post-migration egress reduction chapter reached functional closure)

## Purpose

Move from post-migration egress trimming into a deeper architecture chapter where Oracle owns more of the normal backend operational path and Supabase becomes narrower, more optional, or fallback-only by domain.

This chapter is intentionally domain-by-domain:
- keep existing app behavior stable
- preserve explicit rollback paths
- remove Supabase dependency in bounded backend slices
- prove each slice before widening

## Current State

a1) [have] Oracle is already primary for the major backend/control-plane runtime surfaces:
- queue ledger
- subscription ledger
- unlock ledger
- feed ledger
- source-item ledger
- generation execution state

a2) [have] The previous active chapter reduced the biggest leftover Supabase compatibility/shadow/fallback churn enough that the system is no longer dominated by one migration-era residue family.

a3) [have] Recent live attribution is now more balanced across backend families instead of being dominated by a single old subscription or source-item hotspot.

a4) [have] Oracle primary health has been repeatedly stable:
- public/local health green
- Oracle primary checks passing
- control-plane parity signals clean

a5) [have] That means the next question is no longer “can Oracle be primary?”.
The next question is:
- where does Supabase still remain operationally necessary
- and where is it only compatibility baggage now

## Goal

b1) [todo] Reduce backend dependence on Supabase by giving Oracle more responsibility in carefully chosen domains.

b2) [todo] Narrow Supabase’s role from normal operational path toward:
- compatibility shadow only
- fallback only
- or removable dependency

b3) [todo] Keep existing user-facing behavior intact while doing this:
- generation still works
- source-page and wall behavior stay stable
- queue correctness stays intact
- rollback remains explicit per domain

## Scope Lock

c1) [todo] Work one backend domain at a time.

c2) [todo] Prefer backend-owned domains first, before mixed frontend/product tables.

c3) [todo] Do not broaden this chapter into “replace Supabase everywhere”.

c4) [todo] Treat Supabase auth, browser-facing product tables, and other platform-native surfaces as later-stage questions, not first-wave targets.

## Domain Order

d1) [todo] Recommended order for this chapter:
1. `queue`
2. `generation_state`
3. `source_items`
4. `source_item_unlocks`
5. `user_feed_items`
6. only later consider more product/frontend-facing tables

d2) [have] Why this order:
- `queue` and `generation_state` are the most backend-owned and lowest-risk to deepen
- `source_items` is still backend-heavy but more product-adjacent
- `unlocks` and `feed` are more correctness-sensitive and user-visible
- frontend/product tables need a different level of care because Supabase still plays a stronger platform role there

## Migration Ladder

e1) [todo] For each domain, classify the live state using the same ladder:
1. `primary + full shadow`
2. `primary + minimal shadow`
3. `primary + fallback-only`
4. `Oracle-only operational path`

e2) [todo] Do not skip steps without proof.

e3) [todo] Each domain must explicitly document:
- what Supabase writes still happen
- what Supabase reads still happen
- which of those are true requirements
- which are only compatibility carry-over

## Proof Gates

f1) [todo] Before reducing Supabase responsibility further for a domain, require:
- public/local health green
- Oracle primary/parity checks green for the affected domain
- stable app/runtime canaries for the affected user flows
- logs proving the Oracle path handled the normal operation end to end

f2) [todo] Before removing compatibility writes for a domain, require:
- no unresolved parity drift
- no unresolved rollback gaps
- no frontend/user flow that still assumes Supabase is the normal operational truth

## Rollback Rules

g1) [todo] Every domain change must preserve a clean rollback lever.

g2) [todo] Rollback must be domain-specific, not all-or-nothing.

g3) [todo] If Oracle behavior regresses for a domain, rollback should restore that domain to the prior shadow/fallback mode without forcing unrelated domains backward.

## Phase 1: Queue Audit

h1) [have] `queue` is the first concrete workstream in this chapter, and Queue Ownership Pass 1 has already landed.

h2) [have] Primary files for the queue ownership chapter so far:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/oracleQueueClaimGovernor.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleQueueClaimGovernor.ts)
- [server/services/oracleQueueSweepScheduler.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleQueueSweepScheduler.ts)
- [server/services/queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)

h3) [have] Queue Ownership Pass 1 outcomes:
- queue shadow diffing is now explicit
- unchanged material queue state skips Supabase shadow writes
- Oracle-primary retry requeues can stay Oracle-local instead of automatically mirroring `ingestion_jobs` back to Supabase
- enqueue and terminal queue writes remain conservative on purpose

h4) [todo] Queue Pass 2 audit questions:
- which remaining Supabase queue reads are still normal-path requirements
- which remaining Supabase queue writes are still compatibility-only
- which remaining queue writes are needed for rollback safety
- which queue shadows can move from “always mirror” to “fallback-only”

h5) [todo] Queue Pass 2 implementation focus:
- inspect the remaining `PATCH /rest/v1/ingestion_jobs?id:eq` shadow writes
- classify them by action:
  - claim/start
  - heartbeat/lease
  - retry/requeue
  - terminal
- decide which remaining write classes can move from normal shadowing to fallback-only

h6) [todo] Queue outcome target:
- decide whether queue can move from `primary + minimal shadow` to a stricter `primary + fallback-only` operational model
- do this without jumping straight to Oracle-only queue in one pass

## Phase 2: Generation State

i1) [todo] After queue, audit `generation_state`.

i2) [todo] Focus:
- which run/variant writes still need Supabase as normal operational truth
- whether event/run summary truth can become more Oracle-native without breaking product/runtime expectations

## Later Phases

j1) [todo] `source_items`
- determine whether the remaining Supabase role is still materially useful or mostly compatibility ballast

j2) [todo] `source_item_unlocks`
- evaluate only after queue/generation-state are cleaner, because unlock flows are more user-facing and correctness-sensitive

j3) [todo] `user_feed_items`
- evaluate only after upstream source/unlock/generation ownership is clearer

## Success Criteria

k1) [todo] Oracle owns more of the normal operational backend path by domain.

k2) [todo] Supabase becomes narrower, more explicitly optional, or removable in those backend domains.

k3) [todo] User-facing behavior stays stable and rollback remains practical.

## Relationship To Prior Chapter

l1) [have] The prior active chapter is now historical context:
- [supabase-egress-attribution-and-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/supabase-egress-attribution-and-reduction-plan.md)

l2) [have] That chapter was about:
- attribution
- one-family-at-a-time Supabase churn reduction
- proving Oracle-primary runtime stability

l3) [have] This new chapter is about:
- deeper Oracle ownership
- less backend dependency on Supabase by design
