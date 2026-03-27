# Execution Plans Registry

This file is the authoritative active/on-pause/deserted/completed registry for execution plans.

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
- `docs/exec-plans/active/backend-write-policy-plan.md`
  Current tracked implementation plan for reducing Supabase backend churn by removing or coarsening non-essential bookkeeping writes and cadence.
- `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`
  Current proof/deferred carry-forward tail. This is the only standing active-tail support file.
- `docs/exec-plans/tech-debt-tracker.md`
  Durable post-launch cleanup/debt board. This is not an execution plan, but it remains the long-lived debt surface.

## On-Pause Reference
- These files remain valid reference plans, but they are not the current implementation focus.
- `docs/exec-plans/active/on-pause/bleup-pwa-program.md`
  Deferred until Android/install-update proof work becomes active again.
- `docs/exec-plans/active/on-pause/mvp-runtime-simplification-plan.md`
  Deferred while narrower blueprint-contract cleanup is the current implementation plan.
- `docs/exec-plans/active/on-pause/bleup-pwa-phase5-deferred-tracks.md`
  Deferred child-track reference for later PWA enhancements.
- `docs/exec-plans/active/on-pause/project-bleuv1-mvp-foundation.md`
  Historical paused MVP build reference.
- `docs/exec-plans/active/on-pause/bleuv1-mvp-hardening-playbook.md`
  Historical paused hardening reference.
- `docs/exec-plans/active/on-pause/supabase-egress-reduction-plan.md`
  Paused broader backend/frontend egress reduction plan; retained as reference while narrower backend write-policy work is the current focused implementation track.
- `docs/exec-plans/active/on-pause/backend-aggregation-plan.md`
  Paused structural read-aggregation plan; retained as follow-up reference while the narrower Supabase write-policy pass is active.
- `docs/exec-plans/active/on-pause/post-d3d0239-debloat-plan.md`
  Paused narrow debloat track for auditing the post-`d3d0239` reaction commits, with special scrutiny on the larger stale-state recovery hardening before starting provider-specific investigation.
- `docs/exec-plans/active/on-pause/blueprint-prompt-v5-caveats-plan.md`
  Paused follow-up plan for the low-risk `v5` YT2BP contract rollout: keep `blueprint_sections_v1` and `open_questions`, but shift the section semantics to human-facing `Caveats` with backend-first prompt/gate changes and optional later UI relabel.

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

## Current Program Snapshot
- Core identity lock: `docs/app/core-direction-lock.md`.
- Current runtime/ops truth: `docs/architecture.md`, `docs/ops/yt2bp_runbook.md`, and `docs/ops/mvp-launch-readiness-checklist.md`.
- Current active implementation plan: `docs/exec-plans/active/backend-write-policy-plan.md`.
- Current active proof/deferred tail: `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`.
- Current post-launch debt board: `docs/exec-plans/tech-debt-tracker.md`.
- Latest completed implementation plans: `docs/exec-plans/completed/transcript-provider-launch-plan.md` and `docs/exec-plans/completed/pre-launch-ui-ux-plan.md`.
- PWA rollout follow-up is on pause.
- Runtime simplification follow-up is on pause.
- The broader Supabase egress program is on pause while the narrower backend write-policy pass is the current focused reduction track.
- Backend aggregation is on pause while the write-policy pass addresses the strongest lower-risk backend churn candidates first.
- Post-`d3d0239` debloat review is on pause as a narrow cleanup track to resume before any provider-specific work if the current stack still looks overgrown.
- Blueprint prompt `v5` Caveats rollout is queued as an on-pause follow-up plan; it keeps the current schema while changing the last section’s semantics from `Open Questions` to `Caveats`.
- TanStack Query tuning is completed.
- Transcript-provider robustness work is completed, with later live-proof items carried into the proof tail.
- `PTP` install docs and the broad cleanup umbrella are deserted/superseded, not active.

## Rules
- Keep only one active implementation plan at `docs/exec-plans/active/` root.
- Keep `docs/exec-plans/active/tail/mvp-launch-proof-tail.md` as the canonical proof/deferred carry-forward file.
- Keep paused plans under `docs/exec-plans/active/on-pause/`.
- Move abandoned/superseded plans into `docs/exec-plans/deserted/`.
- Move finished plans into `docs/exec-plans/completed/`.
- Use `docs/exec-plans/plan-authoring-guidelines.md` as the durable rulebook for future plan shape/review.
- Update this index whenever status changes.
- Do not treat on-pause, deserted, or completed plan docs as the current runtime/deploy source of truth.
