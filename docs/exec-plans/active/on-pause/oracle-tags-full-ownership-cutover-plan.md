# Oracle Tags Full Ownership Cutover Plan

Status: `on-pause`
Owner: `Codex / David`
Last updated: `2026-04-12`

## Purpose

Make Oracle the only normal operational `tags` system for Bleup.

This is a full ownership chapter, not a narrow trim. The explicit end state is:
- Oracle owns normal runtime `tags` truth
- Supabase `tags` stops participating in normal runtime behavior
- no normal tag create/read path should depend on Supabase `tags`
- any remaining Supabase `tags` usage becomes migration residue to delete, not a steady-state dependency

This chapter is broader than `blueprint_tags` because `tags` acts like a shared catalog surface:
- tag creation/upsert is shared by multiple backend flows
- tag lookup by slug/name/id shapes multiple product surfaces
- the migration may require catalog/bootstrap handling before normal write/read severing
- that makes this chapter a deliberate later migration, not the safest next move while a live tester is active

## Explicit End State

a1) [todo] Oracle is the sole normal operational `tags` truth in runtime.

a2) [todo] Normal runtime tag behavior no longer depends on Supabase for:
- tag creation/upsert
- tag lookup by slug
- tag lookup by id/name where still used
- tag metadata reads used by channels, search, suggestions, and blueprint shaping

a3) [todo] Tag read/write behavior remains correct through burn-in.

a4) [todo] Supabase `tags` stops doing normal runtime work; any residue is manual/historical only.

## Why This Plan Exists

b1) [have] The latest sampled 24h Supabase attribution is materially led by `tags`.

b2) [have] Current 24h sampled attribution on `2026-04-12` shows:
- `tags` `17.2%`
- `GET /rest/v1/tags` `10.3%`
- `POST /rest/v1/tags` `5.7%`

b3) [have] That makes `tags` a legitimate full migration candidate, not just a follow-up cleanup.

b4) [have] `tags` is also a simplification target:
- fewer dual-state catalog reads
- fewer mixed runtime write paths
- less ambiguity around tag lookup ownership

b5) [have] Even so, `tags` is not the current lowest-risk next migration.
- lower-risk candidates currently ahead of it are:
  - `provider_circuit_state`
  - `channel_candidates`
  - `notifications`

## Current State

c1) [have] Oracle ownership work is already completed for queue, unlocks, feed, source-items, generation-state, and generation-trace.

c2) [have] `blueprint_tags` is now its own ownership chapter and should not be treated as a substitute for `tags`.

c3) [have] The current open question is whether `tags` behaves like:
- a runtime-owned table
or
- a shared catalog with bootstrap/seed semantics

c4) [have] That question should be answered explicitly before deciding whether this chapter can follow the simple write-then-read cutover shape used by narrower domains.

c5) [have] This plan remains queued, but it should be treated as a broader later chapter rather than the immediate next migration while first-tester stability matters.

## Scope Lock

d1) [todo] This plan is `tags` only.

d2) [todo] Do not mix `blueprint_tags`, `channel_candidates`, `notifications`, or other remaining Supabase families into this chapter except where `tags` is a hard dependency.

d3) [todo] Focus on normal operational ownership of:
- tag create/upsert
- tag read/lookups
- catalog/bootstrap semantics if they exist

## Likely Main Files / Surfaces

e1) [todo] Expected backend ownership seams to inspect first:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/routes/channels.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/channels.ts)
- `server/services/*tag*`
- any helper that creates or resolves tags during blueprint/channel flows

e2) [todo] Expected frontend/product read seams to inspect first:
- [src/hooks/useSuggestedTags.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSuggestedTags.ts)
- [src/hooks/useExploreSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useExploreSearch.ts)
- [src/hooks/useBlueprintSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintSearch.ts)
- `src/lib/*tag*`

e3) [todo] The inventory must verify the real seams rather than trust this initial list.

## Fast Cutover Shape

f1) [todo] This chapter likely follows:
1. inventory
2. bootstrap/catalog decision
3. Oracle-only writes
4. Oracle-only reads
5. burn-in
6. closure

f2) [todo] If Phase 0 proves `tags` is truly runtime-only, the chapter may collapse into a simpler writes-then-reads sequence.

f3) [todo] If Phase 0 proves `tags` has real catalog/bootstrap semantics, cutover must explicitly handle seeding/bootstrap before severing runtime reads.

## Phase 0: One Fast Inventory

g1) [todo] Enumerate every meaningful `tags` touchpoint and classify it as:
- runtime write
- runtime read
- catalog/bootstrap dependency
- browser/product residue
- removable legacy residue

g2) [todo] Answer these specific questions:
- where are tags created or upserted?
- where are tags looked up by slug, id, or name?
- which product surfaces depend on tag metadata?
- is there a real bootstrap/catalog ownership concern?

g3) [todo] Produce one explicit decision per seam:
- remove
- replace with Oracle-owned path
- keep temporarily as migration residue

g4) [todo] Output the exact first implementation wave and whether the chapter needs a real bootstrap phase.

## Phase 1: Bootstrap / Catalog Decision

h1) [todo] If `tags` behaves like a shared catalog, land the minimum Oracle seeding/bootstrap path first.

h2) [todo] If `tags` is effectively runtime-owned already, mark this phase trivial and proceed directly to writes.

## Phase 2: Oracle-Only Tag Writes

i1) [todo] Remove the main normal-runtime Supabase `tags` writes from tag creation/upsert paths.

i2) [todo] Keep caller behavior stable while changing only the write owner.

i3) [todo] After this phase, Supabase `tags` should no longer matter to normal runtime tag-write correctness.

## Phase 3: Oracle-Only Tag Reads

j1) [todo] Remove remaining normal-runtime Supabase `tags` reads from backend and browser/product surfaces.

j2) [todo] Oracle-backed tag lookup should become authoritative in normal runtime.

j3) [todo] After this phase, Supabase `tags` should no longer matter to normal runtime tag-read correctness.

## Phase 4: Short Burn-In / Canary

k1) [todo] Validate Oracle-only tag behavior under:
- channel/topic flows
- tag suggestions
- search/explore lookups
- blueprint shaping surfaces that still depend on tag metadata

k2) [todo] Required burn-in target:
- tag lookups remain correct
- tag creation/upsert remains correct
- no hidden Supabase tag dependency resurfaces
- Supabase `tags` egress drops materially

## Phase 5: Cleanup And Closure

l1) [todo] Remove remaining meaningful Supabase `tags` compatibility residue from active runtime surfaces and sync canonical docs to the final Oracle-owned posture.

l2) [todo] Move this plan to `completed/` once:
- Supabase `tags` runtime work is zero or negligible
- no hidden dependency remains
- burn-in evidence is accepted

## Proof Gates

m1) [todo] Required proof before declaring `tags` cutover complete:
- Oracle primary/runtime health green
- tag creation/upsert succeeds in normal runtime
- tag lookup/read surfaces still return expected metadata

m2) [todo] Required proof before closing the chapter:
- at least one meaningful burn-in window
- no unresolved tag correctness regressions
- Supabase attribution shows `tags` materially reduced

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring dual-state `tags` runtime.

n2) [todo] Any emergency rollback should be an explicit code/env change, not a hidden long-lived compatibility path.

## Success Criteria

o1) [todo] Oracle fully owns normal `tags` operations in runtime.

o2) [todo] Supabase `tags` no longer does normal runtime work.

o3) [todo] Tag read/write behavior remains correct through burn-in.
