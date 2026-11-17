-- P1 distributed reliability and provider lifecycle operations. Idempotent.
create table if not exists public.provider_reliability_state (
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null, credential_id uuid not null default '00000000-0000-0000-0000-000000000000',
  window_started_at timestamptz not null default now(), requests int not null default 0,
  queued int not null default 0, consecutive_failures int not null default 0,
  retry_budget_remaining int not null default 20,
  circuit_open_until timestamptz, updated_at timestamptz not null default now(),
  primary key (tenant_id, provider, credential_id)
);
create table if not exists public.reliability_metrics (
  id bigint generated always as identity primary key, tenant_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null, credential_id uuid references public.api_credentials(id) on delete set null,
  metric text not null check (metric in ('retry','throttle','queue','circuit','provider_error')),
  value int not null default 1, recorded_at timestamptz not null default now()
);
create index if not exists idx_reliability_metrics_tenant_time on public.reliability_metrics(tenant_id, recorded_at desc);
alter table public.reliability_metrics enable row level security;
drop policy if exists "reliability metrics are owned" on public.reliability_metrics;
create policy "reliability metrics are owned" on public.reliability_metrics for select using (auth.uid() = tenant_id);

create or replace function public.acquire_provider_permit(p_tenant_id uuid, p_provider text, p_credential_id uuid, p_deadline timestamptz)
returns table(allowed boolean, reason text, retry_at timestamptz, retry_after_ms int)
language plpgsql security definer set search_path=public as $$
declare s public.provider_reliability_state%rowtype; max_per_minute int := 120; max_queue int := 20;
begin
  if p_deadline <= now() then return query select false,'deadline'::text,null::timestamptz,0; return; end if;
  insert into public.provider_reliability_state(tenant_id,provider,credential_id) values(p_tenant_id,lower(p_provider),coalesce(p_credential_id,'00000000-0000-0000-0000-000000000000'))
  on conflict do nothing;
  select * into s from public.provider_reliability_state where tenant_id=p_tenant_id and provider=lower(p_provider) and credential_id=coalesce(p_credential_id,'00000000-0000-0000-0000-000000000000') for update;
  if s.circuit_open_until > now() then return query select false,'circuit_open',s.circuit_open_until,extract(epoch from (s.circuit_open_until-now()))::int*1000; return; end if;
  if s.window_started_at <= now()-interval '1 minute' then update public.provider_reliability_state set window_started_at=now(),requests=1,queued=0,retry_budget_remaining=20,updated_at=now() where tenant_id=p_tenant_id and provider=lower(p_provider) and credential_id=coalesce(p_credential_id,'00000000-0000-0000-0000-000000000000'); return query select true,'ready',null::timestamptz,0; return; end if;
  if s.requests < max_per_minute then update public.provider_reliability_state set requests=requests+1,queued=greatest(0,queued-1),updated_at=now() where tenant_id=p_tenant_id and provider=lower(p_provider) and credential_id=coalesce(p_credential_id,'00000000-0000-0000-0000-000000000000'); return query select true,'ready',null::timestamptz,0; return; end if;
  if s.queued >= max_queue then return query select false,'queue_full',s.window_started_at+interval '1 minute',0; return; end if;
  update public.provider_reliability_state set queued=queued+1,updated_at=now() where tenant_id=p_tenant_id and provider=lower(p_provider) and credential_id=coalesce(p_credential_id,'00000000-0000-0000-0000-000000000000');
  return query select false,'throttled',s.window_started_at+interval '1 minute',least(500,greatest(25,extract(epoch from (s.window_started_at+interval '1 minute'-now()))::int*1000));
end $$;

create or replace function public.consume_provider_retry_budget(p_tenant_id uuid,p_provider text,p_credential_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$ declare changed int; begin
 update public.provider_reliability_state set retry_budget_remaining=retry_budget_remaining-1,updated_at=now()
 where tenant_id=p_tenant_id and provider=lower(p_provider) and credential_id=coalesce(p_credential_id,'00000000-0000-0000-0000-000000000000') and retry_budget_remaining>0;
 get diagnostics changed=row_count; return changed=1;
end $$;
create or replace function public.record_provider_outcome(p_tenant_id uuid,p_provider text,p_credential_id uuid,p_success boolean)
returns void language plpgsql security definer set search_path=public as $$ begin
 update public.provider_reliability_state set consecutive_failures=case when p_success then 0 else consecutive_failures+1 end,
 circuit_open_until=case when p_success then null when consecutive_failures+1>=5 then now()+interval '30 seconds' else circuit_open_until end,updated_at=now()
 where tenant_id=p_tenant_id and provider=lower(p_provider) and credential_id=coalesce(p_credential_id,'00000000-0000-0000-0000-000000000000');
end $$;

create or replace function public.record_reliability_metric(p_tenant_id uuid,p_provider text,p_credential_id uuid,p_metric text,p_value int)
returns void language plpgsql security definer set search_path=public as $$ begin
  if p_metric not in ('retry','throttle','queue','circuit','provider_error') then raise exception 'invalid metric'; end if;
  insert into public.reliability_metrics(tenant_id,provider,credential_id,metric,value) values(p_tenant_id,lower(p_provider),p_credential_id,p_metric,least(1000,greatest(1,p_value)));
end $$;
revoke all on function public.acquire_provider_permit(uuid,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.record_reliability_metric(uuid,text,uuid,text,int) from public,anon,authenticated;
grant execute on function public.acquire_provider_permit(uuid,text,uuid,timestamptz) to admin;
grant execute on function public.record_reliability_metric(uuid,text,uuid,text,int) to admin;
revoke all on function public.consume_provider_retry_budget(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.record_provider_outcome(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.consume_provider_retry_budget(uuid,text,uuid) to admin;
grant execute on function public.record_provider_outcome(uuid,text,uuid,boolean) to admin;

alter table if exists public.api_credentials add column if not exists expected_scopes jsonb not null default '[]'::jsonb;
alter table if exists public.api_credentials add column if not exists consecutive_refresh_failures int not null default 0;
alter table if exists public.api_credentials add column if not exists health_status text not null default 'healthy';
alter table if exists public.api_credentials add column if not exists health_checked_at timestamptz;
alter table if exists public.api_credentials add column if not exists provider_revoked_at timestamptz;
alter table if exists public.api_credentials add column if not exists reconnect_reason text;
create table if not exists public.provider_alerts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 credential_id uuid references public.api_credentials(id) on delete cascade, severity text not null, code text not null,
 message text not null, resolved_at timestamptz, created_at timestamptz not null default now()
);
alter table public.provider_alerts enable row level security;
drop policy if exists "provider alerts are owned" on public.provider_alerts;
create policy "provider alerts are owned" on public.provider_alerts for select using(auth.uid()=user_id);
