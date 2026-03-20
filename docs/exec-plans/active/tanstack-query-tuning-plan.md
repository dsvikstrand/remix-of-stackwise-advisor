# TanStack Query Tuning Plan

Status: `active`

## Goal
a1) [todo] Reduce user-driven query churn and background refetch waste without changing the current visual UX or breaking live queue/job flows.

## Why This Is Active Now
b1) [have] The Supabase egress program already removed several large backend-side hotspots:
- feed suppression churn
- redundant subscription writes
- queue claim/lease over-churn
- refresh bookkeeping reads
- generation trace read/write overhead

b2) [have] The frontend is still using TanStack Query with effectively default global behavior in [App.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/App.tsx), because `QueryClient` is created without conservative `defaultOptions`.

b3) [have] Several important read surfaces still rely on TanStack defaults rather than an explicit freshness policy:
- Wall/feed queries
- search/explore queries
- profile/detail queries
- My Feed / channel-feed reads
- some subscription/source-page reads

b4) [have] This makes TanStack Query tuning the cleanest current low-risk lever for reducing user-driven Supabase/API traffic.

## Scope Lock
c1) [todo] Keep this plan focused on query freshness, refetch, and polling behavior.

c2) [todo] Do not widen this plan into backend architecture work, caching/CDN work, or another broad Supabase egress rewrite.

c3) [todo] Preserve visible UX structure and styling.

c4) [todo] Limit user-visible impact to freshness/timing only, and keep live state surfaces responsive.

## Review Findings
d1) [have] Global TanStack defaults are currently untuned:
- [App.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/App.tsx) creates `new QueryClient()` with no `defaultOptions`

d2) [have] Some live surfaces already use good explicit polling behavior:
- [useGenerationQueue.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useGenerationQueue.ts)
- [useSourceUnlockJobTracker.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSourceUnlockJobTracker.ts)
- refresh-job tracking in [useSubscriptionsPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSubscriptionsPageController.ts)

d3) [have] Some semi-live surfaces already have partial tuning:
- [useNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useNotifications.ts) uses `staleTime: 15_000` and `refetchInterval: 20_000`
- [useAiCredits.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useAiCredits.ts) uses `staleTime: 60_000` and opt-in polling

d4) [have] Static-ish surfaces are the clearest current opportunity because many still inherit default focus/mount/reconnect behavior:
- [useWallPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useWallPageController.ts)
- [useBlueprintSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintSearch.ts)
- [useExploreSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useExploreSearch.ts)
- [useMyFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useMyFeed.ts)
- [useChannelFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useChannelFeed.ts)
- [useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
- [useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)

d5) [have] A good local reference already exists:
- [SourcePage.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/pages/SourcePage.tsx) video-library query uses explicit conservative settings (`staleTime`, no focus refetch, no mount refetch)

## Query Classes
e1) [have] `live`
- queue/job progress
- active unlock progress
- active manual refresh job progress

e2) [have] `semi-live`
- notifications
- credits
- subscription status that can tolerate short delay

e3) [have] `static-ish`
- wall/list/search/feed content
- profile/history
- blueprint detail
- source-page metadata
- channel feed

## First-Pass Policy
f1) [todo] Global baseline policy:
- `staleTime: 60_000`
- `refetchOnWindowFocus: false`
- `refetchOnReconnect: true`
- leave retries as-is unless a query needs special handling

f2) [todo] `live` query policy:
- explicit local overrides
- polling only while active
- keep current fast cadence where the user expects live updates

f3) [todo] `semi-live` query policy:
- `staleTime` roughly `15_000` to `60_000`
- no aggressive focus refetch unless it is clearly needed
- polling only where user value is clear

f4) [todo] `static-ish` query policy:
- `staleTime` roughly `60_000` to `300_000`
- no polling
- no focus refetch unless a surface has a specific reason

## Phases
g1) [todo] Phase 1: set conservative global QueryClient defaults.
- primary file:
  - [App.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/App.tsx)
- implementation direction:
  - add `defaultOptions.queries`
  - set app-wide conservative defaults
  - avoid changing mutation behavior in this pass
- acceptance:
  - static-ish queries stop inheriting aggressive default refetch behavior
  - live surfaces remain correct via local overrides
- progress note:
  - conservative global query defaults are now shipped in [App.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/App.tsx):
    - `staleTime: 60_000`
    - `refetchOnWindowFocus: false`
    - `refetchOnReconnect: true`
  - the next step is to verify/tune explicit live-surface overrides as needed rather than broadening the global defaults further

g2) [have] Phase 2: explicitly preserve/tune live surfaces.
- primary files:
  - [useGenerationQueue.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useGenerationQueue.ts)
  - [useSourceUnlockJobTracker.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSourceUnlockJobTracker.ts)
  - [useSubscriptionsPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSubscriptionsPageController.ts)
- implementation direction:
  - keep fast polling only while active
  - make non-active states conservative
- acceptance:
  - queue/unlock/manual-refresh UX still feels live enough
- progress note:
  - live queue/unlock/manual-refresh queries now declare explicit query behavior instead of relying on inherited defaults
  - [useGenerationQueue.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useGenerationQueue.ts) explicitly keeps its dynamic active-vs-idle polling and disables focus-triggered refetches
  - [useSourceUnlockJobTracker.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSourceUnlockJobTracker.ts) now sets explicit freshness, reconnect, and no-focus-refetch behavior for both latest-job lookup and active-job polling
  - [useSubscriptionsPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSubscriptionsPageController.ts) now makes manual refresh-job tracking explicit with short active freshness and no focus-triggered refetches

g3) [have] Phase 3: tune semi-live surfaces.
- primary files:
  - [useNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useNotifications.ts)
  - [useAiCredits.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useAiCredits.ts)
  - [useWallPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useWallPageController.ts)
- implementation direction:
  - keep useful freshness
  - remove unnecessary focus/mount churn
- acceptance:
  - notifications/credits still feel current enough
- progress note:
  - [useNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useNotifications.ts) now explicitly keeps its `15s` freshness window and `20s` polling while disabling focus-triggered refetches
  - [useAiCredits.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useAiCredits.ts) now explicitly keeps credits semi-live without depending on inherited focus/reconnect behavior
  - [useWallPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useWallPageController.ts) now makes the wall subscription-status read explicit with a `60s` stale window and no focus-triggered refetches

g4) [have] Phase 4: tune static-ish list/detail surfaces.
- primary files:
  - [useWallPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useWallPageController.ts)
  - [useBlueprintSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintSearch.ts)
  - [useExploreSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useExploreSearch.ts)
  - [useMyFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useMyFeed.ts)
  - [useChannelFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useChannelFeed.ts)
  - [useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
  - [useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)
- implementation direction:
  - make stale windows explicit
  - disable unnecessary focus refetches
  - keep no polling on these surfaces
- acceptance:
  - no visible design change
  - only small timing/freshness differences
- progress note:
  - wall, search, explore, My Feed, channel feed, blueprint detail/comments, and profile-tab queries now declare explicit static-ish freshness windows
  - these surfaces now disable focus-triggered refetches and keep reconnect behavior explicit instead of inheriting defaults implicitly
  - profile and blueprint detail reads use slightly longer stale windows than fast-moving list surfaces

g5) [todo] Phase 5: proof and measurement.
- compare before/after on:
  - obvious frontend polling/read surfaces
  - Supabase short-window request history if the change is deployed
- record whether TanStack tuning meaningfully reduced user-driven churn

## First Implementation Slice
h1) [todo] Start with Phase 1 only.
- add conservative `QueryClient` defaults in [App.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/App.tsx)
- explicitly verify the already-live surfaces still override correctly

h2) [todo] Then do a small Phase 2 follow-up for any live query that needs an explicit opt-out from the new defaults.

## Acceptance Criteria
i1) [todo] No visual design regressions.

i2) [todo] Live queue/job/unlock surfaces still feel responsive.

i3) [todo] Static-ish surfaces stop doing unnecessary focus/mount churn.

i4) [todo] Short-window frontend-driven request churn drops or is at least clearly better bounded.

## Related Plans
j1) [have] The broader Supabase/backend egress program is now on pause here:
- [supabase-egress-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/supabase-egress-reduction-plan.md)

j2) [have] This TanStack Query plan is a focused frontend follow-on, not a replacement for that backend history.
