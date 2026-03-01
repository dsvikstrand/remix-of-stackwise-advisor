# Eval Bounds Assets (v0)

Purpose: keep deterministic "bounds" limits out of code, so the ASS/agentic runner and future user flows can share the same guardrails.

Files (all required)
- `eval/policy/bounds/v0/library/bounds_v0.json`
- `eval/policy/bounds/v0/blueprints/bounds_v0.json`
- `eval/policy/bounds/v0/prompt_pack/bounds_v0.json`
- `eval/policy/bounds/v0/control_pack/bounds_v0.json`

Common rules
- Each file must be valid JSON.
- Each file must include `"version": 0`.
- All numeric values must be non-negative integers.

Library bounds (`library/bounds_v0.json`)
- `maxCategories`
- `maxCategoryNameLen`
- `maxItemsPerCategory`
- `maxItemNameLen`

Blueprint bounds (`blueprints/bounds_v0.json`)
- `maxSteps`
- `maxStepTitleLen`
- `maxStepDescriptionLen`
- `maxItemsPerStep`

Prompt pack bounds (`prompt_pack/bounds_v0.json`)
- `maxGoalLen`
- `maxTitleLen`
- `maxDescriptionLen`
- `maxNotesLen`
- `maxTags`
- `maxTagLen`
- `maxBlueprints`

Control pack bounds (`control_pack/bounds_v0.json`)
- `maxGoalLen`
- `maxNameLen`
- `maxNotesLen`
- `maxTags`
- `maxTagLen`
- `maxBlueprints`
