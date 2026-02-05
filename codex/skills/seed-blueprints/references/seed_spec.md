# Seed Spec (Stage 0)

Use `seed/seed_spec_v0.json` as the input format.

**Purpose:** Define a single library and multiple blueprint variants derived from it.

## Required fields
- `run_id`: short string for output folder name
- `library.topic`: base topic
- `library.title`: human title
- `library.description`: short summary
- `library.notes`: optional constraints
- `library.tags`: 2–4 tags
- `blueprints[]`: list of 3–6 variants

## Example
See `seed/seed_spec_v0.json`.
