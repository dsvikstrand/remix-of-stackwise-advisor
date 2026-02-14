# Documentation Index (Canonical)

This folder is the source of truth for product, architecture, planning, and operations.

## Read Order For New Engineers/Models
1. `docs/architecture.md`
2. `docs/app/product-spec.md`
3. `docs/exec-plans/index.md`
4. `docs/ops/yt2bp_runbook.md`
5. `docs/references/channel-taxonomy-v0.md`

## Canonical Documents
- Architecture: `docs/architecture.md`
- Product behavior/spec: `docs/app/product-spec.md`
- Execution registry (active/completed): `docs/exec-plans/index.md`
- Program direction: `docs/exec-plans/active/channels-first-ux-program.md`
- Channel taxonomy reference: `docs/references/channel-taxonomy-v0.md`
- YT2BP product plan: `docs/product-specs/youtube_to_blueprint_plan.md`
- YT2BP API contract: `docs/product-specs/yt2bp_v0_contract.md`
- ASS design spec: `docs/design-docs/seed_ass_spec.md`

## Folder Map
- `docs/app/` product-level behavior and user flow docs
- `docs/architecture.md` system topology and invariants
- `docs/design-docs/` technical design + diagrams
- `docs/exec-plans/active/` currently active plans/program docs
- `docs/exec-plans/completed/` closed plans and closure notes
- `docs/ops/` runbooks and operational procedures
- `docs/product-specs/` product contracts and scoped feature plans
- `docs/references/` stable reference material
- `docs/schemas/` schema contracts

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
