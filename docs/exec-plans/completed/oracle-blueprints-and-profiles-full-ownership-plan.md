# Oracle Blueprints And Profiles Full Ownership Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-19`

## Purpose

Make Oracle the only normal operational read owner for `blueprints` and `profiles` in Bleu.

This is not a small endpoint trim and not a “move one hook off Supabase” pass. It is a full ownership chapter with an explicit end state:
- Oracle owns normal runtime blueprint reads and profile reads on the main product surfaces
- browser and backend no longer treat Supabase `blueprints` or `profiles` as canonical runtime read stores
- no long-lived dual-read resting state remains
- any remaining Supabase `blueprints` / `profiles` usage becomes historical/manual residue, not a runtime dependency

This chapter follows the same lesson as the recent feed/source/channel and comments chapters:
- split ownership creates hidden seams, misleading UI, and expensive scale behavior
- Oracle-only runtime ownership is simpler, more stable, and cheaper to scale
- the target is robust closure, not a quick patch

## Explicit End State

a1) [todo] Oracle is the sole normal operational read owner for `blueprints`.

a2) [todo] Oracle is the sole normal operational read owner for `profiles`.

a3) [todo] Normal runtime blueprint behavior no longer depends on Supabase for:
- blueprint detail reads
- blueprint list/card reads
- blueprint title/banner/summary hydration
- creator/profile hydration attached to blueprint surfaces

a4) [todo] Normal runtime profile behavior no longer depends on Supabase for:
- public profile reads
- creator card/profile hydration
- profile blueprint lists
- profile-adjacent browse/history surfaces that still need blueprint/profile joins

a5) [todo] Browser/runtime surfaces do not read `blueprints` or `profiles` directly from Supabase for the main product experience.

a6) [todo] Supabase attribution shows `blueprints` and `profiles` materially reduced after burn-in.

## Why This Plan Exists

b1) [have] The feed/source/channel compatibility chapter is complete enough to leave active work, and the `blueprint_comments` chapter is now live and healthy.

b2) [have] Fresh attribution after those chapters no longer shows the old compatibility spine as the dominant issue.

b3) [have] The remaining visible scaling-facing families now include:
- `blueprints` `13.5%`
- `profiles` `12.2%`

b4) [have] These are user-multiplied browse/read surfaces, which means they will scale directly with usage.

b5) [have] Treating `blueprints` and `profiles` as separate small chapters would likely preserve another split-owner seam, because many runtime surfaces hydrate them together.

b6) [have] That makes this a combined ownership chapter, not two independent quick fixes.

## Current State

c1) [have] The main product still reads `blueprints` directly from Supabase in multiple runtime surfaces.

c2) [have] The main product still reads `profiles` directly from Supabase in multiple runtime surfaces.

c3) [have] Blueprint detail, profile screens, wall/source cards, and other browse surfaces still rely on these legacy reads in different combinations.

c4) [have] That means Oracle ownership is still incomplete for the core browse/read path even after comments, tags, feed, source, and channel improvements.

c5) [have] The current runtime shape therefore still carries:
- Supabase read egress that scales with users
- split hydration responsibility between backend Oracle-owned paths and browser-direct Supabase queries
- risk of another “real truth exists, UI shows something else” seam

## Scope Lock

d1) [todo] This chapter is about `blueprints` and `profiles` runtime ownership together.

d2) [todo] Do not mix comments, likes, subscriptions, tags, or feed/source compatibility work into this chapter except where a hard dependency must be touched.

d3) [todo] Treat blueprint reads and profile reads as one ownership surface because the runtime repeatedly joins them.

## Main Files / Surfaces

e1) [have] Current browser/runtime blueprint/profile surfaces likely in scope:
- [src/hooks/useBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/hooks/useUserProfile.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useUserProfile.ts)

e2) [have] Current backend/runtime surfaces likely in scope:
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)
- [server/services/wallFeed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/wallFeed.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/profileHistory.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/profileHistory.ts)
- relevant backend route files under [server/routes](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes)

e3) [todo] New Oracle ownership layers likely needed:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- `server/services/oracleBlueprintState.ts`
- `server/services/oracleProfileState.ts`

## Strategy

f1) [have] This chapter should end in full Oracle read ownership, not a long-lived “backend sometimes Oracle, browser still Supabase” compromise.

f2) [have] That means the chapter must cut both:
- backend read ownership
- frontend/browser consumption

f3) [have] The right sequence is not “patch one hook.”
It is:
- add Oracle blueprint/profile state
- add backend blueprint/profile APIs and read helpers
- move all main blueprint/profile readers to those APIs
- remove direct Supabase runtime dependence

## Phase 1: Oracle Blueprint/Profile State + Core Backend Read APIs

g1) [todo] Add Oracle-owned blueprint storage and helpers.
Files:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- `server/services/oracleBlueprintState.ts`

g2) [todo] Add Oracle-owned profile storage and helpers.
Files:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- `server/services/oracleProfileState.ts`

g3) [todo] Bootstrap both stores from legacy Supabase on empty state so existing public content remains visible after cutover.

g4) [todo] Add backend routes/services for the canonical reads.
Likely shape:
- `GET /api/blueprints/:id`
- `GET /api/profile/:userId`
- possibly batch/list helpers where main surfaces need them

## Phase 2: Move Blueprint Detail And Core Profile Reads To Oracle

h1) [todo] Cut blueprint detail over first.
Primary file:
- [src/hooks/useBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprints.ts)

h2) [todo] Replace direct Supabase blueprint/profile hydration in detail with backend Oracle-backed payloads.

h3) [todo] Keep the detail UI contract stable:
- same blueprint content
- same creator display fields
- same likes/tags/comment integrations where those are already handled by separate chapters

h4) [todo] Cut public profile read over next.
Primary file:
- [src/hooks/useUserProfile.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useUserProfile.ts)

## Phase 3: Move List/Card/Browse Surfaces To Oracle

i1) [todo] Cut wall/source/profile blueprint card surfaces over so blueprint and creator hydration no longer relies on direct Supabase `blueprints` / `profiles`.

i2) [todo] Move authored-blueprints and liked-blueprints profile surfaces to backend Oracle-backed reads where needed.

i3) [todo] Ensure the same creator/profile truth is used across detail, wall, source page, and profile screens.

## Phase 4: Remove Runtime Supabase Blueprint/Profile Dependence

j1) [todo] Remove or hard-disable the normal runtime `blueprints` and `profiles` direct-read paths in the browser once the API-backed paths are live.

j2) [todo] Audit backend/runtime for any remaining direct `blueprints` / `profiles` dependence and cut it in the same chapter.

j3) [todo] Do not leave a silent dual-read resting state on the main browse surfaces.

## Phase 5: Burn-In And Closure

k1) [todo] Verify production behavior under real use:
- blueprint detail loads
- wall/source/profile cards render correctly
- public profile pages load
- creator hydration stays coherent
- no title/banner/avatar regressions appear

k2) [todo] Verify Supabase attribution after soak:
- `blueprints` should materially reduce
- `profiles` should materially reduce
- any remaining traffic must be explainable residue, not normal runtime dependence

k3) [todo] Move this chapter to `completed/` only after:
- runtime behavior is stable
- attribution confirms the cutover
- no meaningful direct Supabase blueprint/profile path remains

## Proof Gates

l1) [todo] Required technical proof:
- Oracle health/parity green
- local typecheck/build green
- targeted blueprint/profile tests green

l2) [todo] Required product proof:
- blueprint detail works
- public profile works
- list/card surfaces show correct creator and blueprint data
- no obvious hydration regressions

l3) [todo] Required scaling proof:
- Supabase attribution no longer shows `blueprints` / `profiles` as leading runtime families

## Rollback Rules

m1) [todo] Prefer fix-forward over restoring long-lived dual runtime ownership.

m2) [todo] Any rollback must be an explicit code/env decision, not a hidden fallback that leaves the browser/API split indefinitely.

## Success Criteria

n1) [todo] Oracle owns normal runtime blueprint reads end to end.

n2) [todo] Oracle owns normal runtime profile reads end to end.

n3) [todo] Browser/product blueprint/profile surfaces no longer depend on direct Supabase reads.

n4) [todo] Supabase egress meaningfully drops on `blueprints` and `profiles`.

n5) [todo] The product remains stable under normal browse/profile/detail use after burn-in.
