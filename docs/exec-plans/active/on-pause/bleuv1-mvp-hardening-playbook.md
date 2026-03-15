# bleuV1 MVP Hardening Playbook

Status: `on-pause`

## Goal
Convert the current feature-complete MVP into a stable, clear, and scalable product surface by hardening UX trust, runtime reliability, and engineering foundations.

## Canonical Launch Checklist
a0) [have] Canonical launch-readiness and phased fix process is maintained in `docs/ops/mvp-launch-readiness-checklist.md`.
a00) [have] Use this playbook for strategic priority framing and use the ops checklist for execution evidence/status tracking.
a000) [have] Later cleanup/scalability follow-ups have since been reclassified; use `docs/exec-plans/index.md` for the current active plan.
a0000) [have] Current runtime/deploy truth does not live here; use `docs/architecture.md` and `docs/ops/yt2bp_runbook.md` for the live Oracle contract.

## Current State Snapshot
a1) [have] Core source-first loop is live: source subscriptions -> unlock/generate -> blueprint -> channel/home visibility.
a2) [have] Source Pages, Source Video Library, shared unlock, daily credit wallets, onboarding, and Explore source search are implemented.
a3) [have] Canonical docs and active plan registry are in good shape and checks are passing.
a4) [have] Primary architecture risk remains concentrated in a few large files, but recent cleanup has already extracted the runtime bootstrap plus the main `Subscriptions` and `Wall` page orchestrators into dedicated controller modules/hooks.
a4j) [have] Home/feed product semantics are now locked in `docs/app/mvp-feed-and-channel-model.md`: `For You` is source-driven and may contain locked items, `Joined` is the joined-channel published discovery lane, and `All` is the global published-blueprint lane.
a4b) [have] Launch gate execution board is active at `docs/ops/mvp-launch-readiness-checklist.md` (P0/P1 with owner/date/status/evidence).
a4c) [have] Launch hardening now includes explicit credit-backend fail-safe semantics (`CREDITS_UNAVAILABLE`), shared error-copy mapping, and baseline legal routes (`/terms`, `/privacy`).
a4d) [have] Runtime hotfix applied: source-page search no longer crashes backend when opportunistic asset-sweep wiring is present in route deps.
a4e) [have] Shared auto-unlock schema is now applied on the linked Supabase project (`qgqqavaogicecvhopgan`, migration watermark `20260306113000`).
a4f) [have] Queue admission now uses weighted work-item limits in addition to row depth, and ops queue health reports both row counts and work-item backlog.
a4g) [have] Credit refresh is now lazy by default: the header user menu fetches credits only while open, and Search relies on one-shot reads plus explicit invalidation after billable actions.
a4h) [have] Oracle runtime hardening now also depends on lazy backend OpenAI loading; startup-critical modules should not use top-level `openai` ESM imports.
a4h) [have] Backend maintainability pass extracted shared generation preflight helpers and expanded regression coverage around source-page policy, shared auto billing, and quota degraded paths.
a4i) [have] Admin entitlement bypass now applies to concrete credit reservation and shared auto-unlock funding, preventing auto rows from remaining `unlockable` solely due to zero wallet balance.
a4k) [have] Oracle MVP production runtime is now intentionally single-service combined mode (`agentic-backend.service` with HTTP + background work together); dedicated split worker topology is deferred beyond the current MVP load target.
a4l) [have] Oracle backend config source is now conceptually locked to `/etc/agentic-backend.env`; repo-root `.env` is local-only fallback for non-systemd runs and `.env.production` is no longer part of backend bootstrap.
a4m) [have] Shared transcript proxy runtime for opted-in providers is now locked to one explicit Webshare endpoint; legacy selector/list modes are removed from active runtime and docs/tests should not reintroduce them.
a4n) [have] `youtube_timedtext` is now the current default transcript path; `videotranscriber_temp` is the built-in fallback when YouTube captions are unavailable, and the temporary provider remains intentionally excluded from production runtime truth.
a4o) [have] Supabase schema history still contains the older `transcript_requests` Oracle/Paperspace bridge tables; treat that as historical parity only, not as current MVP transcript-runtime truth.
a4p) [have] Known-channel video-library routes now use the low-cost uploads-playlist path (`channels.list -> playlistItems.list`) instead of `search.list`; broad YouTube discovery remains the quota-heavy area to constrain.
a4q) [have] Current runtime video behavior on `/search` is now bounded single-video lookup (`URL/id first, title fallback second`) rather than broad paginated discovery.
a4q) [have] Source Page `Video Library` is now loaded on explicit user request instead of auto-fetching on page open, which reduces background YouTube API usage on normal source-page reads.
a5) [todo] Improve user trust around shared-cost auto billing transitions and async processing visibility.
a6) [todo] Reduce terminology ambiguity between personal stream, followed channels, source pages, and channel taxonomy.

## MVP Priorities

### P0 - Trust and Clarity (user-facing)
b1) [todo] Add one shared card-state legend (`Locked`, `Unlocking`, `Ready`) reused on Home, Source Page, and My Feed.
b2) [todo] Add lightweight recent-activity panel for generation jobs (queued/running/succeeded/failed).
b3) [todo] Improve credit transparency in UI: latest debit event, refill pace, and next refill timer.
b4) [todo] Add first-unlock guided milestone in onboarding so users see a complete success loop quickly.
b5) [todo] Add plain-language tooltip for shared unlock economics and why costs vary.

### P1 - Reliability and Operations
c1) [have] Integrity sweeps now recover stale unlock reservations/processing rows and orphan running unlock jobs with idempotent refund/fail transitions.
c2) [have] Unlock pipeline now emits correlation `trace_id` from request -> queue/job -> item success/failure -> terminal logs.
c3) [todo] Normalize unlock failure reasons to stable user-facing messages and stable internal reason codes.
c4) [have] Added focused backend integration tests for hold/settle/refund idempotency and concurrent unlock reserve semantics.
c5) [todo] Add explicit smoke playbook for mobile OAuth callback edge cases and unlock transitions.
c6) [have] Notifications MVP foundation is live (`comment_reply`, `generation_succeeded`, `generation_failed`) with header bell inbox and read/read-all controls.

### P2 - Maintainability and Scale-readiness
d1) [todo] Split `server/index.ts` into route modules (`source pages`, `subscriptions`, `unlock/credits`, `ingestion jobs`).
d2) [todo] Continue page orchestration cleanup from the new controller-hook baseline, with `BlueprintDetail` and `SourcePage` still the main remaining frontend hotspots.
d3) [todo] Incrementally tighten TypeScript strictness for touched modules.
d4) [todo] Add CI PR gate for `test`, `build`, and docs checks before merge.
d5) [todo] Add runtime health dashboard script for unlock throughput, failure rates, and queue latency.

## Blind Spots To Fix
e1) [todo] Async unlock feedback can still feel uncertain if job visibility is delayed or too hidden.
e2) [todo] Credits can appear "stuck" if debit/refill updates are not immediate and explicit.
e3) [todo] Scope language on Home (`For You` vs `Joined`) can still be misread without concise helper copy.
e4) [todo] Source/channel naming overlap can confuse non-technical users without consistent glossary phrasing.
e5) [todo] Legacy copy traces (`inventory/libraries`) should be removed from high-traffic screens to avoid identity drift.

## Execution Sequence (4 Sprint Track)
f1) [todo] Sprint 1: UX trust pass (`legend`, `job tray`, `credit detail`, `first-unlock onboarding cue`).
f2) [todo] Sprint 2: Reliability pass (`idempotency tests`, `stale sweeps`, `error-code/message normalization`, `correlation IDs`).
f3) [todo] Sprint 3: Refactor pass (`server route modularization`, `page-level hook extraction`, `strict TS increments`).
f4) [todo] Sprint 4: Growth stability pass (`funnel instrumentation`, `activation tuning`, `retention baseline review`).

## Success Metrics
g1) [todo] Activation: `% of new users who complete first unlock within 24h`.
g2) [todo] Reliability: `unlock success rate`, `median unlock-to-ready time`, `refund ratio`.
g3) [todo] Economics: `average credits spent per active user`, `cost-per-unlock distribution`, `shared unlock reuse rate`.
g4) [todo] UX clarity: `% repeated unlock clicks within 30s for same item` (confusion proxy).
g5) [todo] Retention: `D1` and `D7` by cohort (`imported subscriptions` vs `skipped onboarding`).

## Manual Inspection Checklist
h1) [todo] Unlock from Source Page shows immediate state transition and terminal result without page refresh.
h2) [todo] Unlock from Home `For You` mirrors Source Page behavior and card parity.
h3) [todo] Credit display updates immediately after reserve/settle/refund events.
h4) [todo] OAuth connect/import callback on mobile returns user to intended flow reliably.
h5) [todo] New users can understand first action without internal jargon.
h6) [todo] `For You` and `Your channels` behavior matches their labels.
h7) [todo] Source search in Explore returns valid Source Pages and routes correctly.

## Decision Log (Lock)
i1) [have] Keep source-first identity and shared unlock economics.
i2) [have] Keep credits as primary throttle with soft anti-abuse request limits.
i3) [have] Keep Source Pages platform-agnostic for future adapters.
i4) [have] Prioritize feed usage over adding large new discovery surfaces in current MVP phase.
i5) [have] Optimize trust/reliability before expansion features.

## Validation Commands
j1) [todo] `npm run test`
j2) [todo] `npm run build`
j3) [todo] `npm run docs:refresh-check -- --json`
j4) [todo] `npm run docs:link-check`

## Snapshot Note (2026-03-05)
k1) [have] YouTube comments refresh moved to bootstrap+manual model:
- auto `+15m`
- auto `+24h`
- owner-triggered manual endpoint is available immediately with per-blueprint cooldown
k2) [have] Manual generation billing now uses reserve -> settle/release semantics against the daily credit wallet, and shared-cost auto billing is active for funded auto-enabled subscribers.
k3) [have] Queue realism hardening is in place: weighted queue-work-item limits gate interactive multi-item jobs and `GET /api/ops/queue/health` now reports work-item backlog.
k4) [have] Credit-load hardening is in place: `useAiCredits` no longer polls globally, the always-mounted user menu is lazy-on-open, and post-action wallet freshness is event-driven.
