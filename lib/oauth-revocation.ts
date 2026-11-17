import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { resolveSafeUpstreamAddresses, readBoundedResponseText } from "@/lib/runtime/network-policy";

const MAX_REVOCATION_RESPONSE_BYTES = 64_000;

export type OAuthRevocationCredential = {
  provider: string | null;
  revocationUrl: string | null;
  tokenUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  tokenAuthMethod: "client_secret_post" | "client_secret_basic" | null;
  accessToken: string | null;
  refreshToken: string | null;
};

export type OAuthRevocationResult = {
  provider: string;
  endpoint: string;
  tokenType: "access_token" | "refresh_token";
  alreadyInactive: boolean;
};

function providerKey(value: string | null | undefined) {
  return (value ?? "oauth").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function pinnedLookup(address: string): LookupFunction {
  return (_hostname, options, callback) => {
    const family = isIP(address);
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

export function inferredOAuthRevocationUrl(provider: string | null | undefined, tokenUrl?: string | null, clientId?: string | null) {
  const key = providerKey(provider);
  if (key === "google") return "https://oauth2.googleapis.com/revoke";
  if (key === "slack") return "https://slack.com/api/auth.revoke";
  if (key === "github" && clientId) return `https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`;
  if (key === "hubspot") return "https://api.hubapi.com/oauth/2026-03/token/revoke";
  if (key === "salesforce" && tokenUrl) {
    try {
      const tokenEndpoint = new URL(tokenUrl);
      const hostname = tokenEndpoint.hostname.toLowerCase();
      if (hostname !== "login.salesforce.com" && !hostname.endsWith(".salesforce.com")) return null;
      return new URL("/services/oauth2/revoke", tokenEndpoint).toString();
    } catch {
      return null;
    }
  }
  return null;
}

function safeMessage(response: Response, fallback: string) {
  return `${fallback} (HTTP ${response.status}).`;
}

async function parsedResponse(response: Response) {
  const text = await readBoundedResponseText(response, MAX_REVOCATION_RESPONSE_BYTES, "OAuth revocation response");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function revokeOAuthGrant(
  credential: OAuthRevocationCredential,
  fetcher?: typeof fetch,
): Promise<OAuthRevocationResult> {
  const provider = providerKey(credential.provider);
  const endpointValue = credential.revocationUrl
    ?? inferredOAuthRevocationUrl(credential.provider, credential.tokenUrl, credential.clientId);
  if (!endpointValue) {
    throw new Error("This OAuth provider has no trusted revocation endpoint. Reconnect it from provider metadata that declares x-astrail-revocation-url.");
  }

  const endpoint = new URL(endpointValue);
  if (endpoint.protocol !== "https:") throw new Error("OAuth revocation endpoint must use HTTPS.");
  const safeAddresses = await resolveSafeUpstreamAddresses(endpoint);

  const accessToken = credential.accessToken;
  const refreshToken = credential.refreshToken;
  const token = provider === "github" || provider === "slack"
    ? accessToken
    : refreshToken ?? accessToken;
  const tokenType: OAuthRevocationResult["tokenType"] = token && token === refreshToken ? "refresh_token" : "access_token";
  if (!token) return { provider, endpoint: endpoint.origin + endpoint.pathname, tokenType, alreadyInactive: true };

  let response: Response;
  if (provider === "github") {
    if (!credential.clientId || !credential.clientSecret) throw new Error("GitHub revocation requires the OAuth client ID and client secret.");
    response = await sendRevocationRequest(endpoint, {
      method: "DELETE",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Basic ${Buffer.from(`${credential.clientId}:${credential.clientSecret}`).toString("base64")}`,
        "content-type": "application/json",
        "user-agent": "Astrail/0.3.1 (+https://astrail.dev)",
        "x-github-api-version": "2026-03-10",
      },
      body: JSON.stringify({ access_token: token }),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    }, safeAddresses, fetcher);
  } else if (provider === "slack") {
    response = await sendRevocationRequest(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    }, safeAddresses, fetcher);
  } else {
    const body = new URLSearchParams({ token, token_type_hint: tokenType });
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/x-www-form-urlencoded" };
    if (provider === "hubspot") {
      if (!credential.clientId || !credential.clientSecret) throw new Error("HubSpot revocation requires the OAuth client ID and client secret.");
      body.set("client_id", credential.clientId);
      body.set("client_secret", credential.clientSecret);
    } else if (credential.clientSecret && credential.clientId && credential.tokenAuthMethod === "client_secret_basic") {
      headers.authorization = `Basic ${Buffer.from(`${credential.clientId}:${credential.clientSecret}`).toString("base64")}`;
    } else if (credential.clientSecret && credential.clientId && provider !== "google" && provider !== "salesforce") {
      body.set("client_id", credential.clientId);
      body.set("client_secret", credential.clientSecret);
    } else if (credential.clientId && provider !== "google" && provider !== "salesforce") {
      body.set("client_id", credential.clientId);
    }
    response = await sendRevocationRequest(endpoint, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    }, safeAddresses, fetcher);
  }

  const payload = await parsedResponse(response);
  const knownMissingGrant = response.status === 404 && (provider === "github" || provider === "hubspot");
  const alreadyInactive = payload?.error === "invalid_token" || payload?.error === "token_revoked" || knownMissingGrant;
  const slackSucceeded = provider !== "slack" || payload?.ok === true || payload?.error === "token_revoked";
  if ((!response.ok && !alreadyInactive) || !slackSucceeded) {
    throw new Error(safeMessage(response, `${credential.provider ?? "OAuth"} rejected the revocation request`));
  }

  return {
    provider,
    endpoint: endpoint.origin + endpoint.pathname,
    tokenType,
    alreadyInactive,
  };
}

async function sendRevocationRequest(
  endpoint: URL,
  init: RequestInit,
  safeAddresses: string[],
  fetcher?: typeof fetch,
) {
  if (fetcher) return fetcher(endpoint, init);
  if (!safeAddresses.length) throw new Error("OAuth revocation endpoint did not resolve to a public address.");
  const headers = new Headers(init.headers);
  const body = init.body instanceof URLSearchParams ? init.body.toString() : typeof init.body === "string" ? init.body : "";
  if (body && !headers.has("content-length")) headers.set("content-length", String(Buffer.byteLength(body)));
  const timeoutMs = Math.max(1_000, Math.floor(15_000 / safeAddresses.length));
  let lastError: unknown = new Error("OAuth revocation endpoint was unreachable.");
  for (const address of safeAddresses) {
    try {
      return await sendPinnedRevocationRequest(endpoint, init, address, headers, body, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function sendPinnedRevocationRequest(endpoint: URL, init: RequestInit, address: string, headers: Headers, body: string, timeoutMs: number) {
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(endpoint, {
      method: init.method ?? "GET",
      headers: Object.fromEntries(headers.entries()),
      lookup: pinnedLookup(address),
      timeout: timeoutMs,
    }, (incoming) => {
      const contentLength = Number(incoming.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > MAX_REVOCATION_RESPONSE_BYTES) {
        incoming.destroy();
        reject(new Error("OAuth revocation response exceeded 64000 bytes."));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_REVOCATION_RESPONSE_BYTES) {
          incoming.destroy(new Error("OAuth revocation response exceeded 64000 bytes."));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
          else if (value !== undefined) responseHeaders.set(name, String(value));
        }
        const status = incoming.statusCode ?? 502;
        const responseBody = status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks);
        resolve(new Response(responseBody, { status, headers: responseHeaders }));
      });
      incoming.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("OAuth revocation request timed out.")));
    request.on("error", reject);
    const abort = () => request.destroy(new Error("OAuth revocation request aborted."));
    if (init.signal) {
      if (init.signal.aborted) abort();
      else init.signal.addEventListener("abort", abort, { once: true });
    }
    request.on("close", () => init.signal?.removeEventListener("abort", abort));
    if (body) request.write(body);
    request.end();
  });
}
