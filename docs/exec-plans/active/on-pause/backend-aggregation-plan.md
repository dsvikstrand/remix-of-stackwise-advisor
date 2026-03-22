# Backend Aggregation Plan

Status: `on-pause`

## Pause Note
a0) [have] This plan is paused while the narrower Supabase backend write-policy reduction pass is the current active implementation track.

a01) [have] The aggregation findings and target order remain valid reference context for later resumption.

## Goal
a1) [todo] Reduce frontend request fan-out and repeated small payload fetches by introducing narrowly scoped backend-shaped read endpoints where they provide a clear payoff.

## Why This Is Active Now
b1) [have] The broader Supabase egress program already removed several large backend-side hotspots.

b2) [have] TanStack Query tuning has now covered the main client-side freshness/refetch levers and only the later proof/closure step remains.

b3) [have] The biggest remaining frontend-side leverage is likely structural:
- fewer stitched reads per screen
- fewer repeated client-side joins
- smaller, screen-shaped payloads

b4) [have] Backend aggregation is a standard pattern, but the endpoint cuts for this app are still product-surface-specific.

## Audit Findings
c1) [have] `Wall` is no longer the strongest first candidate because its main lanes already use backend-shaped reads through [wallApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/wallApi.ts) and [wallFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/wallFeed.ts).

c2) [have] The earlier `My Feed` aggregation slice is now legacy compatibility-only.
Current state:
- `/my-feed` now redirects to `/wall`
- `GET /api/my-feed` remains available as a compatibility endpoint
- the landed `My Feed` aggregation work is no longer the active proving surface for this plan

c3) [have] `Channel feed` is now the strongest active aggregation candidate.
Current frontend fan-out in [useChannelFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useChannelFeed.ts):
- base `blueprints` read
- `user_feed_items` read
- `channel_candidates` read
- `blueprint_tags` read
- separate `blueprint_comments` count read for visible rows

c4) [have] `User profile tabs` are also strong candidates, but they are broader than one endpoint.
Current frontend fan-out in [useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts):
- simple `profile` summary read
- `user_blueprints`
- `user_liked_blueprints` with several follow-up joins (`blueprint_likes`, `blueprints`, `profiles`, `source_item_unlocks`, `user_feed_items`, `source_items`, `source_pages`)
- `user_comments`
- `user_activity` assembled from multiple reads

c5) [have] `Blueprint search` and `Explore` still fan out in the browser, but they are weaker first targets than `Channel feed` or profile tabs.
Reasons:
- search flow mixes multiple query modes and dedupe behavior in [useBlueprintSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintSearch.ts)
- explore flow mixes heterogeneous result types in [useExploreSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useExploreSearch.ts)
- that makes the first aggregation cut more product-specific and less rollback-simple

c6) [have] `Blueprint detail/comments` are not the best first candidate.
The detail read in [useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts) does fan out, but the surface is narrower and likely lower total traffic than `My Feed` or profile tabs.

## Scope Lock
c1) [todo] Keep this plan focused on additive, read-oriented aggregation.

c2) [todo] Prefer one screen/task at a time.

c3) [todo] Keep existing endpoints/routes available until each new aggregated path is proven.

c4) [todo] Do not widen this plan into broad backend rewrites, caching/CDN work, or database redesign.

## Safety Rules
d1) [todo] Read-only first.

d2) [todo] Additive first:
- build new aggregated read paths alongside existing ones
- switch one consumer at a time

d3) [todo] Rollback-safe:
- keep old client path available until the replacement proves stable

d4) [todo] Screen/task shaped, not table shaped.

d5) [todo] Avoid mega endpoints.

## Audit Method
e1) [todo] Inventory frontend surfaces that still compose several reads for one visible screen or task.

e2) [todo] For each candidate, record:
- current reads/queries involved
- whether the data is mostly read-only
- whether slight staleness is acceptable
- likely request-count and payload-size savings
- UX risk if the response shape changes

e3) [todo] Focus first on surfaces with:
- repeated fan-out
- stable view-model needs
- low live-state sensitivity

## Candidate Ranking Rubric
f1) [todo] Rank each candidate on:
- traffic / likely egress impact
- request fan-out today
- UI stability of the response shape
- implementation complexity
- rollback simplicity

f2) [todo] Prefer candidates that are:
- high fan-out
- read-heavy
- low-risk
- easy to isolate behind one consumer

## Phases
g1) [have] Phase 1: audit frontend fan-out and screen/task candidates.
- inspect the main read-heavy surfaces
- document current client-side stitching
- shortlist the best aggregation candidates
- progress note:
  - shortlisted candidates are now:
    - `Channel feed`
    - `User profile tabs`
    - `Blueprint search` / `Explore` as secondary follow-ups
  - the earlier `My Feed` slice is retained only as legacy compatibility context and is no longer the active proving target
  - `Wall` is explicitly deprioritized because it already uses backend-shaped feed endpoints
  - the audit confirms the main remaining leverage is in auth/read-heavy browser-side stitching rather than public wall feed assembly

g2) [have] Phase 2: rank the best first aggregation target.
- choose one screen only
- justify the selection by impact, effort, and UX risk
- progress note:
  - recommended first active target: `Channel feed`
  - why it wins:
    - highest obvious active client-side fan-out in one still-used screen
    - stable, read-mostly view-model
    - strong likely request-count and payload reduction
    - one clear consumer path through [useChannelFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useChannelFeed.ts) and [ChannelPage.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/pages/ChannelPage.tsx)
    - rollback is straightforward because the current hook can remain intact until the new endpoint proves itself
  - runner-up target: `User profile tabs`
  - third target: `Blueprint search` / `Explore`
  - historical note:
    - the earlier `My Feed` slice landed as `GET /api/my-feed`, but that surface is now legacy compatibility-only and no longer drives the plan order

g3) [have] Phase 3: define one aggregated endpoint alongside the existing path.
- keep business logic in shared backend services/helpers where possible
- shape the response for the screen, not for raw tables
- preserve auth scope and empty/error behavior
- progress note:
  - the first additive aggregation endpoint is `GET /api/my-feed`
  - the backend shape reuses the current `My Feed` view-model contract closely, including source hydration, blueprint hydration, candidate info, tag expansion, unlock state, and transcript-hidden source filtering
  - the current browser-side path is still available as fallback during rollout

g4) [have] Phase 4: migrate one consumer only.
- update one frontend surface to the new aggregated read
- keep the old path available until verification is complete
- progress note:
  - [useMyFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useMyFeed.ts) is now the single migrated consumer
  - `My Feed` now prefers the backend-shaped read path and falls back to the earlier browser-side hydration if the endpoint is unavailable

g5) [todo] Phase 5: retire `My Feed` from the active proving surface and start the next target.
- record `My Feed` as compatibility-only
- define the first additive `Channel feed` aggregation cut
- keep going from the current active surface instead of proving a legacy redirect

## Acceptance Criteria
h1) [todo] One current active aggregation target is implemented and verified without a behavior regression.

h2) [todo] The new aggregated path demonstrably reduces client fan-out or payload churn for that surface.

h3) [todo] The rollout remains rollback-safe and does not require a broad rewrite.

## Related Plans
i1) [have] TanStack Query tuning is completed:
- [tanstack-query-tuning-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/tanstack-query-tuning-plan.md)

i2) [have] The broader backend/frontend egress history remains on pause here:
- [supabase-egress-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/supabase-egress-reduction-plan.md)
