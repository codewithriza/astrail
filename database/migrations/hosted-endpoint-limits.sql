-- Enforce hosted endpoint capacity with atomic per-workspace slot claims.
-- Existing ownership policies remain unchanged; triggers enforce the quota for every write path.

create table if not exists public.hosted_endpoint_slots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot integer not null check (slot > 0),
  resource_kind text not null check (resource_kind in ('server', 'bundle')),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slot),
  unique (resource_kind, resource_id)
);

alter table public.hosted_endpoint_slots enable row level security;

create index if not exists idx_mcp_servers_user_hosted_endpoint
  on public.mcp_servers (user_id) where hosted_endpoint is not null;
create index if not exists idx_mcp_bundles_user_hosted_endpoint
  on public.mcp_bundles (user_id) where hosted_endpoint is not null;

delete from public.hosted_endpoint_slots as slots
where not exists (
  select 1 from public.mcp_servers as servers
   where slots.resource_kind = 'server'
     and servers.id = slots.resource_id
     and servers.user_id = slots.user_id
     and servers.hosted_endpoint is not null
)
and not exists (
  select 1 from public.mcp_bundles as bundles
   where slots.resource_kind = 'bundle'
     and bundles.id = slots.resource_id
     and bundles.user_id = slots.user_id
     and bundles.hosted_endpoint is not null
);

do $$
declare
  endpoint record;
  candidate_slot integer;
begin
  for endpoint in
    select user_id, resource_kind, resource_id
    from (
      select user_id, id as resource_id, 'server'::text as resource_kind, created_at
        from public.mcp_servers where hosted_endpoint is not null
      union all
      select user_id, id as resource_id, 'bundle'::text as resource_kind, created_at
        from public.mcp_bundles where hosted_endpoint is not null
    ) as endpoints
    where not exists (
      select 1 from public.hosted_endpoint_slots as existing
       where existing.resource_kind = endpoints.resource_kind
         and existing.resource_id = endpoints.resource_id
    )
    order by user_id, created_at, resource_kind, resource_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(endpoint.user_id::text, 948374)
    );
    candidate_slot := 1;
    while exists (
      select 1 from public.hosted_endpoint_slots
       where user_id = endpoint.user_id and slot = candidate_slot
    ) loop
      candidate_slot := candidate_slot + 1;
    end loop;
    insert into public.hosted_endpoint_slots (user_id, slot, resource_kind, resource_id)
    values (endpoint.user_id, candidate_slot, endpoint.resource_kind, endpoint.resource_id)
    on conflict (resource_kind, resource_id) do nothing;
  end loop;
end;
$$;

create or replace function public.claim_hosted_endpoint_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_plan text;
  endpoint_limit integer;
  endpoint_count integer;
  claimed_slot integer;
  candidate_slot integer;
  resource_type text;
begin
  if new.hosted_endpoint is null then
    return new;
  end if;

  resource_type := case when tg_table_name = 'mcp_servers' then 'server' else 'bundle' end;

  if tg_op = 'UPDATE' then
    if old.hosted_endpoint is not null and old.user_id = new.user_id then
      return new;
    end if;
    if old.hosted_endpoint is not null and old.user_id <> new.user_id then
      delete from public.hosted_endpoint_slots
       where user_id = old.user_id
         and hosted_endpoint_slots.resource_kind = resource_type
         and resource_id = old.id;
    end if;
  end if;

  select subscriptions.plan
    into active_plan
    from public.billing_subscriptions as subscriptions
   where subscriptions.user_id = new.user_id
     and subscriptions.entitlement_status = 'active'
     and subscriptions.paid_confirmed_at is not null
     and subscriptions.status in ('active', 'paid', 'succeeded')
     and (subscriptions.current_period_end is null or subscriptions.current_period_end > now())
   order by subscriptions.updated_at desc
   limit 1;

  endpoint_limit := case
    when active_plan in ('starter', 'pro', 'builder', 'launch') then 10
    when active_plan in ('team', 'scale') then 100
    else 3
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 948374)
  );

  select count(*)
    into endpoint_count
    from public.hosted_endpoint_slots
   where user_id = new.user_id;

  if endpoint_count >= endpoint_limit then
    raise exception using
      errcode = 'P0001',
      message = 'hosted_endpoint_limit_reached',
      detail = 'The workspace has reached its active hosted endpoint limit.';
  end if;

  for candidate_slot in 1..endpoint_limit loop
    insert into public.hosted_endpoint_slots (user_id, slot, resource_kind, resource_id)
    values (new.user_id, candidate_slot, resource_type, new.id)
    on conflict do nothing
    returning slot into claimed_slot;

    if claimed_slot is not null then
      return new;
    end if;
  end loop;

  if claimed_slot is null then
    raise exception using
      errcode = 'P0001',
      message = 'hosted_endpoint_limit_reached',
      detail = 'The workspace has reached its active hosted endpoint limit.';
  end if;

  return new;
end;
$$;

create or replace function public.release_hosted_endpoint_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resource_type text;
begin
  resource_type := case when tg_table_name = 'mcp_servers' then 'server' else 'bundle' end;

  if tg_op = 'DELETE'
    or new.hosted_endpoint is null
    or new.user_id <> old.user_id then
    delete from public.hosted_endpoint_slots
     where user_id = old.user_id
       and hosted_endpoint_slots.resource_kind = resource_type
       and resource_id = old.id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.claim_hosted_endpoint_slot() from public;
revoke all on function public.release_hosted_endpoint_slot() from public;

drop trigger if exists enforce_mcp_server_endpoint_limit on public.mcp_servers;
drop trigger if exists release_mcp_server_endpoint_slot on public.mcp_servers;
create trigger enforce_mcp_server_endpoint_limit
  before insert or update of hosted_endpoint, user_id on public.mcp_servers
  for each row execute function public.claim_hosted_endpoint_slot();
create trigger release_mcp_server_endpoint_slot
  after delete or update of hosted_endpoint, user_id on public.mcp_servers
  for each row execute function public.release_hosted_endpoint_slot();

drop trigger if exists enforce_mcp_bundle_endpoint_limit on public.mcp_bundles;
drop trigger if exists release_mcp_bundle_endpoint_slot on public.mcp_bundles;
create trigger enforce_mcp_bundle_endpoint_limit
  before insert or update of hosted_endpoint, user_id on public.mcp_bundles
  for each row execute function public.claim_hosted_endpoint_slot();
create trigger release_mcp_bundle_endpoint_slot
  after delete or update of hosted_endpoint, user_id on public.mcp_bundles
  for each row execute function public.release_hosted_endpoint_slot();
