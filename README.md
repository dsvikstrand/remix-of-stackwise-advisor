# Blueprints (Channels-First)

A React + Supabase app for creating, publishing, and discovering blueprints in curated channels.

## Current Product Shape
- Primary discovery surface: `Feed` (`/wall`)
- Channels IA: `/channels` and `/b/:channelSlug`
- Explore search: `/explore`
- Blueprint detail: `/blueprint/:blueprintId`
- Legacy compatibility routes:
  - `/tags` -> redirects to `/channels`
  - `/blueprints` -> redirects to `/wall`

## Core UX Model
- Channels are curated and followable lanes.
- Tags are blueprint metadata/search terms (not follow lanes).
- Public posting is channel-scoped via the create flow.

## Tech Stack
- Vite + React + TypeScript
- Tailwind + shadcn/ui
- Supabase (auth, data, edge functions)
- Agentic backend for YouTube-to-Blueprint generation

## Local Development
```bash
npm install
npm run dev
```

## Key Commands
```bash
npm run build
npm run test
npm run docs:refresh-check -- --json
npm run docs:link-check
npm run metrics:channels -- --days 7 --json
```

## Documentation Entry Point
Start here: `docs/README.md`

Recommended first read order:
1. `docs/README.md`
2. `docs/architecture.md`
3. `docs/app/product-spec.md`
4. `docs/exec-plans/index.md`
5. `docs/ops/yt2bp_runbook.md`

## Operations
- YT2BP production runbook: `docs/ops/yt2bp_runbook.md`
- Supabase migration closure notes: `docs/exec-plans/completed/supabase-migration-closure-2026-02-13.md`
