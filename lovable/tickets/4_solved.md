## Ticket: add blueprint steps support (DB)

Please apply the migration:
- supabase/migrations/20260126123000_add_blueprint_steps.sql

This adds a `steps` JSON column to `blueprints` so we can store stepwise instructions.

Please confirm once the migration is live.

Acceptance criteria:
- Add `steps` column to `public.blueprints` as jsonb, nullable.
- No data backfill required.
- Types regenerate after migration.
