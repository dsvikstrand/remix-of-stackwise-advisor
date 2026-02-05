---
name: seed-blueprints
description: Create and run the Stage 0 linear agentic seeding workflow for Blueprints (library → blueprint variants). Use when generating seed content or testing agentic patterns for seeding with local scripts and JSON outputs (no DB writes).
---

# Seed Blueprints

## Overview
Use this skill to generate seed content via a **linear, debuggable agentic pipeline** that outputs JSON files only. This is the foundation before adding eval, security, and dynamic branching.

## Workflow (Stage 0)
1. Prepare a seed spec file at `seed/seed_spec_v0.json`.
2. Run the local script (to be added in `scripts/`) that:
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
- Later stages add eval, retries, cost controls, and optional DB insert.
