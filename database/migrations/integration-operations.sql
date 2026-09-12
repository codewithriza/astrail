-- Integration operations: OAuth consent, mapping/reliability config, webhooks, schema drift, and TCO tracking.
alter table if exists public.mcp_servers add column if not exists field_mappings jsonb default '{}'::jsonb;
alter table if exists public.mcp_servers alter column field_mappings set default '{}'::jsonb;
alter table if exists public.mcp_servers add column if not exists execution_policy jsonb not null default '{}'::jsonb;
alter table if exists public.mcp_servers add column if not exists schema_fingerprint text;
alter table if exists public.mcp_servers add column if not exists schema_checked_at timestamptz;
alter table if exists public.mcp_servers add column if not exists schema_drift_detected boolean not null default false;
alter table if exists public.api_credentials add column if not exists authorization_url text;
alter table if exists public.api_credentials add column if not exists token_auth_method text not null default 'client_secret_post';
alter table if exists public.api_credentials add column if not exists refresh_lease_id text;
alter table if exists public.api_credentials add column if not exists refresh_lease_until timestamptz;
alter table if exists public.api_keys add column if not exists end_user_id text;
alter table if exists public.api_keys add column if not exists actor_role text;
alter table if exists public.tool_execution_dedup alter column result_text drop not null;
alter table if exists public.tool_execution_dedup add column if not exists status text not null default 'succeeded';
alter table if exists public.tool_execution_dedup add column if not exists lease_expires_at timestamptz;
alter table if exists public.tool_execution_dedup add column if not exists claim_token text;
alter table if exists public.tool_execution_dedup add column if not exists updated_at timestamptz not null default now();

drop function if exists public.claim_tool_execution(uuid, uuid, text, text);
drop function if exists public.claim_tool_execution(uuid, uuid, text, text, text);
create or replace function public.claim_tool_execution(
  p_server_id uuid,
  p_user_id uuid,
  p_tool_name text,
  p_idempotency_key text,
  p_claim_token text
)
returns table(claim_status text, result_text text, trace_id text, recorded_at timestamptz, owner_token text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed public.tool_execution_dedup%rowtype;
begin
  insert into public.tool_execution_dedup (
    server_id, user_id, tool_name, idempotency_key, status, result_text, claim_token, lease_expires_at, updated_at
  ) values (
    p_server_id, p_user_id, p_tool_name, p_idempotency_key, 'pending', null, p_claim_token, now() + interval '5 minutes', now()
  ) on conflict (server_id, tool_name, idempotency_key) do nothing
  returning * into claimed;

  if claimed.id is not null then
    return query select 'claimed'::text, null::text, null::text, now(), p_claim_token;
    return;
  end if;

  select * into claimed from public.tool_execution_dedup
    where server_id = p_server_id and tool_name = p_tool_name and idempotency_key = p_idempotency_key
    for update;
  if claimed.status = 'succeeded' then
    return query select 'replay'::text, claimed.result_text, claimed.trace_id, claimed.created_at, null::text;
  elsif claimed.status = 'failed' then
    update public.tool_execution_dedup set status = 'pending', result_text = null, trace_id = null, claim_token = p_claim_token,
      lease_expires_at = now() + interval '5 minutes', updated_at = now()
      where id = claimed.id;
    return query select 'claimed'::text, null::text, null::text, now(), p_claim_token;
  elsif claimed.lease_expires_at is not null and claimed.lease_expires_at <= now() then
    return query select 'in_doubt'::text, null::text, claimed.trace_id, claimed.updated_at, null::text;
  else
    return query select 'in_progress'::text, null::text, claimed.trace_id, claimed.updated_at, null::text;
  end if;
end;
$$;
revoke all on function public.claim_tool_execution(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_tool_execution(uuid, uuid, text, text, text) to service_role;

drop policy if exists "tool execution dedup is owned by users" on public.tool_execution_dedup;
create policy "tool execution dedup is owned by users" on public.tool_execution_dedup for all
  using (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = tool_execution_dedup.server_id and user_id = auth.uid()))
  with check (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = tool_execution_dedup.server_id and user_id = auth.uid()));

drop policy if exists "tool schema versions are owned by users" on public.tool_schema_versions;
create policy "tool schema versions are owned by users" on public.tool_schema_versions for all
  using (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = tool_schema_versions.server_id and user_id = auth.uid()))
  with check (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = tool_schema_versions.server_id and user_id = auth.uid()));

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  server_id uuid references public.mcp_servers(id) on delete cascade not null,
  name text not null,
  secret_ciphertext text not null,
  secret_preview text not null,
  signature_header text not null default 'x-astrail-signature',
  event_id_header text not null default 'x-event-id',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid references public.webhook_endpoints(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  unique (endpoint_id, event_id)
);

create table if not exists public.integration_schema_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  server_id uuid references public.mcp_servers(id) on delete cascade not null,
  fingerprint text not null,
  endpoint_count int not null default 0,
  change_summary jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  unique (server_id, fingerprint)
);

create table if not exists public.integration_cost_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  server_id uuid references public.mcp_servers(id) on delete cascade not null,
  category text not null check (category in ('setup', 'maintenance', 'support', 'custom_exception')),
  minutes int not null default 0 check (minutes >= 0 and minutes <= 1000000),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_webhook_endpoints_user_server on public.webhook_endpoints (user_id, server_id);
create index if not exists idx_webhook_events_endpoint_received on public.webhook_events (endpoint_id, received_at desc);
create index if not exists idx_webhook_events_user_received on public.webhook_events (user_id, received_at desc);
create index if not exists idx_schema_versions_server_detected on public.integration_schema_versions (server_id, detected_at desc);
create index if not exists idx_integration_costs_user_created on public.integration_cost_events (user_id, created_at desc);
create index if not exists idx_integration_costs_server_created on public.integration_cost_events (server_id, created_at desc);
create index if not exists idx_mcp_servers_schema_watch on public.mcp_servers (source_type, schema_checked_at)
  where source_url is not null and source_type in ('url', 'openapi_url');

create or replace view public.integration_cost_totals with (security_invoker = true) as
  select user_id, server_id, category, sum(minutes)::bigint as minutes,
    sum(amount)::numeric(14,2) as amount, count(*)::bigint as events
  from public.integration_cost_events
  group by user_id, server_id, category;

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_events enable row level security;
alter table public.integration_schema_versions enable row level security;
alter table public.integration_cost_events enable row level security;

drop policy if exists "webhook endpoints are owned by users" on public.webhook_endpoints;
create policy "webhook endpoints are owned by users" on public.webhook_endpoints for all
  using (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = webhook_endpoints.server_id and user_id = auth.uid()
  )) with check (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = webhook_endpoints.server_id and user_id = auth.uid()
  ));

drop policy if exists "webhook events are owned by users" on public.webhook_events;
create policy "webhook events are owned by users" on public.webhook_events for all
  using (auth.uid() = user_id and exists (
    select 1 from public.webhook_endpoints where id = webhook_events.endpoint_id and user_id = auth.uid()
  )) with check (auth.uid() = user_id and exists (
    select 1 from public.webhook_endpoints where id = webhook_events.endpoint_id and user_id = auth.uid()
  ));

drop policy if exists "schema versions are owned by users" on public.integration_schema_versions;
create policy "schema versions are owned by users" on public.integration_schema_versions for all
  using (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = integration_schema_versions.server_id and user_id = auth.uid()
  )) with check (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = integration_schema_versions.server_id and user_id = auth.uid()
  ));

drop policy if exists "integration costs are owned by users" on public.integration_cost_events;
create policy "integration costs are owned by users" on public.integration_cost_events for all
  using (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = integration_cost_events.server_id and user_id = auth.uid()
  )) with check (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = integration_cost_events.server_id and user_id = auth.uid()
  ));
