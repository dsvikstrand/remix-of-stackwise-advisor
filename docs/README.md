# Docs Index

## Canonical Architecture
- `docs/architecture.md` is the canonical architecture document.

## Tags
- `[APP]`: application (user-facing product concepts and flows)
- `[MVP]`: minimum viable product (launch checklist and acceptance criteria) (deprecated for now)
- `[ASS]`: Agentic Seed System (the seeding pipeline project)
- `[LAS]`: Linear Agentic System (baseline sequential pipeline)
- `[DAS]`: Dynamic Agentic System (gates, retries, select-best)
- `[AG]`: Agentic Persona (persona profiles + persona-run wiring)
- `[GRAPH]`: system graphs (Mermaid, architecture maps) (includes ASS with AG)
- `[SCHEMA]`: schemas (stable data contracts)
- `[LOVABLE]`: Lovable-specific notes/workflows
- `[OPS]`: operational runbooks and production procedures

## New Structure (Incremental Reorg)
- `docs/design-docs/index.md`
- `docs/exec-plans/index.md`
- `docs/generated/index.md`
- `docs/product-specs/index.md`
- `docs/references/index.md`

Note:
- Existing folders (`docs/app`, `docs/ass_das`, `docs/ops`, `docs/schemas`, `docs/lovable`) remain active during migration.
- New indexes are additive and do not replace current paths yet.

## Core Docs (Canonical Sources Of Truth)
- `[APP]` `docs/app/product-spec.md` (product + concepts + user flows)
- `[APP]` `docs/product-specs/youtube_to_blueprint_plan.md` (YT2BP product plan and status)
- `[APP]` `docs/product-specs/yt2bp_v0_contract.md` (YT2BP request/response/error buckets)
- `[ASS] [LAS] [DAS] [AG]` `docs/design-docs/seed_ass_spec.md` (ASS spec: stages, auth, artifacts, eval)
- `[ASS] [GRAPH]` `docs/design-docs/ASS_simple.mmd` (conceptual flow, eval-centered)
- `[ASS] [AG]` `docs/ass_das/persona_onboarding.md` (new persona process, gotchas, smoke matrix)
- `[OPS] [APP]` `docs/ops/yt2bp_runbook.md` (YT2BP operational runbook and recovery commands)
- `[APP]` `docs/architecture.md` (system boundaries, runtime topology, invariants)

## Legacy Alias Paths (Migration Stubs)
- `docs/app/youtube_to_blueprint_plan.md` -> `docs/product-specs/youtube_to_blueprint_plan.md`
- `docs/app/yt2bp_v0_contract.md` -> `docs/product-specs/yt2bp_v0_contract.md`
- `docs/ass_das/seed_ass_spec.md` -> `docs/design-docs/seed_ass_spec.md`
- `docs/ass_das/ASS_simple.mmd` -> `docs/design-docs/ASS_simple.mmd`

## Schemas (Stable Reference)
- `[SCHEMA] [AG]` `docs/schemas/persona_schema.md`
- `[SCHEMA] [ASS]` `docs/schemas/control_pack_schema.md`
- `[SCHEMA] [ASS]` `docs/schemas/ass_eval_config_schema.md`
- `[SCHEMA] [ASS] [AG]` `docs/schemas/seed_secrets_schema.md`

## Freshness System
- Mapping file: `docs/_freshness_map.json`
- Command: `npm run docs:refresh-check`
- Purpose:
  - Inspect changed paths.
  - List required docs to review/update.
  - Output `affected_docs`, `missing_updates`, `suggested_sections`, and `status`.

## Lovable (Reference)
- `[LOVABLE]` `docs/lovable/lovable_sql_add_generation_controls.md`
