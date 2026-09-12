-- Neon Auth identity mirror used to preserve Astrail's UUID foreign keys and
-- RLS policies while legacy users reauthenticate and link their profiles.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  )
$$;

create or replace function auth.user_id()
returns uuid
language sql
stable
as $$ select auth.uid() $$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
    nullif(current_setting('role', true), ''),
    'anon'
  )
$$;

revoke all on schema auth from public;
revoke all on auth.users from public;
grant usage on schema auth to public;
grant execute on function auth.uid() to public;
grant execute on function auth.user_id() to public;
grant execute on function auth.role() to public;
