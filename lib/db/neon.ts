import { neon, Pool } from "@neondatabase/serverless";

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
}

/** Use for single, non-interactive queries in serverless request handlers. */
export function createNeonSql() {
  return neon(databaseUrl());
}

/** Use for transactions and PostgreSQL functions that require one session. */
export function createNeonPool() {
  return new Pool({ connectionString: databaseUrl(), max: 5 });
}

export function hasNeonDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export async function checkNeonDatabase() {
  const sql = createNeonSql();
  const [result] = await sql`select current_database() as database, current_user as role, now() as checked_at`;
  return result;
}
