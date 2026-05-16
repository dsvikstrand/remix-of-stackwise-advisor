# Supabase Operations And Responsibility

Status: `current-session summary`

## What Supabase Is In This App

a1) [have] Supabase remains the auth/session provider.

a2) [have] Supabase still hosts historical schema, migrations, edge functions, and some retained managed-service surfaces.

a3) [have] Supabase no longer should be treated as the default owner for every product runtime table.

a4) [have] For migrated domains, Supabase is mostly compatibility shadow, bootstrap source, historical residue, or break-glass fallback.

## Access Requirements

b1) [have] Required local env for Supabase operations:
- `SUPABASE_ACCESS_TOKEN`
- `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY` when server-side scripts need it

b2) [have] Never commit Supabase secrets.

## Safe Preflight

```bash
npx supabase --version
npx supabase login --token "$SUPABASE_ACCESS_TOKEN"
npx supabase link --project-ref "$VITE_SUPABASE_PROJECT_ID"
npx supabase migration list
```

## Schema Update Flow

c1) [have] Add SQL migration under:

```bash
supabase/migrations/
```

c2) [have] Apply:

```bash
npx supabase db push
```

c3) [have] Prefer additive migrations. Avoid destructive changes unless explicitly requested and backed by a rollback plan.

## Edge Function Flow

d1) [have] Deploy one function:

```bash
npx supabase functions deploy <fn_name> --project-ref "$VITE_SUPABASE_PROJECT_ID"
```

d2) [have] Deploy all:

```bash
npx supabase functions deploy --project-ref "$VITE_SUPABASE_PROJECT_ID"
```

## Current Supabase Responsibilities

e1) [have] Auth/session.

e2) [have] Browser auth client and session state.

e3) [have] Storage where explicitly retained, such as avatar/banner flows.

e4) [have] Edge functions where still active.

e5) [have] Retained product surfaces that have not been migrated or intentionally remain Supabase-owned.

e6) [have] Historical/compatibility rows required during Oracle migration.

## What Supabase Should Not Silently Own Now

f1) [todo] Normal runtime queue ownership for migrated queue paths.

f2) [todo] Normal runtime feed truth for migrated feed paths.

f3) [todo] Normal runtime source-item truth for migrated source-item paths.

f4) [todo] Normal runtime unlock/generation state for migrated paths.

f5) [todo] Browser direct reads/writes to Oracle-owned product tables.

f6) [todo] Hidden backend fallback reads/writes for Oracle-owned domains without explicit reason/logging.

## Egress/Attribution

g1) [have] Supabase REST attribution script:

```bash
set -a; . ./.env; set +a; npm run ops:supabase-rest-attribution -- --json
```

g2) [have] Use `--full-range` for slower broader crawling:

```bash
set -a; . ./.env; set +a; npm run ops:supabase-rest-attribution -- --json --full-range
```

g3) [todo] Interpret attribution by actor and family:
- `backend_service_role` may be compatibility/bootstrap/retained surface.
- `frontend_authenticated` direct product-table access is more suspicious for Oracle-owned domains.
- `auth` and `storage` are expected Supabase surfaces.

## Safety Rules

h1) [have] Do not delete Supabase tables just because Oracle is primary.

h2) [have] Do not remove compatibility shadows until runtime proof, rollback posture, and docs agree.

h3) [have] If Supabase fallback remains for an Oracle-owned domain, it should be explicit, observable, and bounded.

h4) [have] If project-ref mismatch is detected, stop and confirm before applying migrations.
