# Execution Plans Registry

This file is the authoritative active/completed registry for execution plans.

## Primary Planning Surfaces
- `docs/ops/mvp-launch-readiness-checklist.md`
  Launch-gate board. This is the only file that answers `Are we launch-ready?` and `What P0/P1 items are still open?`
- `docs/exec-plans/active/mvp-launch-proof-tail.md`
  Current active proof-only tail beyond the checklist. This is the only file that answers `What launch-proof work is still open right now?`
- `docs/exec-plans/tech-debt-tracker.md`
  Durable post-launch cleanup/debt board. This is the only file that answers `What survives after launch as cleanup or debt?`

## Active Reference Support
- `docs/exec-plans/active/repo-cleanup-and-scale-readiness-plan.md`
  Active post-launch cleanup/scalability plan for backend composition, frontend page orchestration, compatibility pruning, and repo hygiene.
- `docs/ops/p1-1-p1-2-verification-runbook.md`
  Supporting runbook for the remaining P1 verification work.
- `docs/ops/playwright-p1-2-callback-evidence.md`
  Supporting automation evidence for P1-2.
- `docs/ops/playwright-preflight-notes.md`
  Supporting Playwright setup/findings for later callback verification.
- `docs/ops/yt2bp_runbook.md`
  Operational runbook for the YouTube-to-Blueprint service.

## Paused Reference (Not Active)
- `docs/exec-plans/active/on-pause/project-bleuv1-mvp-foundation.md`
- `docs/exec-plans/active/on-pause/bleuv1-mvp-hardening-playbook.md`
- `docs/_archive/legacy-ass-agentic/README.md`
- `docs/_archive/legacy-ass-agentic/agentic/foundation/`
- `docs/_archive/legacy-ass-agentic/agentic/executable/`

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
  Completed: initial source-first umbrella direction plan (superseded by hardening + foundation active tracks).
- `docs/exec-plans/completed/bleuv1-manual-iteration-scheme.md`
  Completed: stepwise execution tracker with full MVP sequence closure.

## Current Program Snapshot
- Core identity lock: `docs/app/core-direction-lock.md`.
- Legacy channels-first program: completed/archived.
- `bleuV1` source-first umbrella program: completed.
- Current launch authorization gate: `docs/ops/mvp-launch-readiness-checklist.md`.
- Current active proof tail beyond the gate: `docs/exec-plans/active/mvp-launch-proof-tail.md`.
- Current active cleanup/scalability plan: `docs/exec-plans/active/repo-cleanup-and-scale-readiness-plan.md`.
- Current post-launch debt board: `docs/exec-plans/tech-debt-tracker.md`.
- Manual iterative build strategy plans are paused reference docs.
- Agentic orchestration: archived reference path.

## Rules
- Keep actively executed plans at `docs/exec-plans/active/` root.
- Keep paused plans under `docs/exec-plans/active/on-pause/`.
- Move finished project plans into `completed/`.
- Update this index whenever status changes.
