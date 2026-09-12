import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);

function loadTsModule(relativePath, requireMap = {}) {
  const source = readFileSync(join(root, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: relativePath,
  });
  const module = { exports: {} };
  const context = vm.createContext({ AbortSignal, Buffer, URL, URLSearchParams, Response, console, fetch, module, exports: module.exports, process, require(id) { return id in requireMap ? requireMap[id] : nodeRequire(id); }, setTimeout, clearTimeout });
  vm.runInContext(outputText, context, { filename: relativePath });
  return module.exports;
}

const revocation = loadTsModule("lib/oauth-revocation.ts", {
  "@/lib/runtime/network-policy": {
    resolveSafeUpstreamAddresses: async () => ["93.184.216.34"],
    readBoundedResponseText: async (response) => response.text(),
  },
});
const credentialDeleteRoute = readFileSync(join(root, "app/api/credentials/[id]/route.ts"), "utf8");
const oauthCallbackRoute = readFileSync(join(root, "app/api/oauth/callback/route.ts"), "utf8");
const oauthConnectRoute = readFileSync(join(root, "app/api/oauth/connect/route.ts"), "utf8");
const openApiSource = readFileSync(join(root, "lib/openapi.ts"), "utf8");
assert.match(credentialDeleteRoute, /"provider_revoked_local_delete_failed", "provider_revoked_audit_failed"/);
assert.match(credentialDeleteRoute, /revocation_status\.eq\.in_progress,revocation_attempted_at\.lt/);
assert.match(credentialDeleteRoute, /\.is\("refresh_lease_until", null\)/);
assert.match(credentialDeleteRoute, /Read[\s\S]*encrypted token columns again after claiming/);
assert.match(credentialDeleteRoute, /revocation_status:\s*"in_progress"/);
assert.match(oauthCallbackRoute, /A provider grant now exists[\s\S]*revokeOAuthGrant/);
assert.match(oauthCallbackRoute, /connect_status:\s*"failed",[\s\S]*revocation_status:\s*"failed"/);
assert.match(oauthCallbackRoute, /The update may have committed[\s\S]*connect_status === "active"[\s\S]*could not confirm whether the token was stored/);
assert.match(credentialDeleteRoute, /connect_status === "exchanging" && !hasIssuedOAuthToken/);
assert.match(credentialDeleteRoute, /select\("id,auth_scheme"\)[\s\S]*auth_scheme !== "oauth2"/);
assert.match(oauthConnectRoute, /confirmed_revocation_url[\s\S]*revocationMatches/);
const bindingStart = openApiSource.indexOf('createHash("sha256").update([', openApiSource.indexOf("oauthSecurityBindings"));
const bindingEnd = openApiSource.indexOf('].join("\\0")).digest("hex")', bindingStart);
assert.ok(bindingStart >= 0 && bindingEnd > bindingStart);
assert.doesNotMatch(openApiSource.slice(bindingStart, bindingEnd), /revocation_url/, "revocation metadata must not invalidate pre-upgrade OAuth bindings");
assert.match(readFileSync(join(root, "lib/oauth-revocation.ts"), "utf8"), /for \(const address of safeAddresses\)/);
await new Promise((resolve, reject) => revocation.pinnedLookup("93.184.216.34")("example.com", { all: true }, (error, addresses) => {
  if (error) return reject(error);
  assert.deepEqual(JSON.parse(JSON.stringify(addresses)), [{ address: "93.184.216.34", family: 4 }]);
  resolve();
}));
assert.equal(revocation.inferredOAuthRevocationUrl("salesforce", "https://attacker.example/token"), null);

let captured;
const google = await revocation.revokeOAuthGrant({
  provider: "google", revocationUrl: null, tokenUrl: "https://oauth2.googleapis.com/token", clientId: "google-client", clientSecret: null,
  tokenAuthMethod: null, accessToken: "google-access", refreshToken: "google-refresh",
}, async (url, init) => {
  captured = { url: String(url), init };
  return new Response("", { status: 200 });
});
assert.equal(captured.url, "https://oauth2.googleapis.com/revoke");
assert.equal(captured.init.method, "POST");
assert.match(String(captured.init.body), /token=google-refresh/);
assert.equal(google.tokenType, "refresh_token");

await revocation.revokeOAuthGrant({
  provider: "github", revocationUrl: null, tokenUrl: "https://github.com/login/oauth/access_token", clientId: "github-client", clientSecret: "github-secret",
  tokenAuthMethod: "client_secret_basic", accessToken: "github-access", refreshToken: null,
}, async (url, init) => {
  captured = { url: String(url), init };
  return new Response(null, { status: 204 });
});
assert.equal(captured.url, "https://api.github.com/applications/github-client/grant");
assert.equal(captured.init.method, "DELETE");
assert.match(captured.init.headers.authorization, /^Basic /);
assert.match(captured.init.headers["user-agent"], /^Astrail\//);
assert.deepEqual(JSON.parse(captured.init.body), { access_token: "github-access" });

await revocation.revokeOAuthGrant({
  provider: "slack", revocationUrl: null, tokenUrl: "https://slack.com/api/oauth.v2.access", clientId: null, clientSecret: null,
  tokenAuthMethod: null, accessToken: "slack-access", refreshToken: null,
}, async (_url, init) => {
  assert.equal(init.headers.authorization, "Bearer slack-access");
  return new Response(JSON.stringify({ ok: true, revoked: true }), { status: 200 });
});

await assert.rejects(() => revocation.revokeOAuthGrant({
  provider: "unknown", revocationUrl: null, tokenUrl: "https://auth.example.com/token", clientId: "client", clientSecret: null,
  tokenAuthMethod: null, accessToken: "secret-token", refreshToken: null,
}, async () => new Response("", { status: 200 })), /no trusted revocation endpoint/i);

await assert.rejects(() => revocation.revokeOAuthGrant({
  provider: "google", revocationUrl: null, tokenUrl: "https://oauth2.googleapis.com/token", clientId: "client", clientSecret: null,
  tokenAuthMethod: null, accessToken: "secret-token", refreshToken: null,
}, async () => new Response(JSON.stringify({ error: "server_error", error_description: "secret-token" }), { status: 500 })), (error) => {
  assert.doesNotMatch(error.message, /secret-token/);
  return true;
});

function makeDeleteHarness(overrides = {}) {
  const state = {
    deleted: false,
    revokeCalls: 0,
    claimAllowed: true,
    auditFails: false,
    updates: [],
    credential: {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "user-1",
      server_id: "22222222-2222-4222-8222-222222222222",
      name: "Google workspace",
      provider: "google",
      auth_scheme: "oauth2",
      security_scheme: "oauth2",
      security_binding: "binding-1",
      end_user_id: "person-1",
      client_id: "client-1",
      client_secret_ciphertext: null,
      token_auth_method: null,
      secret_ciphertext: null,
      access_token_ciphertext: "enc:access",
      refresh_token_ciphertext: "enc:refresh",
      token_url: "https://oauth2.googleapis.com/token",
      revocation_url: "https://oauth2.googleapis.com/revoke",
      revocation_status: null,
      revocation_attempted_at: null,
      connect_status: "connected",
      ...overrides.credential,
    },
    ...overrides.state,
  };

  function mutationQuery(kind) {
    const query = {
      eq() { return query; },
      is() { return query; },
      lt() { return query; },
      or() { return query; },
      select() { return query; },
      async maybeSingle() {
        if (kind === "delete") {
          state.deleted = true;
          return { data: { id: state.credential.id }, error: null };
        }
        return { data: state.claimAllowed ? { id: state.credential.id } : null, error: null };
      },
      then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
    };
    return query;
  }

  const admin = {
    from(table) {
      if (table === "tool_call_logs") return { async insert() { return { error: state.auditFails ? { message: "audit unavailable" } : null }; } };
      if (table === "mcp_servers") {
        return {
          select() {
            const query = {
              eq() { return query; },
              async maybeSingle() {
                return { data: { endpoint_map: [{
                  oauth_security_bindings: { oauth2: "binding-1" },
                  oauth_security_metadata: { oauth2: { token_url: "https://oauth2.googleapis.com/token", revocation_url: "https://oauth2.googleapis.com/revoke" } },
                }] }, error: null };
              },
            };
            return query;
          },
        };
      }
      return {
        select() {
          const query = {
            eq() { return query; },
            async maybeSingle() { return { data: state.credential, error: null }; },
          };
          return query;
        },
        update(payload) { state.updates.push(payload); return mutationQuery("update"); },
        delete() { return mutationQuery("delete"); },
      };
    },
  };
  const route = loadTsModule("app/api/credentials/[id]/route.ts", {
    "next/server": { NextResponse: { json(body, init = {}) { return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }); } } },
    "@/lib/credentials": { decryptCredential(value) { return String(value).replace(/^enc:/, ""); }, hasCredentialEncryptionKey() { return true; } },
    "@/lib/oauth-revocation": {
      inferredOAuthRevocationUrl(provider) { return provider === "google" ? "https://oauth2.googleapis.com/revoke" : null; },
      async revokeOAuthGrant(input) { state.revokeCalls += 1; assert.equal(input.refreshToken, "refresh"); return { provider: "google", endpoint: "https://oauth2.googleapis.com/revoke", tokenType: "refresh_token", alreadyInactive: false }; },
    },
    "@/lib/runtime/oauth-security": {
      oauthSecurityBinding(endpoint, scheme) { return endpoint.oauth_security_bindings?.[scheme] ?? null; },
      oauthSecurityMetadata(endpoint, scheme) { return endpoint.oauth_security_metadata?.[scheme] ?? null; },
    },
    "@/lib/neon/env": { hasServerNeonEnv() { return true; } },
    "@/lib/neon/server": {
      createAdminClient() { return admin; },
      createServerNeonClient() { return { auth: { async getUser() { return { data: { user: { id: "user-1" } } }; } } }; },
    },
  });
  return { route, state };
}

{
  const { route, state } = makeDeleteHarness();
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 200);
  assert.equal(state.revokeCalls, 1);
  assert.equal(state.deleted, true);
  assert.equal((await response.json()).revoked, true);
}

{
  const { route, state } = makeDeleteHarness({ state: { claimAllowed: false } });
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 409);
  assert.equal(state.revokeCalls, 0);
  assert.equal(state.deleted, false);
}

{
  const { route, state } = makeDeleteHarness({ credential: { connect_status: "failed" } });
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 200);
  assert.equal(state.revokeCalls, 1);
  assert.equal(state.deleted, true);
}

{
  const { route, state } = makeDeleteHarness({ credential: { connect_status: "exchanging", access_token_ciphertext: null, refresh_token_ciphertext: null, secret_ciphertext: "enc:astrail_pending_connect" } });
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).requires_provider_confirmation, true);
  assert.equal(state.revokeCalls, 0);
  assert.equal(state.deleted, false);
  const confirmed = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111?confirm_provider_revoked=true", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).manual_confirmation, true);
  assert.equal(state.deleted, true);
}

{
  const { route, state } = makeDeleteHarness({ credential: { security_scheme: null, security_binding: null } });
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).requires_provider_confirmation, true);
  const confirmed = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111?confirm_provider_revoked=true", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(confirmed.status, 200);
  assert.equal(state.deleted, true);
}

{
  const { route, state } = makeDeleteHarness({ credential: { provider: "custom", revocation_url: null } });
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 409);
  assert.equal(state.revokeCalls, 0);
  assert.equal(state.deleted, false);
}

{
  const { route, state } = makeDeleteHarness({ credential: { revocation_status: "provider_revoked_local_delete_failed" } });
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 200);
  assert.equal(state.revokeCalls, 0);
  assert.equal(state.deleted, true);
}

{
  const { route, state } = makeDeleteHarness({ credential: { revocation_url: "https://attacker.example/revoke" } });
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 409);
  assert.equal(state.revokeCalls, 0);
  assert.equal(state.deleted, false);
}

{
  const { route, state } = makeDeleteHarness({ state: { auditFails: true } });
  const response = await route.DELETE(new Request("https://astrail.dev/api/credentials/11111111-1111-4111-8111-111111111111", { method: "DELETE" }), { params: { id: state.credential.id } });
  assert.equal(response.status, 503);
  assert.equal(state.revokeCalls, 1);
  assert.equal(state.deleted, false);
  assert.ok(state.updates.some((payload) => payload.revocation_status === "provider_revoked_audit_failed"));
}

console.log("PASS: provider OAuth revocation adapters, secure requests, atomic deletion flow, cleanup retries, and redacted failures.");
