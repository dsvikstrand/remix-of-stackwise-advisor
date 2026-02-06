# Stage 0 Workflow (Linear)

1. Read `seed/seed_spec_v0.json`.
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
- `SEED_USER_ACCESS_TOKEN` (required): Supabase access token string
- `VITE_AGENTIC_BACKEND_URL` (optional): overrides backend base URL for the runner

Command:
```bash
tsx codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json
```

WSL note:
- If your repo is under `/mnt/c/...`, `tsx` may fail creating IPC sockets on that filesystem.
- Fix by running with `TMPDIR=/tmp`:
```bash
TMPDIR=/tmp tsx codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json
```

Outputs:
- `seed/outputs/<run_id>/library.json`
- `seed/outputs/<run_id>/blueprints.json`
- `seed/outputs/<run_id>/review_requests.json` (payloads only)
- `seed/outputs/<run_id>/banner_requests.json` (payloads only)
- `seed/outputs/<run_id>/validation.json`
- `seed/outputs/<run_id>/publish_payload.json` (payload only, no writes)
- `seed/outputs/<run_id>/run_log.json`
