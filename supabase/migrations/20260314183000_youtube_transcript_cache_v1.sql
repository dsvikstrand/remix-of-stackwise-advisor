create table if not exists public.youtube_transcript_cache (
  video_id text primary key,
  transcript_text text not null,
  transcript_source text not null,
  confidence double precision null,
  segments_json jsonb null,
  provider_id text null,
  transport_json jsonb null,
  provider_trace_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.youtube_transcript_cache enable row level security;

drop policy if exists "YouTube transcript cache service read" on public.youtube_transcript_cache;
drop policy if exists "YouTube transcript cache service write" on public.youtube_transcript_cache;

create policy "YouTube transcript cache service read"
  on public.youtube_transcript_cache for select
  using (auth.role() = 'service_role');

create policy "YouTube transcript cache service write"
  on public.youtube_transcript_cache for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists update_youtube_transcript_cache_updated_at on public.youtube_transcript_cache;
create trigger update_youtube_transcript_cache_updated_at
  before update on public.youtube_transcript_cache
  for each row execute function public.update_updated_at_column();
