-- Non-custodial x402 domain verification, atomic spend reservations, and receipts.

create table if not exists public.x402_domain_verifications (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  domain text not null,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (server_id, domain)
);

create index if not exists idx_x402_domain_verifications_user
  on public.x402_domain_verifications (user_id, status, updated_at desc);

create unique index if not exists idx_mcp_servers_id_user
  on public.mcp_servers (id, user_id);

do $$
begin
  alter table public.x402_domain_verifications
    add constraint x402_domain_verifications_server_owner_fkey
    foreign key (server_id, user_id) references public.mcp_servers(id, user_id) on delete cascade;
exception when duplicate_object then null;
end $$;

alter table public.x402_domain_verifications enable row level security;
drop policy if exists "x402 domains are owned by users" on public.x402_domain_verifications;
create policy "x402 domains are owned by users"
  on public.x402_domain_verifications for all
  using (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = server_id and user_id = auth.uid()
  ))
  with check (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = server_id and user_id = auth.uid()
  ));

create table if not exists public.x402_payment_challenges (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  end_user_id text not null,
  tool_name text not null,
  requirement_fingerprint text not null check (requirement_fingerprint ~ '^[0-9a-f]{64}$'),
  requirement jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.x402_payment_challenges
    add constraint x402_payment_challenges_server_owner_fkey
    foreign key (server_id, user_id) references public.mcp_servers(id, user_id) on delete cascade;
exception when duplicate_object then null;
end $$;

create index if not exists idx_x402_challenges_claim
  on public.x402_payment_challenges (server_id, end_user_id, tool_name, requirement_fingerprint, expires_at)
  where consumed_at is null;

alter table public.x402_payment_challenges enable row level security;
drop policy if exists "x402 challenges are owned by users" on public.x402_payment_challenges;
create policy "x402 challenges are owned by users"
  on public.x402_payment_challenges for select
  using (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = server_id and user_id = auth.uid()
  ));

create or replace function public.record_x402_challenge(
  p_server_id uuid,
  p_user_id uuid,
  p_end_user_id text,
  p_tool_name text,
  p_requirement_fingerprint text,
  p_requirement jsonb,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
begin
  if p_end_user_id is null or length(trim(p_end_user_id)) = 0
    or p_requirement_fingerprint !~ '^[0-9a-f]{64}$'
    or p_requirement is null
    or octet_length(p_requirement::text) > 8000
    or p_expires_at <= now()
    or p_expires_at > now() + interval '15 minutes' then
    return 'invalid';
  end if;
  if not exists (
    select 1 from public.mcp_servers
    where id = p_server_id and user_id = p_user_id and hosted_endpoint is not null
  ) then
    return 'forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'x402-challenge:' || p_server_id::text || ':' || p_end_user_id || ':' || p_tool_name,
    0
  ));
  delete from public.x402_payment_challenges
  where server_id = p_server_id
    and end_user_id = p_end_user_id
    and (expires_at <= now() or consumed_at is not null);
  select count(*) into v_active
  from public.x402_payment_challenges
  where server_id = p_server_id
    and end_user_id = p_end_user_id
    and tool_name = p_tool_name
    and consumed_at is null
    and expires_at > now();
  if v_active >= 32 then return 'limit_exceeded'; end if;
  insert into public.x402_payment_challenges (
    server_id, user_id, end_user_id, tool_name,
    requirement_fingerprint, requirement, expires_at
  ) values (
    p_server_id, p_user_id, left(p_end_user_id, 240), left(p_tool_name, 240),
    p_requirement_fingerprint, p_requirement, p_expires_at
  );
  return 'recorded';
end;
$$;

revoke all on function public.record_x402_challenge(uuid, uuid, text, text, text, jsonb, timestamptz) from public;
revoke all on function public.record_x402_challenge(uuid, uuid, text, text, text, jsonb, timestamptz) from anon;
revoke all on function public.record_x402_challenge(uuid, uuid, text, text, text, jsonb, timestamptz) from authenticated;
grant execute on function public.record_x402_challenge(uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;

create table if not exists public.x402_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  end_user_id text not null,
  tool_name text not null,
  trace_id text not null,
  payment_fingerprint text not null,
  network text not null,
  asset text not null,
  amount text not null check (amount ~ '^[0-9]{1,78}$'),
  pay_to text not null,
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'failed', 'in_doubt')),
  transaction text,
  settlement_response jsonb,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (server_id, payment_fingerprint)
);

create index if not exists idx_x402_receipts_user_created
  on public.x402_payment_receipts (user_id, created_at desc);
create index if not exists idx_x402_receipts_spend_window
  on public.x402_payment_receipts (server_id, end_user_id, network, asset, created_at desc)
  where status in ('reserved', 'settled', 'in_doubt');
create unique index if not exists idx_x402_receipts_network_fingerprint
  on public.x402_payment_receipts (network, payment_fingerprint);

alter table public.x402_payment_receipts enable row level security;
drop policy if exists "x402 receipts are owned by users" on public.x402_payment_receipts;
create policy "x402 receipts are owned by users"
  on public.x402_payment_receipts for select
  using (auth.uid() = user_id);

drop function if exists public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text);

create or replace function public.claim_x402_payment(
  p_server_id uuid,
  p_user_id uuid,
  p_end_user_id text,
  p_tool_name text,
  p_trace_id text,
  p_payment_fingerprint text,
  p_requirement_fingerprint text,
  p_network text,
  p_asset text,
  p_amount text,
  p_pay_to text,
  p_daily_limit text default null
)
returns table(status text, receipt_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_challenge_id uuid;
  v_spent numeric := 0;
begin
  if p_end_user_id is null or length(trim(p_end_user_id)) = 0
    or p_amount !~ '^[0-9]{1,78}$'
    or p_payment_fingerprint !~ '^[0-9a-f]{64}$'
    or p_requirement_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_daily_limit is not null and p_daily_limit !~ '^[0-9]{1,78}$') then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from public.mcp_servers
    where id = p_server_id and user_id = p_user_id and hosted_endpoint is not null
  ) then
    return query select 'forbidden'::text, null::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_server_id::text || ':' || p_end_user_id || ':' || p_network || ':' || lower(p_asset),
    0
  ));

  select id into v_receipt_id
  from public.x402_payment_receipts
  where network = p_network and payment_fingerprint = p_payment_fingerprint;
  if v_receipt_id is not null then
    return query select 'duplicate'::text, v_receipt_id;
    return;
  end if;

  select id into v_challenge_id
  from public.x402_payment_challenges
  where server_id = p_server_id
    and user_id = p_user_id
    and end_user_id = p_end_user_id
    and tool_name = p_tool_name
    and requirement_fingerprint = p_requirement_fingerprint
    and consumed_at is null
    and expires_at > now()
  order by created_at
  for update skip locked
  limit 1;
  if v_challenge_id is null then
    return query select 'challenge_missing'::text, null::uuid;
    return;
  end if;

  if p_daily_limit is not null then
    select coalesce(sum(amount::numeric), 0) into v_spent
    from public.x402_payment_receipts
    where server_id = p_server_id
      and end_user_id = p_end_user_id
      and network = p_network
      and asset = p_asset
      and status in ('reserved', 'settled', 'in_doubt')
      and created_at >= date_trunc('day', now());
    if v_spent + p_amount::numeric > p_daily_limit::numeric then
      return query select 'limit_exceeded'::text, null::uuid;
      return;
    end if;
  end if;

  update public.x402_payment_challenges
  set consumed_at = now()
  where id = v_challenge_id and consumed_at is null;

  insert into public.x402_payment_receipts (
    server_id, user_id, end_user_id, tool_name, trace_id,
    payment_fingerprint, network, asset, amount, pay_to, status
  ) values (
    p_server_id, p_user_id, p_end_user_id, left(p_tool_name, 240), left(p_trace_id, 160),
    p_payment_fingerprint, left(p_network, 160), left(p_asset, 300), p_amount, left(p_pay_to, 300), 'reserved'
  ) returning id into v_receipt_id;

  return query select 'claimed'::text, v_receipt_id;
exception
  when unique_violation then
    select id into v_receipt_id
    from public.x402_payment_receipts
    where network = p_network and payment_fingerprint = p_payment_fingerprint;
    return query select 'duplicate'::text, v_receipt_id;
end;
$$;

revoke all on function public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text, text) from anon;
revoke all on function public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text, text) to service_role;
