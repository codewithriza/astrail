import { createPublicKey, verify } from "node:crypto";
import { assertSafeUpstreamUrl, readBoundedResponseText } from "./runtime/network-policy";

export type AuthorizationServerMetadata = { issuer: string; jwks_uri: string; authorization_endpoint: string; token_endpoint: string; code_challenge_methods_supported?: string[]; grant_types_supported?: string[]; registration_endpoint?: string };
const cache = new Map<string, { value: unknown; expires: number }>();
function configuredIssuer() { return process.env.MCP_AUTHORIZATION_SERVER_ISSUER?.replace(/\/$/, "") ?? null; }
export function mcpResourceIdentifier(origin: string) { return process.env.MCP_RESOURCE_IDENTIFIER?.replace(/\/$/, "") ?? `${origin.replace(/\/$/, "")}/api/mcp`; }
export function protectedResourceMetadata(origin: string) {
  const issuer = configuredIssuer();
  if (!issuer) return null;
  return { resource: mcpResourceIdentifier(origin), resource_name: "Astrail MCP Runtime", authorization_servers: [issuer], scopes_supported: (process.env.MCP_SCOPES_SUPPORTED ?? "mcp:tools").split(/[ ,]+/).filter(Boolean), bearer_methods_supported: ["header"], resource_documentation: `${origin}/docs` };
}
export function bearerChallenge(origin: string, error?: string, description?: string) {
  const metadata = `${origin}/.well-known/oauth-protected-resource`;
  const safe = (value: string) => value.replace(/["\\\r\n]/g, " ").slice(0, 160);
  return `Bearer realm="astrail-mcp", resource_metadata="${metadata}"${error ? `, error="${safe(error)}"` : ""}${description ? `, error_description="${safe(description)}"` : ""}`;
}
async function json(url: string) {
  const hit = cache.get(url); if (hit && hit.expires > Date.now()) return hit.value;
  const parsed = new URL(url); if (parsed.protocol !== "https:") throw new Error("OAuth metadata must use HTTPS.");
  await assertSafeUpstreamUrl(parsed); const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  const text = await readBoundedResponseText(response, 256_000, "OAuth metadata"); if (!response.ok) throw new Error("OAuth metadata discovery failed.");
  const value = JSON.parse(text); cache.set(url, { value, expires: Date.now() + 300_000 }); return value;
}
export async function discoverAuthorizationServer(): Promise<AuthorizationServerMetadata> {
  const issuer = configuredIssuer(); if (!issuer) throw new Error("MCP authorization server is not configured.");
  const issuerUrl = new URL(issuer); const issuerPath = issuerUrl.pathname === "/" ? "" : issuerUrl.pathname.replace(/\/$/, "");
  const candidates = [`${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerPath}`, `${issuerUrl.origin}/.well-known/openid-configuration${issuerPath}`];
  let metadata: AuthorizationServerMetadata | null = null;
  for (const candidate of candidates) { try { metadata = await json(candidate) as AuthorizationServerMetadata; break; } catch {} }
  if (!metadata) throw new Error("Authorization-server metadata unavailable.");
  validateAuthorizationServerMetadata(metadata, issuer);
  return metadata;
}
export function validateAuthorizationServerMetadata(metadata: AuthorizationServerMetadata, issuer: string) {
  if (metadata.issuer !== issuer) throw new Error("Authorization-server issuer mismatch.");
  for (const endpoint of [metadata.jwks_uri, metadata.authorization_endpoint, metadata.token_endpoint]) {
    const url = new URL(endpoint); if (url.protocol !== "https:" || url.origin !== new URL(issuer).origin) throw new Error("Authorization-server metadata host mismatch.");
  }
  if (!metadata.code_challenge_methods_supported?.includes("S256")) throw new Error("Authorization server does not advertise S256 PKCE.");
  if (metadata.grant_types_supported && !metadata.grant_types_supported.includes("authorization_code")) throw new Error("Authorization server does not support authorization_code.");
}
function decode(value: string) { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>; }
export async function validateMcpAccessToken(token: string, origin: string) {
  const parts = token.split("."); if (parts.length !== 3) throw new Error("Opaque tokens require configured introspection; JWT expected.");
  const header = decode(parts[0]), claims = decode(parts[1]); const metadata = await discoverAuthorizationServer();
  validateTokenEnvelopeClaims(claims, metadata.issuer, mcpResourceIdentifier(origin));
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported token signature.");
  const jwks = await json(metadata.jwks_uri) as { keys?: Array<Record<string, unknown>> }; const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.alg === "RS256"); if (!jwk) throw new Error("Signing key not found.");
  const valid = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk as import("node:crypto").JsonWebKey, format: "jwk" }), Buffer.from(parts[2], "base64url")); if (!valid) throw new Error("Invalid token signature.");
  return claims;
}
export function validateTokenEnvelopeClaims(claims: Record<string,unknown>,issuer:string,resource:string,now=Date.now()){
  if(claims.iss!==issuer)throw new Error("Token issuer mismatch.");
  const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];if(audience.length!==1||audience[0]!==resource)throw new Error("Token audience mismatch.");
  if(typeof claims.exp!=="number"||claims.exp*1000<=now)throw new Error("Token expired.");
  if(typeof claims.nbf==="number"&&claims.nbf*1000>now+30_000)throw new Error("Token not active.");
}
export function validateMcpTokenClaims(claims: Record<string, unknown>, tenantId: string) {
  const tenantClaim = process.env.MCP_TENANT_CLAIM ?? "astrail_tenant_id";
  if (claims[tenantClaim] !== tenantId) throw new Error("Token tenant mismatch.");
  if (typeof claims.sub !== "string" || !claims.sub.trim() || claims.sub.length > 256) throw new Error("Token subject missing.");
  const scope = typeof claims.scope === "string" ? claims.scope.split(/\s+/).filter(Boolean) : [];
  if (!scope.includes("mcp:tools")) throw new Error("Token scope insufficient.");
  return { subject: claims.sub, scopes: scope, clientId: typeof claims.client_id === "string" ? claims.client_id : null };
}
export function clearMcpOAuthCacheForTests() { cache.clear(); }
