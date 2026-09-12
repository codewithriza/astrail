create table if not exists billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  dodo_event_id text unique not null,
  event_type text not null default 'unknown',
  user_id uuid,
  event_created_at timestamptz,
  processing_result text not null default 'received',
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  dodo_customer_id text,
  dodo_subscription_id text,
  dodo_payment_id text,
  plan text not null,
  status text not null default 'unknown',
  entitlement_status text not null default 'inactive',
  paid_confirmed_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_payment_status text,
  last_payment_at timestamptz,
  dodo_last_event_id text,
  dodo_last_event_type text,
  dodo_last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists billing_payment_events (
  id uuid primary key default gen_random_uuid(),
  dodo_event_id text unique not null,
  dodo_payment_id text,
  user_id uuid,
  dodo_customer_id text,
  dodo_subscription_id text,
  plan text,
  status text not null default 'unknown',
  amount numeric,
  currency text,
  event_created_at timestamptz,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists billing_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  server_id uuid,
  tool_name text,
  usage_type text not null default 'tool_call',
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

alter table billing_webhook_events add column if not exists user_id uuid;
alter table billing_webhook_events add column if not exists event_created_at timestamptz;
alter table billing_webhook_events add column if not exists processing_result text not null default 'received';

alter table billing_subscriptions add column if not exists entitlement_status text not null default 'inactive';
alter table billing_subscriptions add column if not exists paid_confirmed_at timestamptz;
alter table billing_subscriptions add column if not exists last_payment_status text;
alter table billing_subscriptions add column if not exists last_payment_at timestamptz;
alter table billing_subscriptions add column if not exists dodo_last_event_id text;
alter table billing_subscriptions add column if not exists dodo_last_event_type text;
alter table billing_subscriptions add column if not exists dodo_last_event_at timestamptz;

create index if not exists billing_webhook_events_event_type_idx
  on billing_webhook_events (event_type);

create index if not exists billing_subscriptions_user_id_idx
  on billing_subscriptions (user_id);
create index if not exists billing_subscriptions_entitlement_idx
  on billing_subscriptions (user_id, entitlement_status, paid_confirmed_at);
create index if not exists billing_payment_events_user_created_at_idx
  on billing_payment_events (user_id, event_created_at desc);
create index if not exists billing_payment_events_payment_id_idx
  on billing_payment_events (dodo_payment_id);

create index if not exists billing_usage_user_id_created_at_idx
  on billing_usage (user_id, created_at desc);

create index if not exists tool_call_logs_user_id_created_at_idx
  on tool_call_logs (user_id, created_at desc);

alter table billing_webhook_events enable row level security;
alter table billing_subscriptions enable row level security;
alter table billing_payment_events enable row level security;
alter table billing_usage enable row level security;

drop policy if exists "Users can read own subscriptions" on billing_subscriptions;
create policy "Users can read own subscriptions"
  on billing_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read own billing payment events" on billing_payment_events;
create policy "Users can read own billing payment events"
  on billing_payment_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read own billing usage" on billing_usage;
create policy "Users can read own billing usage"
  on billing_usage for select
  using (auth.uid() = user_id);
