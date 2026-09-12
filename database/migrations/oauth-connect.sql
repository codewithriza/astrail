-- Hosted OAuth connect flow + per-end-user credential scoping.
-- Adds authorization-code-flow bookkeeping columns and an end-user identity
-- column to api_credentials. Safe to run repeatedly.

alter table if exists public.api_credentials add column if not exists authorization_url text;
alter table if exists public.api_credentials add column if not exists connect_status text not null default 'active';
alter table if exists public.api_credentials add column if not exists connect_state text;
alter table if exists public.api_credentials add column if not exists connect_state_expires_at timestamptz;
alter table if exists public.api_credentials add column if not exists pkce_verifier_ciphertext text;
alter table if exists public.api_credentials add column if not exists end_user_id text;
alter table if exists public.api_credentials add column if not exists security_scheme text;
alter table if exists public.api_credentials add column if not exists security_binding text;
alter table if exists public.api_credentials add column if not exists token_auth_method text not null default 'client_secret_post';

-- connect_state is a single-use random token; unique lookup during the callback.
create unique index if not exists api_credentials_connect_state_key
  on public.api_credentials (connect_state)
  where connect_state is not null;

-- Runtime lookup path: credentials for a server scoped to a calling end user.
create index if not exists api_credentials_server_end_user_idx
  on public.api_credentials (server_id, end_user_id);
create index if not exists api_credentials_server_identity_scheme_idx
  on public.api_credentials (server_id, end_user_id, security_scheme);
create index if not exists api_credentials_server_identity_binding_idx
  on public.api_credentials (server_id, end_user_id, security_scheme, security_binding);
