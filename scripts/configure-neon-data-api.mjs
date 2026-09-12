#!/usr/bin/env node
import pg from "pg";

const url = process.env.NEON_DATABASE_URL;
if (!url) throw new Error("NEON_DATABASE_URL is required.");

const client = new pg.Client({ connectionString: url, application_name: "astrail-data-api-roles" });
try {
  await client.connect();
  if (process.argv.includes("--reset-managed-roles")) {
    await client.query(`
      grant authenticated to current_user;
      grant anon to current_user;
      drop owned by authenticated;
      drop role authenticated;
      drop owned by anon;
      drop role anon;
    `);
    console.log("Removed pre-created API roles so Neon can provision them.");
    process.exitCode = 0;
  } else {
  await client.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'admin') then create role admin nologin bypassrls; end if;
    end $$;

    grant usage on schema public, auth to anon, authenticated, admin;
    grant execute on function auth.uid() to anon, authenticated, admin;
    grant execute on function auth.role() to anon, authenticated, admin;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant all privileges on all tables in schema public to admin;
    grant all privileges on all sequences in schema public to admin;
    grant execute on all functions in schema public to admin;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    alter default privileges in schema public grant usage, select on sequences to authenticated;
    alter default privileges in schema public grant execute on functions to authenticated;
    alter default privileges in schema public grant all privileges on tables to admin;
    alter default privileges in schema public grant all privileges on sequences to admin;
    alter default privileges in schema public grant execute on functions to admin;
  `);
  const legacyRole = await client.query("select 1 from pg_roles where rolname='service_role'");
  if (legacyRole.rowCount) {
    await client.query("grant service_role to current_user; drop owned by service_role; drop role service_role");
  }
  console.log("Neon Data API roles and least-privilege grants configured.");
  }
} finally {
  await client.end();
}
