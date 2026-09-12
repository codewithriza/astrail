import { NextResponse } from "next/server";

type TurnstileSiteverifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
};

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function cleanEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getTurnstileSiteKey() {
  return cleanEnv("NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY") || cleanEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
}

function getTurnstileSecretKey() {
  return cleanEnv("CLOUDFLARE_TURNSTILE_SECRET_KEY") || cleanEnv("TURNSTILE_SECRET_KEY");
}

function hasTurnstileSecretKey() {
  return Boolean(getTurnstileSecretKey());
}

export function isTurnstileConfigured() {
  return Boolean(getTurnstileSiteKey() && hasTurnstileSecretKey());
}

export function isTurnstileRequired() {
  return cleanEnv("CLOUDFLARE_TURNSTILE_REQUIRED") === "true" || hasTurnstileSecretKey();
}

export function getTurnstileRemoteIp(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || undefined;
}

export async function verifyTurnstileToken(token: string | null | undefined, remoteIp?: string, expectedAction?: string) {
  const secret = getTurnstileSecretKey();
  const siteKey = getTurnstileSiteKey();

  if (!isTurnstileRequired()) {
    return { ok: true as const, skipped: true as const };
  }

  if (!secret || !siteKey) {
    return {
      ok: false as const,
      status: 503,
      error: "Cloudflare Turnstile is required but not configured.",
    };
  }

  if (!token) {
    return {
      ok: false as const,
      status: 403,
      error: "Complete the Cloudflare challenge before continuing.",
    };
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const result = (await response.json()) as TurnstileSiteverifyResponse;
    if (response.ok && result.success && (!expectedAction || result.action === expectedAction)) {
      return { ok: true as const, skipped: false as const };
    }

    return {
      ok: false as const,
      status: 403,
      error: expectedAction && result.success
        ? "Cloudflare challenge action did not match this request."
        : "Cloudflare challenge failed. Refresh the challenge and try again.",
      codes: expectedAction && result.success
        ? ["action-mismatch"]
        : result["error-codes"] ?? [],
    };
  } catch {
    return {
      ok: false as const,
      status: 502,
      error: "Could not verify the Cloudflare challenge.",
    };
  }
}

export async function requireTurnstile(request: Request, token: string | null | undefined, expectedAction?: string) {
  const result = await verifyTurnstileToken(token, getTurnstileRemoteIp(request), expectedAction);
  if (result.ok) return null;

  return NextResponse.json({
    error: result.error,
    turnstile: {
      required: true,
      configured: isTurnstileConfigured(),
      codes: result.codes ?? [],
    },
  }, { status: result.status });
}
