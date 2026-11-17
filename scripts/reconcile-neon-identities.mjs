#!/usr/bin/env node
import pg from "pg";

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set NEON_DATABASE_URL or DATABASE_URL.");

const client = new pg.Client({ connectionString, application_name: "astrail-identity-reconcile" });
await client.connect();
try {
  const result = await client.query(`
    select public.link_neon_identity(id::uuid, email) as relinked
    from neon_auth."user"
    where email is not null
  `);
  console.log(JSON.stringify({ users_reconciled: result.rowCount, legacy_profiles_relinked: result.rows.filter((row) => row.relinked).length }));
} finally {
  await client.end();
}
