# Oracle Blueprint Tags Full Ownership Cutover Plan

Status: `on-pause`
Owner: `Codex / David`
Last updated: `2026-04-10`

## Purpose

Make Oracle the only normal operational `blueprint_tags` system for Bleup.

This is not a general frontend/read cleanup and not a partial egress trim. It is a direct cutover plan with an explicit end state:
- Oracle owns normal runtime blueprint-tag writes, reads, and lookup behavior
- Supabase `blueprint_tags` stops participating in normal runtime behavior
- no normal runtime channel/topic/tag lookup path depends on Supabase `blueprint_tags`
- any remaining Supabase `blueprint_tags` usage becomes migration residue to delete, not a steady-state dependency

This chapter follows the same lesson as queue, unlocks, feed, source-items, generation-state, generation-trace, and blueprint YouTube comments:
- dual Oracle/Supabase runtime state is more bug-prone than a clean single-owner model
- the app is still in developer-mode tolerance
- short debugging pain is acceptable if it materially simplifies runtime ownership and reduces Supabase egress

## Explicit End State

a1) [todo] Oracle is the sole normal operational `blueprint_tags` truth in runtime when the Oracle control-plane/backend path is enabled.

a2) [todo] Normal runtime blueprint-tag behavior no longer depends on Supabase for:
- tag assignment / tag-join upserts
- blueprint-to-tag lookup reads
- channel/topic display shaping that depends on blueprint tag joins
- backend derivation or mirror paths that persist `blueprint_tags`
- any browser/product read path built on direct `blueprint_tags` queries

a3) [todo] Blueprint tag assignment and topic display behavior remain correct through burn-in.

a4) [todo] Supabase `blueprint_tags` stops doing normal runtime work; any residue is manual/historical only.

## Why This Plan Exists

b1) [have] Queue, unlocks, feed, source-items, generation-state, and generation-trace have completed their main Oracle ownership work.

b2) [have] The current 24h sampled Supabase attribution is no longer led by those earlier ownership domains.

b3) [have] The latest 24h sampled Supabase attribution now shows `blueprint_tags` as a leading family:
- `blueprint_tags` `13.3%`

b4) [have] The hot residual endpoints are narrow and operationally meaningful:
- `GET /rest/v1/blueprint_tags`
- `POST /rest/v1/blueprint_tags?on_conflict`

b5) [have] That makes this a strong next migration chapter if the goal is:
- further Supabase egress reduction
- less dual-state drift in blueprint topic/channel assignment
- simpler reasoning around tag join ownership

## Current State

c1) [have] The current sample suggests `blueprint_tags` is still both read-side and write-side active.

c2) [have] The backend appears to be a primary actor in the current sample:
- `backend_service_role -> blueprint_tags` `10.8%` of sampled REST traffic

c3) [have] The current dominant normalized endpoints include:
- `GET /rest/v1/blueprint_tags?blueprint_id:eq`
- `GET /rest/v1/blueprint_tags?blueprint_id:in`
- `POST /rest/v1/blueprint_tags?on_conflict`

c4) [have] The remaining problem is not likely “Oracle cannot store tag joins.”
- it is that `blueprint_tags` is still a live Supabase runtime surface for both write-side assignment and read-side display shaping

c5) [todo] This cutover is product-visible in:
- blueprint detail topic/tag display
- wall/channel/topic shaping that depends on blueprint tag joins
- any background tagging/classification path that writes tag joins
- channel or topic follow surfaces that read those joins

## Scope Lock

d1) [todo] This plan is `blueprint_tags` only.

d2) [todo] Do not mix general `tags`, blueprint comments, notifications, profiles, or broader `blueprints` reads into this chapter except where a `blueprint_tags` path has a hard dependency.

d3) [todo] Focus on `blueprint_tags` operational ownership and the surfaces built directly on top of it.

## Main Files / Surfaces

e1) [have] Core blueprint-tag ownership seams identified in the inventory include:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/autoChannelPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/autoChannelPipeline.ts)
- [server/services/blueprintCreation.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintCreation.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/routes/channels.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/channels.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [src/hooks/useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/hooks/useBlueprintSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintSearch.ts)
- [src/hooks/useExploreSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useExploreSearch.ts)
- [src/hooks/useSuggestedBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSuggestedBlueprints.ts)
- [src/hooks/useSuggestedTags.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSuggestedTags.ts)
- [src/hooks/useChannelFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useChannelFeed.ts)
- [src/lib/myFeedApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedApi.ts)
- [src/lib/myFeedData.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedData.ts)
- [src/components/home/LandingProofCard.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/home/LandingProofCard.tsx)

e2) [have] Main blueprint-tag behaviors to sever from Supabase:
- blueprint-tag assignment/upsert writes
- blueprint-to-tag join reads
- batch tag-join lookup reads
- channel/topic display shaping built on direct `blueprint_tags`
- compatibility rereads and fallback paths

## Fast Cutover Shape

f1) [have] Historical context:
- queue ownership cutover is completed
- unlock ownership cutover is completed
- feed ownership cutover is completed
- source-items ownership cutover is completed
- generation-state ownership cutover is completed
- generation-trace burn-in/closure is the active ownership root

f2) [todo] This plan aims directly for:
- `Oracle-only operational blueprint-tags path`

f3) [todo] Intermediate “Oracle-first but still normal-runtime Supabase `blueprint_tags` participation” is only an execution aid, not the desired resting state.

## Phase 0: One Fast Inventory

g1) [have] Enumerated the meaningful `blueprint_tags` touchpoints and classified them as:
- runtime write
- runtime read
- derivation/mirror dependency
- browser/product residue
- removable legacy residue

g2) [have] Primary files inspected for the inventory:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/autoChannelPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/autoChannelPipeline.ts)
- [server/services/blueprintCreation.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintCreation.ts)
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
- [server/routes/channels.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/channels.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [src/hooks/useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/hooks/useBlueprintSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintSearch.ts)
- [src/hooks/useExploreSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useExploreSearch.ts)
- [src/hooks/useSuggestedBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSuggestedBlueprints.ts)
- [src/hooks/useSuggestedTags.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSuggestedTags.ts)
- [src/hooks/useChannelFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useChannelFeed.ts)
- [src/lib/myFeedApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedApi.ts)
- [src/lib/myFeedData.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedData.ts)
- [src/components/home/LandingProofCard.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/home/LandingProofCard.tsx)

g3) [have] Inventory output:
- one explicit remove/replace decision per remaining `blueprint_tags` touchpoint
- there is no obvious startup/bootstrap or rehydration path for `blueprint_tags`
- the main write seams are narrow and concentrated
- the read surface is broad and split across backend shaping plus direct frontend/browser reads
- the exact first code wave to run next is Oracle-only writes

g4) [have] Runtime write seam map:
- [server/services/blueprintCreation.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintCreation.ts)
  - inserts blueprint-tag joins during initial blueprint creation via `upsert({ blueprint_id, tag_id }, { onConflict: 'blueprint_id,tag_id' })`
- [server/services/autoChannelPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/autoChannelPipeline.ts)
  - reads current blueprint tag slugs for classification
  - writes the published channel tag join when a candidate is accepted
- [server/routes/channels.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/channels.ts)
  - legacy/manual candidate publish route still upserts `blueprint_tags`
- [src/hooks/useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
  - direct browser create/update flows still insert `blueprint_tags`
- [src/lib/myFeedApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedApi.ts)
  - `publishCandidateFallback(...)` still upserts `blueprint_tags` from the browser fallback path

g5) [have] Runtime read seam map:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
  - blueprint detail hydration still reads joined tags from `blueprint_tags`
- [server/services/wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts)
  - public wall and `For You` shaping still batch-read `blueprint_tags`
- [server/routes/channels.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/channels.ts)
  - channel feed and candidate evaluation still read tag joins from `blueprint_tags`
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
  - source-page blueprint hydration still reads `blueprint_tags`
- [src/lib/myFeedData.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedData.ts)
  - browser feed hydration still queries `blueprint_tags`
- [src/hooks/useBlueprintSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintSearch.ts)
  - search hydration and tag search still query `blueprint_tags`
- [src/hooks/useExploreSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useExploreSearch.ts)
  - explore tag search and tag hydration still query `blueprint_tags`
- [src/hooks/useSuggestedBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSuggestedBlueprints.ts)
  - liked-tag suggestion path still reads `blueprint_tags`
- [src/hooks/useSuggestedTags.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSuggestedTags.ts)
  - related-tag suggestion path still reads `blueprint_tags`
- [src/hooks/useChannelFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useChannelFeed.ts)
  - fallback channel feed still reads `blueprint_tags`
- [src/components/home/LandingProofCard.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/home/LandingProofCard.tsx)
  - landing proof card still reads `blueprint_tags`

g6) [have] Browser/product residue is substantial.
- This chapter is not backend-only in the way queue/unlocks/feed were.
- There are multiple direct Supabase frontend readers plus at least two direct write paths in `src/hooks/useBlueprints.ts` and `src/lib/myFeedApi.ts`.

g7) [have] No meaningful bootstrap/rehydration phase showed up in the inventory.
- `blueprint_tags` currently behaves like a live join/read-write surface, not a startup-owned ledger
- that means Phase 1 is likely trivial and the first real cut should be writes

g8) [have] Recommended first real code wave after inventory:
- **Blueprint Tags Pass 1: Oracle-Only Writes**
- reason: the write seams are narrower than the read surface and removing them first should cut `POST /rest/v1/blueprint_tags?on_conflict` with lower blast radius than a full read sever immediately

## Phase 1: Stop Any Supabase Blueprint-Tag Bootstrap / Residual Input

h1) [have] Verified `blueprint_tags` does not have a meaningful startup/bootstrap or rehydration dependency.

h2) [have] This chapter behaves like generation-trace and blueprint YouTube comments:
- the live seams are runtime read/write joins
- there is no separate bootstrap/input phase worth cutting first

h3) [have] Phase 1 is therefore trivial and complete.
- the first real implementation wave is Oracle-owned writes
- no separate bootstrap cut was required

## Phase 2: Oracle-Only Blueprint-Tag Writes

i1) [have] Added Oracle-owned `blueprint_tag_state` control-plane storage for blueprint-to-tag joins.

i2) [have] Backend normal-runtime blueprint-tag writes now land in Oracle-owned state for the main assignment/publish paths:
- [server/services/blueprintCreation.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintCreation.ts)
- [server/services/autoChannelPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/autoChannelPipeline.ts)
- [server/routes/channels.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/channels.ts)

i3) [have] A narrow Oracle-aware backend read bridge landed with this write pass so the coupled product/runtime paths do not drift immediately:
- auto-channel classification now reads Oracle-owned tag slugs first
- manual channel publish/evaluate paths now read Oracle-owned tag joins first
- auto-banner generation now reads Oracle-owned tag slugs first
- pre-read-cut compatibility was intentionally limited to the coupled backend seams only

i4) [todo] Browser/manual residue still exists outside the main backend write paths:
- [src/hooks/useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/lib/myFeedApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedApi.ts)

i5) [have] After this pass, Supabase `blueprint_tags` no longer matter to the main backend mutation correctness path.
- the remaining work is broader read severing plus the explicit browser/manual residue cleanup decision

## Phase 3: Oracle-Only Blueprint-Tag Reads

j1) [have] Main normal-runtime Supabase `blueprint_tags` reads were cut from the current product/runtime surfaces.

j2) [have] This wave landed:
- Oracle bootstrap now seeds `blueprint_tag_state` from Supabase so existing public/runtime tag joins exist before request handling settles
- backend product reads now use Oracle-owned blueprint-tag rows for wall, `For You`, channels, and source-page blueprint hydration
- frontend/browser tag-join reads now use the Oracle-aware backend `GET /api/blueprint-tags` path instead of direct Supabase `blueprint_tags` queries on the main search/suggestion/landing/feed fallback surfaces

j3) [have] After this phase, Supabase tag joins should no longer matter to normal runtime read correctness in the Oracle-backed path.

j4) [todo] Explicit manual/browser residue still to review separately:
- [src/hooks/useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
- [src/lib/myFeedApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/myFeedApi.ts)

## Phase 4: Short Burn-In / Canary

k1) [todo] Prove Oracle-only blueprint-tag behavior under:
- tag assignment
- topic/channel display shaping
- batch lookup reads
- blueprint detail tag display
- repeat assignment/update without duplicate or missing joins

k2) [todo] Success target:
- no missing tag joins
- no duplicate join behavior
- no channel/topic display regression
- no hidden Supabase `blueprint_tags` dependency surfacing in logs or route behavior

## Phase 5: Cleanup And Closure

l1) [todo] Remove the remaining meaningful Supabase `blueprint_tags` compatibility residue from active runtime surfaces and sync canonical docs to the final Oracle-owned posture.

l2) [todo] Move this plan to `completed/` once:
- Supabase `blueprint_tags` runtime work is zero or negligible
- no hidden dependency remains
- burn-in evidence is accepted

## Proof Gates

m1) [todo] Required proof before declaring blueprint-tag cutover complete:
- Oracle primary check green
- public/local health green
- tag assignment succeeds
- blueprint/channel/topic reads succeed
- no missing/duplicate tag joins appear in product behavior

m2) [todo] Required proof before closing the chapter:
- at least one meaningful burn-in window
- no unresolved tag-join correctness regressions
- Supabase attribution shows `blueprint_tags` materially reduced

## Rollback Rules

n1) [todo] Prefer fix-forward over restoring dual-state blueprint-tag runtime.

n2) [todo] Any emergency rollback should be an explicit code/env change, not a hidden long-lived compatibility path.

## Success Criteria

o1) [todo] Oracle fully owns normal `blueprint_tags` operations in runtime.

o2) [todo] Supabase `blueprint_tags` no longer does normal runtime work.

o3) [todo] Tag assignment and topic display behavior remain correct through burn-in.

o4) [todo] Supabase egress drops materially because the current top `blueprint_tags` endpoints are removed from normal runtime.

## Relationship To Other Chapters

p1) [have] Generation trace remains the current active ownership chapter:
- [oracle-generation-trace-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/oracle-generation-trace-full-ownership-cutover-plan.md)

p2) [have] Blueprint YouTube comments remain the queued next ownership chapter currently ahead in the on-pause queue:
- [oracle-blueprint-youtube-comments-full-ownership-cutover-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-blueprint-youtube-comments-full-ownership-cutover-plan.md)

p3) [have] The broader Oracle-ownership context remains paused:
- [oracle-deeper-ownership-and-supabase-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/oracle-deeper-ownership-and-supabase-reduction-plan.md)

p4) [have] This plan is the next strong egress-reduction candidate after the current active root because the latest sampled 24h Supabase attribution now materially leads with `blueprint_tags`.
