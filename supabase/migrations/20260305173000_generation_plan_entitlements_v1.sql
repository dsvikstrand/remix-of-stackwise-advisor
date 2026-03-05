create table if not exists public.user_generation_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free'
    check (plan in ('free', 'plus', 'admin')),
  daily_limit_override integer null
    check (daily_limit_override is null or daily_limit_override >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_generation_entitlements_plan_idx
  on public.user_generation_entitlements (plan, user_id);

create or replace function public.get_generation_plan_for_user(
  p_user_id uuid
)
returns table (
  plan text,
  daily_limit_override integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    coalesce(e.plan, 'free') as plan,
    e.daily_limit_override
  from (select p_user_id as user_id) u
  left join public.user_generation_entitlements e
    on e.user_id = u.user_id;
end;
$$;

revoke all on function public.get_generation_plan_for_user(uuid) from public;
grant execute on function public.get_generation_plan_for_user(uuid) to service_role;

create or replace function public.set_generation_plan_by_email(
  p_email text,
  p_plan text,
  p_daily_limit_override integer default null
)
returns table (
  user_id uuid,
  email text,
  plan text,
  daily_limit_override integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_email text;
  v_plan text := lower(trim(coalesce(p_plan, '')));
begin
  if v_plan not in ('free', 'plus', 'admin') then
    raise exception 'Invalid plan: % (expected free|plus|admin)', p_plan;
  end if;

  if p_daily_limit_override is not null and p_daily_limit_override < 0 then
    raise exception 'daily_limit_override must be >= 0';
  end if;

  select u.id, u.email
    into v_user_id, v_email
  from auth.users u
  where lower(u.email) = lower(trim(coalesce(p_email, '')))
  limit 1;

  if v_user_id is null then
    raise exception 'User not found for email: %', p_email;
  end if;

  insert into public.user_generation_entitlements (
    user_id,
    plan,
    daily_limit_override,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    v_plan,
    p_daily_limit_override,
    now(),
    now()
  )
  on conflict (user_id) do update
    set
      plan = excluded.plan,
      daily_limit_override = excluded.daily_limit_override,
      updated_at = now();

  return query
  select
    e.user_id,
    v_email as email,
    e.plan,
    e.daily_limit_override
  from public.user_generation_entitlements e
  where e.user_id = v_user_id;
end;
$$;

revoke all on function public.set_generation_plan_by_email(text, text, integer) from public;
grant execute on function public.set_generation_plan_by_email(text, text, integer) to service_role;
