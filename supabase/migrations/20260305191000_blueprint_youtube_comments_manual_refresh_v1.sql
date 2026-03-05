alter table if exists public.blueprint_youtube_refresh_state
  add column if not exists comments_auto_stage smallint not null default 0,
  add column if not exists comments_manual_cooldown_until timestamptz null,
  add column if not exists last_comments_manual_refresh_at timestamptz null,
  add column if not exists last_comments_manual_triggered_by uuid null references auth.users(id) on delete set null;
