# Execution Plans Registry

This file is the authoritative active/completed registry for execution plans.

## Active
- `docs/exec-plans/active/bleuv1-source-first-program.md`
  Program-level umbrella for `bleuV1` source-first MVP direction.
- `docs/exec-plans/active/project-bleuv1-mvp-foundation.md`
  Active manual iterative build plan for the remaining MVP work.
- `docs/exec-plans/active/bleuv1-manual-iteration-scheme.md`
  Step-by-step execution scheme with per-step completion tracking (plan -> PA -> implement -> evaluate).
- `docs/exec-plans/active/bleuv1-mvp-hardening-playbook.md`
  Followable deep-dive hardening playbook (blind spots, MVP priorities, sprint sequence, and success metrics).
- `docs/exec-plans/tech-debt-tracker.md`
  Deferred work backlog and non-blocking engineering debt.

## Paused Reference (Not Active)
- `docs/agentic/README.md`
- `docs/agentic/foundation/`
- `docs/agentic/executable/`

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

## Current Program Snapshot
- Core identity lock: `docs/app/core-direction-lock.md`.
- Legacy channels-first program: completed/archived.
- `bleuV1` source-first program: active.
- `bleuV1` MVP build execution: manual iterative mode.
- Agentic orchestration: paused reference path.

## Rules
- Keep only truly active docs in `active/`.
- Move finished project plans into `completed/`.
- Update this index whenever status changes.
