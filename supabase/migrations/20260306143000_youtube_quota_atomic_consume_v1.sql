create or replace function public.consume_youtube_quota_budget(
  p_provider text,
  p_max_per_minute integer,
  p_max_per_day integer,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds integer,
  window_started_at timestamptz,
  live_calls_window integer,
  live_calls_day integer,
  day_started_at date,
  cooldown_until timestamptz
)
language plpgsql
as $$
declare
  v_provider text := nullif(trim(coalesce(p_provider, '')), '');
  v_now timestamptz := coalesce(p_now, now());
  v_minute_budget integer := greatest(1, coalesce(p_max_per_minute, 1));
  v_day_budget integer := greatest(1, coalesce(p_max_per_day, 1));
  v_state public.youtube_quota_state%rowtype;
  v_retry_at timestamptz;
  v_today_utc date := (v_now at time zone 'UTC')::date;
begin
  if v_provider is null then
    raise exception 'p_provider is required';
  end if;

  insert into public.youtube_quota_state (
    provider,
    window_started_at,
    live_calls_window,
    live_calls_day,
    day_started_at
  )
  values (
    v_provider,
    v_now,
    0,
    0,
    v_today_utc
  )
  on conflict (provider) do nothing;

  select *
  into v_state
  from public.youtube_quota_state
  where provider = v_provider
  for update;

  if v_state.day_started_at is null or v_state.day_started_at <> v_today_utc then
    v_state.day_started_at := v_today_utc;
    v_state.live_calls_day := 0;
  end if;

  if v_state.window_started_at is null or v_now - v_state.window_started_at >= interval '1 minute' then
    v_state.window_started_at := v_now;
    v_state.live_calls_window := 0;
  end if;

  if v_state.cooldown_until is not null and v_state.cooldown_until > v_now then
    update public.youtube_quota_state
    set
      window_started_at = v_state.window_started_at,
      live_calls_window = v_state.live_calls_window,
      live_calls_day = v_state.live_calls_day,
      day_started_at = v_state.day_started_at,
      updated_at = v_now
    where provider = v_provider;

    return query
    select
      false,
      'cooldown'::text,
      greatest(1, ceil(extract(epoch from (v_state.cooldown_until - v_now))))::integer,
      v_state.window_started_at,
      v_state.live_calls_window,
      v_state.live_calls_day,
      v_state.day_started_at,
      v_state.cooldown_until;
    return;
  end if;

  if v_state.live_calls_day >= v_day_budget then
    v_retry_at := (date_trunc('day', v_now at time zone 'UTC') + interval '1 day') at time zone 'UTC';

    update public.youtube_quota_state
    set
      window_started_at = v_state.window_started_at,
      live_calls_window = v_state.live_calls_window,
      live_calls_day = v_state.live_calls_day,
      day_started_at = v_state.day_started_at,
      updated_at = v_now
    where provider = v_provider;

    return query
    select
      false,
      'day_budget'::text,
      greatest(1, ceil(extract(epoch from (v_retry_at - v_now))))::integer,
      v_state.window_started_at,
      v_state.live_calls_window,
      v_state.live_calls_day,
      v_state.day_started_at,
      v_state.cooldown_until;
    return;
  end if;

  if v_state.live_calls_window >= v_minute_budget then
    v_retry_at := v_state.window_started_at + interval '1 minute';

    update public.youtube_quota_state
    set
      window_started_at = v_state.window_started_at,
      live_calls_window = v_state.live_calls_window,
      live_calls_day = v_state.live_calls_day,
      day_started_at = v_state.day_started_at,
      updated_at = v_now
    where provider = v_provider;

    return query
    select
      false,
      'minute_budget'::text,
      greatest(1, ceil(extract(epoch from (v_retry_at - v_now))))::integer,
      v_state.window_started_at,
      v_state.live_calls_window,
      v_state.live_calls_day,
      v_state.day_started_at,
      v_state.cooldown_until;
    return;
  end if;

  v_state.live_calls_window := coalesce(v_state.live_calls_window, 0) + 1;
  v_state.live_calls_day := coalesce(v_state.live_calls_day, 0) + 1;

  update public.youtube_quota_state
  set
    window_started_at = v_state.window_started_at,
    live_calls_window = v_state.live_calls_window,
    live_calls_day = v_state.live_calls_day,
    day_started_at = v_state.day_started_at,
    updated_at = v_now
  where provider = v_provider;

  return query
  select
    true,
    null::text,
    null::integer,
    v_state.window_started_at,
    v_state.live_calls_window,
    v_state.live_calls_day,
    v_state.day_started_at,
    v_state.cooldown_until;
end;
$$;

grant execute on function public.consume_youtube_quota_budget(text, integer, integer, timestamptz) to service_role;
