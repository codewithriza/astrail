import {
  decryptCredential,
  encryptCredential,
  hasCredentialEncryptionKey,
  OAuthRefreshError,
  oauthCredentialExpired,
  refreshOAuthAccessTokenSingleFlight,
} from "../credentials";
import { createHash, randomUUID } from "crypto";
import { localDemoUserId } from "../local-demo";
import { createAdminClient, hasServiceRoleKey } from "../neon/server";
import type { McpServer, McpTool, OpenApiEndpoint } from "../types";
import { writeStructuredLog } from "./observability";
import {
  findEndpointForTool,
  hasSecurityRequirement,
  type RuntimeCredential,
} from "./execute-tool";
import { evaluateOAuthScopeGrant, hasAmbiguousScopedSecurityRequirement, hasIncompleteSecuritySchemeMetadata, hasOAuthSecurityRequirement, oauthSecurityBinding, oauthSecuritySchemeNames } from "./oauth-security";
import { oauthRefreshDue, tokenLifetime } from "./token-lifecycle";

export type CredentialRow = {
  id: string;
  name: string;
  auth_scheme: RuntimeCredential["scheme"];
  provider: string | null;
  security_scheme?: string | null;
  security_binding?: string | null;
  client_id: string | null;
  client_secret_ciphertext: string | null;
  token_auth_method: "client_secret_post" | "client_secret_basic" | null;
  injection_name: string | null;
  scopes: unknown;
  secret_ciphertext: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_url: string | null;
  expires_at: string | null;
  issued_at?: string | null;
  original_ttl_seconds?: number | null;
  refresh_generation?: number | null;
  consecutive_refresh_failures?: number | null;
  connect_status?: string | null;
  revocation_status?: string | null;
  revocation_attempted_at?: string | null;
  end_user_id?: string | null;
  updated_at?: string | null;
};

export type CredentialLoadOptions = {
  endUserId?: string | null;
};

export type CredentialLoadFailure = {
  code: "reauth_required" | "refresh_failed" | "refresh_unavailable" | "insufficient_scope" | "credential_backend_unavailable";
  provider: string | null;
  message: string;
  requiredScopes?: string[];
  missingScopes?: string[];
};

export type CredentialLoadResult = {
  credential: RuntimeCredential | null;
  failure: CredentialLoadFailure | null;
};

const LEGACY_CREDENTIAL_COLUMNS = "id,name,auth_scheme,provider,client_id,client_secret_ciphertext,injection_name,scopes,secret_ciphertext,access_token_ciphertext,refresh_token_ciphertext,token_url,expires_at,updated_at";
const BASE_CREDENTIAL_COLUMNS = `${LEGACY_CREDENTIAL_COLUMNS},token_auth_method`;
const CONNECT_CREDENTIAL_COLUMNS = `${BASE_CREDENTIAL_COLUMNS},connect_status,end_user_id`;
const BOUND_CREDENTIAL_COLUMNS = `${CONNECT_CREDENTIAL_COLUMNS},security_scheme,security_binding`;
const AUDITED_CREDENTIAL_COLUMNS = `${BOUND_CREDENTIAL_COLUMNS},revocation_status,revocation_attempted_at,issued_at,original_ttl_seconds,refresh_generation,last_refresh_status,consecutive_refresh_failures`;
const CREDENTIAL_FETCH_LIMIT = 24;

export function credentialColumnSet(schema: "audited" | "bound" | "connect" | "base" | "legacy") {
  if (schema === "audited") return AUDITED_CREDENTIAL_COLUMNS;
  if (schema === "bound") return BOUND_CREDENTIAL_COLUMNS;
  if (schema === "connect") return CONNECT_CREDENTIAL_COLUMNS;
  if (schema === "base") return BASE_CREDENTIAL_COLUMNS;
  return LEGACY_CREDENTIAL_COLUMNS;
}

export function normalizeEndUserId(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256) return null;
  return trimmed;
}

function credentialAuditRef(credential: CredentialRow) {
  return {
    id: credential.id,
    name: credential.name || "Provider connection",
    provider: credential.provider,
    end_user_id: normalizeEndUserId(credential.end_user_id),
    auth_scheme: credential.auth_scheme,
  };
}

export function pickCredential(
  rows: CredentialRow[],
  requiresOAuth: boolean,
  endUserId: string | null,
  requiredSecuritySchemes: string[] = [],
  endpoint?: OpenApiEndpoint,
) {
  const active = rows.filter((item) => !item.revocation_status && ["active", "reauth_required"].includes(item.connect_status ?? "active"));
  const schemeMatches = (item: CredentialRow) =>
    requiresOAuth ? item.auth_scheme === "oauth2" : item.auth_scheme !== "oauth2";
  const endUserCredentials = active.filter((item) => item.end_user_id === endUserId);
  const workspaceCredentials = active.filter((item) => !item.end_user_id);
  // Never collapse an authenticated end user into a workspace-wide OAuth identity.
  // Shared non-OAuth credentials remain a valid fallback for service integrations.
  const pools = endUserId
    ? requiresOAuth ? [endUserCredentials] : [endUserCredentials, workspaceCredentials]
    : [workspaceCredentials];
  for (const pool of pools) {
    const schemePool = pool.filter(schemeMatches);
    if (requiresOAuth && requiredSecuritySchemes.length > 0) {
      const exact = schemePool.filter((item) => item.security_scheme
        && requiredSecuritySchemes.includes(item.security_scheme)
        && (!endpoint || item.security_binding === oauthSecurityBinding(endpoint, item.security_scheme)));
      const usable = exact.filter((item) => (item.connect_status ?? "active") === "active");
      if (endpoint) {
        const scopeSatisfying = usable.find((item) =>
          evaluateOAuthScopeGrant(endpoint, item.scopes, item.security_scheme).allowed
        );
        if (scopeSatisfying) return scopeSatisfying;
      }
      if (usable[0]) return usable[0];
      if (exact[0]) return exact[0];
      continue;
    }
    const match = schemePool[0];
    if (match) return match;
  }
  return null;
}

async function markCredentialReauthRequired(admin: ReturnType<typeof createAdminClient>, credential: CredentialRow, userId: string, refreshLeaseId?: string | null) {
  try {
    let query = admin.from("api_credentials").update({
      connect_status: "reauth_required",
      refresh_lease_id: null,
      refresh_lease_until: null,
      updated_at: new Date().toISOString(),
    }).eq("id", credential.id).eq("user_id", userId);
    if (refreshLeaseId) query = query.eq("refresh_lease_id", refreshLeaseId);
    const result = await query;
    if (result.error?.message.includes("column")) {
      await admin.from("api_credentials").update({
        connect_status: "reauth_required",
        updated_at: new Date().toISOString(),
      }).eq("id", credential.id).eq("user_id", userId);
    }
  } catch {
    // Best-effort status flip; the failure result below already signals re-auth.
  }
}

type RefreshLease = { supported: boolean; leaseId: string | null; generation: number };

async function claimRefreshLease(admin: ReturnType<typeof createAdminClient>, credentialId: string, userId: string): Promise<Omit<RefreshLease, "generation">> {
  const leaseId = randomUUID();
  const now = new Date().toISOString();
  const until = new Date(Date.now() + 60_000).toISOString();
  const leasePayload = {
    refresh_lease_id: leaseId,
    refresh_lease_until: until,
    updated_at: now,
  };
  let { data, error } = await admin.from("api_credentials").update(leasePayload).eq("id", credentialId).eq("user_id", userId)
    .is("revocation_status", null)
    .or(`refresh_lease_until.is.null,refresh_lease_until.lt.${now}`)
    .select("id").maybeSingle();
  if (error?.message.includes("column")) {
    ({ data, error } = await admin.from("api_credentials").update(leasePayload).eq("id", credentialId).eq("user_id", userId)
      .or(`refresh_lease_until.is.null,refresh_lease_until.lt.${now}`)
      .select("id").maybeSingle());
    if (error?.message.includes("column")) return { supported: false, leaseId: null };
  }
  if (error) return { supported: true, leaseId: null };
  return { supported: true, leaseId: data ? leaseId : null };
}

async function claimAtomicRefreshLease(admin: ReturnType<typeof createAdminClient>, credential: CredentialRow, userId: string): Promise<RefreshLease | null> {
  const leaseId = randomUUID();
  const generation = Number(credential.refresh_generation ?? 0);
  let data: unknown;
  let error: { message: string } | null = null;
  try {
    ({ data, error } = await admin.rpc("claim_oauth_refresh", {
      p_credential_id: credential.id, p_user_id: userId, p_expected_generation: generation,
      p_lease_id: leaseId, p_lease_until: new Date(Date.now() + 60_000).toISOString(),
    }));
  } catch { return null; }
  if (error?.message.includes("claim_oauth_refresh")) return null;
  if (error) return { supported: true, leaseId: null, generation };
  const row = Array.isArray(data) ? data[0] : data;
  return { supported: true, leaseId: row?.claimed ? leaseId : null, generation };
}

async function recordLifecycle(admin: ReturnType<typeof createAdminClient>, server: McpServer, credential: CredentialRow, eventType: string, outcome: string, peerReused = false, detail: Record<string, unknown> = {}) {
  try {
    await admin.from("oauth_lifecycle_events").insert({
      user_id: server.user_id, server_id: server.id, credential_id: credential.id,
      provider: credential.provider, event_type: eventType, generation: credential.refresh_generation ?? 0,
      outcome, peer_reused: peerReused, detail,
    });
  } catch { /* Audit storage must not break provider execution. */ }
}

async function refreshedByPeer(admin: ReturnType<typeof createAdminClient>, credentialId: string, userId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    let { data, error } = await admin.from("api_credentials")
      .select("access_token_ciphertext,secret_ciphertext,expires_at,connect_status,revocation_status,scopes,updated_at")
      .eq("id", credentialId).eq("user_id", userId).maybeSingle();
    if (error?.message.includes("column")) {
      ({ data } = await admin.from("api_credentials")
        .select("access_token_ciphertext,secret_ciphertext,expires_at,connect_status,scopes,updated_at")
        .eq("id", credentialId).eq("user_id", userId).maybeSingle());
    }
    if (data && !data.revocation_status && (data.connect_status ?? "active") === "active" && !oauthCredentialExpired(data.expires_at)) {
      const encrypted = data.access_token_ciphertext ?? data.secret_ciphertext;
      if (encrypted) return { accessTokenCiphertext: encrypted, scopes: data.scopes, updatedAt: data.updated_at };
    }
  }
  return null;
}

async function releaseRefreshLease(admin: ReturnType<typeof createAdminClient>, credentialId: string, userId: string, leaseId: string) {
  await admin.from("api_credentials").update({
    refresh_lease_id: null,
    refresh_lease_until: null,
    updated_at: new Date().toISOString(),
  }).eq("id", credentialId).eq("user_id", userId).eq("refresh_lease_id", leaseId);
}

function reauthFailure(credential: CredentialRow, message?: string): CredentialLoadFailure {
  return {
    code: "reauth_required",
    provider: credential.provider,
    message: message
      ?? `The stored ${credential.provider ?? "OAuth"} grant was revoked or expired upstream. Reconnect via POST /api/oauth/connect to restore access.`,
  };
}

function scopeFailure(credential: CredentialRow, requiredScopes: string[], missingScopes: string[]): CredentialLoadFailure {
  return {
    code: "insufficient_scope",
    provider: credential.provider,
    requiredScopes,
    missingScopes,
    message: `The stored ${credential.provider ?? "OAuth"} grant is missing required scopes: ${missingScopes.join(", ")}. Reconnect and approve the least-privilege scope set required by this tool.`,
  };
}

function backendFailure(): CredentialLoadFailure {
  return {
    code: "credential_backend_unavailable",
    provider: null,
    message: "Encrypted credential storage is temporarily unavailable.",
  };
}

function revocationFailure(credential: CredentialRow): CredentialLoadFailure {
  return {
    code: "credential_backend_unavailable",
    provider: credential.provider,
    message: `The ${credential.provider ?? "OAuth"} connection is being revoked and cannot be used for new calls. Finish or retry revocation from Connections.`,
  };
}

function credentialIdentityVersion(credential: CredentialRow) {
  return createHash("sha256").update(JSON.stringify([
    credential.id,
    credential.security_scheme ?? null,
    credential.security_binding ?? null,
  ])).digest("hex");
}

export async function loadRuntimeCredentialResultForTool(
  server: McpServer,
  tool: McpTool,
  options: CredentialLoadOptions = {}
): Promise<CredentialLoadResult> {
  if (server.user_id === localDemoUserId && process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES === "1") {
    const endpoint = findEndpointForTool(server, tool);
    if (!endpoint || !hasSecurityRequirement(endpoint)) return { credential: null, failure: null };
    if (process.env.ASTRAIL_LOCAL_PROVIDER_CREDENTIALS_DISABLED === "1") return { credential: null, failure: null };
    return {
      credential: {
        scheme: "api_key_query",
        injectionName: "api_key",
        secret: process.env.ASTRAIL_LOCAL_PROVIDER_SECRET ?? "local_provider_secret",
      },
      failure: null,
    };
  }

  const endpoint = findEndpointForTool(server, tool);
  if (!endpoint) return { credential: null, failure: null };
  const isMcpProxy = endpoint.runtime_kind === "mcp_proxy" || endpoint.method.toUpperCase() === "MCP_PROXY";
  if (!isMcpProxy && !hasSecurityRequirement(endpoint)) return { credential: null, failure: null };
  if (!hasServiceRoleKey() || !hasCredentialEncryptionKey()) {
    writeStructuredLog({ event: "astrail.credential_load_failed", server_id: server.id, tool: tool.name, error: "credential backend configuration unavailable" });
    return { credential: null, failure: backendFailure() };
  }
  let requiresOAuth = hasOAuthSecurityRequirement(endpoint);
  const incompleteSecurityMetadata = hasIncompleteSecuritySchemeMetadata(endpoint);
  if (!requiresOAuth && hasAmbiguousScopedSecurityRequirement(endpoint)) {
    return {
      credential: null,
      failure: {
        code: "reauth_required",
        provider: null,
        message: "This endpoint has scoped authentication but no verified OAuth scheme metadata. Re-import its API contract before executing authenticated tools.",
      },
    };
  }
  const endUserId = normalizeEndUserId(options.endUserId);
  const requiredSecuritySchemes = oauthSecuritySchemeNames(endpoint);
  if (requiresOAuth && requiredSecuritySchemes.some((scheme) => !oauthSecurityBinding(endpoint, scheme))) {
    return {
      credential: null,
      failure: {
        code: "reauth_required",
        provider: null,
        message: "This endpoint has no verified OAuth provider binding. Re-import its API contract before executing authenticated tools.",
      },
    };
  }

  try {
    const admin = createAdminClient();
    const queryRows = async (
      columns: string,
      identity: string | null,
      filterIdentity: boolean,
      schemeFilter: "exact" | "unbound" | "none" = "none",
    ) => {
      let query = admin.from("api_credentials").select(columns)
        .eq("user_id", server.user_id).eq("server_id", server.id);
      if (!incompleteSecurityMetadata) query = requiresOAuth ? query.eq("auth_scheme", "oauth2") : query.neq("auth_scheme", "oauth2");
      if (filterIdentity) query = identity ? query.eq("end_user_id", identity) : query.is("end_user_id", null);
      if (schemeFilter === "exact") query = query.in("security_scheme", requiredSecuritySchemes);
      if (schemeFilter === "unbound") query = query.is("security_scheme", null);
      return query.order("created_at", { ascending: false }).limit(CREDENTIAL_FETCH_LIMIT);
    };

    let selectedColumns = credentialColumnSet("audited");
    let result = await queryRows(selectedColumns, endUserId, true, requiresOAuth && requiredSecuritySchemes.length > 0 ? "exact" : "none");
    if (!result.error && result.data?.length === 0 && requiresOAuth && requiredSecuritySchemes.length > 0) {
      result = await queryRows(selectedColumns, endUserId, true, "unbound");
    }
    if (result.error?.message.includes("column")) {
      selectedColumns = credentialColumnSet("bound");
      result = await queryRows(selectedColumns, endUserId, true, requiresOAuth && requiredSecuritySchemes.length > 0 ? "exact" : "none");
      if (!result.error && result.data?.length === 0 && requiresOAuth && requiredSecuritySchemes.length > 0) {
        result = await queryRows(selectedColumns, endUserId, true, "unbound");
      }
    }
    if (result.error?.message.includes("column")) {
      selectedColumns = credentialColumnSet("connect");
      result = await queryRows(selectedColumns, endUserId, true);
    }
    if (result.error?.message.includes("column")) {
      // A pre-connect schema cannot safely resolve an end-user identity.
      if (endUserId) {
        writeStructuredLog({ event: "astrail.credential_load_failed", server_id: server.id, tool: tool.name, error: "per-user credential schema migration unavailable" });
        return { credential: null, failure: backendFailure() };
      }
      selectedColumns = credentialColumnSet("legacy");
      result = await queryRows(selectedColumns, null, false);
    }
    if (result.error || !result.data) {
      writeStructuredLog({ event: "astrail.credential_load_failed", server_id: server.id, tool: tool.name, error: result.error?.message ?? "credential query returned no data" });
      return { credential: null, failure: backendFailure() };
    }
    let rows = result.data as unknown as CredentialRow[];
    if (incompleteSecurityMetadata) {
      const oauthRows = rows.filter((row) => row.auth_scheme === "oauth2");
      if (oauthRows.length > 0) {
        return {
          credential: null,
          failure: reauthFailure(oauthRows[0], "This legacy OAuth endpoint has no authoritative security-scheme metadata. Re-import its API contract and reconnect before execution."),
        };
      }
      requiresOAuth = false;
    }
    if (!requiresOAuth && endUserId && rows.length === 0) {
      const workspace = await queryRows(selectedColumns, null, true);
      if (workspace.error) {
        writeStructuredLog({ event: "astrail.credential_load_failed", server_id: server.id, tool: tool.name, error: workspace.error.message });
        return { credential: null, failure: backendFailure() };
      }
      if (!workspace.error && workspace.data) rows = workspace.data as unknown as CredentialRow[];
    }
    if (rows.length === 0) return { credential: null, failure: null };

    const credential = pickCredential(rows, requiresOAuth, endUserId, requiredSecuritySchemes, endpoint);
    if (!credential) {
      const revokingOAuth = requiresOAuth ? rows.find((row) => row.auth_scheme === "oauth2" && row.revocation_status) : null;
      if (revokingOAuth) return { credential: null, failure: revocationFailure(revokingOAuth) };
      const unboundOAuth = requiresOAuth ? rows.find((row) => row.auth_scheme === "oauth2") : null;
      if (unboundOAuth) {
        return {
          credential: null,
          failure: reauthFailure(unboundOAuth, "This OAuth connection is not bound to the current provider definition and API origin. Reconnect it before Astrail can safely inject its provider token."),
        };
      }
      return { credential: null, failure: null };
    }

    if (credential.auth_scheme === "oauth2") {
      if (credential.revocation_status) return { credential: null, failure: revocationFailure(credential) };
      const effectiveSecurityScheme = credential.security_scheme
        ?? (requiredSecuritySchemes.length === 1 ? requiredSecuritySchemes[0] : null);
      if (credential.connect_status === "reauth_required") {
        return { credential: null, failure: reauthFailure(credential) };
      }
      const scopeGrant = evaluateOAuthScopeGrant(endpoint, credential.scopes, effectiveSecurityScheme);
      if (!scopeGrant.allowed) {
        const hasRecordedScopes = Array.isArray(credential.scopes)
          && credential.scopes.some((scope) => typeof scope === "string" && scope.trim());
        if (!hasRecordedScopes && scopeGrant.requiredScopes.length > 0) {
          return {
            credential: null,
            failure: reauthFailure(credential, "This legacy OAuth connection has no authoritative scope record. Reconnect it before Astrail can safely execute scoped tools."),
          };
        }
        return {
          credential: null,
          failure: scopeFailure(credential, scopeGrant.requiredScopes, scopeGrant.missingScopes),
        };
      }
      const accessTokenCiphertext = credential.access_token_ciphertext ?? credential.secret_ciphertext;
      if (!accessTokenCiphertext) return { credential: null, failure: null };
      if (oauthRefreshDue({ credentialId: credential.id, issuedAt: credential.issued_at, expiresAt: credential.expires_at, originalTtlSeconds: credential.original_ttl_seconds })) {
        if ((credential.connect_status ?? "active") === "reauth_required") {
          // The grant is known-dead. Skip the refresh round trip until the
          // user reconnects (the OAuth callback flips connect_status back).
          return { credential: null, failure: reauthFailure(credential) };
        }
        if (!credential.refresh_token_ciphertext || !credential.token_url) {
          return {
            credential: null,
            failure: {
              code: "refresh_unavailable",
              provider: credential.provider,
              message: "The stored OAuth access token has expired and no refresh token or token URL is stored. Reconnect or attach a fresh token.",
            },
          };
        }
        const atomicRefreshLease = await claimAtomicRefreshLease(admin, credential, server.user_id);
        const refreshLease: RefreshLease = atomicRefreshLease
          ?? await claimRefreshLease(admin, credential.id, server.user_id).then((lease) => ({ ...lease, generation: Number(credential.refresh_generation ?? 0) }));
        if (refreshLease.supported && !refreshLease.leaseId) {
          const peerGrant = await refreshedByPeer(admin, credential.id, server.user_id);
          if (peerGrant) {
            await recordLifecycle(admin, server, credential, "refresh_peer_reuse", "succeeded", true);
            const peerScopeGrant = evaluateOAuthScopeGrant(endpoint, peerGrant.scopes, effectiveSecurityScheme);
            if (!peerScopeGrant.allowed) {
              return {
                credential: null,
                failure: scopeFailure(credential, peerScopeGrant.requiredScopes, peerScopeGrant.missingScopes),
              };
            }
            return { credential: { scheme: "oauth2", secret: decryptCredential(peerGrant.accessTokenCiphertext), identityVersion: credentialIdentityVersion(credential), auditRef: credentialAuditRef(credential) }, failure: null };
          }
          return {
            credential: null,
            failure: { code: "refresh_failed", provider: credential.provider, message: "OAuth refresh is already in progress. Retry this tool call shortly." },
          };
        }
        try {
          const refreshed = await refreshOAuthAccessTokenSingleFlight(credential.id, {
            provider: credential.provider ?? "oauth",
            tokenUrl: credential.token_url,
            clientId: credential.client_id,
            clientSecret: credential.client_secret_ciphertext ? decryptCredential(credential.client_secret_ciphertext) : null,
            tokenAuthMethod: credential.token_auth_method,
            refreshToken: decryptCredential(credential.refresh_token_ciphertext),
            scopes: Array.isArray(credential.scopes) ? credential.scopes.filter((item): item is string => typeof item === "string") : [],
          });
          const encryptedAccessToken = encryptCredential(refreshed.accessToken);
          const refreshedAt = new Date().toISOString();
          const lifetime = tokenLifetime(refreshed.expiresAt ?? null, new Date(refreshedAt));
          const persistPayload = {
            secret_ciphertext: encryptedAccessToken,
            access_token_ciphertext: encryptedAccessToken,
            refresh_token_ciphertext: refreshed.refreshToken ? encryptCredential(refreshed.refreshToken) : credential.refresh_token_ciphertext,
            scopes: refreshed.scopes,
            expires_at: refreshed.expiresAt,
            issued_at: lifetime.issuedAt,
            original_ttl_seconds: lifetime.ttlSeconds,
            updated_at: refreshedAt,
          };
          const refreshedRow = {
            ...persistPayload,
            connect_status: "active",
            consecutive_refresh_failures: 0,
            health_status: "healthy",
            refresh_lease_id: null,
            refresh_lease_until: null,
          };
          let atomicCommit: { data: unknown; error: { message: string } | null };
          try {
            atomicCommit = await admin.rpc("commit_oauth_refresh", {
              p_credential_id: credential.id, p_user_id: server.user_id,
              p_lease_id: refreshLease.leaseId ?? "", p_expected_generation: refreshLease.generation,
              p_access_token_ciphertext: encryptedAccessToken,
              p_refresh_token_ciphertext: refreshed.refreshToken ? encryptCredential(refreshed.refreshToken) : null,
              p_expires_at: refreshed.expiresAt, p_issued_at: lifetime.issuedAt,
              p_original_ttl_seconds: lifetime.ttlSeconds, p_scopes: refreshed.scopes,
            });
          } catch {
            atomicCommit = { data: null, error: { message: "commit_oauth_refresh unavailable" } };
          }
          let persisted = atomicCommit.error?.message.includes("commit_oauth_refresh")
            ? await admin.from("api_credentials").update(refreshedRow).eq("id", credential.id).eq("user_id", server.user_id)
                .eq("refresh_lease_id", refreshLease.leaseId ?? "").is("revocation_status", null).select("id").maybeSingle()
            : { data: atomicCommit.data ? { id: credential.id } : null, error: atomicCommit.error };
          if (persisted.error?.message.includes("column")) {
            persisted = await admin.from("api_credentials").update(refreshedRow).eq("id", credential.id).eq("user_id", server.user_id)
              .eq("refresh_lease_id", refreshLease.leaseId ?? "")
              .select("id").maybeSingle();
          }
          if (persisted.error?.message.includes("column")) {
            // Deployment without refresh leasing: preserve the older update path.
            const legacyPersisted = await admin.from("api_credentials").update(persistPayload).eq("id", credential.id).eq("user_id", server.user_id);
            if (legacyPersisted.error) throw new Error("Could not persist refreshed OAuth credential.");
          } else if (persisted.error || !persisted.data) {
            throw new Error("OAuth refresh lease changed before the new token could be stored.");
          }
          await recordLifecycle(admin, server, credential, "refresh", "succeeded", false, { ttl_seconds: lifetime.ttlSeconds, generation: refreshLease.generation + 1 });
          const refreshedScopeGrant = evaluateOAuthScopeGrant(endpoint, refreshed.scopes, effectiveSecurityScheme);
          if (!refreshedScopeGrant.allowed) {
            return {
              credential: null,
              failure: scopeFailure(credential, refreshedScopeGrant.requiredScopes, refreshedScopeGrant.missingScopes),
            };
          }
          return { credential: { scheme: "oauth2", secret: refreshed.accessToken, identityVersion: credentialIdentityVersion(credential), auditRef: credentialAuditRef(credential) }, failure: null };
        } catch (refreshError) {
          if (refreshError instanceof OAuthRefreshError && refreshError.permanent) {
            await markCredentialReauthRequired(admin, credential, server.user_id, refreshLease.leaseId);
            await recordLifecycle(admin, server, credential, "refresh", "reauth_required", false, { oauth_error: refreshError.oauthErrorCode ?? "permanent_error" });
            return { credential: null, failure: reauthFailure(credential, `${credential.provider ?? "OAuth"} rejected the stored refresh token (${refreshError.oauthErrorCode ?? refreshError.message}). Reconnect via POST /api/oauth/connect.`) };
          }
          if (refreshLease.leaseId) await releaseRefreshLease(admin, credential.id, server.user_id, refreshLease.leaseId);
          const failureCount = (credential.consecutive_refresh_failures ?? 0) + 1;
          await admin.from("api_credentials").update({
            last_refresh_status: "transient_failure", last_refresh_at: new Date().toISOString(), last_refresh_error: "transient_refresh_failure",
            consecutive_refresh_failures: failureCount, health_status: failureCount >= 3 ? "degraded" : "healthy",
          }).eq("id", credential.id).eq("user_id", server.user_id);
          if (failureCount === 3) await admin.from("provider_alerts").insert({
            user_id: server.user_id, credential_id: credential.id, severity: "warning", code: "repeated_refresh_failure",
            message: `${credential.provider ?? "OAuth"} token refresh failed three times. Reconnect before the integration stops working.`,
          });
          await recordLifecycle(admin, server, credential, "refresh", "transient_failure");
          return {
            credential: null,
            failure: {
              code: "refresh_failed",
              provider: credential.provider,
              message: "OAuth token refresh failed transiently. The stored grant is still attached; retry shortly.",
            },
          };
        }
      }
      return { credential: { scheme: "oauth2", secret: decryptCredential(accessTokenCiphertext), identityVersion: credentialIdentityVersion(credential), auditRef: credentialAuditRef(credential) }, failure: null };
    }

    return {
      credential: {
        scheme: credential.auth_scheme,
        injectionName: credential.injection_name,
        secret: decryptCredential(credential.secret_ciphertext),
        identityVersion: credentialIdentityVersion(credential),
        auditRef: credentialAuditRef(credential),
      },
      failure: null,
    };
  } catch (error) {
    writeStructuredLog({
      event: "astrail.credential_load_failed",
      server_id: server.id,
      tool: tool.name,
      error: error instanceof Error ? error.message : "unknown credential loader failure",
    });
    return { credential: null, failure: backendFailure() };
  }
}

export async function loadRuntimeCredentialForTool(
  server: McpServer,
  tool: McpTool,
  options: CredentialLoadOptions = {}
): Promise<RuntimeCredential | null> {
  const result = await loadRuntimeCredentialResultForTool(server, tool, options);
  return result.credential;
}
