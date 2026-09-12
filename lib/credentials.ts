import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { assertSafeUpstreamUrl, readBoundedResponseText } from "@/lib/runtime/network-policy";

const ALGORITHM = "aes-256-gcm";
const OAUTH_EXPIRY_SKEW_MS = 60_000;

export type CredentialScheme = "bearer" | "api_key_header" | "api_key_query" | "oauth2";

export type OAuthCredentialInput = {
  provider: string;
  clientId?: string | null;
  clientSecret?: string | null;
  tokenUrl?: string | null;
  scopes?: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
};

export type OAuthRefreshInput = {
  provider: string;
  tokenUrl: string;
  clientId?: string | null;
  clientSecret?: string | null;
  tokenAuthMethod?: "client_secret_post" | "client_secret_basic" | null;
  refreshToken: string;
  scopes?: string[];
};

export type OAuthRefreshResult = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  scopes: string[];
};

// OAuth error codes that mean the stored grant is dead and re-consent is the
// only recovery. Retrying a refresh with the same token cannot succeed.
const PERMANENT_OAUTH_ERROR_CODES = new Set(["invalid_grant", "invalid_client", "unauthorized_client", "access_denied"]);

export class OAuthRefreshError extends Error {
  readonly permanent: boolean;
  readonly oauthErrorCode: string | null;

  constructor(message: string, options: { permanent?: boolean; oauthErrorCode?: string | null } = {}) {
    super(message);
    this.name = "OAuthRefreshError";
    this.permanent = options.permanent ?? false;
    this.oauthErrorCode = options.oauthErrorCode ?? null;
  }
}

export function hasCredentialEncryptionKey() {
  return Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY);
}

function encryptionKey() {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is required for credential storage.");
  }

  const key = raw.startsWith("base64:")
    ? Buffer.from(raw.slice("base64:".length), "base64")
    : Buffer.from(raw, "hex");

  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes.");
  }

  return key;
}

export function encryptCredential(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptCredential(ciphertext: string) {
  const [ivRaw, tagRaw, encryptedRaw] = ciphertext.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid credential ciphertext.");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function oauthCredentialExpired(expiresAt?: string | null, now = Date.now()) {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs - OAUTH_EXPIRY_SKEW_MS <= now;
}

export function normalizeOAuthScopes(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export async function refreshOAuthAccessToken(
  input: OAuthRefreshInput,
  fetcher: typeof fetch = fetch
): Promise<OAuthRefreshResult> {
  const tokenUrl = new URL(input.tokenUrl);
  if (tokenUrl.protocol !== "https:") {
    throw new Error("OAuth token URL must be an HTTPS URL.");
  }
  await assertSafeUpstreamUrl(tokenUrl);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  if (input.clientId) body.set("client_id", input.clientId);
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  };
  if (input.clientSecret && input.tokenAuthMethod === "client_secret_basic" && input.clientId) {
    headers.authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`;
  } else if (input.clientSecret) {
    body.set("client_secret", input.clientSecret);
  }
  if (input.scopes?.length) body.set("scope", input.scopes.join(" "));

  const response = await fetcher(tokenUrl, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });

  const responseText = await readBoundedResponseText(response, 100_000, "OAuth token response");
  let payload: Record<string, unknown> | null = null;
  try {
    payload = responseText.trim().startsWith("{")
      ? JSON.parse(responseText) as Record<string, unknown>
      : Object.fromEntries(new URLSearchParams(responseText).entries());
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || typeof payload.access_token !== "string" || payload.access_token.length > 8192) {
    const oauthErrorCode = typeof payload?.error === "string" ? payload.error : null;
    const message = typeof payload?.error_description === "string"
      ? payload.error_description
      : oauthErrorCode ?? `OAuth refresh failed for ${input.provider}.`;
    const permanent = (oauthErrorCode !== null && PERMANENT_OAUTH_ERROR_CODES.has(oauthErrorCode))
      || response.status === 401
      || response.status === 403;
    throw new OAuthRefreshError(message, { permanent, oauthErrorCode });
  }

  const expiresIn = Number(payload.expires_in);
  if (typeof payload.refresh_token === "string" && payload.refresh_token.length > 8192) {
    throw new OAuthRefreshError(`OAuth refresh returned an oversized refresh token for ${input.provider}.`, { permanent: false });
  }
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;
  const scopes = normalizeOAuthScopes(payload.scope).length > 0
    ? normalizeOAuthScopes(payload.scope)
    : input.scopes ?? [];

  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt,
    scopes,
  };
}

// One in-flight refresh per credential. Providers that rotate refresh tokens
// invalidate the old token on use, so two concurrent refreshes race and can
// permanently kill the grant; concurrent callers must share one exchange.
const inFlightRefreshes = new Map<string, Promise<OAuthRefreshResult>>();

export function refreshOAuthAccessTokenSingleFlight(
  key: string,
  input: OAuthRefreshInput,
  fetcher: typeof fetch = fetch
): Promise<OAuthRefreshResult> {
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;

  const pending = refreshOAuthAccessToken(input, fetcher).finally(() => {
    inFlightRefreshes.delete(key);
  });
  inFlightRefreshes.set(key, pending);
  return pending;
}

export function previewSecret(secret: string) {
  if (secret.length <= 8) return "****";
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
