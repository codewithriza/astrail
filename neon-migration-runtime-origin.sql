-- Retire the unbound api.astrail.dev hostname from persisted MCP endpoints.
-- The application also normalizes these values at read/export time so this
-- migration can be deployed independently without breaking existing callers.

update public.mcp_servers
set hosted_endpoint = replace(hosted_endpoint, 'https://api.astrail.dev/', 'https://www.astrail.dev/')
where hosted_endpoint like 'https://api.astrail.dev/%';

update public.mcp_bundles
set hosted_endpoint = replace(hosted_endpoint, 'https://api.astrail.dev/', 'https://www.astrail.dev/')
where hosted_endpoint like 'https://api.astrail.dev/%';

notify pgrst, 'reload schema';
