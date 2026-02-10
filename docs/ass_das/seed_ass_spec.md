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
- Mermaid graph: `docs/ass_das/ASS_simple.mmd`

## Inputs
`seed/seed_spec_v0.json`

Key fields:
- `run_id`: output folder name
- Optional: `run_type`: one of `seed|library_only|blueprint_only` (can also be set via `--run-type`)
- `library`: seed topic + title + constraints
- `blueprints[]`: blueprint variants to generate from the generated library
- Optional: `asp` (persona id + optional stub fields; recorded for future alignment evals)

## Run Types (Current)

We support three task-specific flows so you can test parts of the pipeline without editing code:

- `seed` (default): generate library -> generate blueprints -> validate -> optional review/banner -> optional apply
- `library_only`: generate library -> validate minimal structure -> skip blueprints (writes empty `artifacts/blueprints.json`)
- `blueprint_only`: load a library from `--library-json` -> generate blueprints -> validate -> optional review/banner -> optional apply

Notes:
- `--library-json` is required for `blueprint_only`.
- `run_type` is recorded in `logs/run_meta.json` for reproducibility.

## Gate Contract (Current)
When DAS is enabled (`--das`), each candidate is evaluated by a list of gates and recorded in `logs/decision_log.json`.

Stable per-gate contract:
- `gate_id`: string (example: `structural`, `bounds`, `crossref`, `persona_alignment_v0`)
- `ok`: boolean
- `severity`: one of `info|warn|hard_fail`
- `score`: number (0..1 or 0..100, consistent per gate)
- `reason`: short string (human readable)
- `data`: optional JSON object for structured details (counts, limits, etc.)

Initial focus (B1): deterministic eval classes only (examples):
- `structural_inventory`, `bounds_inventory`
- `inventory_quality_heuristics_v0`
- `structural_blueprints`, `bounds_blueprints`, `crossref_blueprints_to_inventory`
- `structural_control_pack`, `bounds_control_pack`, `persona_alignment_controls_v0`
- `structural_prompt_pack`, `bounds_prompt_pack`, `persona_alignment_prompts_v0`

Notes:
- Persona alignment is wired for `PROMPT_PACK` (prompt composer) and `CONTROL_PACK` (promptless controls) so we can validate eval wiring cheaply.
- When using legacy DAS config `eval[]` lists, the runner maps them to the node-specific eval class ids above.

## ASS Eval Config v2 (Current)
ASS eval config v2 describes **eval instances per node** (which eval classes run, and with what params).

- Example: `seed/ass_eval_policy_v2.example.json`
- Schema: `docs/schemas/ass_eval_config_schema.md`
- Runner flag: `--ass-eval-config <path>`
- Resolved config log: `logs/ass_eval_config_resolved.json`

This config is independent from the DAS generation policy config:
- DAS config controls retries and selection (`maxAttempts`, `kCandidates`, etc.)
- ASS eval config controls which evals run on each node

## Domains (Eval Asset Namespace)

Some eval classes require "assets" (golden drafts, rubrics, fixtures). Those assets live under a domain namespace:

- Root: `eval/domains/v0/<domain_id>/`
- Example: `eval/domains/v0/fitness/golden/...`

Domain asset conventions (v0):
- `eval/domains/v0/<domain_id>/rubric_v0.json` (deterministic thresholds and forbidden terms)
- `eval/domains/v0/<domain_id>/golden/libraries/*.json` (golden library fixtures for regression-style evals)

The runner resolves one active domain per run and passes it into evals as `ctx.domain_id`:

- CLI override: `--domain <id>`
- Else: persona `default_domain` (if present) or `persona.safety.domain`
- Else: if using promptless controls, the chosen `control_pack.library.controls.domain` (when not `custom`)

Eval classes that require domain assets should hard-fail with a clear `expected_path` when missing.

## Eval Taxonomy (Global, Planned)

Some controls are shared across all domains (for example `style`, `audience`, `strictness`, `length_hint`). To keep evals stable across:
- seeding runs (ASS)
- future user generation runs

we define a global, machine-readable taxonomy:
- `eval/taxonomy/controls_v1.json`
- Schema doc: `docs/schemas/eval_controls_taxonomy_schema.md`

Eval classes can use the taxonomy for deterministic validation (example: `controls_taxonomy_alignment_v0`).

## Promptless Controls (Current)
We support a promptless intent layer (`ControlPackV0`) that is rendered into a `PromptPackV0` for backend compatibility.

- Schema doc: `docs/schemas/control_pack_schema.md`
- Runner flag: `--compose-controls`
- Output: `requests/control_pack.json` (plus the rendered `requests/prompt_pack.json`)

## Personas (Repo-Global, Current)
Personas are not "seed-only". They are a reusable contract that can be used by:
- Seeding runs (conditioning + eval target)
- Future interactive agent runs (agents that act like users)

Schema doc:
- `docs/schemas/persona_schema.md`

Storage:
- `personas/v0/<persona_id>.json`

Runner behavior (current):
- If the seed spec includes `asp.id`, load `personas/v0/<asp.id>.json`.
- Compute and record `persona_hash` + `prompt_hash` in `logs/run_meta.json` for reproducibility.
- Write the applied prompt block to `logs/persona_log.json` (debugging).

## Persona Accounts (Headless, Current)

If you want each persona to publish as a distinct user, treat each persona as an auth identity:

- Auth store (rotating tokens): `personas/auth_local/<asp_id>.local` (JSON written by the runner)
- Optional creds env (password-grant fallback): `personas/auth_local/<asp_id>.env.local` with:
  - `SEED_USER_EMAIL=...`
  - `SEED_USER_PASSWORD=...`

Optional persona registry:
- `seed/persona_registry_v0.json` maps persona ids to default `auth_env_path` and `auth_store_path`.
- When you run with `--asp <persona_id>`, the runner will use the registry defaults unless you override with `--auth-env/--auth-store`.

The runner will:
- Default `--auth-store` to `seed/auth/<asp_id>.local` when `asp.id` exists.
- Auto-load `seed/auth/<asp_id>.env.local` if present (or use `--auth-env <path>`).
- Use refresh token rotation when possible; if refresh breaks (example: refresh token already used) and email/password is available, fall back to Supabase password grant to self-heal.
- Support `--auth-only` to test/refresh persona auth without calling the agentic backend.

## Mode Policy (Seed vs User, Planned)

We treat eval classes and assets as repo-global building blocks. What differs between seeding and user generation is how the system reacts to failures:

- `seed` mode: strict (hard_fail blocks publish, retries/select-best allowed)
- `user` mode: softer (warn + helpful messaging; minimal retries; no silent failures)

We record mode in `logs/run_meta.json` today, and will wire UI messaging later.

Local helper (optional):
- `seed/scripts/sync_persona_auth_env.ts` can write `seed/auth/<asp_id>.env.local` files from `seed/secrets.local.json` (keyed by persona id).

Local secrets (single source of truth):
- `seed/secrets.local.json` (gitignored): `{ "version": 0, "personas": { "<persona_id>": { "email": "...", "password": "..." } } }`

Utilities (repo-local):
- `codex/skills/seed-blueprints/scripts/persona_registry.ts` (list/validate/show personas)
- `codex/skills/seed-blueprints/scripts/gen_seed_spec.ts` (deterministic seed spec generator)

## Stage 0 (LAS) – Artifacts Only (No Writes)
Stage 0 calls the agentic backend for generation, but does **not** write to Supabase.

Outputs under `seed/outputs/<run_id>/` (layout v2):
- `manifest.json` (paths + dirs map)
- `logs/run_meta.json` (run context, including optional `asp`)
- `logs/run_log.json` (timings + status)
- `logs/persona_log.json` (optional; applied persona prompt block)
- `logs/control_pack_log.json` (optional; controls composer log)
- `artifacts/library.json` (generated categories + items)
- `artifacts/blueprints.json` (generated blueprint drafts)
- `requests/control_pack.json` (optional; promptless controls)
- `requests/review_requests.json` (payloads only; no network)
- `requests/banner_requests.json` (payloads only; no network)
- `artifacts/validation.json` (cross-reference checks)
- `artifacts/publish_payload.json` (payload only; no writes)

## Stage 0.5 (LAS) – Execute AI (Still No Writes)
Stage 0.5 optionally runs two expensive calls to validate the happy path end-to-end:

## AI Credits Bypass (Dev Only)
The backend supports bypassing per-user AI credit limits during development/testing:

- Set `AI_CREDITS_BYPASS=true` in the backend environment.
- Keep it off in production.

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

- Config: `seed/ass_gen_policy_v1.json` (per-node `maxAttempts`, `kCandidates`, legacy `eval[]`)
- Test configs:
  - `seed/das_config_v1_test_controls_persona_align_pass.json` (CONTROL_PACK persona_alignment_v0 pass)
  - `seed/das_config_v1_test_controls_persona_align_retry.json` (CONTROL_PACK forced retry via testOnly_failOnce)
- New artifacts (when `--das` is enabled):
  - `candidates/<node_id>/attempt-01*.json`...
- `logs/decision_log.json` (why we retried/selected)
  - `logs/selection.json` (best candidate summary)

Planned regression fixtures:
- Prefer domain-scoped fixtures under `eval/domains/v0/<domain_id>/golden/...` so eval assets stay organized by topic.
- Persona-specific fixtures can be added later as an extra layer (only when needed).
