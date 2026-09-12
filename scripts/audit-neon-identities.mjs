#!/usr/bin/env node
import pg from "pg";

const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("NEON_DATABASE_URL or DATABASE_URL is required.");
const client = new pg.Client({ connectionString: url, application_name: "astrail-identity-audit" });
try {
  await client.connect();
  const legacy = await client.query("select count(*)::int count from auth.users");
  const neon = await client.query('select count(*)::int count from neon_auth."user"');
  const matched = await client.query('select count(*)::int count from auth.users old join neon_auth."user" fresh on lower(old.email)=lower(fresh.email)');
  const references = await client.query(`select tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.constraint_schema=tc.constraint_schema
      join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
      where tc.constraint_type='FOREIGN KEY' and ccu.table_schema='public' and ccu.table_name='profiles'
      order by tc.table_name, kcu.column_name`);
  console.log(JSON.stringify({
    legacy_users: legacy.rows[0].count,
    neon_users: neon.rows[0].count,
    email_matches: matched.rows[0].count,
    profile_references: references.rows,
  }, null, 2));
} finally {
  await client.end();
}
