import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { decryptCredential, hasCredentialEncryptionKey } from "@/lib/credentials";
import { inferredOAuthRevocationUrl, revokeOAuthGrant } from "@/lib/oauth-revocation";
import { oauthSecurityBinding, oauthSecurityMetadata } from "@/lib/runtime/oauth-security";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient } from "@/lib/neon/server";

export const runtime = "nodejs";

type CredentialRow = {
  id: string;
  user_id: string;
  server_id: string | null;
  name: string;
  provider: string | null;
  auth_scheme: string;
  security_scheme: string | null;
  security_binding: string | null;
  end_user_id: string | null;
  client_id: string | null;
  client_secret_ciphertext: string | null;
  token_auth_method: "client_secret_post" | "client_secret_basic" | null;
  secret_ciphertext: string | null;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_url: string | null;
  revocation_url: string | null;
  revocation_status: string | null;
  revocation_attempted_at: string | null;
  refresh_lease_id: string | null;
  refresh_lease_until: string | null;
  connect_status: string | null;
};

function traceId() {
  return `agt_revoke_${randomUUID().replaceAll("-", "")}`;
}

async function writeRevocationAudit(credential: CredentialRow, status: "success" | "error", trace: string, error: string | null, manualConfirmation = false) {
  const admin = createAdminClient();
  const summary = status === "success" && manualConfirmation
    ? `End user "${credential.end_user_id ?? "workspace"}" confirmed provider-side revocation for ${credential.provider ?? "OAuth"} connection "${credential.name}" before local cleanup.`
    : status === "success"
    ? `End user "${credential.end_user_id ?? "workspace"}" revoked ${credential.provider ?? "OAuth"} connection "${credential.name}" at the provider.`
    : `Provider revocation failed for ${credential.provider ?? "OAuth"} connection "${credential.name}"; the local credential was retained.`;
  const base = {
    server_id: credential.server_id,
    user_id: credential.user_id,
    tool_name: "astrail.oauth.revoke",
    status,
    method: manualConfirmation ? "CONFIRM" : "REVOKE",
    path: credential.provider ?? "oauth",
    execution_mode: "oauth_revocation",
    trace_id: trace,
    attempt_count: manualConfirmation ? 0 : 1,
    error_code: status === "error" ? "provider_revocation_failed" : null,
    error,
    latency_ms: 0,
  };
  try {
    const { error: insertError } = await admin.from("tool_call_logs").insert({
      ...base,
      end_user_id: credential.end_user_id,
      credential_refs: [{
        id: credential.id,
        name: credential.name,
        provider: credential.provider,
        end_user_id: credential.end_user_id,
        auth_scheme: credential.auth_scheme,
      }],
      summary,
    });
    if (!insertError) return true;
    if (!insertError.message.includes("column")) return false;
    const legacy = await admin.from("tool_call_logs").insert(base);
    return !legacy.error;
  } catch {
    return false;
  }
}

async function completeManuallyConfirmedRevocation(admin: ReturnType<typeof createAdminClient>, credential: CredentialRow) {
  const trace = traceId();
  if (!(await writeRevocationAudit(credential, "success", trace, null, true))) {
    return NextResponse.json({
      error: "Astrail could not persist the required manual-revocation audit record, so local ciphertext was retained.",
      revoked: true,
      deleted: false,
      trace_id: trace,
    }, { status: 503 });
  }
  const removed = await admin.from("api_credentials").delete()
    .eq("id", credential.id).eq("user_id", credential.user_id).select("id").maybeSingle();
  if (removed.error || !removed.data) {
    await admin.from("api_credentials").update({
      revocation_status: "provider_revoked_local_delete_failed",
      revocation_error: "Provider revocation was manually confirmed, but Astrail could not remove local ciphertext.",
      revocation_attempted_at: new Date().toISOString(),
    }).eq("id", credential.id).eq("user_id", credential.user_id);
    return NextResponse.json({ error: "Provider revocation was confirmed, but local cleanup failed. Retry removal.", revoked: true, deleted: false, trace_id: trace }, { status: 500 });
  }
  return NextResponse.json({ deleted: true, revoked: true, manual_confirmation: true, trace_id: trace });
}

function canonicalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function trustedRevocationUrl(admin: ReturnType<typeof createAdminClient>, credential: CredentialRow) {
  if (!credential.server_id || !credential.security_scheme || !credential.security_binding) return null;
  const { data: server, error } = await admin.from("mcp_servers")
    .select("endpoint_map")
    .eq("id", credential.server_id)
    .eq("user_id", credential.user_id)
    .maybeSingle();
  if (error || !server || !Array.isArray(server.endpoint_map)) return null;
  const endpoint = server.endpoint_map.find((item) =>
    oauthSecurityBinding(item, credential.security_scheme as string) === credential.security_binding
  );
  if (!endpoint) return null;
  const metadata = oauthSecurityMetadata(endpoint, credential.security_scheme);
  if (!metadata?.token_url || canonicalUrl(metadata.token_url) !== canonicalUrl(credential.token_url)) return null;
  const inferred = inferredOAuthRevocationUrl(credential.provider, metadata.token_url, credential.client_id);
  const expected = inferred ?? metadata.revocation_url;
  if (!expected) return null;
  // Legacy known-provider rows can use only Astrail's fixed provider adapter.
  // Custom rows must carry the endpoint captured at consent time; never trust
  // a newly re-imported custom URL for an existing token.
  if (!credential.revocation_url) return inferred;
  if (canonicalUrl(credential.revocation_url) !== canonicalUrl(expected)) return null;
  return expected;
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "A valid connection ID is required." }, { status: 400 });
  }
  if (!hasServerNeonEnv()) return NextResponse.json({ deleted: true, revoked: true, preview: true });
  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("api_credentials")
    .select("id,user_id,server_id,name,provider,auth_scheme,security_scheme,security_binding,end_user_id,client_id,client_secret_ciphertext,token_auth_method,secret_ciphertext,access_token_ciphertext,refresh_token_ciphertext,token_url,revocation_url,revocation_status,revocation_attempted_at,refresh_lease_id,refresh_lease_until,connect_status")
    .eq("id", params.id).eq("user_id", userData.user.id).maybeSingle();
  if (error?.message.includes("column")) {
    const legacy = await admin.from("api_credentials")
      .select("id,auth_scheme")
      .eq("id", params.id).eq("user_id", userData.user.id).maybeSingle();
    if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 });
    if (!legacy.data) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    if (legacy.data.auth_scheme !== "oauth2") {
      const removed = await admin.from("api_credentials").delete()
        .eq("id", legacy.data.id).eq("user_id", userData.user.id).select("id").maybeSingle();
      if (removed.error || !removed.data) return NextResponse.json({ error: removed.error?.message ?? "Could not remove this connection." }, { status: 500 });
      return NextResponse.json({ deleted: true, revoked: null });
    }
    return NextResponse.json({ error: "Provider revocation requires neon-migration-oauth-revocation-audit.sql." }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  const credential = data as CredentialRow;
  const manualConfirmation = new URL(request.url).searchParams.get("confirm_provider_revoked") === "true";

  const hasIssuedOAuthToken = Boolean(credential.access_token_ciphertext || credential.refresh_token_ciphertext);
  if (credential.auth_scheme === "oauth2" && credential.connect_status === "exchanging" && !hasIssuedOAuthToken) {
    if (manualConfirmation) return completeManuallyConfirmedRevocation(admin, credential);
    return NextResponse.json({
      error: "This interrupted OAuth exchange has no stored provider token to revoke. Verify or revoke Astrail in the provider's security settings before removing the local placeholder.",
      revoked: false,
      deleted: false,
      requires_provider_confirmation: true,
    }, { status: 409 });
  }
  if (credential.auth_scheme !== "oauth2"
    || credential.connect_status === "pending"
    || (credential.connect_status === "failed" && !hasIssuedOAuthToken)) {
    const removed = await admin.from("api_credentials").delete()
      .eq("id", credential.id).eq("user_id", userData.user.id).select("id").maybeSingle();
    if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
    return NextResponse.json({ deleted: true, revoked: credential.auth_scheme !== "oauth2" ? null : true });
  }
  if (["provider_revoked_local_delete_failed", "provider_revoked_audit_failed"].includes(credential.revocation_status ?? "")) {
    if (credential.revocation_status === "provider_revoked_audit_failed") {
      const trace = traceId();
      if (!(await writeRevocationAudit(credential, "success", trace, null))) {
        return NextResponse.json({
          error: "Provider access is already revoked, but Astrail could not persist the required audit record.",
          revoked: true,
          deleted: false,
          trace_id: trace,
        }, { status: 503 });
      }
    }
    const removed = await admin.from("api_credentials").delete()
      .eq("id", credential.id).eq("user_id", userData.user.id).select("id").maybeSingle();
    if (removed.error || !removed.data) {
      return NextResponse.json({
        error: "Provider access is already revoked, but Astrail could not remove the local ciphertext.",
        revoked: true,
        deleted: false,
      }, { status: 500 });
    }
    return NextResponse.json({ deleted: true, revoked: true, already_inactive: true });
  }
  if (manualConfirmation) return completeManuallyConfirmedRevocation(admin, credential);
  if (!hasCredentialEncryptionKey()) {
    return NextResponse.json({ error: "Provider revocation requires CREDENTIAL_ENCRYPTION_KEY." }, { status: 503 });
  }
  const revocationUrl = await trustedRevocationUrl(admin, credential);
  if (!revocationUrl) {
    return NextResponse.json({
      error: "This legacy connection is not bound to a trusted provider revocation endpoint. Revoke Astrail in the provider's security settings, then confirm that manual revocation to remove local ciphertext.",
      revoked: false,
      deleted: false,
      requires_provider_confirmation: true,
    }, { status: 409 });
  }

  const attemptedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const clearedStaleRefresh = await admin.from("api_credentials").update({
    refresh_lease_id: null,
    refresh_lease_until: null,
  }).eq("id", credential.id)
    .eq("user_id", userData.user.id)
    .lt("refresh_lease_until", attemptedAt);
  if (clearedStaleRefresh.error) return NextResponse.json({ error: clearedStaleRefresh.error.message }, { status: 500 });

  const claimed = await admin.from("api_credentials").update({
    revocation_status: "in_progress",
    revocation_error: null,
    revocation_attempted_at: attemptedAt,
  })
    .eq("id", credential.id)
    .eq("user_id", userData.user.id)
    .is("refresh_lease_until", null)
    .or(`revocation_status.is.null,revocation_status.eq.failed,and(revocation_status.eq.in_progress,revocation_attempted_at.lt.${staleBefore})`)
    .select("id")
    .maybeSingle();
  if (claimed.error) return NextResponse.json({ error: claimed.error.message }, { status: 500 });
  if (!claimed.data) return NextResponse.json({ error: "This connection is being refreshed or revoked. Retry after the current attempt finishes.", revoked: false, deleted: false }, { status: 409 });

  // Refresh persistence clears its lease before this claim can succeed. Read
  // the encrypted token columns again after claiming so a refresh that
  // completed between the initial read and this update cannot leave us
  // revoking a stale, pre-rotation token.
  const fresh = await admin.from("api_credentials")
    .select("client_secret_ciphertext,secret_ciphertext,access_token_ciphertext,refresh_token_ciphertext")
    .eq("id", credential.id)
    .eq("user_id", userData.user.id)
    .eq("revocation_status", "in_progress")
    .maybeSingle();
  if (fresh.error || !fresh.data) {
    await admin.from("api_credentials").update({
      revocation_status: "failed",
      revocation_error: "Astrail could not reload the serialized token state for provider revocation.",
      revocation_attempted_at: attemptedAt,
    }).eq("id", credential.id).eq("user_id", userData.user.id).eq("revocation_status", "in_progress");
    return NextResponse.json({ error: "Could not load the latest provider token state. Retry revocation.", revoked: false, deleted: false }, { status: 500 });
  }
  const revocationCredential = { ...credential, ...fresh.data };

  const trace = traceId();
  let result: Awaited<ReturnType<typeof revokeOAuthGrant>>;
  try {
    result = await revokeOAuthGrant({
      provider: credential.provider,
      revocationUrl,
      tokenUrl: credential.token_url,
      clientId: credential.client_id,
      clientSecret: revocationCredential.client_secret_ciphertext ? decryptCredential(revocationCredential.client_secret_ciphertext) : null,
      tokenAuthMethod: credential.token_auth_method,
      accessToken: revocationCredential.access_token_ciphertext
        ? decryptCredential(revocationCredential.access_token_ciphertext)
        : revocationCredential.secret_ciphertext ? decryptCredential(revocationCredential.secret_ciphertext) : null,
      refreshToken: revocationCredential.refresh_token_ciphertext ? decryptCredential(revocationCredential.refresh_token_ciphertext) : null,
    });
  } catch (revocationError) {
    const message = revocationError instanceof Error ? revocationError.message : "Provider revocation failed.";
    await admin.from("api_credentials").update({
      revocation_status: "failed",
      revocation_error: message.slice(0, 500),
      revocation_attempted_at: attemptedAt,
    }).eq("id", credential.id).eq("user_id", userData.user.id);
    await writeRevocationAudit(credential, "error", trace, message.slice(0, 500));
    const status = message.includes("no trusted revocation endpoint") ? 409 : 502;
    return NextResponse.json({ error: message, revoked: false, deleted: false, trace_id: trace }, { status });
  }
  if (!(await writeRevocationAudit(credential, "success", trace, null))) {
    await admin.from("api_credentials").update({
      revocation_status: "provider_revoked_audit_failed",
      revocation_error: "Provider access was revoked, but Astrail could not persist the required audit record.",
      revocation_attempted_at: attemptedAt,
    }).eq("id", credential.id).eq("user_id", userData.user.id);
    return NextResponse.json({
      error: "Provider access was revoked, but Astrail could not persist the required audit record. Retry cleanup before deleting local ciphertext.",
      revoked: true,
      deleted: false,
      trace_id: trace,
    }, { status: 503 });
  }
  const removed = await admin.from("api_credentials").delete()
    .eq("id", credential.id).eq("user_id", userData.user.id).select("id").maybeSingle();
  if (removed.error || !removed.data) {
    await admin.from("api_credentials").update({
      revocation_status: "provider_revoked_local_delete_failed",
      revocation_error: "Provider access was revoked, but Astrail could not remove the local ciphertext.",
      revocation_attempted_at: attemptedAt,
    }).eq("id", credential.id).eq("user_id", userData.user.id);
    return NextResponse.json({
      error: "Provider access was revoked, but Astrail could not remove the local ciphertext. Retry removal; the token can no longer be used upstream.",
      revoked: true,
      deleted: false,
      trace_id: trace,
    }, { status: 500 });
  }
  return NextResponse.json({
    deleted: true,
    revoked: true,
    provider: result.provider,
    token_type: result.tokenType,
    already_inactive: result.alreadyInactive,
    trace_id: trace,
  });
}
