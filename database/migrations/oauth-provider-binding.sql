-- Bind each encrypted OAuth grant to the exact OpenAPI security scheme it may satisfy.
-- Safe to run repeatedly.

alter table if exists public.api_credentials add column if not exists security_scheme text;
alter table if exists public.api_credentials add column if not exists security_binding text;

create index if not exists api_credentials_server_identity_scheme_idx
  on public.api_credentials (server_id, end_user_id, security_scheme);
create index if not exists api_credentials_server_identity_binding_idx
  on public.api_credentials (server_id, end_user_id, security_scheme, security_binding);
