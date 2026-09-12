#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set NEON_DATABASE_URL or DATABASE_URL.");

const client = new pg.Client({ connectionString, application_name: "astrail-schema-apply" });
await client.connect();
try {
  const schema = await readFile(new URL("../neon-schema.sql", import.meta.url), "utf8");
  const workspaceSchema = await readFile(new URL("../neon-migration-cli-workspaces.sql", import.meta.url), "utf8");
  await client.query("begin");
  await client.query(schema);
  await client.query(workspaceSchema);
  await client.query("commit");
  console.log("Neon schema applied atomically.");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
