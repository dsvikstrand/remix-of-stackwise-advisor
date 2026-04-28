# Oracle Tags Full Ownership Plan

Status: `paused`
Owner: `Codex / David`
Last updated: `2026-04-22`

## Purpose

Make Oracle the only normal operational tag system for Bleup.

This is a full ownership chapter, not a small query trim. The target is to remove normal-runtime Supabase dependence for the whole tag dependency class:
- `tags`
- `blueprint_tags`
- `tag_follows`

The intended resting state is:
- Oracle owns normal runtime tag directory truth
- Oracle owns blueprint-tag joins
- Oracle owns tag follow state
- backend and browser stop treating Supabase tag tables as canonical runtime storage
- any remaining Supabase tag usage is explicit bootstrap, import, or break-glass residue, not steady-state runtime dependence

This chapter follows the same operating principle as the earlier ownership migrations:
- singular runtime ownership
- no quiet fallback as the resting state
- robust closure over multiple surfaces, not a narrow patch to one hot endpoint

## Explicit End State

a1) [todo] Oracle is the sole normal operational truth for `tags`, `blueprint_tags`, and `tag_follows`.

a2) [todo] Normal runtime tag behavior no longer depends on Supabase for:
- tag lookup by slug/id
- tag directory reads
- popular/suggested tag reads
- tag follow/unfollow mutation flows
- followed-tag reads
- blueprint-tag hydration on wall/search/explore/source/channel/profile surfaces
- blueprint tag writes during blueprint create/edit and channel flows

a3) [todo] Browser/runtime surfaces do not read or write tag tables directly from Supabase in normal product paths.

a4) [todo] Supabase tag-family traffic trends toward `0%` in normal runtime attribution after burn-in.

a5) [todo] Any remaining Supabase tag-family usage is explicit bootstrap/import/break-glass only and is observable.

## Why This Plan Exists

b1) [have] Fresh sampled attribution on `2026-04-22` shows `tags` as a leading visible Supabase family:
- `tags` `20.3%`

b2) [have] The hottest tag-related normalized endpoint in the current sample is:
- `GET /rest/v1/tags?slug:eq` `15.3%`

b3) [have] There is also adjacent tag-family residue already visible in product/runtime code:
- `blueprint_tags`
- `tag_follows`

b4) [have] This is not just one table problem. Tag usage is spread across:
- wall/feed enrichment
- search/explore
- suggested tags
- onboarding/followed tags
- channels and blueprint authoring

b5) [have] That makes `tags` a real multi-surface ownership chapter, not a one-endpoint cleanup.

## Current State

c1) [have] Oracle-aware groundwork already exists for part of the tag surface:
- [oracleBlueprintTagState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleBlueprintTagState.ts)
- [blueprintTags.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/blueprintTags.ts)
- Oracle-aware tag-row fallback helpers in [index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)

c2) [have] The current runtime is still split across Supabase for key tag-family behaviors:
- direct browser reads of `tags`
- direct browser reads/writes of `tag_follows`
- direct browser and backend reads of `blueprint_tags`
- backend tag creation/upsert against Supabase in channel and blueprint flows

c3) [have] Tag behavior is currently spread across both catalog-style and join-style use cases:
- shared tag lookup by slug
- tag follow state
- blueprint-tag joins
- blueprint/channel tagging writes

c4) [have] Because of that spread, this chapter should be treated as broader than `blueprint_comments` or `blueprint_likes`, but still smaller than a core feed/runtime rewrite.

## Scope Lock

d1) [todo] This chapter covers the full runtime tag dependency class:
- `tags`
- `blueprint_tags`
- `tag_follows`

d2) [todo] Do not mix unrelated chapters into this work:
- `blueprints`
- `profiles`
- `comments`
- feed/source/channel compatibility
- unrelated search/marketing cleanup beyond required tag dependencies

d3) [todo] Treat tag directory truth, tag follows, and blueprint-tag joins as one ownership surface because splitting them would preserve dual-state runtime behavior.

## Main Files / Surfaces

e1) [todo] Primary backend seams already visible:
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)
- [server/services/wallFeed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/wallFeed.ts)
- [server/services/autoChannelPipeline.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/autoChannelPipeline.ts)
- [server/services/blueprintCreation.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/blueprintCreation.ts)
- [server/routes/channels.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/channels.ts)
- [server/routes/blueprintTags.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/blueprintTags.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/handlers/sourcePagesHandlers.ts)

e2) [todo] Primary frontend/runtime seams already visible:
- [src/hooks/useTags.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useTags.ts)
- [src/hooks/useTagFollows.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useTagFollows.ts)
- [src/hooks/useSuggestedTags.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useSuggestedTags.ts)
- [src/hooks/useExploreSearch.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useExploreSearch.ts)
- [src/hooks/useBlueprintSearch.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprintSearch.ts)
- [src/hooks/useSuggestedBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useSuggestedBlueprints.ts)
- [src/hooks/useBlueprints.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/lib/blueprintTagsApi.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/lib/blueprintTagsApi.ts)
- [src/lib/myFeedData.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/lib/myFeedData.ts)

e3) [todo] New Oracle ownership layer likely needed:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- [server/services/oracleBlueprintTagState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleBlueprintTagState.ts)
- new `server/services/oracleTagState.ts`
- new `server/services/oracleTagFollowState.ts`

## Strategy

f1) [have] This chapter must end in full Oracle runtime ownership, not an “Oracle-aware reads but Supabase still owns follows and writes” compromise.

f2) [have] The correct migration unit is the whole tag dependency class, because `tags`, `blueprint_tags`, and `tag_follows` reinforce each other on the main product surfaces.

f3) [have] The right sequence is:
- complete caller inventory
- add Oracle tag directory + follow state
- finish Oracle blueprint-tag ownership
- move backend readers and writers
- move frontend/runtime consumers
- remove direct Supabase runtime dependence
- burn in and verify attribution

f4) [have] This chapter should be expected to take `2-3` real implementation rounds before soak, not one small pass.

## Phase 0: Full Caller Inventory

g1) [todo] Enumerate every meaningful `tags`, `blueprint_tags`, and `tag_follows` touchpoint and classify it as:
- backend runtime read
- backend runtime write
- frontend direct read
- frontend direct write
- bootstrap/import
- admin/debug/manual residue

g2) [todo] Answer these specific questions:
- where are tags created/upserted?
- where are tags looked up by slug/id?
- where are followed tags read or mutated?
- where are blueprint tags hydrated into runtime payloads?
- which surfaces can move immediately once Oracle state exists?

g3) [todo] Output the exact Round 1 wave based on the real callers, not on attribution alone.

## Phase 1: Oracle Tag State And Backend Ownership

h1) [todo] Add Oracle-owned tag directory state.
Required capabilities:
- read tag by slug
- read tag by id
- list tags by slugs
- list popular tags
- create/upsert tag deterministically

h2) [todo] Add Oracle-owned tag follow state.
Required capabilities:
- read followed tags for a user
- follow/unfollow tag idempotently
- list followed tag ids/slugs in batch

h3) [todo] Complete Oracle-owned blueprint-tag join handling as part of the same state layer.
Required capabilities:
- list tag rows by blueprint ids
- list blueprint ids by tag ids/slugs
- replace blueprint-tag sets during create/edit flows

h4) [todo] Add backend APIs/helpers that become the canonical tag owner for:
- tag directory reads
- follow state reads/writes
- blueprint tag hydration

## Phase 2: Backend Runtime Cutover

i1) [todo] Move backend tag reads off direct Supabase tables for main product surfaces:
- wall/feed
- source pages
- channel surfaces
- profile/search/explore helpers that hydrate tags

i2) [todo] Move backend tag writes off direct Supabase tables for main runtime flows:
- blueprint create/edit tagging
- channel tag creation/upsert
- any backend tag follow mutation path

i3) [todo] Ensure Oracle tag state stays current on writes so runtime request handlers do not need request-time Supabase recovery.

## Phase 3: Frontend Runtime Cutover

j1) [todo] Move direct browser tag directory reads to backend Oracle-backed APIs:
- tag directory
- tags-by-slug
- suggested/popular tags

j2) [todo] Move direct browser `tag_follows` reads/writes to backend Oracle-backed APIs.

j3) [todo] Move direct browser blueprint-tag hydration to backend Oracle-backed APIs/helpers where still needed.

j4) [todo] Keep UI behavior stable:
- same follow state semantics
- same tag chips/labels
- same search/explore/tag suggestion behavior

## Phase 4: Runtime Fallback Removal

k1) [todo] Remove ordinary request-time Supabase tag-family fallback from normal runtime paths.

k2) [todo] Restrict any remaining Supabase tag-family access to explicit categories only:
- bootstrap/import
- audited break-glass fallback

k3) [todo] Add observability so any remaining Supabase tag-family access is attributable and rare.

## Phase 5: Burn-In And Closure

l1) [todo] Verify production behavior under real use:
- tag directory reads
- follow/unfollow flows
- suggested/popular tags
- blueprint create/edit tagging
- wall/search/explore/source/channel tag hydration

l2) [todo] Verify Supabase attribution after soak:
- `tags`
- `blueprint_tags`
- `tag_follows`
should materially reduce and ideally disappear from normal runtime samples

l3) [todo] Move this chapter to `completed/` only after:
- runtime behavior is stable
- attribution confirms normal-runtime cutover
- no meaningful direct Supabase tag-family path remains

## Proof Gates

m1) [todo] Required technical proof:
- Oracle health/parity green
- local typecheck/build green
- targeted tag-family tests green

m2) [todo] Required product proof:
- tag lookup remains correct
- follow state remains correct
- blueprint tagging remains correct
- search/explore/tag suggestion behavior remains coherent

m3) [todo] Required scaling proof:
- Supabase attribution no longer shows `tags`, `blueprint_tags`, or `tag_follows` as meaningful runtime families

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring long-lived dual runtime ownership for tags.

n2) [todo] Any rollback must be explicit, not a hidden fallback that leaves tag truth split across Oracle and Supabase indefinitely.

## Success Criteria

o1) [todo] Oracle owns normal runtime tag directory truth.

o2) [todo] Oracle owns normal runtime blueprint-tag joins.

o3) [todo] Oracle owns normal runtime tag follow state.

o4) [todo] Browser/product surfaces no longer depend on direct Supabase tag-family reads/writes.

o5) [todo] Supabase tag-family egress trends toward `0%` for normal runtime traffic after burn-in.
