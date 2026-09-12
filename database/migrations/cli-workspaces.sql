alter table if exists public.api_keys add column if not exists workspace_id uuid;
alter table if exists public.api_keys add column if not exists end_user_id text;
alter table if exists public.api_keys add column if not exists actor_role text;
alter table if exists public.api_keys add column if not exists agent_id text;
alter table if exists public.api_keys add column if not exists agent_policy jsonb not null default '{}'::jsonb;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  environment text not null default 'personal',
  bundle_id uuid references public.mcp_bundles(id) on delete set null,
  status text not null default 'active',
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'api_keys_workspace_fk') then
    alter table public.api_keys add constraint api_keys_workspace_fk
      foreign key (workspace_id) references public.workspaces(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_workspaces_user_created_at on public.workspaces(user_id, created_at desc);
create index if not exists idx_api_keys_workspace on public.api_keys(workspace_id);

alter table public.workspaces enable row level security;
drop policy if exists "workspaces are owned by users" on public.workspaces;
create policy "workspaces are owned by users" on public.workspaces for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
