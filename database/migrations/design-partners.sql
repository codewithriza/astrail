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
