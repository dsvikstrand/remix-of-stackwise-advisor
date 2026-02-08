# Stage 0 Workflow (Linear)

1. Read `seed/seed_spec_v0.json`.
   - Optional: `asp` block (persona stub). It is recorded in `run_meta.json` for future alignment gates, but does not change generation yet.
2. Call `generate-inventory` using `library.topic` + `library.title` + `library.notes`.
3. For each blueprint variant:
   - Call `generate-blueprint` with variant title/description/notes and the library categories.
4. Save outputs into `seed/outputs/<run_id>/`.
5. Validate that all items in blueprint steps exist in the library categories.

**No DB writes in Stage 0.**

## Run (Stage 0)

Prereqs:
- Agentic backend reachable (default: `https://bapi.vdsai.cloud`)
- A real Supabase access token for a user (used to behave like a signed-in user)

Environment:
- `SEED_USER_ACCESS_TOKEN` (recommended): Supabase access token string (JWT; expires quickly)
- `SEED_USER_REFRESH_TOKEN` (optional, recommended for automation): Supabase refresh token (used to mint new access tokens)
- `VITE_AGENTIC_BACKEND_URL` (optional): overrides backend base URL for the runner
- `SUPABASE_URL` or `VITE_SUPABASE_URL` (required if using refresh token or Stage 1)
- `SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` (required if using refresh token or Stage 1)

Command:
```bash
npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json
```

WSL note:
- If your repo is under `/mnt/c/...`, `tsx` may fail creating IPC sockets on that filesystem.
- Fix by running with `TMPDIR=/tmp`:
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json
```

Oracle note:
- One-shot `ssh oracle-free "..."` commands may not load `nvm`, so you can silently end up on Node 10.
- Prefer wrapping with a login shell so Node 20 + `npx` are available:
```bash
ssh oracle-free 'bash -lc "cd /home/ubuntu/remix-of-stackwise-advisor && node -v && npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json"'
```

Outputs:
- `seed/outputs/<run_id>/run_meta.json` (run context including optional `asp`)
- `seed/outputs/<run_id>/library.json`
- `seed/outputs/<run_id>/blueprints.json`
- `seed/outputs/<run_id>/review_requests.json` (payloads only)
- `seed/outputs/<run_id>/banner_requests.json` (payloads only)
- `seed/outputs/<run_id>/validation.json`
- `seed/outputs/<run_id>/publish_payload.json` (payload only, no writes)
- `seed/outputs/<run_id>/run_log.json`

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
- `seed/outputs/<run_id>/reviews.json`
- `seed/outputs/<run_id>/banners.json`

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
- `seed/outputs/<run_id>/apply_log.json`
- `seed/outputs/<run_id>/rollback.sql`

Notes:
- Stage 1 has been exercised successfully with `--limit-blueprints 1` (happy path).

## Token Automation (No Manual Access Token Copy/Paste)

If you store the seed user's refresh token, the runner can mint new access tokens automatically and persist token rotation.

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
- `seed/das_config_v1_test_retry.json` (forces one retry on `LIB_GEN` for validation)

New artifacts (when DAS is enabled):
- `seed/outputs/<run_id>/candidates/<node_id>/attempt-01.json` ...
- `seed/outputs/<run_id>/decision_log.json`
- `seed/outputs/<run_id>/selection.json`

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
  --das \
  --das-config seed/das_config_v1_test_retry.json
```
