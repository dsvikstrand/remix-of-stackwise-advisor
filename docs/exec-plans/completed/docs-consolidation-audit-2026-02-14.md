# Docs Consolidation Audit (2026-02-14)

Status: `completed`

## Scope
- all files under the docs directory
- root `README.md`
- `AGENTS.md` docs-governance alignment

## Document Matrix

| Path | Purpose | Status | Canonical / Replacement | Stale Risk |
|---|---|---|---|---|
| README.md | Repo onboarding | canonical | self | high -> refreshed |
| docs/README.md | docs entrypoint | canonical | self | high -> refreshed |
| docs/architecture.md | system topology and invariants | canonical | self | medium |
| docs/_freshness_map.json | docs freshness routing | canonical | self | high -> refreshed |
| docs/LINKS.md | external reference links | canonical | self | low |
| docs/app/product-spec.md | runtime product behavior | canonical | self | high -> refreshed |
| docs/app/youtube_pilot_run_sheet.md | YT pilot sheet | canonical | self | low |
| docs/app/yt2bp_smoke_urls.txt | YT smoke URL list | canonical | self | low |
| docs/product-specs/index.md | product-spec index | canonical | self | low |
| docs/product-specs/youtube_to_blueprint_plan.md | YT2BP plan | canonical | self | medium |
| docs/product-specs/yt2bp_v0_contract.md | YT2BP contract | canonical | self | low |
| docs/design-docs/index.md | design-doc index | canonical | self | low |
| docs/design-docs/seed_ass_spec.md | ASS design spec | canonical | self | low |
| docs/design-docs/ASS_simple.mmd | ASS simplified diagram | canonical | self | low |
| docs/ass_das/ASS_full.mmd | detailed ASS diagram | canonical reference | self | low |
| docs/ass_das/persona_onboarding.md | persona onboarding runbook | canonical | self | low |
| docs/exec-plans/index.md | active/completed registry | canonical | self | high -> refreshed |
| docs/exec-plans/active/channels-first-ux-program.md | channels-first program source | active | self | medium |
| docs/exec-plans/active/project-3-channel-following.md | P3 active project | active | self | medium |
| docs/exec-plans/active/project-4-blueprint-detail-priority.md | P4 planned | active/planned | self | medium |
| docs/exec-plans/active/project-5-metrics-validation.md | P5 planned | active/planned | self | medium |
| docs/exec-plans/tech-debt-tracker.md | deferred debt list | canonical | self | medium |
| docs/exec-plans/completed/project-1-ia-and-lingo.md | P1 closure history | completed | self | low |
| docs/exec-plans/completed/project-2-feed-density.md | P2 closure history | completed | self | low |
| docs/exec-plans/completed/supabase-migration-closure-2026-02-13.md | migration closure | completed | self | low |
| docs/exec-plans/completed/docs-consolidation-audit-2026-02-14.md | consolidation audit | completed | self | none |
| docs/references/index.md | references index | canonical | self | low |
| docs/references/channel-taxonomy-v0.md | channel taxonomy reference | canonical | self | low |
| docs/generated/index.md | generated-doc index | canonical | self | low |
| docs/lovable/lovable_sql_add_generation_controls.md | lovable SQL note | canonical/reference | self | low |
| docs/ops/normalization_loop_protocol.md | ops protocol | canonical | self | low |
| docs/ops/yt2bp_runbook.md | production runbook | canonical | self | medium |
| docs/schemas/ass_eval_config_schema.md | schema contract | canonical | self | low |
| docs/schemas/control_pack_schema.md | schema contract | canonical | self | low |
| docs/schemas/eval_bounds_schema.md | schema contract | canonical | self | low |
| docs/schemas/eval_controls_taxonomy_schema.md | schema contract | canonical | self | low |
| docs/schemas/eval_scorecard_schema.md | schema contract | canonical | self | low |
| docs/schemas/persona_schema.md | schema contract | canonical | self | low |
| docs/schemas/seed_secrets_schema.md | schema contract | canonical | self | low |

## Deprecated/Stub Files Removed (Hard Delete)
- app/youtube_to_blueprint_plan.md
- app/yt2bp_v0_contract.md
- ass_das/seed_ass_spec.md
- ass_das/ASS_simple.mmd

## Coverage Gaps Closed In This Pass
- `/blueprints` no longer treated as dedicated browse page (redirect to `/wall` documented).
- Feed scope + sort customization documented.
- Help/theme relocation to profile dropdown captured via product behavior update.
- Active/completed execution-plan split made explicit and index-driven.
- Stub alias strategy retired; canonical paths only.
