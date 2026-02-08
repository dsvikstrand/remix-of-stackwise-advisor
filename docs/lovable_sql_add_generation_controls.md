# Lovable SQL: Add `generation_controls` Columns

Goal: persist promptless generation intent (control packs) in Supabase so DAS + eval can inspect "what was intended" later.

Run this in Lovable Cloud SQL console:

```sql
ALTER TABLE IF EXISTS public.inventories
  ADD COLUMN IF NOT EXISTS generation_controls jsonb;

ALTER TABLE IF EXISTS public.blueprints
  ADD COLUMN IF NOT EXISTS generation_controls jsonb;
```

Notes:
- This is safe to re-run (`IF NOT EXISTS`).
- App code will fall back gracefully if these columns are missing, but persistence will be skipped until they exist.

