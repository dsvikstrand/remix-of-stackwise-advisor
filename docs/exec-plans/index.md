# Execution Plans Registry

This file is the authoritative active/reference/deserted/completed registry for execution plans.

## Current Runtime / Ops Truth
- `docs/app/core-direction-lock.md`
  Canonical product/runtime lock, including the single-service Oracle MVP runtime.
- `docs/architecture.md`
  Canonical system/runtime topology for the current production contract.
- `docs/ops/yt2bp_runbook.md`
  Canonical production operations and backend-first release runbook.
- `docs/ops/mvp-launch-readiness-checklist.md`
  Canonical launch gate board and proof log.

## Active Root
- `docs/exec-plans/active/oracle-generation-trace-full-ownership-cutover-plan.md`
  Current active implementation root for the explicit generation-trace cutover chapter whose end state is full Oracle ownership and zero normal-runtime Supabase `generation_run_events` work.
- `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`
  Current proof/deferred carry-forward tail. This is the only standing active-tail support file.
- `docs/exec-plans/tech-debt-tracker.md`
  Durable post-launch cleanup/debt board. This is not an execution plan, but it remains the long-lived debt surface.

## Reference Plans
- These files remain valid historical reference plans, but they are not the current implementation focus.
- `docs/exec-plans/active/on-pause/oracle-deeper-ownership-and-supabase-reduction-plan.md`
  Paused broader Oracle-ownership architecture chapter retained as context after the narrower queue and unlock full-ownership cutovers completed.
- `docs/exec-plans/active/on-pause/oracle-blueprint-youtube-comments-full-ownership-cutover-plan.md`
  Queued next ownership chapter for full Oracle `blueprint_youtube_comments` cutover after current generation-trace burn-in/closure; this is the strongest remaining Supabase family in the latest 24h sample.
- `docs/exec-plans/completed/oracle-feed-full-ownership-cutover-plan.md`
  Completed Oracle-only feed cutover; retained as reference while later chapters pursued remaining Supabase-owned runtime surfaces.
- `docs/exec-plans/completed/oracle-generation-state-full-ownership-cutover-plan.md`
  Completed Oracle-only generation-state cutover; retained as reference after bootstrap/write/read severing and accepted burn-in.
- `docs/exec-plans/deserted/backend-aggressive-egress-tuning-plan.md`
  Paused backend egress tuning root retained in case the team chooses to resume the remaining aggressive-but-acceptable freshness/cadence trims later.
- `docs/exec-plans/completed/bleup-pwa-program.md`
  Deferred until Android/install-update proof work becomes active again.
- `docs/exec-plans/completed/mvp-runtime-simplification-plan.md`
  Deferred historical runtime simplification umbrella retained for later reconsideration.
- `docs/exec-plans/completed/bleup-pwa-phase5-deferred-tracks.md`
  Deferred child-track reference for later PWA enhancements.
- `docs/exec-plans/completed/project-bleuv1-mvp-foundation.md`
  Historical paused MVP build reference.
- `docs/exec-plans/completed/bleuv1-mvp-hardening-playbook.md`
  Historical paused hardening reference.
- `docs/exec-plans/completed/supabase-egress-reduction-plan.md`
  Historical broader backend/frontend egress reduction plan retained as reference.
- `docs/exec-plans/completed/backend-aggregation-plan.md`
  Historical structural read-aggregation plan retained as follow-up reference.
- `docs/exec-plans/completed/supabase-egress-attribution-and-reduction-plan.md`
  Completed reference for the post-migration Supabase REST attribution and staged backend egress reduction chapter.
- `docs/exec-plans/completed/post-d3d0239-debloat-plan.md`
  Paused narrow debloat track for auditing the post-`d3d0239` reaction commits, with special scrutiny on the larger stale-state recovery hardening before starting provider-specific investigation.
## Deserted / Superseded
- These files are preserved for history only. They must not be resumed without a new explicit replacement plan.
- `docs/exec-plans/deserted/ptp-provider-install-master-plan.md`
  Deserted after the `PTP` direction was abandoned.
- `docs/exec-plans/deserted/ptp-provider-validation-playbook.md`
  Deserted with the `PTP` install track.
- `docs/exec-plans/deserted/repo-cleanup-and-scale-readiness-plan.md`
  Superseded by narrower, more trackable cleanup plans.
- `docs/exec-plans/deserted/codex-session-checkpoint.md`
  Historical session-local recovery note; not a current planning surface.

## Completed
- `docs/exec-plans/completed/project-1-ia-and-lingo.md`
  Completed: channels-first terminology + IA baseline.
- `docs/exec-plans/completed/project-2-feed-density.md`
  Completed: feed density + wall-to-wall UI baseline.
- `docs/exec-plans/completed/project-3-channel-following.md`
  Completed: channel-following runtime + telemetry loop.
- `docs/exec-plans/completed/project-4-blueprint-detail-priority.md`
  Completed: blueprint detail hierarchy/content priority pass.
- `docs/exec-plans/completed/project-5-metrics-validation.md`
  Completed: channels-first metrics framework draft.
- `docs/exec-plans/completed/channels-first-ux-program.md`
  Completed/deprecated umbrella program replaced by `bleuV1` program direction.
- `docs/exec-plans/completed/supabase-migration-closure-2026-02-13.md`
  Completed: Supabase migration closure and validation notes.
- `docs/exec-plans/completed/docs-consolidation-audit-2026-02-14.md`
  Completed: full docs inventory/classification and deprecated-stub removal.
- `docs/exec-plans/completed/bleuv1-refactor-a3-parity-checklist.md`
  Completed: backend-first no-behavior-drift parity contract, including final Phase 4 validation evidence.
- `docs/exec-plans/completed/mvp-launch-hardening-phases.md`
  Completed: earlier phase-by-phase launch hardening program retained as reference/history.
- `docs/exec-plans/completed/mvp-readiness-review-followup.md`
  Completed: main MVP readiness implementation program, including P0/P1 hardening and P2 cleanup/refactor execution.
- `docs/exec-plans/completed/bleuv1-refactor-a3-route-map-current.md`
  Completed: final modular route-distribution snapshot (`53` routes, `0` direct registrations in `server/index.ts`).
- `docs/exec-plans/completed/bleuv1-refactor-a3-route-map-baseline.md`
  Completed: pre-refactor route-map baseline artifact.
- `docs/exec-plans/completed/bleuv1-refactor-a3-response-shape-baseline.md`
  Completed: pre-refactor response-shape baseline artifact.
- `docs/exec-plans/completed/bleuv1-source-first-program.md`
  Completed: initial source-first umbrella direction plan.
- `docs/exec-plans/completed/bleuv1-manual-iteration-scheme.md`
  Completed: stepwise execution tracker with full MVP sequence closure.
- `docs/exec-plans/completed/transcript-provider-robustness-plan.md`
  Completed: transcript-provider hardening through provider fallback, cache reuse, stage-aware retry, and `yt_to_text` retirement. Remaining live-proof tail lives in `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`.
- `docs/exec-plans/completed/blueprint-contract-cutover-plan.md`
  Completed: blueprint contract cutover from legacy `steps`-first handling to canonical `blueprint_sections_v1`, including runtime, persistence, frontend, and repo-hygiene closure.
- `docs/exec-plans/completed/transcript-provider-launch-plan.md`
  Completed: transcript-provider launch execution, migration apply sequence, deploy, and proof logging.
- `docs/exec-plans/completed/pre-launch-ui-ux-plan.md`
  Completed: pre-launch navigation, interpretability, Help, and Home onboarding pass.
- `docs/exec-plans/completed/tanstack-query-tuning-plan.md`
  Completed: conservative global defaults plus explicit live/semi-live/static-ish query behavior, with post-change proof showing lower browser-attributed request churn.
- `docs/exec-plans/completed/backend-write-policy-plan.md`
  Completed: narrower backend write-policy reduction pass that replaced the earlier active root write-policy track.
- `docs/exec-plans/completed/backend-aggregation-plan.md`
  Completed/reference: structural read-aggregation plan retained as history after registry cleanup.
- `docs/exec-plans/completed/supabase-egress-reduction-plan.md`
  Completed/reference: broader Supabase egress reduction plan retained as history after later focused passes.
- `docs/exec-plans/completed/post-d3d0239-debloat-plan.md`
  Completed/reference: narrow post-`d3d0239` debloat audit retained as history.
- `docs/exec-plans/completed/bleup-pwa-program.md`
  Completed/reference: umbrella PWA program retained for history while remaining proof items live in the proof tail.
- `docs/exec-plans/completed/bleup-pwa-phase5-deferred-tracks.md`
  Completed/reference: deferred PWA child-track reference retained for later reconsideration.
- `docs/exec-plans/completed/mvp-runtime-simplification-plan.md`
  Completed/reference: runtime simplification umbrella retained for history.
- `docs/exec-plans/completed/project-bleuv1-mvp-foundation.md`
  Completed/reference: MVP foundation build reference retained for history.
- `docs/exec-plans/completed/bleuv1-mvp-hardening-playbook.md`
  Completed/reference: broader `bleuV1` hardening playbook retained for history.
- `docs/exec-plans/completed/blueprint-prompt-v5-caveats-plan.md`
  Completed: low-risk `v5` YT2BP contract rollout, keeping `blueprint_sections_v1` and `open_questions` while shifting the final section semantics and display label to `Caveats`.
- `docs/exec-plans/completed/backend-egress-skip-candidates-plan.md`
  Completed: narrow backend egress follow-up covering trigger-path maintenance, worker cadence/breadth/status trims, and fast-scope lease-heartbeat deferral.
- `docs/exec-plans/completed/backend-egress-skip-phase1-plan.md`
  Completed: safe-first child slice for the backend egress tracker covering trigger-path waste and low-value support-table/cleanup work.
- `docs/exec-plans/completed/frontend-read-surface-egress-plan.md`
  Completed: narrowed frontend/read-surface follow-up where only subscriptions passive status reads were implemented; remaining optional surfaces were not promoted to active work.
- `docs/exec-plans/completed/oracle-queue-full-ownership-cutover-plan.md`
  Completed: Oracle-only queue cutover, removing normal-runtime Supabase `ingestion_jobs` participation and closing the first full-ownership backend chapter.
- `docs/exec-plans/completed/oracle-unlock-full-ownership-cutover-plan.md`
  Completed: Oracle-only unlock cutover, removing normal-runtime Supabase `source_item_unlocks` participation and stale-shadow rehydration.
- `docs/exec-plans/completed/oracle-feed-full-ownership-cutover-plan.md`
  Completed: Oracle-only feed cutover, removing normal-runtime Supabase `user_feed_items` participation after accepted burn-in.
- `docs/exec-plans/completed/oracle-source-item-full-ownership-cutover-plan.md`
  Completed: Oracle-only source-item cutover, removing normal-runtime Supabase `source_items` participation after accepted burn-in.
- `docs/exec-plans/completed/oracle-generation-state-full-ownership-cutover-plan.md`
  Completed: Oracle-only generation-state cutover, removing normal-runtime Supabase `generation_runs` and `source_item_blueprint_variants` participation after accepted burn-in.

## Current Program Snapshot
- Core identity lock: `docs/app/core-direction-lock.md`.
- Current runtime/ops truth: `docs/architecture.md`, `docs/ops/yt2bp_runbook.md`, and `docs/ops/mvp-launch-readiness-checklist.md`.
- Current active implementation plan: `docs/exec-plans/active/oracle-generation-trace-full-ownership-cutover-plan.md`.
  Generation trace is now the only open ownership chapter because Oracle-only event write/read severing is landed and the remaining work is burn-in plus closure after the most recent trace-specific follow-up.
- Queued next ownership chapter: `docs/exec-plans/active/on-pause/oracle-blueprint-youtube-comments-full-ownership-cutover-plan.md`.
  Blueprint YouTube comments are now the strongest next migration target because the latest 24h attribution sample is led by `blueprint_youtube_comments` read/write/delete traffic.
- Paused broader Oracle-ownership context: `docs/exec-plans/active/on-pause/oracle-deeper-ownership-and-supabase-reduction-plan.md`.
- Current active proof/deferred tail: `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`.
- Current post-launch debt board: `docs/exec-plans/tech-debt-tracker.md`.
- Latest completed ownership chapters: `docs/exec-plans/completed/oracle-feed-full-ownership-cutover-plan.md`, `docs/exec-plans/completed/oracle-source-item-full-ownership-cutover-plan.md`, and `docs/exec-plans/completed/oracle-generation-state-full-ownership-cutover-plan.md`.
- Current active ownership chapter: `docs/exec-plans/active/oracle-generation-trace-full-ownership-cutover-plan.md`.
- Latest completed implementation plans: `docs/exec-plans/completed/transcript-provider-launch-plan.md` and `docs/exec-plans/completed/pre-launch-ui-ux-plan.md`.
- Historical PWA/runtime-simplification/egress reference plans are archived under `docs/exec-plans/completed/`.
- The prior Supabase egress attribution/reduction chapter is completed and now serves as reference context for the paused broader Oracle-ownership chapter and the completed queue/unlock cutover chapters.
- Backend egress skip candidates + Phase 1 child plan are completed and archived under `docs/exec-plans/completed/`.
- Frontend read-surface egress follow-up is completed and archived under `docs/exec-plans/completed/`.
- Backend aggressive egress tuning is currently preserved under `docs/exec-plans/deserted/backend-aggressive-egress-tuning-plan.md`.
- Blueprint prompt `v5` Caveats rollout is completed.
- TanStack Query tuning is completed.
- Transcript-provider robustness work is completed, with later live-proof items carried into the proof tail.
- `PTP` install docs and the broad cleanup umbrella are deserted/superseded, not active.

## Rules
- Keep only one active implementation plan at `docs/exec-plans/active/` root.
- Keep `docs/exec-plans/active/tail/mvp-launch-proof-tail.md` as the canonical proof/deferred carry-forward file.
- Keep historical reference plans under `docs/exec-plans/completed/` unless a new explicit reactivation plan is created.
- Move abandoned/superseded plans into `docs/exec-plans/deserted/`.
- Move finished plans into `docs/exec-plans/completed/`.
- Use `docs/exec-plans/plan-authoring-guidelines.md` as the durable rulebook for future plan shape/review.
- Update this index whenever status changes.
- Do not treat on-pause, deserted, or completed plan docs as the current runtime/deploy source of truth.
