-- Integration hardening: per-server field mappings, human-readable audit
-- context on tool call logs, outbound tool-call idempotency dedup, and tool
-- schema version snapshots for spec re-imports. Safe to run repeatedly.

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
  using (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = tool_execution_dedup.server_id and user_id = auth.uid()))
  with check (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = tool_execution_dedup.server_id and user_id = auth.uid()));

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
  using (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = tool_schema_versions.server_id and user_id = auth.uid()))
  with check (auth.uid() = user_id and exists (select 1 from public.mcp_servers where id = tool_schema_versions.server_id and user_id = auth.uid()));
