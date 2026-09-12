create table if not exists public.profiles (
  id uuid primary key,
  email text,
  plan text default 'free',
  created_at timestamptz default now()
);

create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  description text,
  source_url text,
  source_type text,
  generated_code text,
  tools_json jsonb default '[]'::jsonb,
  endpoint_map jsonb default '[]'::jsonb,
  diagnostics jsonb default '{}'::jsonb,
  status text default 'pending',
  validation_status text default 'pending',
  generation_status text default 'pending',
  is_public boolean default false,
  hosted_endpoint text,
  call_count int default 0,
  generation_version int default 1,
  protocol_version text default '2024-11-05',
  created_at timestamptz default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  key_hash text unique not null,
  key_preview text not null,
  last_used timestamptz,
  created_at timestamptz default now()
);

alter table if exists public.mcp_servers add column if not exists hosted_endpoint text;
alter table if exists public.mcp_servers add column if not exists call_count int default 0;
alter table if exists public.mcp_servers add column if not exists endpoint_map jsonb default '[]'::jsonb;
alter table if exists public.mcp_servers add column if not exists diagnostics jsonb default '{}'::jsonb;
alter table if exists public.mcp_servers add column if not exists status text default 'pending';
alter table if exists public.mcp_servers add column if not exists validation_status text default 'pending';
alter table if exists public.mcp_servers add column if not exists generation_status text default 'pending';
alter table if exists public.mcp_servers add column if not exists generation_version int default 1;
alter table if exists public.mcp_servers add column if not exists protocol_version text default '2024-11-05';
alter table public.mcp_servers alter column tools_json set default '[]'::jsonb;
alter table if exists public.mcp_servers alter column endpoint_map set default '[]'::jsonb;
alter table if exists public.mcp_servers alter column diagnostics set default '{}'::jsonb;
alter table if exists public.mcp_servers alter column status set default 'pending';
alter table if exists public.mcp_servers alter column validation_status set default 'pending';
alter table if exists public.mcp_servers alter column generation_status set default 'pending';
alter table if exists public.mcp_servers alter column protocol_version set default '2024-11-05';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mcp_servers'
      and column_name = 'generation_version'
      and data_type <> 'integer'
  ) then
    alter table public.mcp_servers
      alter column generation_version drop default,
      alter column generation_version type int using (
        case
          when generation_version::text ~ '^[0-9]+$' then generation_version::text::int
          else 1
        end
      ),
      alter column generation_version set default 1;
  end if;
end $$;

create table if not exists public.tool_call_logs (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.mcp_servers(id) on delete set null,
  user_id uuid references public.profiles(id) on delete cascade,
  tool_name text,
  status text,
  method text,
  path text,
  execution_mode text,
  upstream_status int,
  trace_id text,
  attempt_count int,
  error_code text,
  error text,
  latency_ms int,
  created_at timestamptz default now()
);

alter table if exists public.tool_call_logs add column if not exists method text;
alter table if exists public.tool_call_logs add column if not exists path text;
alter table if exists public.tool_call_logs add column if not exists execution_mode text;
alter table if exists public.tool_call_logs add column if not exists upstream_status int;
alter table if exists public.tool_call_logs add column if not exists trace_id text;
alter table if exists public.tool_call_logs add column if not exists attempt_count int;
alter table if exists public.tool_call_logs add column if not exists error_code text;
alter table if exists public.tool_call_logs add column if not exists error text;

create table if not exists public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  server_id uuid references public.mcp_servers(id) on delete cascade,
  name text not null,
  provider text,
  auth_scheme text not null,
  client_id text,
  client_secret_ciphertext text,
  injection_name text,
  scopes jsonb default '[]'::jsonb,
  secret_ciphertext text not null,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_url text,
  expires_at timestamptz,
  key_preview text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.api_credentials add column if not exists server_id uuid references public.mcp_servers(id) on delete cascade;
alter table if exists public.api_credentials add column if not exists provider text;
alter table if exists public.api_credentials add column if not exists client_id text;
alter table if exists public.api_credentials add column if not exists client_secret_ciphertext text;
alter table if exists public.api_credentials add column if not exists injection_name text;
alter table if exists public.api_credentials add column if not exists scopes jsonb default '[]'::jsonb;
alter table if exists public.api_credentials add column if not exists access_token_ciphertext text;
alter table if exists public.api_credentials add column if not exists refresh_token_ciphertext text;
alter table if exists public.api_credentials add column if not exists token_url text;
alter table if exists public.api_credentials add column if not exists expires_at timestamptz;
alter table if exists public.api_credentials add column if not exists revocation_url text;
alter table if exists public.api_credentials add column if not exists revocation_status text;
alter table if exists public.api_credentials add column if not exists revocation_error text;
alter table if exists public.api_credentials add column if not exists revocation_attempted_at timestamptz;

create table if not exists public.mcp_bundles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  hosted_endpoint text,
  is_public boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.mcp_bundle_servers (
  bundle_id uuid references public.mcp_bundles(id) on delete cascade,
  server_id uuid references public.mcp_servers(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (bundle_id, server_id)
);

create index if not exists idx_tool_call_logs_server_created_at
  on public.tool_call_logs (server_id, created_at desc);
create index if not exists idx_tool_call_logs_user_created_at
  on public.tool_call_logs (user_id, created_at desc);
create index if not exists idx_tool_call_logs_trace_id
  on public.tool_call_logs (trace_id);
create index if not exists idx_api_credentials_user_server
  on public.api_credentials (user_id, server_id);
create index if not exists idx_mcp_bundles_user_created_at
  on public.mcp_bundles (user_id, created_at desc);
create index if not exists idx_mcp_bundle_servers_server
  on public.mcp_bundle_servers (server_id);

alter table public.profiles enable row level security;
alter table public.mcp_servers enable row level security;
alter table public.api_keys enable row level security;
alter table public.tool_call_logs enable row level security;
alter table public.mcp_bundles enable row level security;
alter table public.mcp_bundle_servers enable row level security;
alter table public.api_credentials enable row level security;

drop policy if exists "profiles are owned by users" on public.profiles;
drop policy if exists "servers are owned by users" on public.mcp_servers;
drop policy if exists "public servers are readable" on public.mcp_servers;
drop policy if exists "api keys are owned by users" on public.api_keys;
drop policy if exists "tool call logs are owned by users" on public.tool_call_logs;
drop policy if exists "bundles are owned by users" on public.mcp_bundles;
drop policy if exists "bundle servers follow bundle ownership" on public.mcp_bundle_servers;
drop policy if exists "credentials are owned by users" on public.api_credentials;

create policy "profiles are owned by users"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "servers are owned by users"
  on public.mcp_servers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "public servers are readable"
  on public.mcp_servers for select
  using (is_public = true or auth.uid() = user_id);

create policy "api keys are owned by users"
  on public.api_keys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tool call logs are owned by users"
  on public.tool_call_logs for select
  using (auth.uid() = user_id);

create policy "bundles are owned by users"
  on public.mcp_bundles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bundle servers follow bundle ownership"
  on public.mcp_bundle_servers for all
  using (
    exists (
      select 1 from public.mcp_bundles
      where public.mcp_bundles.id = public.mcp_bundle_servers.bundle_id
      and public.mcp_bundles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.mcp_bundles
      where public.mcp_bundles.id = public.mcp_bundle_servers.bundle_id
      and public.mcp_bundles.user_id = auth.uid()
    )
  );

create policy "credentials are owned by users"
  on public.api_credentials for select
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Profiles are created by Astrail after Neon Auth verifies the session. During
-- migration the profile ID may be relinked from a legacy identity by email.

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  dodo_event_id text unique not null,
  event_type text not null default 'unknown',
  user_id uuid references public.profiles(id) on delete set null,
  event_created_at timestamptz,
  processing_result text not null default 'received',
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dodo_customer_id text,
  dodo_subscription_id text,
  dodo_payment_id text,
  plan text not null,
  status text not null default 'unknown',
  entitlement_status text not null default 'inactive',
  paid_confirmed_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_payment_status text,
  last_payment_at timestamptz,
  dodo_last_event_id text,
  dodo_last_event_type text,
  dodo_last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.billing_payment_events (
  id uuid primary key default gen_random_uuid(),
  dodo_event_id text unique not null,
  dodo_payment_id text,
  user_id uuid references public.profiles(id) on delete set null,
  dodo_customer_id text,
  dodo_subscription_id text,
  plan text,
  status text not null default 'unknown',
  amount numeric,
  currency text,
  event_created_at timestamptz,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.billing_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  server_id uuid references public.mcp_servers(id) on delete set null,
  tool_name text,
  usage_type text not null default 'tool_call',
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

-- Existing installations may predate these columns. Add them before indexes
-- below reference them so the canonical schema remains safely re-runnable.
alter table if exists public.billing_webhook_events add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table if exists public.billing_webhook_events add column if not exists event_created_at timestamptz;
alter table if exists public.billing_webhook_events add column if not exists processing_result text not null default 'received';
alter table if exists public.billing_subscriptions add column if not exists entitlement_status text not null default 'inactive';
alter table if exists public.billing_subscriptions add column if not exists paid_confirmed_at timestamptz;
alter table if exists public.billing_subscriptions add column if not exists last_payment_status text;
alter table if exists public.billing_subscriptions add column if not exists last_payment_at timestamptz;
alter table if exists public.billing_subscriptions add column if not exists dodo_last_event_id text;
alter table if exists public.billing_subscriptions add column if not exists dodo_last_event_type text;
alter table if exists public.billing_subscriptions add column if not exists dodo_last_event_at timestamptz;

create index if not exists billing_webhook_events_event_type_idx
  on public.billing_webhook_events (event_type);
create index if not exists billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id);
create index if not exists billing_subscriptions_entitlement_idx
  on public.billing_subscriptions (user_id, entitlement_status, paid_confirmed_at);
create index if not exists billing_payment_events_user_created_at_idx
  on public.billing_payment_events (user_id, event_created_at desc);
create index if not exists billing_payment_events_payment_id_idx
  on public.billing_payment_events (dodo_payment_id);
create index if not exists billing_usage_user_id_created_at_idx
  on public.billing_usage (user_id, created_at desc);
create index if not exists tool_call_logs_user_id_created_at_idx
  on public.tool_call_logs (user_id, created_at desc);

alter table if exists public.billing_webhook_events enable row level security;
alter table if exists public.billing_subscriptions enable row level security;
alter table if exists public.billing_payment_events enable row level security;
alter table if exists public.billing_usage enable row level security;

alter table if exists public.billing_webhook_events add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table if exists public.billing_webhook_events add column if not exists event_created_at timestamptz;
alter table if exists public.billing_webhook_events add column if not exists processing_result text not null default 'received';

alter table if exists public.billing_subscriptions add column if not exists entitlement_status text not null default 'inactive';
alter table if exists public.billing_subscriptions add column if not exists paid_confirmed_at timestamptz;
alter table if exists public.billing_subscriptions add column if not exists last_payment_status text;
alter table if exists public.billing_subscriptions add column if not exists last_payment_at timestamptz;
alter table if exists public.billing_subscriptions add column if not exists dodo_last_event_id text;
alter table if exists public.billing_subscriptions add column if not exists dodo_last_event_type text;
alter table if exists public.billing_subscriptions add column if not exists dodo_last_event_at timestamptz;

drop policy if exists "Users can read own subscriptions" on public.billing_subscriptions;
create policy "Users can read own subscriptions"
  on public.billing_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read own billing payment events" on public.billing_payment_events;
create policy "Users can read own billing payment events"
  on public.billing_payment_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read own billing usage" on public.billing_usage;
create policy "Users can read own billing usage"
  on public.billing_usage for select
  using (auth.uid() = user_id);

create table if not exists public.design_partner_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text not null,
  role text,
  persona text default 'developer' check (persona in ('buyer', 'developer', 'workflow_owner')),
  agent_kind text not null,
  workflow_goal text,
  needed_api text not null,
  systems_involved text,
  has_api_docs text not null check (has_api_docs in ('yes', 'no')),
  api_docs_url_or_notes text,
  approval_steps text,
  auth_constraints text,
  runtime_preference text not null check (runtime_preference in ('hosted', 'exported_code', 'self_hosted')),
  urgency text not null check (urgency in ('today', 'this_week', 'exploring')),
  status text not null default 'new' check (status in ('new', 'contacted', 'mapped', 'generated', 'tested', 'onboarded', 'success')),
  created_at timestamptz default now()
);

alter table if exists public.design_partner_requests add column if not exists role text;
alter table if exists public.design_partner_requests add column if not exists persona text default 'developer';
alter table if exists public.design_partner_requests add column if not exists workflow_goal text;
alter table if exists public.design_partner_requests add column if not exists systems_involved text;
alter table if exists public.design_partner_requests add column if not exists api_docs_url_or_notes text;
alter table if exists public.design_partner_requests add column if not exists approval_steps text;
alter table if exists public.design_partner_requests add column if not exists auth_constraints text;
alter table if exists public.design_partner_requests add column if not exists status text not null default 'new';

create index if not exists idx_design_partner_requests_created_at
  on public.design_partner_requests (created_at desc);
create index if not exists idx_design_partner_requests_urgency
  on public.design_partner_requests (urgency, created_at desc);
create index if not exists idx_design_partner_requests_preference
  on public.design_partner_requests (runtime_preference, created_at desc);
create index if not exists idx_design_partner_requests_persona
  on public.design_partner_requests (persona, created_at desc);

alter table if exists public.design_partner_requests enable row level security;

drop policy if exists "public can create design partner requests" on public.design_partner_requests;
drop policy if exists "authenticated users can read design partner requests" on public.design_partner_requests;

create policy "public can create design partner requests"
  on public.design_partner_requests for insert
  with check (true);

create policy "authenticated users can read design partner requests"
  on public.design_partner_requests for select
  using (auth.role() = 'authenticated');
alter table if exists public.mcp_servers add column if not exists runtime_policy jsonb;

create table if not exists public.tool_approval_requests (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.mcp_servers(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  tool_name text not null,
  arguments_ciphertext text not null,
  arguments_redacted jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_approval_requests_user_status
  on public.tool_approval_requests (user_id, status, created_at desc);
create index if not exists idx_tool_approval_requests_server
  on public.tool_approval_requests (server_id, created_at desc);

alter table public.tool_approval_requests enable row level security;
drop policy if exists "tool approvals are owned by users" on public.tool_approval_requests;
create policy "tool approvals are owned by users"
  on public.tool_approval_requests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Hosted OAuth connect flow + per-end-user credential scoping (see neon-migration-oauth-connect.sql).
alter table if exists public.api_credentials add column if not exists authorization_url text;
alter table if exists public.api_credentials add column if not exists connect_status text not null default 'active';
alter table if exists public.api_credentials add column if not exists connect_state text;
alter table if exists public.api_credentials add column if not exists connect_state_expires_at timestamptz;
alter table if exists public.api_credentials add column if not exists pkce_verifier_ciphertext text;
alter table if exists public.api_credentials add column if not exists end_user_id text;
alter table if exists public.api_credentials add column if not exists security_scheme text;
alter table if exists public.api_credentials add column if not exists security_binding text;
create unique index if not exists api_credentials_connect_state_key
  on public.api_credentials (connect_state)
  where connect_state is not null;
create index if not exists api_credentials_server_end_user_idx
  on public.api_credentials (server_id, end_user_id);
create index if not exists api_credentials_server_identity_scheme_idx
  on public.api_credentials (server_id, end_user_id, security_scheme);
create index if not exists api_credentials_server_identity_binding_idx
  on public.api_credentials (server_id, end_user_id, security_scheme, security_binding);

-- Human-readable audit summaries (see neon-migration-runtime-quality.sql).
alter table if exists public.tool_call_logs add column if not exists summary text;
alter table if exists public.tool_call_logs add column if not exists api_key_id uuid;
alter table if exists public.tool_call_logs add column if not exists api_key_name text;
alter table if exists public.tool_call_logs add column if not exists api_key_preview text;
alter table if exists public.tool_call_logs add column if not exists client_name text;
alter table if exists public.tool_call_logs add column if not exists credential_refs jsonb not null default '[]'::jsonb;
alter table if exists public.tool_call_logs add column if not exists bundle_id uuid;

-- Integration hardening: field mappings, audit context, idempotency dedup, schema versions (see neon-migration-integration-hardening.sql).

-- Per-customer field mapping rules applied deterministically at runtime.
alter table if exists public.mcp_servers add column if not exists field_mappings jsonb;

-- Audit-log enrichment: who acted (end user + actor role), what they sent
-- (secret-redacted arguments), and a plain-English summary line.
alter table if exists public.tool_call_logs add column if not exists end_user_id text;
alter table if exists public.tool_call_logs add column if not exists actor_role text;
alter table if exists public.tool_call_logs add column if not exists arguments_redacted jsonb;
alter table if exists public.tool_call_logs add column if not exists summary text;

create index if not exists idx_tool_call_logs_end_user
  on public.tool_call_logs (server_id, end_user_id, created_at desc);
create index if not exists idx_tool_call_logs_api_key
  on public.tool_call_logs (api_key_id, created_at desc);
create index if not exists idx_tool_call_logs_client
  on public.tool_call_logs (client_name, created_at desc);

-- Outbound idempotency: one successful execution per (server, tool, key).
create table if not exists public.tool_execution_dedup (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool_name text not null,
  idempotency_key text not null,
  trace_id text,
  result_text text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tool_execution_dedup_key
  on public.tool_execution_dedup (server_id, tool_name, idempotency_key);

alter table public.tool_execution_dedup enable row level security;

drop policy if exists "tool execution dedup is owned by users" on public.tool_execution_dedup;
create policy "tool execution dedup is owned by users"
  on public.tool_execution_dedup for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tool schema snapshots taken before each spec re-import.
create table if not exists public.tool_schema_versions (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version bigint not null default 0,
  tools_json jsonb not null default '[]'::jsonb,
  endpoint_map jsonb not null default '[]'::jsonb,
  diff jsonb,
  tool_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_schema_versions_server_created_at
  on public.tool_schema_versions (server_id, created_at desc);

alter table public.tool_schema_versions enable row level security;

drop policy if exists "tool schema versions are owned by users" on public.tool_schema_versions;
create policy "tool schema versions are owned by users"
  on public.tool_schema_versions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
grant execute on function public.claim_tool_execution(uuid, uuid, text, text, text) to admin;

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
  using (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = webhook_endpoints.server_id and user_id = auth.uid()))
  with check (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = webhook_endpoints.server_id and user_id = auth.uid()));

drop policy if exists "webhook events are owned by users" on public.webhook_events;
create policy "webhook events are owned by users" on public.webhook_events for all
  using (auth.uid() = user_id and exists (select 1 from public.webhook_endpoints where id = webhook_events.endpoint_id and user_id = auth.uid()))
  with check (auth.uid() = user_id and exists (select 1 from public.webhook_endpoints where id = webhook_events.endpoint_id and user_id = auth.uid()));

drop policy if exists "schema versions are owned by users" on public.integration_schema_versions;
create policy "schema versions are owned by users" on public.integration_schema_versions for all
  using (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = integration_schema_versions.server_id and user_id = auth.uid()))
  with check (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = integration_schema_versions.server_id and user_id = auth.uid()));

drop policy if exists "integration costs are owned by users" on public.integration_cost_events;
create policy "integration costs are owned by users" on public.integration_cost_events for all
  using (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = integration_cost_events.server_id and user_id = auth.uid()))
  with check (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = integration_cost_events.server_id and user_id = auth.uid()));

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
create policy "x402 domains are owned by users" on public.x402_domain_verifications for all
  using (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = server_id and user_id = auth.uid()
  )) with check (auth.uid() = user_id and exists (
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
create policy "x402 challenges are owned by users" on public.x402_payment_challenges for select
  using (auth.uid() = user_id and exists (
    select 1 from public.mcp_servers where id = server_id and user_id = auth.uid()
  ));

create or replace function public.record_x402_challenge(
  p_server_id uuid, p_user_id uuid, p_end_user_id text, p_tool_name text,
  p_requirement_fingerprint text, p_requirement jsonb, p_expires_at timestamptz
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_active integer;
begin
  if p_end_user_id is null or length(trim(p_end_user_id)) = 0
    or p_requirement_fingerprint !~ '^[0-9a-f]{64}$' or p_requirement is null
    or octet_length(p_requirement::text) > 8000 or p_expires_at <= now()
    or p_expires_at > now() + interval '15 minutes' then return 'invalid'; end if;
  if not exists (select 1 from public.mcp_servers where id = p_server_id and user_id = p_user_id and hosted_endpoint is not null) then
    return 'forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('x402-challenge:' || p_server_id::text || ':' || p_end_user_id || ':' || p_tool_name, 0));
  delete from public.x402_payment_challenges where server_id = p_server_id and end_user_id = p_end_user_id
    and (expires_at <= now() or consumed_at is not null);
  select count(*) into v_active from public.x402_payment_challenges
    where server_id = p_server_id and end_user_id = p_end_user_id and tool_name = p_tool_name
      and consumed_at is null and expires_at > now();
  if v_active >= 32 then return 'limit_exceeded'; end if;
  insert into public.x402_payment_challenges (
    server_id, user_id, end_user_id, tool_name, requirement_fingerprint, requirement, expires_at
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
grant execute on function public.record_x402_challenge(uuid, uuid, text, text, text, jsonb, timestamptz) to admin;

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
create policy "x402 receipts are owned by users" on public.x402_payment_receipts for select
  using (auth.uid() = user_id);

drop function if exists public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text);

create or replace function public.claim_x402_payment(
  p_server_id uuid, p_user_id uuid, p_end_user_id text, p_tool_name text,
  p_trace_id text, p_payment_fingerprint text, p_requirement_fingerprint text, p_network text, p_asset text,
  p_amount text, p_pay_to text, p_daily_limit text default null
)
returns table(status text, receipt_id uuid)
language plpgsql security definer set search_path = ''
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
    return query select 'invalid'::text, null::uuid; return;
  end if;
  if not exists (select 1 from public.mcp_servers where id = p_server_id and user_id = p_user_id and hosted_endpoint is not null) then
    return query select 'forbidden'::text, null::uuid; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_server_id::text || ':' || p_end_user_id || ':' || p_network || ':' || lower(p_asset), 0));
  select id into v_receipt_id from public.x402_payment_receipts
    where network = p_network and payment_fingerprint = p_payment_fingerprint;
  if v_receipt_id is not null then return query select 'duplicate'::text, v_receipt_id; return; end if;
  select id into v_challenge_id from public.x402_payment_challenges
    where server_id = p_server_id and user_id = p_user_id and end_user_id = p_end_user_id
      and tool_name = p_tool_name and requirement_fingerprint = p_requirement_fingerprint
      and consumed_at is null and expires_at > now()
    order by created_at for update skip locked limit 1;
  if v_challenge_id is null then return query select 'challenge_missing'::text, null::uuid; return; end if;
  if p_daily_limit is not null then
    select coalesce(sum(amount::numeric), 0) into v_spent from public.x402_payment_receipts
      where server_id = p_server_id and end_user_id = p_end_user_id and network = p_network
        and asset = p_asset and status in ('reserved', 'settled', 'in_doubt')
        and created_at >= date_trunc('day', now());
    if v_spent + p_amount::numeric > p_daily_limit::numeric then
      return query select 'limit_exceeded'::text, null::uuid; return;
    end if;
  end if;
  update public.x402_payment_challenges set consumed_at = now()
    where id = v_challenge_id and consumed_at is null;
  insert into public.x402_payment_receipts (
    server_id, user_id, end_user_id, tool_name, trace_id, payment_fingerprint,
    network, asset, amount, pay_to, status
  ) values (
    p_server_id, p_user_id, p_end_user_id, left(p_tool_name, 240), left(p_trace_id, 160), p_payment_fingerprint,
    left(p_network, 160), left(p_asset, 300), p_amount, left(p_pay_to, 300), 'reserved'
  ) returning id into v_receipt_id;
  return query select 'claimed'::text, v_receipt_id;
exception when unique_violation then
  select id into v_receipt_id from public.x402_payment_receipts
    where network = p_network and payment_fingerprint = p_payment_fingerprint;
  return query select 'duplicate'::text, v_receipt_id;
end;
$$;
revoke all on function public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text, text) from anon;
revoke all on function public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.claim_x402_payment(uuid, uuid, text, text, text, text, text, text, text, text, text, text) to admin;
