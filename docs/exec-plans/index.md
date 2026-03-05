# Execution Plans Registry

This file is the authoritative active/completed registry for execution plans.

## Active
- `docs/exec-plans/active/mvp-launch-hardening-phases.md`
  Phase-by-phase execution checklist for queue, worker, dependency, and launch-day operational hardening.
- `docs/ops/mvp-launch-readiness-checklist.md`
  MVP launch execution board and go/no-go gate (P0 critical + P1 useful hardening).
- `docs/exec-plans/tech-debt-tracker.md`
  Deferred work backlog and non-blocking engineering debt.

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
- Current execution track: launch hardening phases + tech-debt tracker.
- Launch authorization gate: `docs/ops/mvp-launch-readiness-checklist.md`.
- Manual iterative build strategy plans are paused reference docs.
- Agentic orchestration: archived reference path.

## Rules
- Keep actively executed plans at `docs/exec-plans/active/` root.
- Keep paused plans under `docs/exec-plans/active/on-pause/`.
- Move finished project plans into `completed/`.
- Update this index whenever status changes.
