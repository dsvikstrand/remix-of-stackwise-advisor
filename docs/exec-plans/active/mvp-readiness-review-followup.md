# MVP Readiness Review Follow-up

Status: `active`

## Goal
a1) [todo] Keep one active engineering program for MVP hardening work that sits beside, but does not replace, the launch checklist.

## Scope
b1) [have] This plan is derived from the repository review completed on `2026-03-05`.
b2) [have] This plan focuses on launch stability, cost control, rate-limit protection, queue behavior, and repo-risk cleanup.
b3) [have] This plan is the only active implementation program beyond `docs/ops/mvp-launch-readiness-checklist.md`.
b4) [have] This plan answers `What is the current engineering program?` and `What is P2 and what order do we do it in?`

## Launch Read
c1) [have] Current review recommendation is `GO for code-path blockers; remaining launch work is checklist evidence capture plus P1/P2 follow-up`.
c2) [have] `P0` implementation blockers in this file are resolved.
c3) [todo] Treat remaining checklist evidence gaps and open `P1` drill items as the last pre-launch proof work.
c4) [have] Treat `P2` items in this file as the explicit post-launch execution path, not as launch-gate work.

## Status Snapshot
d1) [have] Direct URL generation now uses reserve -> settle/release billing against the daily-credit wallet instead of eager flat charging.
d2) [have] Queue controls, worker split, provider retry logic, and launch runbooks are already present.
d3) [have] Source-page unlock flow now runs queue/intake preflight before holds and releases reservations on enqueue failure.
d4) [have] Source-page video library policy is now enforced in the backend as subscriber-only, not frontend-only gating.
d5) [have] Search and manual refresh now classify duplicate/in-progress items before reservation, queue only the affordable new-item prefix, and carry reservation metadata into worker execution.
d6) [have] Shared-cost auto billing now uses canonical auto intents, funded-participant snapshots, and shared settle/release semantics instead of the temporary single-payer path.
d7) [have] Shared YouTube quota protection now uses an atomic DB consume path and routine subscription/source-page reads no longer spend live YouTube asset quota.
d8) [have] Handler-level coverage now exists for direct URL reserve/release timing plus Search/manual-refresh affordability trimming, and shared auto-billing math/lifecycle tests now cover the new funded-subset path.
d9) [have] `P2` backend/test/docs work landed: source-page handler coverage exists, shared generation preflight helpers are in place, and only long-tail post-launch cleanup remains in the debt tracker.

## Execution Order
e1) [have] `P0-1`, `P0-2`, and `P0-3` are completed.
e2) [have] `P0-4` is complete.
e3) [have] `P1-1`, `P1-2`, `P1-3`, and `P1-4` are implemented and locally validated.
e4) [have] Production now runs `13e9da13590335046bad9f0c0db16e2ac7d53046`, including the credit-override hotfix that restored `/api/credits` and credit-backed generation after the `5c16f60` regression.
e5) [have] Live production queue drills now prove the new work-item metrics are wired through route responses and `/api/ops/queue/health`.
e6) [todo] Remaining launch work is now concentrated in `P1-1` branch-protection evidence and `P1-2` Android Chrome real-device OAuth callback validation.
e7) [have] `docs/ops/p1-1-p1-2-verification-runbook.md` now captures the exact verification steps, device/browser matrix, and evidence templates for the final `P1-1` / `P1-2` closure work.
e8) [have] `docs/ops/playwright-p1-2-callback-evidence.md` now captures repeatable Playwright evidence for the `/subscriptions` callback path on iPhone/Android emulation, while explicitly leaving real-device Safari/Chrome signoff as the remaining `P1-2` gap.

## P0 Launch Blockers

### P0-1 Credit Hold Before Queue Acceptance
f1) [have] Risk: `blocking`
f2) [have] Problem:
- Source-page unlock currently reserves credits before queue backpressure or intake-pause checks complete.
- Under `QUEUE_BACKPRESSURE` or `QUEUE_INTAKE_DISABLED`, users can end the request with credits temporarily held for work that never entered the queue.
f3) [have] Primary files:
- `server/handlers/sourcePagesHandlers.ts`
- `server/services/sourceUnlocks.ts`
- `server/services/creditWallet.ts`
f4) [have] Implementation outcome:
- queue/intake preflight now happens before holds
- enqueue failure paths release reservations instead of stranding holds
- duplicate, ready, in-progress, transcript-cooldown, and duration-blocked branches still short-circuit without charging
f5) [have] Validation:
- handler/runtime validation landed in the source-page flow
- local typecheck/test/build pass completed after the billing-boundary patch
f6) [have] Exit criteria:
- no request can leave a held reservation unless a queue job is actually created

### P0-2 Source Page Policy Enforcement
g1) [have] Risk: `blocking`
g2) [have] Problem:
- Source Page Video Library appears subscriber-only in docs/UI, but backend routes currently allow any authenticated user to list and unlock videos.
g3) [have] Primary files:
- `server/handlers/sourcePagesHandlers.ts`
- `src/pages/SourcePage.tsx`
- `docs/app/product-spec.md`
- `docs/architecture.md`
g4) [have] Implementation outcome:
- Source Page shell remains public-readable
- `GET /videos` and `POST /videos/unlock|generate` are now subscriber-only in the backend
- frontend gating/copy were aligned to the backend rule
g5) [have] Validation:
- policy-blocked callers now receive deterministic `SOURCE_PAGE_SUBSCRIPTION_REQUIRED`
g6) [have] Exit criteria:
- no mismatch remains between backend behavior, frontend gating, and canonical docs

### P0-3 Generation Billing Consistency
h1) [have] Risk: `blocking`
h2) [have] Problem:
- Direct URL generation charges credits, while search-based generation appears to use daily-cap checks only.
- The Search UI currently implies a `1` credit cost, so either the backend or the product contract is inconsistent.
h3) [have] Primary files:
- `server/handlers/youtubeHandlers.ts`
- `server/services/blueprintCreation.ts`
- `src/pages/Search.tsx`
- `docs/app/product-spec.md`
h4) [have] Implementation outcome:
- direct URL, Search, and manual refresh now use one manual-generation credit model
- manual generation costs `1.00` per new blueprint intent
- duplicates/ready/in-progress items short-circuit as no-charge
- Search/manual refresh queue only the affordable new-item prefix and return additive skipped buckets
h5) [have] Validation:
- direct URL reserve/release timing is covered by targeted tests
- Search/manual refresh affordability and queue payload trimming are covered by targeted tests
h6) [have] Exit criteria:
- every manual generation path follows one coherent billing model
- no manual UI route advertises a cost that the backend does not enforce

### P0-4 Auto Shared-Cost Billing
i1) [have] Risk: `blocking`
i2) [have] Problem:
- subscription auto generation needed to move off the temporary payer-selection path
- locked product policy required shared-cost billing across funded auto-enabled subscribers
i3) [have] Primary files:
- `server/services/sourceSubscriptionSync.ts`
- `server/index.ts`
- `server/services/autoUnlockBilling.ts`
- `server/services/creditWallet.ts`
- `supabase/migrations/20260306113000_auto_unlock_shared_cost_v1.sql`
- `docs/app/product-spec.md`
- `docs/architecture.md`
i4) [have] Implementation outcome:
- one canonical auto intent now exists per source video through durable `source_auto_unlock_intents` + `source_auto_unlock_participants`
- release detection snapshots subscribed + auto-enabled participants
- funded-subset selection uses deterministic fixed-point recomputation with `0.01` precision and stable user-id remainder assignment
- participant holds reserve via an atomic DB function, settle at first OpenAI dispatch, and release on pre-generation failure
- unlock workers now collapse auto-vs-auto and manual-vs-auto races to one billable intent and one generation winner
- unlock recovery sweeps release shared auto holds for expired/stale auto reservations
i5) [have] Validation:
- tests now cover `10`, `3`, shrinking-subset, and `0` funded-participant cases
- deterministic `0.34 + 0.33 + 0.33` settlement math is covered
- shared auto settle/release lifecycle is covered in unit tests
- Supabase migration `20260306113000_auto_unlock_shared_cost_v1.sql` is applied on linked project `qgqqavaogicecvhopgan`
- post-apply introspection confirms `source_auto_unlock_intents`, `source_auto_unlock_participants`, `source_item_unlocks.auto_unlock_intent_id`, and `reserve_source_auto_unlock_intent`
i6) [have] Exit criteria:
- auto billing now matches the locked product policy and is auditable from durable ledger data

## P1 Strongly Recommended Before Launch

### P1-1 Quota Guard Concurrency Hardening
j1) [have] Risk: `high`
j2) [have] Problem:
- shared YouTube quota guard uses a non-atomic read/compute/write pattern and can under-enforce limits during concurrent spikes
j3) [have] Primary files:
- `server/services/youtubeQuotaGuard.ts`
- `supabase/migrations/20260306143000_youtube_quota_atomic_consume_v1.sql`
- related search/channel-search handlers in `server/handlers/youtubeHandlers.ts`
j4) [have] Implementation outcome:
- quota consume now runs through `public.consume_youtube_quota_budget(...)`, which locks the provider row, resets minute/day windows atomically, honors active cooldowns, and increments counters only on allow
- `checkAndConsume()` now delegates to the DB function and preserves fail-open behavior only for missing-schema / missing-RPC environments
- `markQuotaLimited()` remains the cooldown write path for upstream `403/429`
j5) [have] Validation:
- quota guard service tests now cover the RPC path and missing-function fail-open behavior
- Supabase migration `20260306143000_youtube_quota_atomic_consume_v1.sql` is applied on linked project `qgqqavaogicecvhopgan`
- local typecheck/test/build pass completed after the provider-safety patch
j6) [have] Exit criteria:
- quota guard cannot materially over-admit live requests under concurrency

### P1-2 Quota Burn Reduction On Read Paths
k1) [have] Risk: `high`
k2) [have] Problem:
- subscriptions and related display surfaces still trigger live YouTube asset lookups on normal reads
k3) [have] Primary files:
- `server/handlers/sourceSubscriptionsHandlers.ts`
- `server/handlers/sourcePagesHandlers.ts`
- `server/index.ts` (`fetchYouTubeChannelAssetMap`)
- `server/services/sourcePageAssetSweep.ts`
k4) [have] Implementation outcome:
- `GET /api/source-subscriptions` now reads `source_channel_avatar_url` from stored `source_pages` metadata and never blocks on live YouTube asset fetches
- missing/stale source-page assets now fall back to `null` on read and trigger only the bounded background source-page asset sweep
- source-page reads no longer do inline asset hydration; they return stored/null metadata immediately and rely on the sweep for later repair
k5) [have] Validation:
- handler tests now prove subscription reads do not call `fetchYouTubeChannelAssetMap`
- handler tests now cover the missing-asset fallback path plus bounded sweep scheduling
k6) [have] Exit criteria:
- routine browsing does not materially consume YouTube quota

### P1-3 Queue Budgeting By Work Size
l1) [have] Risk: `medium`
l2) [have] Problem:
- queue depth is job-based, but some interactive jobs can contain many videos and monopolize workers
l3) [have] Primary files:
- `server/handlers/youtubeHandlers.ts`
- `server/handlers/sourcePagesHandlers.ts`
- `server/handlers/sourceSubscriptionsHandlers.ts`
- `server/handlers/opsHandlers.ts`
- `server/services/ingestionQueue.ts`
- queue metrics/runbook docs
l4) [have] Implementation outcome:
- queue admission now uses dual thresholds: existing row-depth limits plus `QUEUE_WORK_ITEMS_HARD_LIMIT=250` and `QUEUE_WORK_ITEMS_PER_USER_LIMIT=40`
- interactive route caps are now reduced to `SEARCH_GENERATE_MAX_ITEMS=20`, `SOURCE_UNLOCK_GENERATE_MAX_ITEMS=20`, and `REFRESH_GENERATE_MAX_ITEMS=10`
- Search, Source Page, and manual refresh responses now return additive `queue_work_items` and `user_queue_work_items`
- `GET /api/ops/queue/health` now reports additive top-level and per-scope work-item metrics alongside existing row-based fields
l5) [have] Validation:
- queue work-item helper coverage landed in `src/test/ingestionQueueWorkItems.test.ts`
- handler tests now cover weighted backpressure on Search and manual refresh flows plus additive queue work-item metadata
- local typecheck/test/build pass completed after the weighted-budget patch
- production drill on `2026-03-06` showed two authenticated 3-item Search jobs producing `running_depth=2`, `running_work_items=6`, and `search_video_generate.running_work_items=6`
- production follow-up deploy on `2026-03-06` fixed `worker_running` to derive from fresh running-job lease/heartbeat state and verified `worker_running=true` during a live `all_active_subscriptions` run, then `false` again after completion
- timed operator drill on `2026-03-06` classified queue state in under `5` minutes using `/api/ops/queue/health`, `/api/ingestion/jobs/latest`, and `npm run metrics:queue`
l6) [have] Exit criteria:
- queue health signals now reflect both row depth and real queued work size for supported scopes

### P1-4 Credit Polling Load Reduction
m1) [have] Risk: `medium`
m2) [have] Problem:
- always-mounted UI surfaces were still refreshing `/api/credits` in the background, creating avoidable steady read load at launch scale
m3) [have] Primary files:
- `src/hooks/useAiCredits.ts`
- `src/components/shared/UserMenu.tsx`
- `src/pages/Search.tsx`
- `src/components/subscriptions/RefreshSubscriptionsDialog.tsx`
m4) [have] Implementation outcome:
- `useAiCredits` now defaults to one-shot fetch with no polling unless a caller opts in explicitly
- `UserMenu` now fetches credits only while the dropdown is open for a signed-in user
- Search still performs a one-shot load on mount for credit-aware generation UI, then relies on explicit invalidation after credit-changing actions
- manual refresh queue success now invalidates `['ai-credits']` so wallet state refresh stays event-driven
m5) [have] Validation:
- `src/test/useAiCredits.test.ts` now covers the no-poll default behavior
- local request-volume estimate dropped from roughly `100/500/1000` background `/api/credits` requests per minute at `100/500/1000` signed-in users to `0` steady-state menu-closed polling requests per minute
- local typecheck/test/build pass completed after the lazy-refresh patch
- production credit-path hotfix verification on `2026-03-06` restored `/api/credits` to `200` responses with `credits_backend_mode=db` and correct daily-grant values for two real accounts
- authenticated API drill on `2026-03-06` completed with `119/120` successful responses, `latency_p95_ms=1038`, and no critical saturation
- headless browser proof on deployed frontend showed `0` `/api/credits` requests during a `70s` menu-closed wall idle window, `1` request when the menu opened, `1` request on Search mount, and `0` additional requests during a subsequent `70s` Search idle window
- authenticated headless frontend burst across `/`, `/wall`, and `/my-feed` produced `32` backend API responses, all `200`, with `0` page errors
m6) [have] Exit criteria:
- background credit refresh is now lazy/on-demand rather than a constant global poll source

## P2 Cleanup And Refactor

Status:
- [have] `P2` is intentionally outside the launch gate.
- [have] This section is the only active `P2` source of truth.
- [have] `P2` was executed in three phases: `P2-A Coverage`, `P2-B Shared Preflight`, `P2-C Hygiene`.
- [have] Recommended order stayed intact: confidence first, then consolidation, then cleanup.
- [have] Remaining follow-up work now lives in `docs/exec-plans/tech-debt-tracker.md`.

### P2-A Coverage Expansion
n1) [have] Risk: `medium`
n2) [have] Primary files:
- `src/test/*`
- `server/handlers/sourcePagesHandlers.ts`
- `server/handlers/sourceSubscriptionsHandlers.ts`
n3) [have] Implementation outcome:
- source-page subscription enforcement
- source-page unlock refund/rollback paths
- auto shared-cost billing semantics
- quota-guard degraded/cached behavior
n4) [have] Validation:
- new `src/test/sourcePagesHandlers.test.ts` now covers subscriber-only library access, unlock denial, queue rejection cleanup, and duplicate/in-progress no-charge stability
- `src/test/sourceSubscriptionsHandlers.test.ts` and `src/test/youtubeHandlers.test.ts` now cover mixed duplicate/new/in-progress classification and additive queue result buckets
- `src/test/autoUnlockBilling.test.ts` now covers empty-funded-set retry safety and settled-intent non-billable retry behavior
- `src/test/youtubeQuotaGuardService.test.ts` now covers missing-RPC fail-open behavior plus explicit cooldown and minute-window reset timing
n5) [have] Why first:
- expands confidence before structural refactors
- protects later cleanup from behavioral drift
n6) [have] Exit criteria:
- the highest-risk launch-era handler flows have direct regression coverage
- the next refactor phase can proceed with tighter guardrails

### P2-B Shared Preflight Refactor
o1) [have] Risk: `medium`
o2) [have] Problem:
- enqueue preflight logic is spread across multiple handlers with slightly different semantics
o3) [have] Primary files:
- `server/handlers/youtubeHandlers.ts`
- `server/handlers/sourcePagesHandlers.ts`
- `server/handlers/sourceSubscriptionsHandlers.ts`
- `server/services/generationPreflight.ts`
o4) [have] Implementation outcome:
- centralize reusable preflight checks for auth, duration policy, duplicate classification, wallet reservation, queue backpressure, and intake pause
- Search/manual-refresh now share classification, reservation-prefix, queue-count, queue-admission, and additive result-bucket helpers
- source-page routes now share subscription access resolution plus queue-admission helpers
- handler ownership stayed split and route contracts remained stable
o5) [have] Why second:
- this is the main maintainability win
- it is safer once broader handler coverage exists
o6) [have] Exit criteria:
- handler-specific drift is reduced
- shared preflight rules live in one reusable service surface with no intended behavior change

### P2-C Repo Hygiene Pass
p1) [have] Risk: `low`
p2) [have] Scope:
- identify stale docs references, dead route assumptions, and duplicated helper logic left from earlier MVP iterations
p3) [have] Implementation outcome:
- active/completed exec-plan registry consistency
- route-policy duplication between docs/UI/backend
- rate-limit and error-copy logic duplicated across handlers/pages
p4) [have] Why last:
- the cleanup targets are easier to identify once coverage and preflight consolidation settle
- this avoids spending time on cosmetic cleanup before the larger structural work lands
p5) [have] Exit criteria:
- obvious stale references and duplicated helper logic are removed or explicitly tracked elsewhere
- docs, backend policy, and frontend assumptions are materially easier to reason about

## Verification Bundle
q1) [have] Route-policy tests:
- unsubscribed source-page user cannot access subscriber-only library features if that is the chosen policy
- source-page unlock rejection does not hold credits
- manual generation billing path matches product contract
- auto shared-cost billing path matches product contract
q2) [have] Runtime checks:
- `npm run test`
- `npx tsc --noEmit`
- `npm run build`
q3) [have] Load/ops checks:
- launch-era queue and quota drills were already captured in `docs/ops/mvp-launch-readiness-checklist.md`, so `P2` stayed scoped to backend/test/docs without reopening launch-gate operations work

## Recommended Post-Launch Execution Order
r1) [have] `Phase 1: P2-A Coverage`
- regression tests landed before structural changes

r2) [have] `Phase 2: P2-B Shared Preflight`
- queue/intake/classification/reservation helpers now live in `server/services/generationPreflight.ts`

r3) [have] `Phase 3: P2-C Hygiene`
- docs and obvious policy drift were cleaned after the refactor settled

## Completion Rule
s1) [todo] Keep this plan active until the remaining `P1-1` / `P1-2` checklist gaps are either closed or explicitly deferred for launch.
