# Local Repo Guide

Status: `current-session summary`

## Runtime Baseline

a1) [have] Node baseline is `20.20.0`.

a2) [have] `.nvmrc` pins the expected Node version.

a3) [have] Repo scripts use `scripts/with-node20.sh` where possible.

a4) [have] Node 18 shells are unsupported for this repo.

## Common Commands

```bash
nvm use 20.20.0
npm install
npm run dev
npm run dev:server
npm run typecheck
npm test
npm run build
npm run build:release
npm run docs:refresh-check -- --json
npm run docs:link-check
```

## Release/Deploy Commands

```bash
npm run deploy:oracle:dry-run -- --sha "$(git rev-parse HEAD)"
npm run deploy:oracle -- --sha "$(git rev-parse HEAD)"
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://bleup.app --release-sha "$(git rev-parse HEAD)"
```

## Environment Files

b1) [have] `.env` is local only and must not be committed.

b2) [have] Oracle production does not use repo-root `.env`; production app config comes from `/etc/agentic-backend.env`.

b3) [have] Supabase-related local envs may include:
- `SUPABASE_ACCESS_TOKEN`
- `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

b4) [have] GitHub CLI may use `GITHUB_TOKEN` from `.env`, but never print or commit the token.

## Git And Workflow Rules

c1) [have] Follow `AGENTS.md`.

c2) [have] Plan first for code changes; wait for `PA`.

c3) [have] `PAP` means implement, commit, and push.

c4) [have] `UDO` means approved to run commands/deploy-style operations without another prompt.

c5) [have] Do not revert unrelated user changes.

c6) [have] Do not use destructive Git commands unless explicitly requested.

## Docs Governance

d1) [have] Docs entrypoint: `docs/README.md`.

d2) [have] Plan registry: `docs/exec-plans/index.md`.

d3) [have] Runtime truth:
- `docs/app/core-direction-lock.md`
- `docs/app/product-spec.md`
- `docs/architecture.md`
- `docs/ops/yt2bp_runbook.md`

d4) [have] Historical plans are not runtime truth unless the registry marks them active.

d5) [todo] After docs updates, run:

```bash
npm run docs:refresh-check -- --json
npm run docs:link-check
```

## Useful Local Inspection

```bash
git status -sb
rg -n "pattern" src server scripts docs
rg --files src server docs
```

## Safety Notes

e1) [have] Never commit `.env`, tokens, private keys, downloaded logs with secrets, or local scratch artifacts unless explicitly intended.

e2) [have] Prefer current code and live checks over completed plans.

e3) [have] Use `apply_patch` for manual file edits.

e4) [have] Keep docs concise and cross-linked; do not fork canonical truth into many conflicting specs.
