# Stage 0 Workflow (Linear)

1. Read `seed/seed_spec_v0.json`.
   - Optional: `asp.id` loads a repo-global persona from `personas/v0/<asp.id>.json`.
   - The runner appends the persona prompt block into:
     - `LIB_GEN` request `customInstructions`
     - `BP_GEN` request `notes`
   - Optional: `--compose-prompts` composes a "prompt pack" (template-based v0) from `(persona + goal)` and
     overrides the effective `library` + `blueprints` used downstream.
     - Writes `requests/prompt_pack.json` + `logs/prompt_pack_log.json`.
2. Call `generate-inventory` using `library.topic` + `library.title` + `library.notes`.
3. For each blueprint variant:
   - Call `generate-blueprint` with variant title/description/notes and the library categories.
4. Save outputs into `seed/outputs/<run_id>/`.
5. Validate that all items in blueprint steps exist in the library categories.

**No DB writes in Stage 0.**

## Planning docs
- Mermaid graph: `docs/seed_las_stage0.mmd`
- ASS baseline + DAS roadmap: `docs/seed_ass_spec.md`
- Persona contract (current): `docs/persona_schema.md`

## Persona utilities

List personas:
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/persona_registry.ts --list
```

Validate personas:
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/persona_registry.ts --validate
```

Show a persona (hashes + prompt block):
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/persona_registry.ts --show skincare_diet_female_v0
```

Generate a seed spec deterministically (no LLM):
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/gen_seed_spec.ts \
  --goal "Simple home skincare routine for beginners" \
  --persona skincare_diet_female_v0 \
  --blueprints 2 \
  --out seed/seed_spec_generated.local
```

## Run (Stage 0)

Prereqs:
- Agentic backend reachable (default: `https://bapi.vdsai.cloud`)
- A way to authenticate as the "seed user" (used to behave like a signed-in user)

Environment:
- `SEED_USER_ACCESS_TOKEN` (optional): Supabase access token string (JWT; expires quickly)
- `SEED_USER_REFRESH_TOKEN` (optional): Supabase refresh token (used to mint new access tokens; rotates)
- `SEED_USER_EMAIL` + `SEED_USER_PASSWORD` (optional, recommended for headless persona accounts): enables password-grant fallback so runs can self-heal if refresh token rotation breaks
- `--auth-env <path>` (optional): load `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` from a local env file (recommended pattern: `seed/auth/<asp_id>.env.local`)
- `VITE_AGENTIC_BACKEND_URL` (optional): overrides backend base URL for the runner
- `SUPABASE_URL` or `VITE_SUPABASE_URL` (required if using refresh token or Stage 1)
- `SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` (required if using refresh token or Stage 1)

Auth store:
- If `asp.id` is present in the spec and `--auth-store` is not provided, the runner defaults to `seed/auth/<asp_id>.local`.
- Otherwise it defaults to `seed/seed_auth.local`.

Command:
```bash
npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json
```

Run types:
- `seed` (default): full flow
- `library_only`: only generate library (writes empty `artifacts/blueprints.json`)
- `blueprint_only`: only generate blueprints from an input library (`--library-json` required)

Notes:
- Stage 1 apply mode (`--apply`) requires at least one generated blueprint, so it is not compatible with `library_only`.

Examples:
```bash
# library_only (fastest end-to-end auth + library smoke)
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \\
  --spec seed/seed_spec_persona_smoke.json \\
  --run-type library_only \\
  --das --das-config seed/das_config_v1_test_custom_overrides.json
```

```bash
# blueprint_only (use a prior run's library.json)
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \\
  --spec seed/seed_spec_persona_smoke.json \\
  --run-type blueprint_only \\
  --library-json seed/outputs/<run_id>/artifacts/library.json \\
  --limit-blueprints 1 \\
  --das --das-config seed/das_config_v1_test_custom_overrides.json
```

Persona override (no spec edits):
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \\
  --spec seed/seed_spec_persona_smoke.json \\
  --asp skincare_diet_female_v0
```

WSL note:
- If your repo is under `/mnt/c/...`, `tsx` may fail creating IPC sockets on that filesystem.
- Fix by running with `TMPDIR=/tmp`:
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json
```

Oracle note:
- One-shot `ssh oracle-free "..."` commands may not load `nvm`, so you can silently end up on Node 10.
- Prefer an explicit Node 20 PATH so `npx` + `tsx` work reliably:
```bash
ssh oracle-free 'bash -lc "export PATH=/home/ubuntu/.nvm/versions/node/v20.20.0/bin:$PATH; cd /home/ubuntu/remix-of-stackwise-advisor && node -v && npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json"'
```

Outputs:
- `seed/outputs/<run_id>/manifest.json` (paths + dirs map)
- `seed/outputs/<run_id>/logs/run_meta.json` (run context including optional `asp`)
- `seed/outputs/<run_id>/logs/run_log.json`
- `seed/outputs/<run_id>/logs/prompt_pack_log.json` (only when `--compose-prompts`)
- `seed/outputs/<run_id>/artifacts/library.json`
- `seed/outputs/<run_id>/artifacts/blueprints.json`
- `seed/outputs/<run_id>/requests/prompt_pack.json` (only when `--compose-prompts`)
- `seed/outputs/<run_id>/requests/review_requests.json` (payloads only)
- `seed/outputs/<run_id>/requests/banner_requests.json` (payloads only)
- `seed/outputs/<run_id>/artifacts/validation.json`
- `seed/outputs/<run_id>/artifacts/publish_payload.json` (payload only, no writes)

## Run (Stage 0.5: Execute Review + Banner Dry Run)

Stage 0.5 is still "no writes", but it *does* execute two expensive calls so you can validate the happy path end-to-end:

- Review: `POST /api/analyze-blueprint` (returns SSE streamed text; runner collects into a single string per blueprint)
- Banner: `POST /api/generate-banner` with `dryRun: true` (returns `{ contentType, imageBase64 }`, no Storage upload)

Command:
```bash
npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \
  --spec seed/seed_spec_v0.json \
  --do-review \
  --do-banner
```

Optional (nudge the review):
```bash
npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \
  --spec seed/seed_spec_v0.json \
  --do-review \
  --review-focus "Keep it short, practical, and safety-minded." \
  --do-banner
```

Additional outputs:
- `seed/outputs/<run_id>/ai/reviews.json`
- `seed/outputs/<run_id>/ai/banners.json`

## Run (Stage 1: Apply Mode - Writes To Supabase)

Stage 1 takes the Stage 0/0.5 artifacts and **writes real rows** to Supabase:

- Inserts the generated library as an `inventories` row.
- Inserts each generated blueprint as a `blueprints` row.
- Writes tag joins (`inventory_tags`, `blueprint_tags`).
- If `reviews.json` exists: persists `llm_review` per blueprint.
- If `banners.json` exists: calls the `upload-banner` edge function and updates `banner_url`.
- Publishes by setting `is_public=true` on the created rows.
- Writes rollback + apply logs into the run folder.

Prereqs:
- A real Supabase access token for a user (same as Stage 0).
- Supabase URL + anon key available to the runner:
  - `SUPABASE_URL` or `VITE_SUPABASE_URL`
  - `SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY`

Recommended (testing): limit to 1 blueprint to keep writes/cost small.

Command (Stage 0.5 + Stage 1 in one run):
```bash
TMPDIR=/tmp \
SEED_USER_ACCESS_TOKEN="$(cat access_tok.txt)" \
SUPABASE_URL="https://piszvseyaefxekubphhf.supabase.co" \
SUPABASE_ANON_KEY="(paste VITE_SUPABASE_PUBLISHABLE_KEY)" \
npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \
  --spec seed/seed_spec_v0.json \
  --limit-blueprints 1 \
  --do-review \
  --do-banner \
  --apply \
  --yes APPLY_STAGE1
```

Stage 1 outputs (additional):
- `seed/outputs/<run_id>/logs/apply_log.json`
- `seed/outputs/<run_id>/logs/rollback.sql`

Notes:
- Stage 1 has been exercised successfully with `--limit-blueprints 1` (happy path).

## Token Automation (No Manual Access Token Copy/Paste)

If you store the seed user's refresh token, the runner can mint new access tokens automatically and persist token rotation.

## Persona Account Convention (No Manual Tokens, Oracle Friendly)

Recommended convention:
- Each persona has its own Supabase account (email+password).
- On Oracle, store that persona's credentials in `seed/auth/<persona_id>.env.local`:
  - `SEED_USER_EMAIL="..."`
  - `SEED_USER_PASSWORD="..."`
- The runner writes rotating tokens to `seed/auth/<persona_id>.local` (auth store).

Why:
- refresh tokens rotate and can become "already used" when copied from browser sessions.
- password grant fallback self-heals when refresh rotation fails.

Persona registry (recommended):
- `seed/persona_registry_v0.json` maps persona ids to default auth env/store paths.
- When you run with `--asp <persona_id>`, the runner uses the registry paths unless you override with `--auth-env/--auth-store`.

Recommended local store:
- `seed/seed_auth.local` (JSON; ignored by `*.local`)

Important:
- Supabase refresh tokens **rotate**. If you refresh once, the old refresh token becomes invalid.
- Always use `--auth-store ...` so the runner can write back the rotated `refresh_token`.

Verified:
- Refresh flow works when the stored access token is missing (forced test by clearing `access_token` in the auth store).

Example:
```bash
TMPDIR=/tmp \
SEED_USER_REFRESH_TOKEN="$(cat refresh_tok.local)" \
SUPABASE_URL="https://piszvseyaefxekubphhf.supabase.co" \
SUPABASE_ANON_KEY="(paste VITE_SUPABASE_PUBLISHABLE_KEY)" \
npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \
  --spec seed/seed_spec_v0.json \
  --run-id refresh-token-test \
  --limit-blueprints 1 \
  --auth-store seed/seed_auth.local
```

## Run (DAS v1: Dynamic Gates + Retries)

DAS v1 adds retry loops and "select best out of k candidates" to generation nodes.

Config:
- `seed/das_config_v1.json` (per-node `maxAttempts`, `kCandidates`, `eval[]`)
- `seed/das_config_v1_test_retry.json` (forces one retry on `PROMPT_PACK` and `LIB_GEN` for validation)

New artifacts (when DAS is enabled):
- `seed/outputs/<run_id>/candidates/<node_id>/attempt-01.json` ...
- `seed/outputs/<run_id>/logs/decision_log.json`
- `seed/outputs/<run_id>/logs/selection.json`

Command (Stage 0 + DAS):
```bash
TMPDIR=/tmp \
SEED_USER_REFRESH_TOKEN="$(cat refresh_tok.local)" \
SUPABASE_URL="https://piszvseyaefxekubphhf.supabase.co" \
SUPABASE_ANON_KEY="(paste VITE_SUPABASE_PUBLISHABLE_KEY)" \
npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \
  --spec seed/seed_spec_das_smoke.json \
  --run-id das-smoke \
  --limit-blueprints 1 \
  --auth-store seed/seed_auth.local \
  --compose-prompts \
  --das \
  --das-config seed/das_config_v1_test_retry.json
```
