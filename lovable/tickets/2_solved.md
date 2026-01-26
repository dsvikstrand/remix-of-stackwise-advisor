## Ticket: include score + overview-required review sections

Please apply and deploy these updates:

1) Apply migration:
- supabase/migrations/20260126100000_add_inventory_include_score.sql

2) Deploy Edge Function update:
- supabase/functions/analyze-blueprint/index.ts
- It now accepts `includeScore` from the client and, when true, adds `Score: X/100` inside the Overview section.
- Review sections now always include Overview; additional sections are passed via `reviewSections`.

3) Regenerate Supabase types after migration.

Please confirm when these are live.
