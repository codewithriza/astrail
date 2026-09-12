-- Provider-side OAuth revocation and immutable execution attribution.
-- Safe to run repeatedly.

alter table if exists public.api_credentials add column if not exists revocation_url text;
alter table if exists public.api_credentials add column if not exists revocation_status text;
alter table if exists public.api_credentials add column if not exists revocation_error text;
alter table if exists public.api_credentials add column if not exists revocation_attempted_at timestamptz;
alter table if exists public.api_credentials add column if not exists refresh_lease_id text;
alter table if exists public.api_credentials add column if not exists refresh_lease_until timestamptz;

alter table if exists public.tool_call_logs add column if not exists api_key_id uuid;
alter table if exists public.tool_call_logs add column if not exists api_key_name text;
alter table if exists public.tool_call_logs add column if not exists api_key_preview text;
alter table if exists public.tool_call_logs add column if not exists client_name text;
alter table if exists public.tool_call_logs add column if not exists credential_refs jsonb not null default '[]'::jsonb;
alter table if exists public.tool_call_logs add column if not exists bundle_id uuid;

-- Preserve evidence when an integration is deleted. Account deletion may still
-- remove the owning user's records through the user_id foreign key.
alter table if exists public.tool_call_logs
  drop constraint if exists tool_call_logs_server_id_fkey;
alter table if exists public.tool_call_logs
  add constraint tool_call_logs_server_id_fkey
  foreign key (server_id) references public.mcp_servers(id) on delete set null;

-- Browser sessions may read their own vault and audit records, but only
-- service-role routes may mutate credentials or append/delete audit evidence.
drop policy if exists "credentials are owned by users" on public.api_credentials;
create policy "credentials are owned by users"
  on public.api_credentials for select
  using (auth.uid() = user_id);

drop policy if exists "tool call logs are owned by users" on public.tool_call_logs;
create policy "tool call logs are owned by users"
  on public.tool_call_logs for select
  using (auth.uid() = user_id);

-- These regular index statements are compatible with the documented
-- copy/paste SQL Editor workflow.
create index if not exists idx_tool_call_logs_api_key
  on public.tool_call_logs (api_key_id, created_at desc);
create index if not exists idx_tool_call_logs_client
  on public.tool_call_logs (client_name, created_at desc);
