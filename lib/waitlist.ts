import { createAdminClient } from "@/lib/neon/server";

export type WaitlistInsert = { email: string };

export function isNeonConfigured() {
  return Boolean(
    (process.env.NEON_DATA_API_URL ?? process.env.NEXT_PUBLIC_NEON_DATA_API_URL)
      && (process.env.NEON_DATA_API_KEY || process.env.NEON_AUTH_BASE_URL),
  );
}

export function getWaitlistTable() {
  return process.env.NEON_WAITLIST_TABLE || "waitlist";
}

export function createNeonAdmin() {
  return createAdminClient();
}
