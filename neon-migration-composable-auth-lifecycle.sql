-- P0.1/P0.2: concurrency-safe OAuth lifecycle and composable task authorization.
-- Safe to run repeatedly.

alter table if exists public.api_credentials add column if not exists issued_at timestamptz;
alter table if exists public.api_credentials add column if not exists original_ttl_seconds int;
alter table if exists public.api_credentials add column if not exists refresh_generation bigint not null default 0;
alter table if exists public.api_credentials add column if not exists last_refresh_status text;
alter table if exists public.api_credentials add column if not exists last_refresh_at timestamptz;
alter table if exists public.api_credentials add column if not exists last_refresh_error text;

alter table if exists public.api_keys add column if not exists agent_id text;
alter table if exists public.api_keys add column if not exists agent_policy jsonb not null default '{}'::jsonb;
create index if not exists idx_api_keys_user_agent on public.api_keys (user_id, agent_id);

create table if not exists public.task_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  server_id uuid not null references public.mcp_servers(id) on delete cascade,
  agent_id text not null,
  token_hash text not null unique,
  nonce text not null unique,
  issuer text not null,
  purpose text not null,
  allowed_tools jsonb not null default '[]'::jsonb,
  allowed_actions jsonb not null default '[]'::jsonb,
  approval_actions jsonb not null default '[]'::jsonb,
  allowed_resources jsonb not null default '[]'::jsonb,
  allowed_scopes jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_authorizations_lookup on public.task_authorizations (user_id, server_id, agent_id, expires_at desc);
alter table public.task_authorizations enable row level security;
drop policy if exists "task authorizations are owned by users" on public.task_authorizations;
create policy "task authorizations are owned by users" on public.task_authorizations for select using (auth.uid() = user_id);

alter table if exists public.tool_call_logs add column if not exists agent_id text;
alter table if exists public.tool_call_logs add column if not exists task_authorization_id uuid references public.task_authorizations(id) on delete set null;
alter table if exists public.tool_call_logs add column if not exists authorization_decision jsonb;
alter table if exists public.tool_call_logs add column if not exists purpose text;
alter table if exists public.tool_approval_requests add column if not exists agent_id text;
alter table if exists public.tool_approval_requests add column if not exists task_authorization_id uuid references public.task_authorizations(id) on delete set null;
alter table if exists public.tool_approval_requests add column if not exists authorization_decision jsonb;

create table if not exists public.oauth_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  server_id uuid references public.mcp_servers(id) on delete set null,
  credential_id uuid references public.api_credentials(id) on delete set null,
  provider text,
  event_type text not null,
  generation bigint not null default 0,
  outcome text not null,
  peer_reused boolean not null default false,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.oauth_lifecycle_events enable row level security;
drop policy if exists "oauth lifecycle events are owned by users" on public.oauth_lifecycle_events;
create policy "oauth lifecycle events are owned by users" on public.oauth_lifecycle_events for select using (auth.uid() = user_id);

create or replace function public.claim_oauth_refresh(
  p_credential_id uuid, p_user_id uuid, p_expected_generation bigint,
  p_lease_id text, p_lease_until timestamptz
) returns table(claimed boolean, current_generation bigint)
language plpgsql security definer set search_path = public as $$
declare row_generation bigint;
begin
  update public.api_credentials set
    refresh_lease_id = p_lease_id,
    refresh_lease_until = p_lease_until,
    last_refresh_status = 'refreshing',
    last_refresh_error = null,
    updated_at = now()
  where id = p_credential_id and user_id = p_user_id
    and refresh_generation = p_expected_generation
    and revocation_status is null
    and (refresh_lease_until is null or refresh_lease_until < now())
  returning refresh_generation into row_generation;
  return query select row_generation is not null, coalesce(row_generation, (
    select refresh_generation from public.api_credentials where id = p_credential_id and user_id = p_user_id
  ));
end $$;

create or replace function public.commit_oauth_refresh(
  p_credential_id uuid, p_user_id uuid, p_lease_id text, p_expected_generation bigint,
  p_access_token_ciphertext text, p_refresh_token_ciphertext text, p_expires_at timestamptz,
  p_issued_at timestamptz, p_original_ttl_seconds int, p_scopes jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare changed int;
begin
  update public.api_credentials set
    access_token_ciphertext = p_access_token_ciphertext,
    secret_ciphertext = p_access_token_ciphertext,
    refresh_token_ciphertext = coalesce(p_refresh_token_ciphertext, refresh_token_ciphertext),
    expires_at = p_expires_at,
    issued_at = p_issued_at,
    original_ttl_seconds = p_original_ttl_seconds,
    scopes = p_scopes,
    refresh_generation = refresh_generation + 1,
    last_refresh_status = 'succeeded',
    last_refresh_at = now(),
    last_refresh_error = null,
    refresh_lease_id = null,
    refresh_lease_until = null,
    updated_at = now()
  where id = p_credential_id and user_id = p_user_id
    and refresh_lease_id = p_lease_id and refresh_generation = p_expected_generation;
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

revoke all on function public.claim_oauth_refresh(uuid,uuid,bigint,text,timestamptz) from public, anon, authenticated;
revoke all on function public.commit_oauth_refresh(uuid,uuid,text,bigint,text,text,timestamptz,timestamptz,int,jsonb) from public, anon, authenticated;
grant execute on function public.claim_oauth_refresh(uuid,uuid,bigint,text,timestamptz) to service_role;
grant execute on function public.commit_oauth_refresh(uuid,uuid,text,bigint,text,text,timestamptz,timestamptz,int,jsonb) to service_role;
