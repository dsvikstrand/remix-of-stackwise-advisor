# Control Pack v0 (Promptless Generation Contract)

Goal: represent user intent as "click/press" controls (plus optional name/notes), then render it into a `PromptPackV0`
so the backend can keep using the existing text-based endpoints.

This is intentionally small and deterministic in v0. Later versions can add richer controls and/or an LLM composer.

## Data Shape (JSON)

Top-level:
- `version`: `0`
- `run_type`: `"seed" | "library" | "blueprint"`
- `goal`: string (high-level task; in UI this can be derived from controls)
- `persona_id`: optional string (if a persona is applied)
- `library`: controls for generating a library
- `blueprints`: array of controls for generating blueprints (count depends on run type)

Library:
- `name`: optional string (display name)
- `notes`: optional string (free text; optional in UI)
- `controls`: required, promptless settings (4-5 fields)
- `tags`: optional string[] (slug-like)

Blueprint:
- `name`: optional string
- `notes`: optional string
- `controls`: required, promptless settings (4-5 fields)
- `tags`: optional string[]

## Control Fields (v0)

Library controls (`library.controls`):
- `domain`: `"skincare" | "fitness" | "nutrition" | "productivity" | "general"`
- `audience`: `"beginner" | "intermediate" | "advanced"`
- `style`: `"friendly" | "practical" | "coach" | "clinical"`
- `strictness`: `"low" | "medium" | "high"`
- `length_hint`: `"short" | "medium" | "long"`

Blueprint controls (`blueprints[i].controls`):
- `focus`: string slug (example: `"strength-basics"`, `"hydration"`, `"morning-focus"`)
- `length`: `"short" | "medium" | "long"`
- `strictness`: `"low" | "medium" | "high"`
- `variety`: `"low" | "medium" | "high"`
- `caution`: `"conservative" | "balanced" | "aggressive"`

## Runner Integration

Implementation:
- `ControlPackV0` lives in `codex/skills/seed-blueprints/scripts/lib/control_pack_v0.ts`.
- When `--compose-controls` is enabled, the runner:
  - creates `requests/control_pack.json`
  - renders it to a `PromptPackV0` into `requests/prompt_pack.json`
  - overrides the effective `specRun` so downstream nodes are unchanged

## Guardrails / Evals

v0 gates are deterministic and cheap:
- `structural`: required fields exist and have valid types
- `bounds`: max lengths / max counts
- `testOnly_failOnce`: smoke-test wiring for retries (DAS config only)

Future (planned):
- `persona_alignment_controls_v0`: alignment checks directly on control choices
- LLM-based composer: generate control packs from persona + high-level goal

