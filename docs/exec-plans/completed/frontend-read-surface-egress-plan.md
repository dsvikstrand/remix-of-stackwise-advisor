# Frontend Read Surface Egress Plan

Status: `completed`  
Owner: `Codex / David`  
Last updated: `2026-03-31`

## Purpose

Track the next frontend/read-surface egress cuts that target non-core convenience and history surfaces with relatively weak product value compared with their request cost.

This plan intentionally avoids core blueprint generation, core browse feeds, and backend queue correctness. It focuses on duplicated status surfaces, secondary profile history, and optional comment-heavy UI.

## Current State

a1) [have] The recent backend/control-plane egress passes are complete and live.

a2) [have] Remaining good-ratio candidates now skew toward frontend read surfaces:
- bell live queue polling
- profile activity/comments hydration
- subscriptions passive refresh-job status reads
- optional source/comment surfaces

a3) [have] These surfaces are useful, but they are not as central as:
- generation correctness
- source unlock completion
- main Wall/feed browsing

a4) [have] The plan was intentionally narrowed in practice: `P3` subscriptions passive status reads became the only implemented target, while the other slices remained candidates only.

## Goal

b1) [todo] Reduce frontend-initiated read churn on secondary UX surfaces.

b2) [todo] Preserve:
- core generation flows
- full queue page usefulness
- basic profile readability
- blueprint detail usefulness

b3) [todo] Prefer:
- lazy-load
- one-shot fetch-on-open
- simpler/shallower views
over
- aggressive always-on polling

## Planned Cuts

c1) [todo] **P1: trim bell-side live queue**
Primary files:
- [NotificationsBell.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/shared/NotificationsBell.tsx)
- [useGenerationQueue.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useGenerationQueue.ts)

Current behavior:
- opening the bell starts active-job polling
- queue data is shown inline in the bell even though the full queue page already exists

Target change:
- remove the live queue block from the bell entirely
or
- degrade it to a one-shot fetch with no interval polling

Goal:
- eliminate duplicated status polling on a non-core convenience surface

Risk:
- low

c2) [todo] **P2: lazy-load or simplify profile activity/comments**
Primary files:
- [useUserProfile.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useUserProfile.ts)
- [ProfileTabs.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/profile/ProfileTabs.tsx)

Current behavior:
- profile comments and activity issue multiple reads/hydration queries
- they are loaded as part of a secondary profile-history surface

Target change:
- only fetch comments/activity when the tab is opened
- reduce breadth of `useUserActivity`
or
- simplify the activity model to fewer read paths

Goal:
- cut profile-history reads that are useful but not central

Risk:
- low-medium

c3) [todo] **P3: reduce subscriptions-page passive status reads**
Primary files:
- [useSubscriptionsPageController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useSubscriptionsPageController.ts)
- [subscriptionsApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/subscriptionsApi.ts)

Current behavior:
- subscriptions page still does passive latest-job reads when no active job id is known

Target change:
- keep direct known-job polling only
- weaken or remove passive `latest-mine` lookups
- fetch on dialog open or explicit refresh instead

Goal:
- reduce convenience-only status churn on subscriptions

Risk:
- low-medium

c4) [todo] **P4: make source YouTube comments explicitly optional**
Primary files:
- [useBlueprintYoutubeComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useBlueprintYoutubeComments.ts)
- [BlueprintDetail.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/pages/BlueprintDetail.tsx)

Current behavior:
- source comments are still a richer optional read surface on detail

Target change:
- lazy-load with explicit user action
- keep manual refresh path intact after load

Goal:
- reduce optional enrichment reads on blueprint detail

Risk:
- low-medium

c5) [todo] **P5: weaken inbox freshness**
Primary files:
- [useNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useNotifications.ts)
- [NotificationsBell.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/shared/NotificationsBell.tsx)

Current behavior:
- bell/inbox still behaves relatively live for a secondary surface

Target change:
- fetch fewer rows
- longer stale windows
- reduce eager write/read behavior if acceptable

Goal:
- keep notifications useful without treating the bell like a live dashboard

Risk:
- low

c6) [todo] **P6: lazy-load wall/community comments**
Primary files:
- [useComments.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useComments.ts)
- [CommentsThread.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/wall/CommentsThread.tsx)

Current behavior:
- wall/community comments still form a direct secondary read surface

Target change:
- fetch only on explicit thread open
- optionally reduce default depth/limit

Goal:
- trim social/discussion reads that are secondary to the main app loop

Risk:
- low-medium

## Recommended Order

d1) [have] Original broad recommendation was:
1. `P1` bell live queue
2. `P2` profile activity/comments

d2) [have] After review, the current narrowed recommendation is:
1. `P3` subscriptions passive status

d3) [have] Best follow-up slice after that, if still needed:
1. `P3` subscriptions passive status
2. `P4` source YouTube comments

d4) [have] Lowest-priority cleanup after that:
1. `P5` inbox freshness
2. `P6` wall/community comments

## Verification

e1) [todo] After the current `P3` slice, run:
- `npm run typecheck`
- targeted frontend tests if present

e2) [todo] Product sanity checks:
- subscriptions page still opens normally without passive latest-job reads
- opening the refresh dialog still restores a queued/running refresh job acceptably
- known active refresh jobs still poll and settle normally

e3) [todo] After deploy and soak, compare:
- request churn tied to subscriptions passive status reads
- overall UX acceptability of the narrower refresh-status restore behavior

## Exit Criteria

f1) [have] This plan is complete because:
- the narrowed `P3` slice landed and was production-verified
- the remaining candidate slices were not selected as current implementation work
- the next active egress work moved back to backend/control-plane tuning under a new active root plan
