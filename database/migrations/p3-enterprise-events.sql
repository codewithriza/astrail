-- P2.4/P3 enterprise, event operations, local-boundary retention and skill demos.
-- Includes the base webhook tables so this migration is safe even when files
-- were applied alphabetically instead of in roadmap dependency order.
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete cascade not null,
  server_id uuid references public.mcp_servers(id) on delete cascade not null, name text not null,
  secret_ciphertext text not null, secret_preview text not null,
  signature_header text not null default 'x-astrail-signature', event_id_header text not null default 'x-event-id',
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(), endpoint_id uuid references public.webhook_endpoints(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null, event_id text not null, event_type text,
  payload jsonb not null, headers jsonb not null default '{}'::jsonb, status text not null default 'received',
  received_at timestamptz not null default now(), unique(endpoint_id,event_id)
);
create index if not exists idx_webhook_endpoints_user_server on public.webhook_endpoints(user_id,server_id);
create index if not exists idx_webhook_events_endpoint_received on public.webhook_events(endpoint_id,received_at desc);
create index if not exists idx_webhook_events_user_received on public.webhook_events(user_id,received_at desc);
alter table public.webhook_endpoints enable row level security;alter table public.webhook_events enable row level security;
drop policy if exists "webhook endpoints are owned by users" on public.webhook_endpoints;
create policy "webhook endpoints are owned by users" on public.webhook_endpoints for all using(auth.uid()=user_id and exists(select 1 from public.mcp_servers where id=webhook_endpoints.server_id and user_id=auth.uid())) with check(auth.uid()=user_id and exists(select 1 from public.mcp_servers where id=webhook_endpoints.server_id and user_id=auth.uid()));
drop policy if exists "webhook events are owned by users" on public.webhook_events;
create policy "webhook events are owned by users" on public.webhook_events for select using(auth.uid()=user_id);
alter table if exists public.webhook_endpoints add column if not exists provider text not null default 'generic';
alter table if exists public.webhook_events add column if not exists server_id uuid references public.mcp_servers(id) on delete cascade;
alter table if exists public.webhook_events add column if not exists correlation_id text;
alter table if exists public.webhook_events add column if not exists attempt_count int not null default 0;
alter table if exists public.webhook_events add column if not exists max_attempts int not null default 5;
alter table if exists public.webhook_events add column if not exists next_attempt_at timestamptz;
alter table if exists public.webhook_events add column if not exists lease_id text;
alter table if exists public.webhook_events add column if not exists lease_until timestamptz;
alter table if exists public.webhook_events add column if not exists last_error text;
alter table if exists public.webhook_events add column if not exists task_authorization_id uuid references public.task_authorizations(id) on delete set null;
alter table if exists public.webhook_events add column if not exists trigger_tool text;
alter table if exists public.webhook_events add column if not exists processed_at timestamptz;
alter table if exists public.webhook_events add column if not exists dead_lettered_at timestamptz;
create index if not exists idx_webhook_events_queue on public.webhook_events(status,next_attempt_at,lease_until);
create table if not exists public.webhook_event_transitions(id bigint generated always as identity primary key,event_id uuid not null references public.webhook_events(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,from_status text,to_status text not null,reason text,correlation_id text,created_at timestamptz not null default now());
alter table public.webhook_event_transitions enable row level security;drop policy if exists "webhook transitions owned" on public.webhook_event_transitions;create policy "webhook transitions owned" on public.webhook_event_transitions for select using(auth.uid()=user_id);
create or replace function public.claim_webhook_event(p_event_id uuid,p_user_id uuid,p_lease_id text,p_lease_until timestamptz) returns boolean language plpgsql security definer set search_path=public as $$ declare changed int;begin update public.webhook_events set status='processing',lease_id=p_lease_id,lease_until=p_lease_until,attempt_count=attempt_count+1 where id=p_event_id and user_id=p_user_id and status in('received','retry_scheduled') and (next_attempt_at is null or next_attempt_at<=now()) and (lease_until is null or lease_until<now());get diagnostics changed=row_count;return changed=1;end$$;
revoke all on function public.claim_webhook_event(uuid,uuid,text,timestamptz) from public,anon,authenticated;grant execute on function public.claim_webhook_event(uuid,uuid,text,timestamptz) to admin;

create table if not exists public.organizations(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,argument_retention text not null default 'redacted' check(argument_retention in('none','keys_only','redacted')),audit_retention_days int not null default 90,created_at timestamptz not null default now());
create table if not exists public.organization_memberships(organization_id uuid references public.organizations(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,role text not null check(role in('owner','admin','auditor','member')),status text not null default 'active',last_reviewed_at timestamptz,primary key(organization_id,user_id));
create table if not exists public.organization_oidc_configs(id uuid primary key default gen_random_uuid(),organization_id uuid not null unique references public.organizations(id) on delete cascade,issuer text not null,client_id text not null,client_secret_ciphertext text,allowed_domains jsonb not null default '[]',enabled boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.organization_scim_configs(id uuid primary key default gen_random_uuid(),organization_id uuid not null unique references public.organizations(id) on delete cascade,token_hash text not null,token_preview text not null,enabled boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.enterprise_identity_grant_mappings(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,issuer text not null,subject text not null,user_id uuid not null references public.profiles(id) on delete cascade,outbound_end_user_id text not null,created_at timestamptz not null default now(),unique(organization_id,issuer,subject));
create table if not exists public.organization_access_reviews(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,reviewer_id uuid not null references public.profiles(id),status text not null default 'open',snapshot jsonb not null,decisions jsonb not null default '[]',completed_at timestamptz,created_at timestamptz not null default now());
alter table if exists public.mcp_servers add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table if exists public.tool_call_logs add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.organizations enable row level security;alter table public.organization_memberships enable row level security;alter table public.organization_oidc_configs enable row level security;alter table public.organization_scim_configs enable row level security;alter table public.enterprise_identity_grant_mappings enable row level security;alter table public.organization_access_reviews enable row level security;
create or replace function public.current_organization_role(p_organization_id uuid) returns text language sql stable security definer set search_path=public as $$select role from public.organization_memberships where organization_id=p_organization_id and user_id=auth.uid() and status='active' limit 1$$;
revoke all on function public.current_organization_role(uuid) from public,anon;grant execute on function public.current_organization_role(uuid) to authenticated,admin;
drop policy if exists "organizations members read" on public.organizations;create policy "organizations members read" on public.organizations for select using(public.current_organization_role(id) is not null);
drop policy if exists "memberships visible" on public.organization_memberships;create policy "memberships visible" on public.organization_memberships for select using(user_id=auth.uid() or public.current_organization_role(organization_id) in('owner','admin','auditor'));
drop policy if exists "oidc admins" on public.organization_oidc_configs;create policy "oidc admins" on public.organization_oidc_configs for select using(public.current_organization_role(organization_id) in('owner','admin'));
drop policy if exists "grant mappings admins" on public.enterprise_identity_grant_mappings;create policy "grant mappings admins" on public.enterprise_identity_grant_mappings for select using(public.current_organization_role(organization_id) in('owner','admin','auditor'));
drop policy if exists "reviews admins" on public.organization_access_reviews;create policy "reviews admins" on public.organization_access_reviews for select using(public.current_organization_role(organization_id) in('owner','admin','auditor'));
