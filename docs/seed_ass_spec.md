# Agentic Seed System (ASS) – Baseline (LAS) + Roadmap (DAS)

## Goal
Build a **debuggable agentic seeding pipeline** that can:

- Generate a library (inventory) and blueprint drafts from a topic
- Optionally execute AI review + banner generation
- Optionally apply results to Supabase (DB + banner upload)

The baseline is a **linear agentic system (LAS)**. We will evolve it into a **dynamic agentic system (DAS)** with gates/retries/selection.

## Where It Lives
- Runner: `codex/skills/seed-blueprints/scripts/seed_stage0.ts`
- Input spec: `seed/seed_spec_v0.json`
- Outputs: `seed/outputs/<run_id>/...`
- Mermaid graph: `docs/seed_las_stage0.mmd`

## Inputs
`seed/seed_spec_v0.json`

Key fields:
- `run_id`: output folder name
- `library`: seed topic + title + constraints
- `blueprints[]`: blueprint variants to generate from the generated library
- Optional: `asp` (persona id + optional stub fields; recorded for future alignment evals)

## Gate Contract (Current)
When DAS is enabled (`--das`), each candidate is evaluated by a list of gates and recorded in `logs/decision_log.json`.

Stable per-gate contract:
- `gate_id`: string (example: `structural`, `bounds`, `crossref`)
- `ok`: boolean
- `severity`: one of `info|warn|hard_fail`
- `score`: number (0..1 or 0..100, consistent per gate)
- `reason`: short string (human readable)
- `data`: optional JSON object for structured details (counts, limits, etc.)

Initial focus (B1): deterministic gates only (`structural`, `bounds`, `crossref`).

## Personas (Repo-Global, Planned)
Personas are not "seed-only". They are a reusable contract that can be used by:
- Seeding runs (conditioning + eval target)
- Future interactive agent runs (agents that act like users)

Schema doc:
- `docs/persona_schema.md`

Planned storage:
- `personas/v0/<persona_id>.json`

Runner behavior (planned):
- Load persona by id from the seed spec.
- Compute and record `persona_hash` in `logs/run_meta.json` for reproducibility.

## Stage 0 (LAS) – Artifacts Only (No Writes)
Stage 0 calls the agentic backend for generation, but does **not** write to Supabase.

Outputs under `seed/outputs/<run_id>/` (layout v2):
- `manifest.json` (paths + dirs map)
- `logs/run_meta.json` (run context, including optional `asp`)
- `logs/run_log.json` (timings + status)
- `artifacts/library.json` (generated categories + items)
- `artifacts/blueprints.json` (generated blueprint drafts)
- `requests/review_requests.json` (payloads only; no network)
- `requests/banner_requests.json` (payloads only; no network)
- `artifacts/validation.json` (cross-reference checks)
- `artifacts/publish_payload.json` (payload only; no writes)

## Stage 0.5 (LAS) – Execute AI (Still No Writes)
Stage 0.5 optionally runs two expensive calls to validate the happy path end-to-end:

- Review: `POST /api/analyze-blueprint` (SSE stream collected into text)
- Banner: `POST /api/generate-banner` with `dryRun: true` (base64; no Storage upload)

Additional outputs:
- `ai/reviews.json`
- `ai/banners.json`

## Stage 1 – Apply Mode (Writes To Supabase)
Stage 1 takes the Stage 0/0.5 artifacts and writes to Supabase:

- Insert inventory/library row
- Insert blueprint rows
- Persist optional review text
- Upload banner via Supabase edge function and persist `banner_url`
- Publish by setting `is_public=true`

Additional outputs:
- `logs/apply_log.json`
- `logs/rollback.sql`

## Validation (Current)
Hard checks we already have:
- Schema shape checks (runner-side)
- Cross-reference checks (blueprint item refs must exist in library categories)

## DAS v1 (Dynamic Gates + Retries)
DAS v1 adds **gates + retries + select-best** on generation nodes when enabled.

- Config: `seed/das_config_v1.json` (per-node `maxAttempts`, `kCandidates`, `eval[]`)
- New artifacts (when `--das` is enabled):
  - `candidates/<node_id>/attempt-01*.json`...
  - `logs/decision_log.json` (why we retried/selected)
  - `logs/selection.json` (best candidate summary)

Planned regression fixtures (GD):
- `seed/golden/<persona_id>/case-01.json` ...
Use these as small, curated baselines for quality/eval.
