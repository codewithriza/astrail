import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptCredential, hasCredentialEncryptionKey, normalizeOAuthScopes, previewSecret } from "@/lib/credentials";
import { localDemoUserId } from "@/lib/local-demo";
import { assertSafeUpstreamUrl } from "@/lib/runtime/network-policy";
import { oauthSecuritySchemeNames } from "@/lib/runtime/oauth-security";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient, createUserDataClient } from "@/lib/neon/server";

export const runtime = "nodejs";

const CreateCredentialSchema = z.object({
  name: z.string().min(1).max(80),
  server_id: z.string().uuid().optional(),
  provider: z.string().min(1).max(80).optional(),
  security_scheme: z.string().trim().min(1).max(120).optional(),
  auth_scheme: z.enum(["bearer", "api_key_header", "api_key_query", "oauth2"]),
  end_user_id: z.string().trim().min(1).max(256).optional(),
  client_id: z.string().max(240).optional(),
  client_secret: z.string().max(4096).optional(),
  token_auth_method: z.enum(["client_secret_post", "client_secret_basic"]).optional(),
  injection_name: z.string().min(1).max(80).optional(),
  scopes: z.union([z.array(z.string().min(1).max(120)).max(80), z.string().max(4000)]).optional(),
  secret: z.string().min(8).max(4096).optional(),
  access_token: z.string().min(8).max(8192).optional(),
  refresh_token: z.string().max(8192).optional(),
  token_url: z.string().url().max(1000).optional(),
  expires_at: z.string().datetime().optional(),
}).superRefine((value, context) => {
  if (value.auth_scheme === "oauth2") {
    if (!value.provider?.trim()) {
      context.addIssue({ code: "custom", path: ["provider"], message: "OAuth credentials require a provider." });
    }
    if (!value.access_token && !value.secret) {
      context.addIssue({ code: "custom", path: ["access_token"], message: "OAuth credentials require an access token." });
    }
    if (value.refresh_token && !value.token_url) {
      context.addIssue({ code: "custom", path: ["token_url"], message: "A refresh token requires a token URL." });
    }
    if (!value.server_id) {
      context.addIssue({ code: "custom", path: ["server_id"], message: "OAuth credentials must be attached to a server." });
    }
    return;
  }

  if (!value.secret) {
    context.addIssue({ code: "custom", path: ["secret"], message: "Credential secret is required." });
  }
});

const CredentialSelect = "id,user_id,server_id,name,provider,security_scheme,security_binding,auth_scheme,client_id,token_auth_method,authorization_url,token_url,revocation_url,revocation_status,revocation_error,revocation_attempted_at,expires_at,injection_name,scopes,key_preview,connect_status,end_user_id,created_at,updated_at";
const ConnectCredentialSelect = "id,user_id,server_id,name,provider,auth_scheme,client_id,token_auth_method,authorization_url,token_url,expires_at,injection_name,scopes,key_preview,connect_status,end_user_id,created_at,updated_at";
const LegacyCredentialSelect = "id,user_id,server_id,name,provider,auth_scheme,injection_name,scopes,key_preview,created_at,updated_at";

export async function GET(request: Request) {
  if (!hasServerNeonEnv()) {
    return NextResponse.json({ credentials: [] });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const serverId = new URL(request.url).searchParams.get("server_id");
  let query = createUserDataClient()
    .from("api_credentials")
    .select(CredentialSelect)
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });
  if (serverId) query = query.eq("server_id", serverId);
  const { data, error } = await query;

  if (error?.message.includes("column")) {
    let connectQuery = createUserDataClient()
      .from("api_credentials")
      .select(ConnectCredentialSelect)
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false });
    if (serverId) connectQuery = connectQuery.eq("server_id", serverId);
    const connect = await connectQuery;
    if (!connect.error) return NextResponse.json({ credentials: connect.data ?? [], schema: "connect" });
    if (!connect.error.message.includes("column")) return NextResponse.json({ error: connect.error.message }, { status: 500 });
    let fallbackQuery = createUserDataClient()
      .from("api_credentials")
      .select(LegacyCredentialSelect)
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false });
    if (serverId) fallbackQuery = fallbackQuery.eq("server_id", serverId);
    const fallback = await fallbackQuery;
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    return NextResponse.json({ credentials: fallback.data ?? [], schema: "legacy" });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ credentials: data ?? [] });
}

export async function POST(request: Request) {
  if (!hasServerNeonEnv()) {
    const body = await request.json() as {
      name?: string;
      server_id?: string;
      provider?: string;
      security_scheme?: string;
      auth_scheme?: "bearer" | "api_key_header" | "api_key_query" | "oauth2";
      end_user_id?: string;
      client_id?: string;
      injection_name?: string;
      scopes?: string[] | string;
      secret?: string;
      access_token?: string;
      refresh_token?: string;
      token_url?: string;
      expires_at?: string;
    };
    const token = body.auth_scheme === "oauth2" ? body.access_token ?? body.secret : body.secret;
    if (!body.name?.trim() || !body.auth_scheme || !token || token.length < 8) {
      return NextResponse.json({ error: "Credential name, auth scheme, and an 8+ character secret or access token are required." }, { status: 400 });
    }
    return NextResponse.json({
      credential: {
        id: "local-credential",
        user_id: localDemoUserId,
        server_id: body.server_id ?? null,
        name: body.name.trim(),
        provider: body.provider ?? null,
        security_scheme: body.security_scheme ?? null,
        auth_scheme: body.auth_scheme,
        end_user_id: body.end_user_id?.trim() || null,
        client_id: body.client_id ?? null,
        token_url: body.token_url ?? null,
        expires_at: body.expires_at ?? null,
        injection_name: body.injection_name ?? null,
        scopes: normalizeOAuthScopes(body.scopes),
        key_preview: previewSecret(token),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      preview: true,
    });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  if (!hasCredentialEncryptionKey()) {
    return NextResponse.json({
      error: "Credential storage requires CREDENTIAL_ENCRYPTION_KEY. No plaintext credential was stored.",
    }, { status: 503 });
  }

  const body = CreateCredentialSchema.parse(await request.json());
  if (body.token_url) {
    const tokenUrl = new URL(body.token_url);
    if (tokenUrl.protocol !== "https:") {
      return NextResponse.json({ error: "OAuth token URL must use HTTPS." }, { status: 400 });
    }
    try {
      await assertSafeUpstreamUrl(tokenUrl);
    } catch {
      return NextResponse.json({ error: "OAuth token URL must resolve to a public HTTPS endpoint." }, { status: 400 });
    }
  }
  let securityScheme = body.security_scheme ?? null;
  if (body.server_id) {
    const { data: server, error: serverError } = await createAdminClient()
      .from("mcp_servers")
      .select("id,endpoint_map")
      .eq("id", body.server_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (serverError || !server) {
      return NextResponse.json({ error: "Selected server does not belong to this user." }, { status: 403 });
    }
    if (body.auth_scheme === "oauth2") {
      const schemes = Array.from(new Set((Array.isArray(server.endpoint_map) ? server.endpoint_map : [])
        .flatMap((endpoint) => oauthSecuritySchemeNames(endpoint))));
      if (securityScheme && schemes.length > 0 && !schemes.includes(securityScheme)) {
        return NextResponse.json({ error: `OAuth security scheme must be one of: ${schemes.join(", ")}.` }, { status: 400 });
      }
      if (!securityScheme && schemes.length === 1) securityScheme = schemes[0];
      if (!securityScheme && schemes.length > 1) {
        return NextResponse.json({ error: `This server has multiple OAuth schemes. Choose one: ${schemes.join(", ")}.` }, { status: 400 });
      }
      return NextResponse.json({
        error: "Direct OAuth token attachment cannot verify the token issuer. Use POST /api/oauth/connect so Astrail derives the provider endpoints from the imported API contract.",
      }, { status: 400 });
    }
  }

  const secret = body.auth_scheme === "oauth2" ? body.access_token ?? body.secret : body.secret;
  if (!secret) {
    return NextResponse.json({ error: "Credential secret is required." }, { status: 400 });
  }
  const encryptedSecret = encryptCredential(secret);
  const scopes = normalizeOAuthScopes(body.scopes);
  const insertPayload: Record<string, unknown> = body.auth_scheme === "oauth2"
    ? {
        user_id: userData.user.id,
        server_id: body.server_id ?? null,
        name: body.name,
        provider: body.provider ?? null,
        security_scheme: securityScheme,
        auth_scheme: body.auth_scheme,
        end_user_id: body.end_user_id ?? null,
        client_id: body.client_id ?? null,
        client_secret_ciphertext: body.client_secret ? encryptCredential(body.client_secret) : null,
        token_auth_method: body.token_auth_method ?? "client_secret_post",
        injection_name: null,
        scopes,
        secret_ciphertext: encryptedSecret,
        access_token_ciphertext: encryptedSecret,
        refresh_token_ciphertext: body.refresh_token ? encryptCredential(body.refresh_token) : null,
        token_url: body.token_url ?? null,
        expires_at: body.expires_at ?? null,
        key_preview: previewSecret(secret),
        updated_at: new Date().toISOString(),
      }
    : {
        user_id: userData.user.id,
        server_id: body.server_id ?? null,
        name: body.name,
        provider: body.provider ?? null,
        auth_scheme: body.auth_scheme,
        ...(body.end_user_id ? { end_user_id: body.end_user_id } : {}),
        injection_name: body.auth_scheme === "bearer" ? null : body.injection_name ?? null,
        scopes,
        secret_ciphertext: encryptedSecret,
        key_preview: previewSecret(secret),
        updated_at: new Date().toISOString(),
      };

  const { data, error } = await createAdminClient()
    .from("api_credentials")
    .insert(insertPayload)
    .select(body.auth_scheme === "oauth2" ? CredentialSelect : LegacyCredentialSelect)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ credential: data });
}
