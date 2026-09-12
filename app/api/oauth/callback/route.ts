import { NextResponse } from "next/server";
import { decryptCredential, encryptCredential, hasCredentialEncryptionKey, previewSecret } from "@/lib/credentials";
import { connectStateExpired, exchangeAuthorizationCode } from "@/lib/oauth-connect";
import { revokeOAuthGrant } from "@/lib/oauth-revocation";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient } from "@/lib/neon/server";
import { getOAuthCallbackUrl } from "@/lib/urls";
import { tokenLifetime } from "@/lib/runtime/token-lifecycle";

export const runtime = "nodejs";

const CALLBACK_STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

type PendingConnectRow = {
  id: string;
  user_id: string;
  provider: string | null;
  client_id: string | null;
  client_secret_ciphertext: string | null;
  token_auth_method: "client_secret_post" | "client_secret_basic" | null;
  scopes: unknown;
  token_url: string | null;
  revocation_url: string | null;
  connect_state_expires_at: string | null;
  pkce_verifier_ciphertext: string | null;
};

function dashboardRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/dashboard/connections", new URL(getOAuthCallbackUrl(request.url)).origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (!hasServerNeonEnv() || !hasCredentialEncryptionKey()) {
    return dashboardRedirect(request, { connect_error: "OAuth connect is not configured on this deployment." });
  }

  const query = new URL(request.url).searchParams;
  const state = query.get("state");
  const code = query.get("code");
  const providerError = query.get("error");

  if (!state || !CALLBACK_STATE_PATTERN.test(state)) {
    return dashboardRedirect(request, { connect_error: "Missing or malformed OAuth state." });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_credentials")
    .update({ connect_status: "exchanging", updated_at: new Date().toISOString() })
    .eq("connect_state", state)
    .eq("connect_status", "pending")
    .select("id,user_id,provider,client_id,client_secret_ciphertext,token_auth_method,scopes,token_url,revocation_url,connect_state_expires_at,pkce_verifier_ciphertext")
    .maybeSingle();

  if (error || !data) {
    return dashboardRedirect(request, { connect_error: "OAuth connect session not found. Start the connect flow again." });
  }
  const pending = data as PendingConnectRow;

  const invalidatePending = () => admin
    .from("api_credentials")
    .update({
      connect_state: null,
      connect_state_expires_at: null,
      pkce_verifier_ciphertext: null,
      connect_status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .eq("connect_status", "exchanging");

  if (providerError) {
    await invalidatePending();
    const description = query.get("error_description");
    return dashboardRedirect(request, { connect_error: description || `Provider returned "${providerError}".` });
  }

  if (connectStateExpired(pending.connect_state_expires_at)) {
    await invalidatePending();
    return dashboardRedirect(request, { connect_error: "OAuth connect session expired. Start the connect flow again." });
  }

  if (!code || !pending.token_url || !pending.client_id || !pending.pkce_verifier_ciphertext) {
    await invalidatePending();
    return dashboardRedirect(request, { connect_error: "OAuth connect session is incomplete. Start the connect flow again." });
  }

  const fallbackScopes = Array.isArray(pending.scopes)
    ? pending.scopes.filter((item): item is string => typeof item === "string")
    : [];
  let clientSecret: string | null = null;
  let exchanged: Awaited<ReturnType<typeof exchangeAuthorizationCode>>;
  try {
    clientSecret = pending.client_secret_ciphertext ? decryptCredential(pending.client_secret_ciphertext) : null;
    exchanged = await exchangeAuthorizationCode({
      provider: pending.provider ?? "oauth",
      tokenUrl: pending.token_url,
      code,
      redirectUri: getOAuthCallbackUrl(request.url),
      clientId: pending.client_id,
      clientSecret,
      tokenAuthMethod: pending.token_auth_method,
      codeVerifier: decryptCredential(pending.pkce_verifier_ciphertext),
      fallbackScopes,
    });
  } catch (exchangeError) {
    await invalidatePending();
    const message = exchangeError instanceof Error ? exchangeError.message : "OAuth code exchange failed.";
    return dashboardRedirect(request, { connect_error: message });
  }

  let encryptedAccessToken: string | null = null;
  let encryptedRefreshToken: string | null = null;
  try {
    encryptedAccessToken = encryptCredential(exchanged.accessToken);
    encryptedRefreshToken = exchanged.refreshToken ? encryptCredential(exchanged.refreshToken) : null;
    const lifetime = tokenLifetime(exchanged.expiresAt);
    const { data: updated, error: updateError } = await admin
      .from("api_credentials")
      .update({
        secret_ciphertext: encryptedAccessToken,
        access_token_ciphertext: encryptedAccessToken,
        refresh_token_ciphertext: encryptedRefreshToken,
        scopes: exchanged.scopes,
        expires_at: exchanged.expiresAt,
        issued_at: lifetime.issuedAt,
        original_ttl_seconds: lifetime.ttlSeconds,
        refresh_generation: 0,
        last_refresh_status: "connected",
        key_preview: previewSecret(exchanged.accessToken),
        connect_status: "active",
        connect_state: null,
        connect_state_expires_at: null,
        pkce_verifier_ciphertext: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pending.id)
      .eq("connect_state", state)
      .eq("connect_status", "exchanging")
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      // The update may have committed even when its response was lost. Confirm
      // the row state before revoking the provider grant, otherwise an active
      // stored credential could be left pointing at a token we just revoked.
      let persistenceStateKnown = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const verification = await admin
          .from("api_credentials")
          .select("connect_status,access_token_ciphertext")
          .eq("id", pending.id)
          .eq("user_id", pending.user_id)
          .maybeSingle();
        if (!verification.error) {
          persistenceStateKnown = true;
          if (verification.data?.connect_status === "active" && verification.data.access_token_ciphertext) {
            return dashboardRedirect(request, { connected: pending.id });
          }
          break;
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (!persistenceStateKnown) {
        return dashboardRedirect(request, {
          connect_error: "Astrail could not confirm whether the token was stored. Refresh Connections before reconnecting; if the connection is interrupted, revoke Astrail in the provider settings.",
        });
      }
      throw new Error("OAuth credential persistence failed after token exchange.");
    }

    return dashboardRedirect(request, { connected: pending.id });
  } catch {
    // A provider grant now exists. Revoke it immediately rather than marking
    // the row failed and later deleting it locally while access remains live.
    try {
      await revokeOAuthGrant({
        provider: pending.provider,
        revocationUrl: pending.revocation_url,
        tokenUrl: pending.token_url,
        clientId: pending.client_id,
        clientSecret,
        tokenAuthMethod: pending.token_auth_method,
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
      });
      await invalidatePending();
      return dashboardRedirect(request, { connect_error: "Token storage failed, so Astrail revoked the new provider grant. Start the connection again." });
    } catch {
      // If automatic cleanup also fails, retain encrypted tokens whenever
      // possible so Connections can safely retry provider revocation.
      if (encryptedAccessToken) {
        const recovery = await admin.from("api_credentials").update({
          secret_ciphertext: encryptedAccessToken,
          access_token_ciphertext: encryptedAccessToken,
          refresh_token_ciphertext: encryptedRefreshToken,
          scopes: exchanged.scopes,
          expires_at: exchanged.expiresAt,
          key_preview: previewSecret(exchanged.accessToken),
          connect_status: "failed",
          revocation_status: "failed",
          revocation_error: "Automatic provider cleanup failed after token storage failure.",
          connect_state: null,
          connect_state_expires_at: null,
          pkce_verifier_ciphertext: null,
          updated_at: new Date().toISOString(),
        }).eq("id", pending.id).eq("connect_status", "exchanging").select("id").maybeSingle();
        if (!recovery.error && recovery.data) {
          return dashboardRedirect(request, { connect_error: "Token storage failed and provider cleanup needs a retry. Use Revoke in Connections." });
        }
      }
      return dashboardRedirect(request, { connect_error: "The provider issued access, but Astrail could neither store nor revoke it. Revoke Astrail in the provider's security settings immediately." });
    }
  }
}
