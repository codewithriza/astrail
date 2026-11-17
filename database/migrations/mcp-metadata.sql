alter table if exists public.mcp_servers add column if not exists endpoint_map jsonb default '[]'::jsonb;
alter table if exists public.mcp_servers add column if not exists diagnostics jsonb default '{}'::jsonb;
alter table if exists public.mcp_servers add column if not exists status text default 'pending';
alter table if exists public.mcp_servers add column if not exists validation_status text default 'pending';
alter table if exists public.mcp_servers add column if not exists generation_status text default 'pending';
alter table if exists public.mcp_servers add column if not exists generation_version int default 1;
alter table if exists public.mcp_servers add column if not exists protocol_version text default '2024-11-05';

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

alter table if exists public.tool_call_logs enable row level security;
alter table if exists public.mcp_bundles enable row level security;
alter table if exists public.mcp_bundle_servers enable row level security;
alter table if exists public.api_credentials enable row level security;

drop policy if exists "tool call logs are owned by users" on public.tool_call_logs;
drop policy if exists "bundles are owned by users" on public.mcp_bundles;
drop policy if exists "bundle servers follow bundle ownership" on public.mcp_bundle_servers;
drop policy if exists "credentials are owned by users" on public.api_credentials;

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

create table if not exists public.design_partner_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text not null,
  role text,
  agent_kind text not null,
  needed_api text not null,
  has_api_docs text not null check (has_api_docs in ('yes', 'no')),
  api_docs_url_or_notes text,
  runtime_preference text not null check (runtime_preference in ('hosted', 'exported_code', 'self_hosted')),
  urgency text not null check (urgency in ('today', 'this_week', 'exploring')),
  status text not null default 'new' check (status in ('new', 'contacted', 'onboarded', 'generated', 'success')),
  created_at timestamptz default now()
);

alter table if exists public.design_partner_requests add column if not exists role text;
alter table if exists public.design_partner_requests add column if not exists api_docs_url_or_notes text;
alter table if exists public.design_partner_requests add column if not exists status text not null default 'new';

create index if not exists idx_design_partner_requests_created_at
  on public.design_partner_requests (created_at desc);
create index if not exists idx_design_partner_requests_urgency
  on public.design_partner_requests (urgency, created_at desc);
create index if not exists idx_design_partner_requests_preference
  on public.design_partner_requests (runtime_preference, created_at desc);

alter table if exists public.design_partner_requests enable row level security;

drop policy if exists "public can create design partner requests" on public.design_partner_requests;
drop policy if exists "authenticated users can read design partner requests" on public.design_partner_requests;

create policy "public can create design partner requests"
  on public.design_partner_requests for insert
  with check (true);

create policy "authenticated users can read design partner requests"
  on public.design_partner_requests for select
  using (auth.role() = 'authenticated');
