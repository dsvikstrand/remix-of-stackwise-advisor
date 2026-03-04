alter table public.blueprints
  add column if not exists sections_json jsonb;
