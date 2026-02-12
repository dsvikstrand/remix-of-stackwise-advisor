# Persona Onboarding (ASS)

Purpose
- Add a new persona safely for ASS runs and future user-like agent runs.
- Avoid common auth/domain/eval path mismatches.

Scope
- Applies to `seed_stage0.ts` persona runs using `--asp <persona_id>`.
- Covers local setup, Oracle setup, and smoke verification.

Required Inputs
- Persona id (example: `my_new_persona_v0`)
- Persona profile JSON content
- Headless auth email/password for that persona account
- Target domain id(s) (example: `fitness`, `skincare`)

Files You Will Touch
- `personas/v0/<persona_id>.json`
- `seed/persona_registry_v0.json`
- `personas/auth_local/<persona_id>.env.local` (local and Oracle copy)
- Optional token store (auto-written): `personas/auth_local/<persona_id>.local`
- Domain assets (if new domain):
- `eval/domain_assets/v0/<domain_id>/domain.json`
- `eval/domain_assets/v0/<domain_id>/rubric_v0.json`
- `eval/domain_assets/v0/<domain_id>/golden/...`

Process
1) Add persona profile
- Create `personas/v0/<persona_id>.json`.
- Keep `default_domain` aligned with intended first run.

2) Register persona defaults
- Add entry to `seed/persona_registry_v0.json`:
- `id`
- `auth_env_path` -> `personas/auth_local/<persona_id>.env.local`
- `auth_store_path` -> `personas/auth_local/<persona_id>.local`
- `controls_defaults` for library/blueprints

3) Add persona auth env (local)
- Create `personas/auth_local/<persona_id>.env.local`:
- `SEED_USER_EMAIL=...`
- `SEED_USER_PASSWORD=...`
- Keep file local/private; do not commit credentials.

4) Sync persona auth env to Oracle
- Copy the same env file to Oracle:
```bash
scp personas/auth_local/<persona_id>.env.local oracle-free:/home/ubuntu/remix-of-stackwise-advisor/personas/auth_local/<persona_id>.env.local
ssh oracle-free "chmod 600 /home/ubuntu/remix-of-stackwise-advisor/personas/auth_local/<persona_id>.env.local"
```

5) Ensure domain assets exist
- If persona/domain is new, create domain assets under `eval/domain_assets/v0/<domain_id>/`.
- If domain assets are missing, domain-scoped evals can hard-fail by design.

6) Ensure active global method packs exist
- Blueprint global quality pack path:
- `eval/methods/v0/llm_blueprint_quality_v0/global_pack_v0.json`
- Content safety pack path:
- `eval/methods/v0/llm_content_safety_grading_v0/global_pack_v0.json`
- PII pack path:
- `eval/methods/v0/pii_leakage_v0/global_pack_v0.json`

Smoke Matrix (Recommended)
1) Auth-only
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \
  --spec seed/seed_spec_v0.json \
  --asp <persona_id> \
  --auth-only
```
Expected
- `Stage 0 complete (auth-only)` and updated auth store.

2) Compose controls only
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \
  --spec seed/seed_spec_v0.json \
  --asp <persona_id> \
  --compose-controls \
  --no-backend
```
Expected
- `requests/control_pack.json` reflects persona defaults.

3) Full apply run
```bash
TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts \
  --spec seed/seed_spec_v0.json \
  --asp <persona_id> \
  --do-review \
  --do-banner \
  --apply \
  --yes APPLY_STAGE1
```
Expected
- `logs/run_log.json` apply steps are `ok: true`.
- `logs/apply_log.json` contains `inventoryId` and `blueprintIds`.

Common Gotchas
- Registry/auth path mismatch:
- Registry points to `personas/auth_local/...` but file was copied to `seed/auth/...`.
- Missing Oracle env load:
- For shell runs requiring env, use `set -a; source .env; set +a` before command.
- Missing domain assets:
- Domain evals fail with expected path hints when assets are absent.
- Missing method pack:
- Global LLM evals hard-fail when required pack files are unavailable.
- Refresh token reuse:
- If refresh token is stale, runner should self-heal via email/password if env file exists.

Verification Artifacts
- `logs/run_log.json` (step-by-step status)
- `logs/decision_log.json` (gate decisions)
- `logs/apply_log.json` (created IDs + banner uploads)
- `manifest.json` (output layout pointers)
