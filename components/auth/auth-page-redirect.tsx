"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/neon/client";

type AuthPageRedirectProps = {
  redirectTo?: string;
  disabled?: boolean;
};

function safeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

function hasAuthCallbackPayload() {
  const url = new URL(window.location.href);
  if (
    url.searchParams.has("code")
    || url.searchParams.has("token_hash")
    || url.searchParams.has("neon_auth_session_verifier")
  ) return true;

  const hash = new URLSearchParams(window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash);

  return hash.has("access_token") || hash.has("refresh_token");
}

export function AuthPageRedirect({ redirectTo = "/dashboard", disabled = false }: AuthPageRedirectProps) {
  const router = useRouter();

  useEffect(() => {
    if (disabled || hasAuthCallbackPayload()) return;

    let cancelled = false;

    async function redirectSignedInUser() {
      try {
        const neon = createClient();
        const { data, error } = await neon.auth.getUser();
        if (!cancelled && !error && data.user) {
          router.replace(safeRedirectPath(redirectTo));
        }
      } catch {
        // Auth pages still need to render when public auth env is missing.
      }
    }

    void redirectSignedInUser();

    return () => {
      cancelled = true;
    };
  }, [disabled, redirectTo, router]);

  return null;
}
