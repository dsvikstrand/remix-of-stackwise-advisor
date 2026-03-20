# Backend Aggregation Plan

Status: `active`

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

c2) [have] `My Feed` is the clearest first aggregation candidate.
Current frontend fan-out in [useMyFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useMyFeed.ts):
- one base `user_feed_items` read
- parallel reads for `source_items`, `blueprints`, `channel_candidates`, `source_item_unlocks`
- follow-up reads for `blueprint_tags`, `tags`, and `source_pages`
- client-side hiding/grouping logic layered on top

c3) [have] `Channel feed` is the next strongest candidate after `My Feed`.
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

c5) [have] `Blueprint search` and `Explore` still fan out in the browser, but they are weaker first targets than `My Feed`.
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
    - `My Feed`
    - `Channel feed`
    - `User profile tabs`
    - `Blueprint search` / `Explore` as secondary follow-ups
  - `Wall` is explicitly deprioritized because it already uses backend-shaped feed endpoints
  - the audit confirms the main remaining leverage is in auth/read-heavy browser-side stitching rather than public wall feed assembly

g2) [have] Phase 2: rank the best first aggregation target.
- choose one screen only
- justify the selection by impact, effort, and UX risk
- progress note:
  - recommended first target: `My Feed`
  - why it wins:
    - highest obvious client-side fan-out in one hook
    - stable, read-mostly view-model
    - strong likely request-count and payload reduction
    - one clear consumer path through [useMyFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useMyFeed.ts) and [MyFeed.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/pages/MyFeed.tsx)
    - rollback is straightforward because the current hook can remain intact until the new endpoint proves itself
  - runner-up target: `Channel feed`
  - third target: `User profile tabs`, likely as multiple narrower aggregations rather than one giant endpoint

g3) [todo] Phase 3: define one aggregated endpoint alongside the existing path.
- keep business logic in shared backend services/helpers where possible
- shape the response for the screen, not for raw tables
- preserve auth scope and empty/error behavior

g4) [todo] Phase 4: migrate one consumer only.
- update one frontend surface to the new aggregated read
- keep the old path available until verification is complete

g5) [todo] Phase 5: measure request/egress change and decide the next target.
- compare before/after request shape
- decide whether to keep going, pause, or close the plan

## Acceptance Criteria
h1) [todo] One initial aggregation target is implemented and verified without a behavior regression.

h2) [todo] The new aggregated path demonstrably reduces client fan-out or payload churn for that surface.

h3) [todo] The rollout remains rollback-safe and does not require a broad rewrite.

## Related Plans
i1) [have] TanStack Query tuning is now on pause pending later proof/closure:
- [tanstack-query-tuning-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/tanstack-query-tuning-plan.md)

i2) [have] The broader backend/frontend egress history remains on pause here:
- [supabase-egress-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/supabase-egress-reduction-plan.md)
