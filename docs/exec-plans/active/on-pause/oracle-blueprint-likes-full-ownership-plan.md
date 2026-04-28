# Oracle Blueprint Likes Full Ownership Plan

Status: `paused`
Owner: `Codex / David`
Last updated: `2026-04-21`

## Purpose

Make Oracle the only normal operational `blueprint_likes` system for Bleu.

This is not a quick read trim and not a small toggle optimization. It is a full ownership chapter with an explicit end state:
- Oracle owns normal runtime blueprint-like reads, writes, counts, and user-like status resolution
- browser and backend no longer treat Supabase `blueprint_likes` as canonical runtime storage
- no long-lived dual-read or dual-write resting state remains
- any remaining Supabase `blueprint_likes` usage is explicit bootstrap or audited break-glass residue, not runtime dependence

This chapter follows the same operating principle as the earlier Oracle ownership plans:
- runtime ownership should be singular and observable
- hidden fallback creates misleading attribution and brittle behavior
- the target is robust closure, not a quick local reduction in one query

## Explicit End State

a1) [todo] Oracle is the sole normal operational truth for `blueprint_likes`.

a2) [todo] Normal runtime like behavior no longer depends on Supabase for:
- blueprint detail like status
- blueprint detail like counts
- like/unlike mutation flows
- wall/source/profile card like status
- profile liked-blueprints lists
- any backend helper that enriches blueprint payloads with like state

a3) [todo] Browser/runtime surfaces do not read or write `blueprint_likes` directly from Supabase.

a4) [todo] Supabase `blueprint_likes` becomes bootstrap-only or break-glass residue, then removable.

a5) [todo] Normal attribution trends toward `0%` runtime `blueprint_likes` Supabase egress after burn-in.

## Why This Plan Exists

b1) [have] Fresh 24h attribution on `2026-04-21` shows `blueprint_likes` as the leading visible Supabase family:
- `blueprint_likes` `17.5%`

b2) [have] The hottest like-related normalized endpoint is:
- `GET /rest/v1/blueprint_likes?blueprint_id:in&user_id:eq`

b3) [have] This is user-multiplied browse/social traffic, not a compatibility-shadow seam.

b4) [have] That makes `blueprint_likes` a stronger immediate scaling target than continuing to chip away at the smaller remaining `blueprints` residue.

## Current State

c1) [have] The current runtime still treats `blueprint_likes` as a Supabase-owned surface.

c2) [have] The latest attribution indicates both backend and frontend participation:
- backend enrichment/status reads
- frontend authenticated like-status reads

c3) [have] `blueprint_likes` likely participates in:
- blueprint detail like status/count
- wall/source/profile card enrichment
- profile liked-blueprints views
- optimistic like/unlike flows

c4) [todo] The exact caller inventory needs to be completed at implementation start, but the ownership problem is already clear from attribution.

## Scope Lock

d1) [todo] This chapter is `blueprint_likes` only.

d2) [todo] Do not mix `blueprints`, `profiles`, `tags`, `comments`, or feed/source compatibility work into this chapter unless a hard dependency must be touched.

d3) [todo] Treat like reads, counts, and mutations as one ownership surface.

## Main Files / Surfaces

e1) [todo] Current browser/runtime like surfaces to inventory and cut over:
- [src/hooks/useBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/hooks/useUserProfile.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useUserProfile.ts)
- any frontend like-specific API/helper under [src/lib](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/lib)

e2) [todo] Current backend/runtime surfaces likely involved in like enrichment:
- [server/services/wallFeed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/wallFeed.ts)
- [server/services/profileHistory.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/profileHistory.ts)
- [server/routes/profileRead.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/profileRead.ts)
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)

e3) [todo] New Oracle ownership layer likely needed:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- new [server/services/oracleBlueprintLikeState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleBlueprintLikeState.ts)

## Strategy

f1) [have] This chapter must end in full Oracle runtime ownership, not an “Oracle-first but Supabase still handles some toggles and joins” compromise.

f2) [have] That means the chapter must cut both:
- backend ownership
- frontend/browser consumption

f3) [have] The correct sequence is:
- inventory every active like caller
- add Oracle like state
- add backend like API/services
- move all main readers and writers to Oracle-backed paths
- remove direct Supabase runtime dependence

## Phase 1: Oracle Like State + Backend API Ownership

g1) [todo] Add Oracle-owned like storage and helpers.
Files:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- `server/services/oracleBlueprintLikeState.ts`

g2) [todo] Support the full runtime contract in Oracle:
- read like status for `(blueprint_id, user_id)`
- count likes by `blueprint_id`
- batch read like status for multiple blueprint ids
- toggle like/unlike idempotently
- list liked blueprint ids for a user

g3) [todo] Keep stable timestamps and dedupe semantics so existing UI expectations do not regress.

g4) [todo] Add backend routes/services so like consumers stop needing direct Supabase access.
Likely shape:
- `GET /api/blueprints/:id/like-state`
- `POST /api/blueprints/:id/like`
- `DELETE /api/blueprints/:id/like`
- backend batch/helper readers for wall/profile/detail enrichment

## Phase 2: Move Main Product Surfaces To Oracle-Backed APIs

h1) [todo] Cut blueprint detail like state over.
Primary file:
- [src/hooks/useBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprints.ts)

h2) [todo] Replace direct Supabase like writes with backend API mutations.

h3) [todo] Replace direct browser status/count reads with backend-hydrated payloads so the browser does not separately query `blueprint_likes`.

h4) [todo] Keep the UI contract stable:
- same like count display
- same user-like status behavior
- same optimistic/refetch semantics where appropriate

## Phase 3: Move Browse/Profile Like Surfaces To Oracle

i1) [todo] Cut wall/source/profile card enrichment over to Oracle-backed like payloads.

i2) [todo] Cut profile liked-blueprints surfaces over.
Primary file:
- [src/hooks/useUserProfile.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useUserProfile.ts)

i3) [todo] Ensure backend profile/history readers resolve liked blueprint lists without direct Supabase `blueprint_likes` joins.

## Phase 4: Remove Runtime Supabase Like Dependence

j1) [todo] Remove or hard-disable normal runtime `blueprint_likes` direct reads/writes in the browser once API-backed paths are live.

j2) [todo] Audit backend/runtime for any remaining direct `blueprint_likes` dependence and cut it in the same chapter.

j3) [todo] If wall/detail/profile surfaces derive like counts or liked-state via enrichment helpers, ensure those resolve from Oracle-backed data or Oracle-aware aggregators instead of falling back to Supabase.

## Phase 5: Burn-In And Closure

k1) [todo] Verify production behavior under real use:
- blueprint detail like/unlike works
- wall cards show correct liked state
- source/profile cards show correct liked state
- profile liked-blueprints lists work
- no count drift or optimistic-toggle regressions appear

k2) [todo] Verify Supabase attribution after soak:
- `blueprint_likes` should materially reduce
- remaining `blueprint_likes` activity, if any, must be explicit bootstrap/break-glass residue

k3) [todo] Move this chapter to `completed/` only after:
- runtime behavior is stable
- attribution confirms normal-runtime cutover
- no meaningful direct Supabase like path remains

## Proof Gates

l1) [todo] Required technical proof:
- Oracle health/parity green
- local typecheck/build green
- targeted like tests green

l2) [todo] Required product proof:
- detail like toggle works
- like counts stay correct
- liked blueprint lists work
- no obvious hydration regressions appear

l3) [todo] Required scaling proof:
- Supabase attribution no longer shows `blueprint_likes` as a leading runtime family

## Rollback Rules

m1) [todo] Prefer fix-forward over restoring long-lived dual runtime ownership.

m2) [todo] Any rollback must be explicit, not a hidden fallback that leaves likes split across Oracle and Supabase indefinitely.

## Success Criteria

n1) [todo] Oracle owns normal runtime `blueprint_likes` behavior end to end.

n2) [todo] Browser/product like surfaces no longer depend on direct Supabase like reads/writes.

n3) [todo] Supabase egress on likes trends toward `0%` for normal runtime traffic.

n4) [todo] The product remains stable under normal browse/like use after burn-in.
