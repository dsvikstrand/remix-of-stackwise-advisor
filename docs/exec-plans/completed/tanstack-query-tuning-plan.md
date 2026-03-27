# TanStack Query Tuning Plan

Status: `completed`

## Goal
a1) [have] Reduce user-driven query churn and background refetch waste without changing visual UX or breaking live queue/job flows.

## Shipped
b1) [have] Conservative global `QueryClient` defaults were added in [App.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/App.tsx):
- `staleTime: 60_000`
- `refetchOnWindowFocus: false`
- `refetchOnReconnect: true`

b2) [have] Live query surfaces now declare explicit local behavior instead of depending on inherited defaults:
- [useGenerationQueue.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useGenerationQueue.ts)
- [useSourceUnlockJobTracker.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSourceUnlockJobTracker.ts)
- [useSubscriptionsPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSubscriptionsPageController.ts)

b3) [have] Semi-live query surfaces now declare explicit cadence and no-focus-refetch behavior:
- [useNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useNotifications.ts)
- [useAiCredits.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useAiCredits.ts)
- [useWallPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useWallPageController.ts)

b4) [have] Static-ish list/detail surfaces now use explicit stale windows with no focus-triggered refetch by default:
- [useWallPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useWallPageController.ts)
- [useBlueprintSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintSearch.ts)
- [useExploreSearch.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useExploreSearch.ts)
- [useMyFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useMyFeed.ts)
- [useChannelFeed.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useChannelFeed.ts)
- [useBlueprints.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprints.ts)
- [useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)

## Verification
c1) [have] Implementation phases `1` through `4` were locally verified and manually sanity-checked during rollout.

c2) [have] Manual checks confirmed the main live-risk surfaces still felt responsive:
- generation queue
- source unlock flow
- subscriptions manual refresh
- notifications / credits / Wall semi-live behavior
- Wall / Search / Explore / My Feed / Channel / blueprint detail / profile static-ish behavior

c3) [have] Phase `5` proof is complete.
Direct pre-vs-post comparison artifact:
- [tanstack-proof-pre-vs-post.json](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/tmp/tanstack-proof-pre-vs-post.json)

c4) [have] The cleanest direct comparison used:
- pre-TanStack window: `2026-03-20T06:35:00Z` -> `2026-03-20T08:27:00Z`
- post-TanStack, pre-aggregation window: `2026-03-20T08:57:00Z` -> `2026-03-20T10:49:00Z`

c5) [have] Browser-attributed request totals improved:
- pre: `40`
- post: `27`
- change: about `-33%`

c6) [have] Ignoring `mvp_events` telemetry noise, browser-side data-ish reads improved from about:
- `35` -> `27`
- change: about `-23%`

c7) [have] The proof windows did not show a meaningful static-ish frontend churn hotspot after tuning.
Remaining request-history dominance stayed on backend/system paths, which is expected and tracked separately.

## Outcome
d1) [have] TanStack Query usage is now explicitly classified by surface type instead of relying on aggressive defaults.

d2) [have] Static-ish frontend reads are better bounded without changing the visible product structure.

d3) [have] Live and semi-live surfaces retained the intended responsiveness after manual inspection.

d4) [have] Any further frontend traffic reduction should be treated as a new follow-on effort, not a continuation of this completed plan.

## Related Plans
e1) [have] The broader Supabase/backend egress history remains on pause here:
- [supabase-egress-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/supabase-egress-reduction-plan.md)

e2) [have] Backend aggregation is now the active structural read-reduction track:
- [backend-aggregation-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/backend-aggregation-plan.md)
