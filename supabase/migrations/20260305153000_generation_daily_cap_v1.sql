create table if not exists public.user_generation_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  used_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_day),
  constraint user_generation_daily_usage_used_count_non_negative check (used_count >= 0)
);

create index if not exists user_generation_daily_usage_day_user_idx
  on public.user_generation_daily_usage (usage_day, user_id);

create or replace function public.consume_generation_daily_quota(
  p_user_id uuid,
  p_units integer,
  p_limit integer,
  p_reset_hour_utc integer default 0
)
returns table (
  allowed boolean,
  used_count integer,
  remaining_count integer,
  limit_count integer,
  usage_day date,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_utc timestamp := timezone('utc', now());
  v_units integer := greatest(1, coalesce(p_units, 1));
  v_limit integer := greatest(0, coalesce(p_limit, 0));
  v_reset_hour integer := greatest(0, least(23, coalesce(p_reset_hour_utc, 0)));
  v_usage_day date;
  v_used integer := 0;
begin
  if extract(hour from v_now_utc) < v_reset_hour then
    v_usage_day := (v_now_utc::date - 1);
  else
    v_usage_day := v_now_utc::date;
  end if;

  usage_day := v_usage_day;
  reset_at := (((v_usage_day + 1)::timestamp + make_interval(hours => v_reset_hour)) at time zone 'UTC');
  limit_count := v_limit;

  if v_limit <= 0 then
    allowed := false;
    used_count := 0;
    remaining_count := 0;
    return next;
    return;
  end if;

  insert into public.user_generation_daily_usage (user_id, usage_day, used_count)
  values (p_user_id, v_usage_day, v_units)
  on conflict (user_id, usage_day)
  do update
    set used_count = public.user_generation_daily_usage.used_count + v_units,
        updated_at = now()
  where public.user_generation_daily_usage.used_count + v_units <= v_limit
  returning public.user_generation_daily_usage.used_count into v_used;

  if found then
    allowed := true;
    used_count := v_used;
    remaining_count := greatest(0, v_limit - v_used);
    return next;
    return;
  end if;

  select coalesce(u.used_count, 0)
    into v_used
  from public.user_generation_daily_usage u
  where u.user_id = p_user_id
    and u.usage_day = v_usage_day;

  allowed := false;
  used_count := greatest(0, v_used);
  remaining_count := greatest(0, v_limit - used_count);
  return next;
end;
$$;

revoke all on function public.consume_generation_daily_quota(uuid, integer, integer, integer) from public;
grant execute on function public.consume_generation_daily_quota(uuid, integer, integer, integer) to service_role;

create or replace function public.get_generation_daily_quota_status(
  p_user_id uuid,
  p_limit integer,
  p_reset_hour_utc integer default 0
)
returns table (
  used_count integer,
  remaining_count integer,
  limit_count integer,
  usage_day date,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_utc timestamp := timezone('utc', now());
  v_limit integer := greatest(0, coalesce(p_limit, 0));
  v_reset_hour integer := greatest(0, least(23, coalesce(p_reset_hour_utc, 0)));
  v_usage_day date;
  v_used integer := 0;
begin
  if extract(hour from v_now_utc) < v_reset_hour then
    v_usage_day := (v_now_utc::date - 1);
  else
    v_usage_day := v_now_utc::date;
  end if;

  usage_day := v_usage_day;
  reset_at := (((v_usage_day + 1)::timestamp + make_interval(hours => v_reset_hour)) at time zone 'UTC');
  limit_count := v_limit;

  select coalesce(u.used_count, 0)
    into v_used
  from public.user_generation_daily_usage u
  where u.user_id = p_user_id
    and u.usage_day = v_usage_day;

  used_count := greatest(0, v_used);
  remaining_count := greatest(0, v_limit - used_count);
  return next;
end;
$$;

revoke all on function public.get_generation_daily_quota_status(uuid, integer, integer) from public;
grant execute on function public.get_generation_daily_quota_status(uuid, integer, integer) to service_role;
