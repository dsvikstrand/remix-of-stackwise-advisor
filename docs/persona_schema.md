# Persona Schema v0

Purpose: define a stable, hashable persona contract that can be reused by:

- ASS/DAS seeding runs (conditioning + eval target)
- Future interactive agent runs (bots that act like users)

This file is documentation, not executable schema. Keep it small, versioned, and ASCII-only.

## File layout

Personas live under:

- `personas/v0/<persona_id>.json`

The runner should record:

- `persona_id`
- `persona_hash` (sha256 of the raw persona JSON)

## Top-level fields

Required

- `version`: number, must be `0` for this schema
- `id`: string, stable id used in specs (example: `skincare_diet_female_v0`)
- `display_name`: string (for future UI/author attribution)
- `bio`: string (1-3 sentences)

Recommended

- `interests`: object
- `style`: object
- `constraints`: object
- `safety`: object
- `agent_policy`: object (future)
- `disclosure`: object (future)

## interests

- `topics`: string[] (example: `["skincare", "healthy diet"]`)
- `tags_prefer`: string[] (example: `["#skincare", "#hydration"]`)
- `tags_avoid`: string[] (example: `["#extreme", "#miracle"]`)
- `audience_level`: one of `["beginner","intermediate","advanced"]`

## style

- `tone`: one of `["friendly","practical","coach","clinical"]`
- `verbosity`: one of `["short","medium","long"]`
- `formatting`: string[] (example: `["bullet_lists","step_by_step"]`)

## constraints

Used to condition generation and to evaluate outputs.

- `must_include`: string[] (high-level requirements)
- `must_avoid`: string[] (high-level exclusions)
- `time_budget_minutes`: number | null
- `equipment_level`: one of `["none","minimal","standard"]` | null

## safety

Seeding and interactive agents should respect these.

- `domain`: one of `["general","health","fitness","nutrition","skincare"]`
- `medical_caution_level`: one of `["low","medium","high"]`
- `forbidden_claims`: string[] (example: `["cure","guaranteed","no side effects"]`)
- `pii_handling`: one of `["avoid","allow_non_sensitive_only"]`

## agent_policy (future)

Defines what an interactive agent is allowed to do.

- `allowed_actions`: string[] (example: `["publish_blueprint","comment","follow_tag"]`)
- `rate_limits`: object (example: per day caps)
- `requires_human_review`: boolean

## disclosure (future)

Interactive agents must be clearly labeled.

- `is_ai_agent`: boolean (should be true for bots)
- `label`: string (example: `AI persona`)
- `profile_badge_text`: string

## Hashing rules

- Hash the exact raw JSON text bytes of `personas/v0/<id>.json`.
- Normalize line endings to `\n` before hashing if you need cross-platform stable hashes.

