# Documentation Index (Canonical)

This folder is the source of truth for product, architecture, planning, and operations.

## Current Production Truth
- Product/runtime lock: `docs/app/core-direction-lock.md`
- System/runtime topology: `docs/architecture.md`
- Current production ops/release runbook: `docs/ops/yt2bp_runbook.md`
- Launch gate board: `docs/ops/mvp-launch-readiness-checklist.md`
- Plan/status registry: `docs/exec-plans/index.md`
- Preferred non-store app path: installable Bleup PWA at `https://bleup.app` (online-first, same backend/auth model as the web app)

## Delivery Mode
- Active: manual iterative build loop.
- Protocol: propose update -> planning pass -> `PA` -> implement + evaluate.
- Agentic orchestration docs are reference material and not the active execution path.
- Historical plan/reference docs may describe superseded intermediate states. Use the canonical runtime docs above for current production truth.

## Read Order For Current Runtime And Ops
1. `docs/app/core-direction-lock.md`
2. `docs/architecture.md`
3. `docs/ops/yt2bp_runbook.md`
4. `docs/ops/mvp-launch-readiness-checklist.md`
5. `docs/exec-plans/index.md`

## Primary Planning Surfaces
- Launch gate board: `docs/ops/mvp-launch-readiness-checklist.md`
- Active proof/deferred tail: `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`
- Active implementation program: `docs/exec-plans/active/backend-write-policy-plan.md`
- Plan authoring governance: `docs/exec-plans/plan-authoring-guidelines.md`
- Latest completed implementation programs:
  - `docs/exec-plans/completed/transcript-provider-launch-plan.md`
  - `docs/exec-plans/completed/pre-launch-ui-ux-plan.md`
- Durable post-launch debt: `docs/exec-plans/tech-debt-tracker.md`

## Canonical Runtime Documents
- Core direction lock: `docs/app/core-direction-lock.md`
- Landing direction: `docs/app/landing-page-direction.md`
- Feed model: `docs/app/mvp-feed-and-channel-model.md`
- Product behavior/spec: `docs/app/product-spec.md`
- Architecture: `docs/architecture.md`
- Execution registry: `docs/exec-plans/index.md`

## App Section Docs
- Section-by-section app docs: `app-sections/README.md`
- Only reviewed sections should contain real content.
- Unreviewed sections may exist as empty placeholders until they are inspected.

## Supporting Runbooks And Evidence
- YT2BP runbook: `docs/ops/yt2bp_runbook.md`
- Oracle CLI/auth access: `docs/ops/oracle-cli-access.md`
- P1-1 / P1-2 verification runbook: `docs/ops/p1-1-p1-2-verification-runbook.md`
- Playwright callback evidence: `docs/ops/playwright-p1-2-callback-evidence.md`
- Playwright preflight notes: `docs/ops/playwright-preflight-notes.md`
- Google OAuth verification checklist: `docs/ops/google-oauth-verification-checklist.md`
- Google OAuth reviewer demo script: `docs/ops/google-oauth-reviewer-demo-script.md`
- YT2BP API contract (adapter v0): `docs/product-specs/yt2bp_v0_contract.md`

## Historical Reference
- Historical references are not the current production contract.
- Paused broader egress program: `docs/exec-plans/active/on-pause/supabase-egress-reduction-plan.md`
- Paused backend aggregation program: `docs/exec-plans/active/on-pause/backend-aggregation-plan.md`
- Paused post-`d3d0239` debloat audit: `docs/exec-plans/active/on-pause/post-d3d0239-debloat-plan.md`
- Completed TanStack Query tuning program: `docs/exec-plans/completed/tanstack-query-tuning-plan.md`
- Completed launch hardening phases: `docs/exec-plans/completed/mvp-launch-hardening-phases.md`
- Completed stepwise execution scheme: `docs/exec-plans/completed/bleuv1-manual-iteration-scheme.md`
- Paused PWA implementation umbrella: `docs/exec-plans/active/on-pause/bleup-pwa-program.md`
- Paused runtime simplification umbrella: `docs/exec-plans/active/on-pause/mvp-runtime-simplification-plan.md`
- Paused strategy reference (`bleuV1`): `docs/exec-plans/active/on-pause/bleuv1-mvp-hardening-playbook.md`
- Paused MVP build reference plan: `docs/exec-plans/active/on-pause/project-bleuv1-mvp-foundation.md`

## Interpretation Rule
- If a detailed plan/reference file conflicts with canonical docs, follow canonical docs.
- Treat `docs/product-specs/youtube_to_blueprint_plan.md` as detailed historical/reference context; use `docs/product-specs/yt2bp_v0_contract.md` for runtime API truth.
- Do not use paused/completed plan docs to infer the current Oracle runtime or release contract.

## Legacy Archive (Reference-Only)
- Agentic foundation pack (archived): `docs/_archive/legacy-ass-agentic/agentic/foundation/`
- Agentic executable pack (archived): `docs/_archive/legacy-ass-agentic/agentic/executable/`
- ASS/DAS design docs (archived): `docs/_archive/legacy-ass-agentic/`

## Folder Map
- `docs/app/` product-level behavior and user flow docs
- `app-sections/` section-by-section app surface notes and reviews
- `docs/_archive/legacy-ass-agentic/` archived ASS/agentic reference contracts (not active runtime guidance)
- `docs/architecture.md` system topology and invariants
- `docs/design-docs/` technical design + diagrams
- `docs/exec-plans/active/` one current implementation plan only
- `docs/exec-plans/active/tail/` proof/deferred carry-forward docs
- `docs/exec-plans/active/on-pause/` paused reference plans
- `docs/exec-plans/deserted/` abandoned/superseded plans kept for history only
- `docs/exec-plans/completed/` closed plans and closure notes
- `docs/ops/` runbooks and operational procedures
- `docs/product-specs/` product contracts and scoped feature plans
- `docs/references/` stable reference material
- `docs/_archive/legacy-ass-agentic/schemas/` archived schema contracts (legacy seed/ASS)

## Governance Rules
- Do not reintroduce moved/deprecated stub docs.
- Use canonical paths only (listed above).
- Keep active/completed status in sync via `docs/exec-plans/index.md`.
- When code changes match freshness rules, run:
  - `npm run docs:refresh-check -- --json`
  - `npm run docs:link-check`

## Freshness System
- Mapping file: `docs/_freshness_map.json`
- Checker: `npm run docs:refresh-check`
- Output fields:
  - `affected_docs`
  - `missing_updates`
  - `suggested_sections`
  - `status`
