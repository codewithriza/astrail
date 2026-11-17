#!/usr/bin/env node
import pg from "pg";

const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set NEON_DATABASE_URL or DATABASE_URL.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, application_name: "astrail-neon-verifier" });
try {
  await client.connect();
  const database = await client.query("select current_database() database, current_user role, version()");
  const tables = await client.query("select count(*)::int count from pg_tables where schemaname='public'");
  const auth = await client.query("select to_regclass('auth.users') is not null as users, to_regprocedure('auth.uid()') is not null as uid");
  const invalidIndexes = await client.query("select indexrelid::regclass::text name from pg_index where not indisvalid");
  const unvalidatedConstraints = await client.query("select conname from pg_constraint where not convalidated");
  if (!auth.rows[0].users || !auth.rows[0].uid) throw new Error("Neon Auth identity compatibility objects are missing.");
  if (invalidIndexes.rowCount) throw new Error("Invalid indexes: " + invalidIndexes.rows.map((row) => row.name).join(", "));
  if (unvalidatedConstraints.rowCount) throw new Error("Unvalidated constraints: " + unvalidatedConstraints.rows.map((row) => row.conname).join(", "));
  console.log(JSON.stringify({ ...database.rows[0], public_tables: tables.rows[0].count, status: "ready" }, null, 2));
} finally {
  await client.end();
}
