# Seed Runner Run Types (v0)

This doc is for `codex/skills/seed-blueprints/scripts/seed_stage0.ts`.

## Types

- `seed` (default)
  - Generates: library + blueprints
  - Validates: crossref
  - Optional: review/banner (Stage 0.5), apply (Stage 1)

- `library_only`
  - Generates: library only
  - Writes: `artifacts/blueprints.json` as empty with `skipped=true`
  - Useful: quick auth + library smoke tests, or iterating on library gates

- `blueprint_only`
  - Input: `--library-json <path>`
  - Generates: blueprints only
  - Useful: iterating on blueprint generation/gates while holding library constant

## Outputs

All run types still produce the standard v2 output layout under `seed/outputs/<run_id>/`.

The key difference is which artifacts contain real content vs a skip marker.
