create table if not exists public.blueprint_youtube_search_cache (
  cache_key text primary key,
  kind text not null check (kind in ('video_search', 'channel_search')),
  query text not null,
  page_token text null,
  response_json jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_served_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blueprint_youtube_search_cache_expires_idx
  on public.blueprint_youtube_search_cache (expires_at);

create index if not exists blueprint_youtube_search_cache_kind_query_idx
  on public.blueprint_youtube_search_cache (kind, query);

create table if not exists public.youtube_quota_state (
  provider text primary key,
  window_started_at timestamptz null,
  live_calls_window integer not null default 0,
  live_calls_day integer not null default 0,
  day_started_at date null,
  cooldown_until timestamptz null,
  last_403_at timestamptz null,
  last_429_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_quota_state_cooldown_idx
  on public.youtube_quota_state (cooldown_until);
