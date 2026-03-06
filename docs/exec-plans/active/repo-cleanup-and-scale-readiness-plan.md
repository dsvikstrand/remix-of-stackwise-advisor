# Repo Cleanup And Scale-Readiness Plan

Status: `active`

## Goal
a1) [todo] Reduce legacy, bloated, and duplicated code paths that increase maintenance cost or slow future feature work, without reopening launch-gate behavior changes.

## Scope
b1) [have] This is a post-launch cleanup/scalability plan, not a launch-gate plan.
b2) [have] Scope is backend, frontend composition, compatibility-layer pruning, and repo/docs hygiene.
b3) [have] Out of scope:
- billing-policy changes
- queue-model changes beyond maintainability cleanup
- schema migrations
- frontend redesign work

## Why This Plan Exists
c1) [have] The repo is materially safer than it was during MVP hardening, but a few concentrated hotspots still carry disproportionate maintenance risk.
c2) [have] The main risks are:
- oversized orchestration files
- duplicated policy logic across runtime layers
- compatibility aliases/fields that are still live but no longer product-core
- noisy historical artifacts that make the repo harder to navigate

## Cleanup Phases

### C1 Backend Composition Cleanup
d1) [have] Goal:
- reduce concentration in the backend runtime bootstrap/orchestration layer

d2) [have] Primary files:
- `server/index.ts`
- `server/services/*`
- `server/routes/*`
- `server/handlers/*`

d3) [have] Targets:
- extract worker/runtime bootstrap concerns from `server/index.ts`
- isolate queue-runner/scheduler wiring from route composition
- keep route registration in `server/index.ts`, but move operational orchestration into dedicated modules
- make runtime-mode (`combined`, `web_only`, `worker_only`) composition easier to reason about in one place

d4) [have] Success criteria:
- `server/index.ts` is materially smaller
- worker loop, scheduler loop, and runtime bootstrap are not interwoven with route registration
- no public API behavior changes

d5) [have] Completion notes:
- runtime config resolution now lives in `server/services/runtimeConfig.ts`
- queued worker lifecycle now lives in `server/services/queuedIngestionWorkerController.ts`
- YouTube refresh scheduler lifecycle now lives in `server/services/youtubeRefreshSchedulerController.ts`
- `server/index.ts` still owns route registration and queue job processing semantics, but no longer owns long-lived worker/scheduler timer state directly

### C2 Frontend Page-Orchestrator Cleanup
e1) [todo] Goal:
- reduce page-level spaghetti in high-churn surfaces by extracting hooks/helpers, not redesigning UX

e2) [todo] Primary files:
- `src/pages/Subscriptions.tsx`
- `src/pages/Wall.tsx`
- `src/pages/BlueprintDetail.tsx`
- `src/pages/SourcePage.tsx`

e3) [todo] Targets:
- extract subscription page OAuth/import/refresh orchestration into focused hooks
- extract `Wall` feed composition + unlock/status orchestration into focused hooks/selectors
- extract `BlueprintDetail` source-channel lookup/render-prep logic into reusable helpers/hooks
- keep route/component contracts stable while reducing in-component state/query/mutation sprawl

e4) [todo] Success criteria:
- page files are materially smaller
- async orchestration is split from render-heavy JSX
- tests or smoke checks cover the extracted hooks/helpers where practical

### C3 Compatibility-Layer Pruning
f1) [todo] Goal:
- remove compatibility paths that no longer justify the cognitive load

f2) [todo] Primary targets:
- source-page alias `POST /api/source-pages/:platform/:externalId/videos/generate`
- `mode` compatibility handling on source-subscription endpoints
- other no-longer-used compatibility-only request/response branches discovered during cleanup

f3) [todo] Rules:
- do not remove a compatibility path until confirmed unused by current frontend/runtime flows
- prefer a small removal matrix with explicit “keep/remove/defer” decisions
- update docs and tests at the same time

f4) [todo] Success criteria:
- fewer live aliases/coercions remain in handler code and canonical docs
- the current product path is easier to understand from code alone

### C4 Docs And Repo Hygiene
g1) [todo] Goal:
- reduce repo noise and documentation drift that makes the codebase feel more legacy than it is

g2) [todo] Primary targets:
- heavy non-canonical docs under `docs/golden_blueprint/`
- stale compatibility language that no longer maps to real product risk
- duplicate policy phrasing across runtime docs/runbooks

g3) [todo] Actions:
- move or reclassify bulky artifact docs so they do not dominate normal repo navigation
- tighten canonical docs so “legacy/compatibility/rollback” language is only retained where operationally necessary
- keep runbooks/reference docs aligned with the canonical set

g4) [todo] Success criteria:
- repo search/navigation is less noisy
- current product/runtime truth is easier to identify
- docs do not overexplain old migration context in normal read paths

## Recommended Order
h1) [todo] `Phase 1: C1 Backend Composition`
- highest maintainability payoff and the biggest single hotspot

h2) [todo] `Phase 2: C2 Frontend Page-Orchestrators`
- extract page-level orchestration once backend composition is calmer

h3) [todo] `Phase 3: C3 Compatibility Pruning`
- remove aliases/coercions only after current live paths are easy to trace

h4) [todo] `Phase 4: C4 Docs/Repo Hygiene`
- finish with low-risk cleanup after structural changes settle

## Validation
i1) [todo] Run targeted tests after each cleanup slice.

i2) [todo] Full validation bundle for any substantial phase:
- `npm run test`
- `npx tsc --noEmit`
- `npm run build`
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`

## Completion Rule
j1) [todo] Move this plan to `completed/` when:
- the four cleanup phases are either finished or explicitly deferred
- remaining long-tail leftovers are tracked only in `docs/exec-plans/tech-debt-tracker.md`
