# Blueprints (`bleuV1`)

A React + Supabase app for turning media into bite-sized blueprints and discussing them with the community.

## Current Product Direction (`bleuV1`)
- Source-first: media ingestion is the primary content supply (YouTube first).
- Personal-first: users get a personal `My Feed` lane from pulled content.
- Subscription-ready: users can follow YouTube channels, and new uploads are ingested automatically.
- Community layer: Home feed (`/wall`) is the shared lane where users vote/comment/add insights.
- Automated distribution: blueprints are auto-channeled and auto-published when checks pass; non-pass items stay in `My Feed`.

## Current Delivery Mode
- Active mode: manual iterative delivery.
- Loop: you propose change -> plan -> `PA` -> implementation -> validation.
- Agentic orchestration docs are retained as reference and are not the active delivery path.

## Current Production Runtime
- Oracle production runs split systemd services: `agentic-backend.service` serves HTTP, and `agentic-worker.service` owns ingestion/background work.
- Both services run Node `20.20.0` against the compiled release artifact at `dist/server/index.mjs`.
- Live backend config comes from `/etc/agentic-backend.env`.
- Releases are backend-first: deploy Oracle backend for one explicit SHA with `npm run deploy:oracle -- --sha <sha>`, smoke-check it, then manually publish the frontend for that same SHA.

## Current Runtime Surfaces
- Home: `/`
- Home feed: `/wall`
- Explore: `/explore`
- Channels: `/channels`
- Channel page: `/b/:channelSlug`
- YouTube adapter (manual v0): `/youtube`
- My Feed: `/my-feed`
- Subscriptions: `/subscriptions`
- Search: `/search`
- Profile: `/u/:userId` (`Feed / Comments / Liked`)
- Blueprint detail: `/blueprint/:blueprintId`

## Tech Stack
- Vite + React + TypeScript
- Tailwind + shadcn/ui
- Supabase (auth, data, edge functions)
- Express backend for generation/eval paths

## Local Development
```bash
nvm use 20.20.0
npm install
npm run dev
```

- Node runtime rule: use Node `20.20.0` locally (`.nvmrc`), and treat Node 18 shells as unsupported.
- Repo scripts auto-switch to Node 20 through `scripts/with-node20.sh` when `nvm` is available; installs fail fast on older Node versions via `engine-strict`.

## Key Commands
```bash
npm run typecheck
npm run build
npm run build:release
npm run deploy:oracle:dry-run -- --sha "$(git rev-parse HEAD)"
npm run test
npm run docs:refresh-check -- --json
npm run docs:link-check
```

## Documentation Entry Point
Start with `docs/README.md`, then use this path for current runtime truth:
1. `docs/app/core-direction-lock.md`
2. `docs/architecture.md`
3. `docs/ops/yt2bp_runbook.md`
