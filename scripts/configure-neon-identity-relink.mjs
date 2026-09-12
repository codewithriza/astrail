#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.NEON_DATABASE_URL;
if (!url) throw new Error("NEON_DATABASE_URL is required.");
const authSql = await readFile(new URL("./neon/bootstrap-auth-compatibility.sql", import.meta.url), "utf8");
const identitySql = await readFile(new URL("./neon/identity-relink.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: url, application_name: "astrail-identity-relink-setup" });
try {
  await client.connect();
  await client.query(authSql);
  await client.query(identitySql);
  console.log("Neon identity relinking configured.");
} finally {
  await client.end();
}
