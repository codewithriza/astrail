import { createHash, randomBytes } from "crypto";
import { normalizeOAuthScopes } from "@/lib/credentials";
import { assertSafeUpstreamUrl, readBoundedResponseText } from "@/lib/runtime/network-policy";

export const CONNECT_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_OAUTH_TOKEN_RESPONSE_BYTES = 100_000;

export type AuthorizationCodeExchangeResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
};

export function generatePkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateConnectState() {
  return randomBytes(32).toString("base64url");
}

export function connectStateExpired(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= now;
}

export function buildAuthorizeUrl(input: {
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
  codeChallenge: string;
  extraParams?: Record<string, string>;
}) {
  const url = new URL(input.authorizationUrl);
  if (url.protocol !== "https:") {
    throw new Error("OAuth authorization URL must use HTTPS.");
  }
  for (const [key, value] of Object.entries(input.extraParams ?? {})) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  if (input.scopes.length > 0) url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeAuthorizationCode(
  input: {
    provider: string;
    tokenUrl: string;
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret?: string | null;
    tokenAuthMethod?: "client_secret_post" | "client_secret_basic" | null;
    codeVerifier: string;
    fallbackScopes?: string[];
  },
  fetcher: typeof fetch = fetch
): Promise<AuthorizationCodeExchangeResult> {
  const tokenUrl = new URL(input.tokenUrl);
  if (tokenUrl.protocol !== "https:") {
    throw new Error("OAuth token URL must be an HTTPS URL.");
  }
  await assertSafeUpstreamUrl(tokenUrl);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
  });
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  };
  if (input.clientSecret && input.tokenAuthMethod === "client_secret_basic") {
    headers.authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`;
  } else if (input.clientSecret) {
    body.set("client_secret", input.clientSecret);
  }

  const response = await fetcher(tokenUrl, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });

  const responseText = await readBoundedResponseText(response, MAX_OAUTH_TOKEN_RESPONSE_BYTES, "OAuth token response");
  let payload: Record<string, unknown> | null = null;
  try {
    payload = responseText.trim().startsWith("{")
      ? JSON.parse(responseText) as Record<string, unknown>
      : Object.fromEntries(new URLSearchParams(responseText).entries());
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || typeof payload.access_token !== "string" || payload.access_token.length > 8192) {
    const message = typeof payload?.error_description === "string"
      ? payload.error_description
      : typeof payload?.error === "string"
        ? payload.error
        : `OAuth code exchange failed for ${input.provider}.`;
    throw new Error(message);
  }

  const expiresIn = Number(payload.expires_in);
  if (typeof payload.refresh_token === "string" && payload.refresh_token.length > 8192) {
    throw new Error(`OAuth code exchange returned an oversized refresh token for ${input.provider}.`);
  }
  const scopes = normalizeOAuthScopes(payload.scope);
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
    scopes: scopes.length > 0 ? scopes : input.fallbackScopes ?? [],
  };
}
