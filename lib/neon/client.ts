"use client";

import { createClient as createNeonClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import { getBrowserNeonConfig } from "@/lib/neon/env";

export function createClient() {
  const { dataApiUrl } = getBrowserNeonConfig();
  if (!dataApiUrl) throw new Error("Neon is not configured.");

  const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  return createNeonClient({
    auth: {
      url: `${origin}/api/auth`,
      adapter: SupabaseAuthAdapter(),
    },
    dataApi: { url: dataApiUrl },
  });
}
