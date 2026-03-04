create table if not exists public.blueprint_youtube_refresh_state (
  blueprint_id uuid primary key references public.blueprints(id) on delete cascade,
  youtube_video_id text not null,
  source_item_id uuid null references public.source_items(id) on delete set null,
  enabled boolean not null default true,
  last_view_refresh_at timestamptz null,
  next_view_refresh_at timestamptz null,
  last_view_refresh_status text null,
  last_comments_refresh_at timestamptz null,
  next_comments_refresh_at timestamptz null,
  last_comments_refresh_status text null,
  consecutive_view_failures integer not null default 0,
  consecutive_comments_failures integer not null default 0,
  last_error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blueprint_youtube_refresh_state_view_due_idx
  on public.blueprint_youtube_refresh_state (enabled, next_view_refresh_at);

create index if not exists blueprint_youtube_refresh_state_comments_due_idx
  on public.blueprint_youtube_refresh_state (enabled, next_comments_refresh_at);
