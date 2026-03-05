# MVP Readiness Review Follow-up

Status: `active`

## Goal
a1) [todo] Convert the MVP-readiness review into a concrete launch-hardening checklist that can be executed in priority order without mixing blockers, cost controls, and cleanup work.

## Scope
b1) [have] This plan is derived from the repository review completed on `2026-03-05`.
b2) [have] This plan focuses on launch stability, cost control, rate-limit protection, queue behavior, and repo-risk cleanup.
b3) [todo] This plan does not replace `docs/ops/mvp-launch-readiness-checklist.md`; it feeds concrete implementation work into that launch gate.

## Launch Read
c1) [have] Current review recommendation is `NO-GO until P0 issues below are resolved`.
c2) [todo] Treat `P0` items in this file as launch blockers.
c3) [todo] Treat `P1` items in this file as strongly recommended before launch.
c4) [todo] Treat `P2` items in this file as cleanup/hardening that can land after the blockers if time is constrained.

## Status Snapshot
d1) [have] Direct URL generation now uses the same daily-credit wallet model as the other manual generation entrypoints, alongside route-level rate limiting.
d2) [have] Queue controls, worker split, provider retry logic, and launch runbooks are already present.
d3) [todo] Source-page unlock flow needs a pre-enqueue fix so credits are never held for rejected requests.
d4) [have] Source-page video library policy is now enforced in the backend as subscriber-only, not frontend-only gating.
d5) [have] Search/manual generation billing now routes through the wallet-backed credit model instead of a separate daily-cap-only path.
d6) [todo] Shared YouTube quota protection needs stronger concurrency safety and lower background quota burn.
d7) [todo] Handler-level tests are missing for several high-risk routes and policies.

## Execution Order
e1) [todo] Finish `P0-1`, `P0-2`, and `P0-3` first.
e2) [todo] Then complete `P1-1`, `P1-2`, and `P1-3`.
e3) [todo] Only after those are stable, spend time on `P2` cleanup/refactor work.

## P0 Launch Blockers

### P0-1 Credit Hold Before Queue Acceptance
f1) [todo] Risk: `blocking`
f2) [todo] Problem:
- Source-page unlock currently reserves credits before queue backpressure or intake-pause checks complete.
- Under `QUEUE_BACKPRESSURE` or `QUEUE_INTAKE_DISABLED`, users can end the request with credits temporarily held for work that never entered the queue.
f3) [todo] Primary files:
- `server/handlers/sourcePagesHandlers.ts`
- `server/services/sourceUnlocks.ts`
- `server/services/creditWallet.ts`
f4) [todo] Implementation checklist:
- move queue/intake preflight earlier so request rejection happens before any hold is created
- or add guaranteed rollback/refund + unlock reset before every non-enqueue return path
- verify duplicate, ready, in-progress, transcript-cooldown, and duration-blocked branches still behave correctly
f5) [todo] Validation:
- add handler/service tests covering `QUEUE_BACKPRESSURE` and `QUEUE_INTAKE_DISABLED`
- prove wallet balance and unlock state are unchanged after rejected requests
f6) [todo] Exit criteria:
- no request can leave a held reservation unless a queue job is actually created
- test coverage exists for both pressure and paused-intake branches

### P0-2 Source Page Policy Enforcement
g1) [todo] Risk: `blocking`
g2) [todo] Problem:
- Source Page Video Library appears subscriber-only in docs/UI, but backend routes currently allow any authenticated user to list and unlock videos.
g3) [todo] Primary files:
- `server/handlers/sourcePagesHandlers.ts`
- `src/pages/SourcePage.tsx`
- `docs/app/product-spec.md`
- `docs/architecture.md`
g4) [todo] Implementation checklist:
- decide the actual product policy: `subscriber-only` or `signed-in user`
- enforce that policy in backend `GET /videos` and `POST /videos/unlock|generate`
- align frontend copy and docs with the enforced rule
g5) [todo] Validation:
- add handler tests for subscribed and unsubscribed cases
- verify unauthorized or policy-blocked callers get deterministic error codes
g6) [todo] Exit criteria:
- no mismatch remains between backend behavior, frontend gating, and canonical docs

### P0-3 Generation Billing Consistency
h1) [todo] Risk: `blocking`
h2) [todo] Problem:
- Direct URL generation charges credits, while search-based generation appears to use daily-cap checks only.
- The Search UI currently implies a `1` credit cost, so either the backend or the product contract is inconsistent.
h3) [todo] Primary files:
- `server/handlers/youtubeHandlers.ts`
- `server/services/blueprintCreation.ts`
- `src/pages/Search.tsx`
- `docs/app/product-spec.md`
h4) [todo] Implementation checklist:
- decide the canonical billing rule for Search, direct URL, manual refresh, and source-page unlock flows
- implement billing checks consistently across those entrypoints
- align UI labels and support-facing copy with actual billing behavior
h5) [todo] Validation:
- add route or service tests that prove search generation is billed exactly as intended
- verify insufficient-credit behavior matches user-facing copy
h6) [todo] Exit criteria:
- every generation path follows one coherent billing model
- no UI route advertises a cost that the backend does not enforce

## P1 Strongly Recommended Before Launch

### P1-1 Quota Guard Concurrency Hardening
i1) [todo] Risk: `high`
i2) [todo] Problem:
- shared YouTube quota guard uses a non-atomic read/compute/write pattern and can under-enforce limits during concurrent spikes
i3) [todo] Primary files:
- `server/services/youtubeQuotaGuard.ts`
- related search/channel-search handlers in `server/handlers/youtubeHandlers.ts`
i4) [todo] Implementation checklist:
- move quota consume logic to an atomic DB function or equivalent compare-and-swap path
- keep cooldown fallback behavior for upstream `429/403` signals
- document whether budgets are strict or best-effort
i5) [todo] Validation:
- add focused service tests for concurrent consume attempts
- verify retry-after behavior remains deterministic
i6) [todo] Exit criteria:
- quota guard cannot materially over-admit live requests under concurrency

### P1-2 Quota Burn Reduction On Read Paths
j1) [todo] Risk: `high`
j2) [todo] Problem:
- subscriptions and related display surfaces still trigger live YouTube asset lookups on normal reads
j3) [todo] Primary files:
- `server/handlers/sourceSubscriptionsHandlers.ts`
- `server/index.ts` (`fetchYouTubeChannelAssetMap`)
- `server/services/sourcePageAssetSweep.ts`
j4) [todo] Implementation checklist:
- stop live asset fetching on hot read paths where stored data is good enough
- prefer stored source-page assets or cached refresh jobs
- keep opportunistic hydration bounded and non-user-blocking
j5) [todo] Validation:
- confirm repeated subscriptions page loads do not trigger live provider calls
- document fallback behavior when assets are missing
j6) [todo] Exit criteria:
- routine browsing does not materially consume YouTube quota

### P1-3 Queue Budgeting By Work Size
k1) [todo] Risk: `medium`
k2) [todo] Problem:
- queue depth is job-based, but some interactive jobs can contain many videos and monopolize workers
k3) [todo] Primary files:
- `server/handlers/youtubeHandlers.ts`
- `server/handlers/sourcePagesHandlers.ts`
- `server/handlers/sourceSubscriptionsHandlers.ts`
- queue metrics/runbook docs
k4) [todo] Implementation checklist:
- reduce max batch sizes for interactive routes or add per-job item caps by scope
- expose item-count-aware queue metrics if job size remains variable
- ensure operator dashboards distinguish `job count` from `work item count`
k5) [todo] Validation:
- run a drill using multi-item jobs and compare worker occupancy vs queue-depth reporting
k6) [todo] Exit criteria:
- queue health signals reflect real workload, not just row count

### P1-4 Credit Polling Load Reduction
l1) [todo] Risk: `medium`
l2) [todo] Problem:
- `useAiCredits` polls every `15s` from global UI surfaces, which can create steady backend load at launch scale
l3) [todo] Primary files:
- `src/hooks/useAiCredits.ts`
- `src/components/shared/UserMenu.tsx`
l4) [todo] Implementation checklist:
- reduce polling frequency or only poll when menus/views are open
- consider event-driven invalidation after generation/unlock actions instead of constant polling
- keep manual refresh behavior for support-critical views if needed
l5) [todo] Validation:
- estimate request volume for `100`, `500`, and `1000` active signed-in users before and after the change
l6) [todo] Exit criteria:
- background credit polling is no longer a meaningful launch-load contributor

## P2 Cleanup And Refactor

### P2-1 Handler Coverage Expansion
m1) [todo] Risk: `medium`
m2) [todo] Primary files:
- `src/test/*`
- `server/handlers/sourcePagesHandlers.ts`
- `server/handlers/sourceSubscriptionsHandlers.ts`
m3) [todo] Add coverage for:
- source-page subscription enforcement
- source-page unlock refund/rollback paths
- search-generation billing semantics
- quota-guard degraded/cached behavior

### P2-2 Shared Preflight Refactor
n1) [todo] Risk: `medium`
n2) [todo] Problem:
- enqueue preflight logic is spread across multiple handlers with slightly different semantics
n3) [todo] Primary files:
- `server/handlers/youtubeHandlers.ts`
- `server/handlers/sourcePagesHandlers.ts`
- `server/handlers/sourceSubscriptionsHandlers.ts`
- `server/services/*`
n4) [todo] Refactor target:
- centralize reusable preflight checks for auth, duration policy, credits, daily cap, queue backpressure, and intake pause

### P2-3 Repo Hygiene Pass
o1) [todo] Risk: `low`
o2) [todo] Scope:
- identify stale docs references, dead route assumptions, and duplicated helper logic left from earlier MVP iterations
o3) [todo] Initial targets:
- active/completed exec-plan registry consistency
- route-policy duplication between docs/UI/backend
- rate-limit and error-copy logic duplicated across handlers/pages

## Verification Bundle
p1) [todo] Route-policy tests:
- unsubscribed source-page user cannot access subscriber-only library features if that is the chosen policy
- source-page unlock rejection does not hold credits
- search generation billing path matches product contract
p2) [todo] Runtime checks:
- `npm run test`
- `npx tsc --noEmit`
- `npm run build`
p3) [todo] Load/ops checks:
- run one queue-pressure drill focused on source-page unlock
- run one quota-pressure drill focused on search and subscription reads
- append evidence to `docs/ops/mvp-launch-readiness-checklist.md`

## Completion Rule
q1) [todo] This plan can move to `completed/` only when all `P0` items are done and the launch checklist reflects the new evidence.
