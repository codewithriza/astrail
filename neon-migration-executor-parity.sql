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
