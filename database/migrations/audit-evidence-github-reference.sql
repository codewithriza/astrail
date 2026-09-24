-- P0.3: intent-linked, tamper-evident audit evidence and retention/legal holds.
-- P0.4 uses the existing encrypted credential/task tables; no provider secrets are added here.
create extension if not exists pgcrypto;

alter table if exists public.tool_call_logs add column if not exists task_id text;
alter table if exists public.tool_call_logs add column if not exists affected_resources jsonb not null default '[]'::jsonb;
alter table if exists public.tool_call_logs add column if not exists effective_scopes jsonb not null default '[]'::jsonb;
alter table if exists public.tool_call_logs add column if not exists policy_result jsonb;
alter table if exists public.tool_call_logs add column if not exists provider_result jsonb;
alter table if exists public.tool_call_logs add column if not exists approval_id uuid;
alter table if exists public.tool_call_logs add column if not exists approval_actor_id uuid;
alter table if exists public.tool_call_logs add column if not exists approval_decision text;
alter table if exists public.tool_call_logs add column if not exists approval_decided_at timestamptz;
alter table if exists public.tool_call_logs add column if not exists approval_reason text;
alter table if exists public.tool_call_logs add column if not exists execution_claim_id text;
alter table if exists public.tool_call_logs add column if not exists evidence_sequence bigint;
alter table if exists public.tool_call_logs add column if not exists previous_event_hash text;
alter table if exists public.tool_call_logs add column if not exists event_hash text;
alter table if exists public.tool_call_logs add column if not exists storage_status text not null default 'persisted';

-- Evidence keeps historical identifiers verbatim. ON DELETE SET NULL would be
-- an update and would violate append-only semantics.
alter table if exists public.tool_call_logs drop constraint if exists tool_call_logs_server_id_fkey;
alter table if exists public.tool_call_logs drop constraint if exists tool_call_logs_task_authorization_id_fkey;

alter table if exists public.tool_approval_requests add column if not exists decided_by uuid;
alter table if exists public.tool_approval_requests add column if not exists decision_reason text;
alter table if exists public.tool_approval_requests add column if not exists execution_claim_id text;

create table if not exists public.audit_legal_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  reason text not null,
  server_id uuid references public.mcp_servers(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  released_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.audit_legal_holds enable row level security;
drop policy if exists "audit legal holds are owned by users" on public.audit_legal_holds;
create policy "audit legal holds are owned by users" on public.audit_legal_holds for select using (auth.uid() = user_id);
create index if not exists idx_audit_legal_holds_active on public.audit_legal_holds(user_id, server_id, starts_at) where released_at is null;

create or replace function public.chain_tool_call_evidence() returns trigger
language plpgsql security definer set search_path = public as $$
declare prior_hash text; prior_sequence bigint; canonical jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('audit-chain:' || new.user_id::text, 7419));
  select event_hash, evidence_sequence into prior_hash, prior_sequence from public.tool_call_logs
    where user_id = new.user_id and event_hash is not null order by evidence_sequence desc nulls last limit 1;
  new.evidence_sequence := coalesce(prior_sequence, 0) + 1;
  new.previous_event_hash := prior_hash;
  canonical := jsonb_build_object(
    'id', new.id, 'user_id', new.user_id, 'server_id', new.server_id, 'tool_name', new.tool_name,
    'status', new.status, 'trace_id', new.trace_id, 'created_at', new.created_at,
    'agent_id', new.agent_id, 'task_id', new.task_id, 'purpose', new.purpose,
    'arguments_redacted', new.arguments_redacted, 'affected_resources', new.affected_resources,
    'effective_scopes', new.effective_scopes, 'policy_result', new.policy_result,
    'provider_result', new.provider_result, 'credential_refs', new.credential_refs,
    'approval_id', new.approval_id, 'approval_actor_id', new.approval_actor_id,
    'approval_decision', new.approval_decision, 'approval_decided_at', new.approval_decided_at,
    'approval_reason', new.approval_reason, 'execution_claim_id', new.execution_claim_id,
    'previous_event_hash', prior_hash, 'evidence_sequence', new.evidence_sequence
  );
  new.event_hash := encode(digest(convert_to(canonical::text, 'UTF8'), 'sha256'), 'hex');
  return new;
end $$;

drop trigger if exists tool_call_logs_chain_evidence on public.tool_call_logs;
create trigger tool_call_logs_chain_evidence before insert on public.tool_call_logs
for each row execute function public.chain_tool_call_evidence();

create or replace function public.protect_tool_call_evidence() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_setting('astrail.audit_retention', true) = 'allowed' then return old; end if;
  raise exception 'tool_call_logs are append-only; use the retention procedure';
end $$;
drop trigger if exists tool_call_logs_append_only on public.tool_call_logs;
create trigger tool_call_logs_append_only before update or delete on public.tool_call_logs
for each row execute function public.protect_tool_call_evidence();

create or replace function public.purge_audit_logs(p_user_id uuid, p_cutoff timestamptz, p_limit int default 100)
returns table(deleted_count int, held_count int) language plpgsql security definer set search_path = public as $$
declare deleted_rows int; held_rows int;
begin
  perform set_config('astrail.audit_retention', 'allowed', true);
  select count(*)::int into held_rows from public.tool_call_logs logs
    where logs.user_id = p_user_id and logs.created_at < p_cutoff and exists (
      select 1 from public.audit_legal_holds holds where holds.user_id = logs.user_id
        and holds.released_at is null and holds.starts_at <= logs.created_at
        and (holds.ends_at is null or holds.ends_at >= logs.created_at)
        and (holds.server_id is null or holds.server_id = logs.server_id)
    );
  with candidates as (
    select logs.id from public.tool_call_logs logs where logs.user_id = p_user_id and logs.created_at < p_cutoff
      and not exists (select 1 from public.audit_legal_holds holds where holds.user_id = logs.user_id
        and holds.released_at is null and holds.starts_at <= logs.created_at
        and (holds.ends_at is null or holds.ends_at >= logs.created_at)
        and (holds.server_id is null or holds.server_id = logs.server_id))
    order by logs.created_at asc limit least(greatest(p_limit, 1), 1000)
  ) delete from public.tool_call_logs logs using candidates where logs.id = candidates.id;
  get diagnostics deleted_rows = row_count;
  return query select deleted_rows, held_rows;
end $$;
revoke all on function public.purge_audit_logs(uuid,timestamptz,int) from public, anon, authenticated;
grant execute on function public.purge_audit_logs(uuid,timestamptz,int) to admin;

-- No application role may directly update or delete audit evidence.
revoke update, delete, truncate on public.tool_call_logs from anon, authenticated;
