# Oracle Blueprint Comments Full Ownership Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-19`

## Purpose

Make Oracle the only normal operational `blueprint_comments` system for Bleu.

This is not a small read-trim pass and not a “reduce one endpoint” cleanup. It is a full ownership chapter with an explicit end state:
- Oracle owns normal runtime blueprint comment reads, writes, edit/delete behavior, and comment-derived counts
- browser and backend no longer treat Supabase `blueprint_comments` as canonical runtime storage
- no long-lived dual-read or dual-write resting state remains
- any remaining Supabase `blueprint_comments` usage becomes historical/manual residue, not a runtime dependency

This chapter follows the same lesson as the recent feed/source/channel compatibility removal:
- split ownership creates hidden seams and misleading product behavior
- Oracle-only runtime ownership is simpler, more stable, and cheaper to scale
- the target is robust closure, not a quick patch

## Explicit End State

a1) [todo] Oracle is the sole normal operational truth for `blueprint_comments`.

a2) [todo] Normal runtime comment behavior no longer depends on Supabase for:
- blueprint detail comment reads
- comment create flows
- user-profile comment history/activity reads
- comment edit/delete flows, if currently supported
- any backend helper that derives or displays comment counts

a3) [todo] Browser/runtime surfaces do not read or write `blueprint_comments` directly from Supabase.

a4) [todo] Supabase `blueprint_comments` becomes residue only, then removable.

a5) [todo] Supabase attribution shows `blueprint_comments` materially reduced after burn-in.

## Why This Plan Exists

b1) [have] The feed/source/channel ownership chapter is now stable a day later and no longer dominates Supabase attribution.

b2) [have] The fresh 24h sampled attribution on `2026-04-19` is now led by `blueprint_comments`:
- `blueprint_comments` `18.9%`

b3) [have] The hottest normalized endpoint is:
- `GET /rest/v1/blueprint_comments?blueprint_id:eq`

b4) [have] Current `blueprint_comments` traffic is user-multiplied browse/social traffic, not a compatibility-shadow seam.

b5) [have] That makes `blueprint_comments` a better scaling target than further work on the already-cooled feed/source/channel spine.

## Current State

c1) [have] The current comment runtime is still browser-direct in the main product surfaces:
- [src/hooks/useBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/hooks/useUserProfile.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useUserProfile.ts)

c2) [have] `useBlueprintComments` currently:
- reads `blueprint_comments` directly from Supabase
- then performs a second `profiles` read for comment authors

c3) [have] `useCreateBlueprintComment` currently writes `blueprint_comments` directly to Supabase.

c4) [have] `useUserComments` and `useUserActivity` currently read `blueprint_comments` directly from Supabase for profile/history surfaces.

c5) [have] This means the current comment system is not Oracle-owned in runtime, and scaling comment traffic will multiply Supabase read pressure with user count.

## Scope Lock

d1) [todo] This chapter is `blueprint_comments` only.

d2) [todo] Do not mix `blueprint_youtube_comments`, `blueprints`, `profiles`, `likes`, or feed/source compatibility work into this chapter except where a hard dependency must be touched.

d3) [todo] Treat comment counts, comment lists, and comment mutations as one ownership surface.

## Main Files / Surfaces

e1) [have] Current browser/runtime comment surfaces:
- [src/hooks/useBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/hooks/useUserProfile.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useUserProfile.ts)

e2) [have] Backend/runtime surfaces likely needed for the cutover:
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)
- [server/routes](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes)
- comment-related backend helpers to add for list/create/update/delete/count

e3) [have] Comment-count display dependency to audit during the chapter:
- [server/services/wallFeed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/wallFeed.ts)

e4) [todo] New Oracle ownership layer likely needed:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- new [server/services/oracleBlueprintCommentState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleBlueprintCommentState.ts)

## Strategy

f1) [have] This chapter should end in full Oracle ownership, not a long-lived “Oracle-first but browser still reads Supabase” compromise.

f2) [have] That means the chapter must cut both:
- backend ownership
- frontend/browser consumption

f3) [have] The right sequence is not “patch one hook.”
It is:
- add Oracle comment state
- add backend comment API/services
- move all main comment readers/writers to that API
- remove direct Supabase runtime dependence

## Phase 1: Oracle Comment State + Backend API Ownership

g1) [todo] Add Oracle-owned comment storage and helpers.
Files:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- `server/services/oracleBlueprintCommentState.ts`

g2) [todo] Support the full runtime contract in Oracle:
- list comments by `blueprint_id`
- create comment
- list comments by `user_id`
- comment counts by blueprint
- update/delete if supported by current product behavior

g3) [todo] Use stable comment ids and durable timestamps so existing UI expectations do not regress.

g4) [todo] Add backend routes/services so comment consumers stop needing direct Supabase access.
Likely shape:
- `GET /api/blueprints/:id/comments`
- `POST /api/blueprints/:id/comments`
- `GET /api/users/:id/comments` or equivalent profile-scoped reader

## Phase 2: Move Main Product Surfaces To Oracle-Backed APIs

h1) [todo] Cut blueprint detail comments over.
Primary file:
- [src/hooks/useBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprints.ts)

h2) [todo] Replace direct Supabase comment writes in `useCreateBlueprintComment` with the backend API.

h3) [todo] Replace direct comment/profile fanout reads with backend-hydrated comment payloads so the browser does not do:
- `blueprint_comments`
- then `profiles`
as separate Supabase reads for the same screen

h4) [todo] Keep the UI contract stable:
- same comment sort behavior
- same author display fields
- same optimistic/refetch semantics where appropriate

## Phase 3: Move Profile/History Comment Surfaces To Oracle

i1) [todo] Cut profile comment history and activity over.
Primary file:
- [src/hooks/useUserProfile.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useUserProfile.ts)

i2) [todo] Ensure profile/activity views read comment history through backend Oracle-backed payloads, not direct Supabase `blueprint_comments`.

i3) [todo] If blueprint title joins are needed, resolve them server-side so the browser does not reassemble comment history from multiple Supabase tables.

## Phase 4: Remove Runtime Supabase Comment Dependence

j1) [todo] Remove or hard-disable the normal runtime `blueprint_comments` direct-read/write paths in the browser once the API-backed paths are live.

j2) [todo] Audit backend/runtime for any remaining direct `blueprint_comments` dependence and cut it in the same chapter.

j3) [todo] If wall/feed/detail surfaces derive comment counts, ensure those counts come from Oracle-backed data or Oracle-aware aggregators instead of falling back to Supabase.

## Phase 5: Burn-In And Closure

k1) [todo] Verify production behavior under real use:
- comment list loads
- comment create succeeds
- profile comment history loads
- activity surfaces remain coherent
- no missing author/title data regressions

k2) [todo] Verify Supabase attribution after soak:
- `blueprint_comments` should materially reduce
- any remaining `blueprint_comments` activity must be explainable residue, not normal runtime dependence

k3) [todo] Move this chapter to `completed/` only after:
- runtime behavior is stable
- attribution confirms the cutover
- no meaningful direct Supabase comment path remains

## Proof Gates

l1) [todo] Required technical proof:
- Oracle health/parity green
- local typecheck/build green
- targeted comment tests green

l2) [todo] Required product proof:
- blueprint detail comments work
- user comment history works
- create comment works
- no obvious author/title hydration regressions

l3) [todo] Required scaling proof:
- Supabase attribution no longer shows `blueprint_comments` as a leading runtime family

## Rollback Rules

m1) [todo] Prefer fix-forward over restoring long-lived dual runtime ownership.

m2) [todo] Any rollback must be an explicit code/env decision, not a hidden fallback that leaves the browser/API split indefinitely.

## Success Criteria

n1) [todo] Oracle owns normal runtime `blueprint_comments` behavior end to end.

n2) [todo] Browser/product comment surfaces no longer depend on direct Supabase comment reads/writes.

n3) [todo] Supabase egress meaningfully drops on comment traffic.

n4) [todo] The product remains stable under normal browse/comment use after burn-in.
