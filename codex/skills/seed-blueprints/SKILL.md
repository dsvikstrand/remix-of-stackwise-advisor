---
name: seed-blueprints
description: Create and run the linear agentic seeding workflow for Blueprints (library → blueprint variants). Use when generating seed content or testing agentic patterns with local scripts, JSON artifacts (Stage 0/0.5), and optional Supabase apply mode (Stage 1).
---

# Seed Blueprints

## Overview
Use this skill to generate seed content via a **linear, debuggable agentic pipeline**:

- Stage 0: generate library + blueprint drafts -> JSON artifacts only (no DB writes)
- Stage 0.5: execute review + banner in dryRun mode -> still no DB/Storage writes
- Stage 1: apply mode -> write real rows to Supabase (inventories, blueprints, tags, optional review + banner_url)

## Workflow (Stage 0)
1. Prepare a seed spec file at `seed/seed_spec_v0.json`.
2. Run the local script `codex/skills/seed-blueprints/scripts/seed_stage0.ts` that:
   - generates a library from the spec topic
   - generates multiple blueprint variants from that library
   - writes JSON outputs to `seed/outputs/<run_id>/`
3. Validate outputs against the library (items must exist).
4. Review outputs manually before any DB insert (Stage 0 has **no writes**).

## References
- Seed spec template: `references/seed_spec.md`
- Endpoints: `references/endpoints.md`
- Linear workflow: `references/workflow.md`

## Notes
- This skill is for **learning agentic patterns**: clear inputs, deterministic outputs, debuggable logs.
- Later stages add eval, retries, cost controls, and dynamic branching.
- DAS config: `seed/das_config_v1.json` (per-node retries/select-best; enabled with `--das`).
