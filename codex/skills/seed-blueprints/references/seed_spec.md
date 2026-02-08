# Seed Spec (Stage 0)

Use `seed/seed_spec_v0.json` as the input format.

**Purpose:** Define a single library and multiple blueprint variants derived from it.

## Required fields
- `run_id`: short string for output folder name
- `asp`: optional agentic seeder persona stub (context only for now; used later for alignment evals)
- `library.topic`: base topic
- `library.title`: human title
- `library.description`: short summary
- `library.notes`: optional constraints
- `library.tags`: 2–4 tags
- `blueprints[]`: list of 3–6 variants

## Optional `asp` fields (v0 stub)
- `asp.id`: stable string identifier (recommended)
- `asp.display_name`: display name for later multi-account seeding
- `asp.bio`: short bio
- `asp.interests[]`: tags/topics the seeder prefers
- `asp.tone`: writing style (e.g. pragmatic, playful, clinical)
- `asp.must_include[]`: constraints to bias generation later
- `asp.must_avoid[]`: constraints to avoid unsafe or off-topic content later

## DAS config (separate file)
The seed spec defines *what to generate*. The DAS config defines *how to run the graph* (retries, select-best, gates).

- Config file: `seed/das_config_v1.json`

## Example
See `seed/seed_spec_v0.json`.
