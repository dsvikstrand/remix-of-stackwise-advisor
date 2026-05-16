# Code Map

Status: `current-session summary`

## Top-Level Areas

a1) [have] `src/`
- React frontend.
- Pages, components, hooks, API clients, Supabase integration, PWA helpers, tests.

a2) [have] `server/`
- Express backend, route contracts, routes, handlers, services, LLM/transcript logic, Oracle state services.

a3) [have] `scripts/`
- Build/deploy/release, ops checks, metrics, attribution, docs checks, one-off maintenance scripts.

a4) [have] `supabase/`
- Supabase migrations and edge functions.

a5) [have] `docs/`
- Product, architecture, ops, execution plans, onboarding pack, generated docs.

## Frontend Map

b1) [have] `src/pages/`
- Route-level UI surfaces.
- Important pages: `Wall`, `Search`, `YouTubeToBlueprint`, `Subscriptions`, `SourcePage`, `BlueprintDetail`, `Channels`, `ChannelPage`, profile pages.

b2) [have] `src/components/`
- Shared UI and domain components.
- Key folders: `feed`, `wall`, `blueprint`, `subscriptions`, `profile`, `layout`, `pwa`, `queue`.

b3) [have] `src/hooks/`
- Frontend orchestration hooks for data, mutations, app surfaces, and legacy compatibility.

b4) [have] `src/lib/`
- API clients and helper modules.
- Important Oracle-aware frontend access is usually through backend API helpers here.

b5) [have] `src/integrations/supabase/`
- Supabase client integration.
- Browser Supabase usage should be auth/session or intentionally retained surface, not normal access to Oracle-owned product tables.

b6) [have] `src/test/`
- Vitest tests and helper utilities.

## Backend Map

c1) [have] `server/index.ts`
- Runtime composition/bootstrap.
- Service wiring, env parsing, route registration, Oracle/Supabase seam wiring.

c2) [have] `server/routes/`
- Express route modules.
- Routes should own HTTP contract and delegate heavy logic to handlers/services.

c3) [have] `server/handlers/`
- Larger route-domain orchestration.

c4) [have] `server/services/`
- Business logic and state services.
- Oracle ownership services are named like `oracle*State.ts` or `oracle*LedgerState.ts`.

c5) [have] `server/contracts/api/`
- Route contract types and shared dependency interfaces.

c6) [have] `server/transcript/`
- Transcript providers/fallbacks/circuit interactions.

c7) [have] `server/llm/`
- OpenAI/LLM runtime helpers.
- OpenAI SDK loading should stay lazy at call time for Oracle startup safety.

c8) [have] `server/runtime/`
- Runtime support helpers.

## Supabase Map

d1) [have] `supabase/migrations/`
- Schema/function migrations.
- Use repo as source of truth for schema changes.

d2) [have] `supabase/functions/`
- Edge functions such as `log-event` and `upload-banner`.

d3) [have] Supabase still owns auth/session and some retained managed-service surfaces.

d4) [have] Oracle-owned product runtime should not add new silent direct Supabase dependencies.

## Scripts Map

e1) [have] `scripts/deploy_oracle_release.mjs`
- Oracle backend deploy flow.

e2) [have] `scripts/release_smoke.mjs`
- Release parity/API/frontend/PWA smoke.

e3) [have] `scripts/supabase_rest_attribution_report.mjs`
- Supabase REST usage attribution.

e4) [have] `scripts/oracle_*_parity_check.mjs`
- Oracle/Supabase parity checks for migrated domains.

e5) [have] `scripts/docs-refresh-check.mjs` and `scripts/docs-link-check.mjs`
- Docs governance checks.

## Current Ownership-Sensitive Code Areas

f1) [have] Wall/feed and locked cards:
- `src/pages/Wall.tsx`
- `src/components/feed`
- `server/services/wallFeed.ts`
- feed routes/services and Oracle feed ledger state.

f2) [have] Generation queue:
- ingestion queue services
- worker service runtime
- `server/services/blueprintCreation.ts`
- transcript/LLM services

f3) [have] Subscriptions/source pages:
- `src/pages/Subscriptions.tsx`
- `src/pages/SourcePage.tsx`
- source subscription/source page handlers and services.

f4) [have] Tags/likes/comments:
- backend APIs and Oracle state services for tag, blueprint-tag, tag-follow, blueprint-like, comments.

f5) [have] Supabase migration residue:
- inspect with `rg` before changing ownership paths.
