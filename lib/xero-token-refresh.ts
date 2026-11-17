import { randomUUID } from "node:crypto";
import {
  decryptCredential,
  encryptCredential,
  OAuthRefreshError,
  refreshOAuthAccessTokenSingleFlight,
} from "@/lib/credentials";
import { createAdminClient } from "@/lib/neon/server";
import { tokenLifetime } from "@/lib/runtime/token-lifecycle";

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const REFRESH_AHEAD_MS = 10 * 60 * 1000;
const LEASE_MS = 60 * 1000;
const MAX_BATCH_SIZE = 50;

type XeroCredential = {
  id: string;
  user_id: string;
  server_id: string | null;
  provider: string | null;
  client_id: string | null;
  client_secret_ciphertext: string | null;
  token_auth_method: "client_secret_post" | "client_secret_basic" | null;
  refresh_token_ciphertext: string | null;
  token_url: string | null;
  scopes: unknown;
  refresh_generation: number | null;
};

export type XeroRefreshSummary = {
  inspected: number;
  refreshed: number;
  skipped: number;
  reauthRequired: number;
  failed: number;
};

function stringScopes(value: unknown) {
  return Array.isArray(value) ? value.filter((scope): scope is string => typeof scope === "string") : [];
}

export async function refreshExpiringXeroTokens(limit = MAX_BATCH_SIZE): Promise<XeroRefreshSummary> {
  const admin = createAdminClient();
  const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(limit)));
  const cutoff = new Date(Date.now() + REFRESH_AHEAD_MS).toISOString();
  const { data, error } = await admin.from("api_credentials")
    .select("id,user_id,server_id,provider,client_id,client_secret_ciphertext,token_auth_method,refresh_token_ciphertext,token_url,scopes,refresh_generation")
    .eq("auth_scheme", "oauth2")
    .ilike("provider", "xero")
    .eq("connect_status", "active")
    .is("revocation_status", null)
    .not("refresh_token_ciphertext", "is", null)
    .lte("expires_at", cutoff)
    .order("expires_at", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error(`Could not load expiring Xero credentials: ${error.message}`);

  const credentials = (data ?? []) as XeroCredential[];
  const summary: XeroRefreshSummary = { inspected: credentials.length, refreshed: 0, skipped: 0, reauthRequired: 0, failed: 0 };
  for (const credential of credentials) {
    if (!credential.client_id || !credential.client_secret_ciphertext || !credential.refresh_token_ciphertext
      || credential.token_url !== XERO_TOKEN_URL || !stringScopes(credential.scopes).includes("offline_access")) {
      summary.reauthRequired += 1;
      await admin.from("api_credentials").update({
        connect_status: "reauth_required",
        last_refresh_status: "reauth_required",
        last_refresh_error: "xero_refresh_configuration_invalid",
        updated_at: new Date().toISOString(),
      }).eq("id", credential.id).eq("user_id", credential.user_id);
      continue;
    }

    const leaseId = randomUUID();
    const generation = Number(credential.refresh_generation ?? 0);
    const { data: leaseData, error: leaseError } = await admin.rpc("claim_oauth_refresh", {
      p_credential_id: credential.id,
      p_user_id: credential.user_id,
      p_expected_generation: generation,
      p_lease_id: leaseId,
      p_lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
    });
    const lease = Array.isArray(leaseData) ? leaseData[0] : leaseData;
    if (leaseError || !lease?.claimed) {
      summary.skipped += 1;
      continue;
    }

    try {
      const refreshed = await refreshOAuthAccessTokenSingleFlight(credential.id, {
        provider: "xero",
        tokenUrl: XERO_TOKEN_URL,
        clientId: credential.client_id,
        clientSecret: decryptCredential(credential.client_secret_ciphertext),
        tokenAuthMethod: "client_secret_basic",
        refreshToken: decryptCredential(credential.refresh_token_ciphertext),
        scopes: stringScopes(credential.scopes),
      });
      const refreshedAt = new Date();
      const lifetime = tokenLifetime(refreshed.expiresAt ?? null, refreshedAt);
      const { data: committed, error: commitError } = await admin.rpc("commit_oauth_refresh", {
        p_credential_id: credential.id,
        p_user_id: credential.user_id,
        p_lease_id: leaseId,
        p_expected_generation: generation,
        p_access_token_ciphertext: encryptCredential(refreshed.accessToken),
        p_refresh_token_ciphertext: refreshed.refreshToken ? encryptCredential(refreshed.refreshToken) : null,
        p_expires_at: refreshed.expiresAt,
        p_issued_at: lifetime.issuedAt,
        p_original_ttl_seconds: lifetime.ttlSeconds,
        p_scopes: refreshed.scopes,
      });
      if (commitError || committed !== true) throw new Error("Xero token rotation lost its database lease before commit.");
      summary.refreshed += 1;
      await admin.from("oauth_lifecycle_events").insert({
        user_id: credential.user_id,
        server_id: credential.server_id,
        credential_id: credential.id,
        provider: "xero",
        event_type: "scheduled_refresh",
        generation: generation + 1,
        outcome: "succeeded",
        detail: { ttl_seconds: lifetime.ttlSeconds },
      });
    } catch (refreshError) {
      const permanent = refreshError instanceof OAuthRefreshError && refreshError.permanent;
      summary[permanent ? "reauthRequired" : "failed"] += 1;
      await admin.from("api_credentials").update({
        ...(permanent ? { connect_status: "reauth_required" } : {}),
        refresh_lease_id: null,
        refresh_lease_until: null,
        last_refresh_status: permanent ? "reauth_required" : "transient_failure",
        last_refresh_at: new Date().toISOString(),
        last_refresh_error: permanent ? (refreshError.oauthErrorCode ?? "xero_refresh_rejected") : "transient_refresh_failure",
        updated_at: new Date().toISOString(),
      }).eq("id", credential.id).eq("user_id", credential.user_id).eq("refresh_lease_id", leaseId);
    }
  }
  return summary;
}
