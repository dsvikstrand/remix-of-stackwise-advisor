# Eval Controls Taxonomy Schema (v1)

Purpose:
- Define the meaning of shared GUI controls (domain, audience, style, strictness, length_hint).
- Shared by seeding (ASS) and user generation evals.
- Deterministic and machine-readable.

File:
- `eval/policy/taxonomy/lib_gen_controls_v1.json`
- `eval/policy/taxonomy/bp_gen_controls_v1.json`

Top-level fields:
- `version`: number, must be `1`
- `notes`: string[] (optional)

Required sections:
- `domain`:
  - `allowCustom`: boolean
  - `values`: `{ id: string, label: string }[]`
- `audience` / `style` / `strictness` / `length_hint`:
  - `values`: `{ id: string, label: string, expects?: string[] }[]`

Conventions:
- All `id` fields should be lowercase slugs: `[a-z0-9_-]+`.
- `expects` should describe output characteristics (not prompts).
