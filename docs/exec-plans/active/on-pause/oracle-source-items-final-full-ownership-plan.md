# Oracle Source Items Final Full Ownership Plan

Status: `paused`
Owner: `Codex / David`
Last updated: `2026-04-23`

## Purpose

Finish `source_items` as a true Oracle-owned runtime surface.

This chapter is not a first migration of `source_items`. Oracle-first seams already exist, and earlier source-item ownership work was completed in a narrower cutover chapter. The reason this new chapter exists is that later product/runtime work still leaves measurable `source_items` Supabase residue in normal traffic.

The goal here is not a quick cleanup. The goal is to close the remaining runtime dependency class with the same standard as the stronger ownership chapters:
- Oracle is the normal runtime owner
- write-side state stays current enough that request-time Supabase recovery is not the resting state
- Supabase `source_items` becomes explicit bootstrap/break-glass residue only
- normal traffic attribution should drive toward `0%` `source_items`

## Explicit End State

a1) [todo] Oracle is the sole normal runtime owner of `source_items`.

a2) [todo] Normal runtime product paths do not read Supabase `source_items` directly for:
- feed hydration
- wall hydration
- source-page hydration
- my-feed hydration
- blueprint availability checks
- blueprint generation/source metadata lookups
- YouTube comment refresh/view-count update flows

a3) [todo] Normal runtime write/update paths do not depend on Supabase `source_items` as canonical storage.

a4) [todo] Request-time Supabase `source_items` fallback is not part of normal runtime behavior.

a5) [todo] Any remaining Supabase `source_items` access is explicit bootstrap/import/break-glass only and is observable.

## Why This Plan Exists

b1) [have] Fresh attribution after the latest ownership waves shows `source_items` is still a visible Supabase family even after the larger compatibility seam was removed.

b2) [have] The current sampled shape is no longer the old compatibility spike. It is smaller and cleaner, which makes this the right time to do a proper final ownership sweep instead of another emergency compatibility patch.

b3) [have] The repo already has a serious Oracle-first source-item seam:
- [server/services/oracleSourceItemLedgerState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleSourceItemLedgerState.ts)
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)
  - `persistSourceItemRowOracleAware(...)`
  - `getSourceItemByIdOracleFirst(...)`
  - `listProductSourceItemsOracleFirst(...)`

b4) [have] That means this chapter is not greenfield. It is a closure chapter to retire the remaining runtime residue cleanly.

## Current State

c1) [have] Oracle source-item ledger state already exists and stores the full practical runtime source-item row:
- id
- canonical/source identifiers
- URL/title/published status
- source page/channel linkage
- thumbnail
- metadata blob

c2) [have] A number of newer runtime paths already accept Oracle-first source readers through injected helpers such as `readSourceRows(...)`.

c3) [have] Residual direct Supabase `source_items` reads still exist in important runtime/product surfaces:
- [server/routes/feed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/feed.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/blueprintAvailability.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/blueprintAvailability.ts)
- [server/services/blueprintCreation.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/blueprintCreation.ts)
- [server/services/blueprintYoutubeComments.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/blueprintYoutubeComments.ts)
- [src/lib/myFeedData.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/lib/myFeedData.ts)

c4) [have] Request-time fallback still exists in the shared Oracle-first helpers in [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts), especially around:
- `listProductSourceItemsOracleFirst(...)`
- `getSourceItemByIdOracleFirst(...)`
- `persistSourceItemRowOracleAware(...)`

c5) [have] This chapter therefore needs to finish both:
- remaining direct callers
- the fallback contract itself

## Scope Lock

d1) [todo] This chapter covers `source_items` runtime ownership.

d2) [todo] It may touch adjacent surfaces only where they are required to remove `source_items` runtime dependence:
- source pages
- wall/feed hydration
- unlock availability
- blueprint generation metadata
- YouTube comments refresh metadata

d3) [todo] Do not silently broaden this into a combined mega-refactor of:
- `source_pages`
- unlock state
- subscription state
- blueprint state
unless a concrete `source_items` ownership dependency forces that work.

## Main Runtime Seams

e1) [todo] Shared Oracle-first source-item ownership seam:
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)
- [server/services/oracleSourceItemLedgerState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleSourceItemLedgerState.ts)

e2) [todo] Remaining backend runtime readers/writers:
- [server/routes/feed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/feed.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/blueprintAvailability.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/blueprintAvailability.ts)
- [server/services/blueprintCreation.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/blueprintCreation.ts)
- [server/services/blueprintYoutubeComments.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/blueprintYoutubeComments.ts)
- [server/services/wallFeed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/wallFeed.ts)

e3) [todo] Remaining frontend/runtime readers:
- [src/lib/myFeedData.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/lib/myFeedData.ts)
- any API/helper that still expects direct `source_items` Supabase reads through the browser

## Strategy

f1) [have] The correct shape is not “replace one hot query.” The correct shape is to retire `source_items` as a normal runtime Supabase dependency class.

f2) [have] Because Oracle ledger state and Oracle-first helpers already exist, this should be handled as a closure program, not a first-principles rewrite.

f3) [have] The right sequence is:
- full residue inventory
- remove remaining direct runtime readers
- complete runtime write-through/update paths
- remove silent request-time fallback from the normal path
- burn in and prove attribution

f4) [have] Expected effort:
- likely `2` real implementation rounds
- conservatively `3` max before soak

## Phase 0: Residue Inventory

g1) [todo] Enumerate every remaining direct `source_items` runtime caller and classify it as:
- backend runtime read
- backend runtime write/update
- frontend direct read
- bootstrap/import/manual/admin residue

g2) [todo] Verify which current callers already have an injectable Oracle-first reader available and which need a new backend helper/API seam.

g3) [todo] Identify which remaining Supabase reads are:
- true normal runtime dependence
- request-time fallback only
- non-runtime/ops residue

## Phase 1: Remove Remaining Direct Runtime Readers

h1) [todo] Cut the main backend runtime readers over to Oracle-owned source-item reads.

h2) [todo] Cut frontend/runtime source-item reads over to backend Oracle-backed APIs/helpers where still needed.

h3) [todo] Ensure high-signal product surfaces are Oracle-owned first:
- feed route lookup/hydration
- source-page blueprint hydration
- my-feed hydration
- wall/source metadata hydration
- blueprint availability source lookup

h4) [todo] Add focused tests that prove these surfaces no longer require direct Supabase `source_items`.

## Phase 2: Complete Runtime Write-Through Ownership

i1) [todo] Remove remaining runtime write/update dependence on Supabase `source_items` as canonical storage.

i2) [todo] Cover the important mutation/update cases:
- source-item persistence from ingestion
- metadata/view-count refresh
- title/thumbnail/source linkage updates
- blueprint generation source metadata reads that currently reach back to Supabase
- YouTube comment refresh/update paths

i3) [todo] Ensure Oracle ledger state stays current enough that normal runtime request handlers do not need request-time Supabase repair.

## Phase 3: Fallback Removal And Observability

j1) [todo] Tighten `listProductSourceItemsOracleFirst(...)` and related helpers so normal runtime does not silently fall back to Supabase `source_items`.

j2) [todo] Restrict remaining Supabase `source_items` access to explicit categories only:
- bootstrap/import
- audited break-glass fallback

j3) [todo] Make any remaining fallback observable enough that attribution and logs can distinguish:
- intended exceptional recovery
- missed runtime dependency residue

## Proof Gates

k1) [todo] Technical proof:
- run `npm run typecheck`
- focused Vitest for touched source-item/runtime surfaces
- run `npm run build`
- direct `server/index.ts` compile check if needed

k2) [todo] Runtime proof:
- feed lookups still work
- source-page blueprint/feed surfaces still work
- wall/my-feed hydration still works
- blueprint availability still works
- generation flows that depend on source metadata still work
- YouTube comment refresh/view-count updates still work

k3) [todo] Ops proof:
- backend health green
- Oracle primary parity green
- no new source-item shadow/fallback failure signatures

k4) [todo] Attribution proof:
- `source_items` materially drops from normal runtime Supabase samples
- if any `source_items` traffic remains, it is explicitly understood as bootstrap/break-glass residue

## Closure Condition

l1) [todo] This chapter is done only when:
- no normal runtime backend path reads Supabase `source_items`
- no normal runtime frontend path reads Supabase `source_items`
- no normal runtime write/update path depends on Supabase `source_items` as canonical storage
- Oracle-first helpers no longer use silent request-time Supabase fallback as the normal path
- live health is clean
- attribution confirms `source_items` is no longer a meaningful normal-runtime family

## Notes

m1) [have] A previously completed source-item cutover plan already exists in the registry as historical reference:
- [oracle-source-item-full-ownership-cutover-plan.md](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/docs/exec-plans/completed/oracle-source-item-full-ownership-cutover-plan.md)

m2) [have] This new chapter exists because later product/runtime work still leaves measurable `source_items` Supabase residue. It should be interpreted as a final closure chapter, not a contradiction of the earlier completed plan.
