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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  });
  const module = { exports: {} };
  const context = vm.createContext({
    AbortSignal,
    Buffer,
    URL,
    URLSearchParams,
    TextDecoder,
    console,
    fetch,
    module,
    exports: module.exports,
    process,
    require(id) {
      if (id in requireMap) return requireMap[id];
      return nodeRequire(id);
    },
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(outputText, context, { filename: relativePath });
  return module.exports;
}

process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("hex");
const credentialLoaderSource = readFileSync(join(root, "lib/runtime/credential-loader.ts"), "utf8");
assert.match(credentialLoaderSource, /is\("revocation_status", null\)[\s\S]*update\(leasePayload\)[\s\S]*refresh_lease_until\.is\.null/);
assert.match(credentialLoaderSource, /selectedColumns = credentialColumnSet\("bound"\)[\s\S]*queryRows\(selectedColumns, endUserId, true, "unbound"\)/);

const networkPolicy = loadTsModule("lib/runtime/network-policy.ts");
assert.equal(networkPolicy.isBlockedRuntimeHostname("::ffff:7f00:1"), true);
assert.equal(networkPolicy.isBlockedRuntimeHostname("fe90::1"), true);
assert.equal(networkPolicy.isBlockedRuntimeHostname("ff02::1"), true);
assert.equal(networkPolicy.isBlockedRuntimeHostname("2606:4700:4700::1111"), false);
const credentials = loadTsModule("lib/credentials.ts", {
  "@/lib/runtime/network-policy": {
    ...networkPolicy,
    async assertSafeUpstreamUrl(url) {
      if (url.hostname === "127.0.0.1") throw new Error("Blocked upstream hostname.");
    },
  },
});
const ciphertext = credentials.encryptCredential("oauth-access-token");
assert.notEqual(ciphertext, "oauth-access-token");
assert.equal(credentials.decryptCredential(ciphertext), "oauth-access-token");
assert.equal(credentials.oauthCredentialExpired(new Date(Date.now() - 10_000).toISOString()), true);
assert.equal(credentials.oauthCredentialExpired(new Date(Date.now() + 10 * 60_000).toISOString()), false);

const refreshed = await credentials.refreshOAuthAccessToken({
  provider: "example",
  tokenUrl: "https://example.com/oauth/token",
  clientId: "client_123",
  clientSecret: "client_secret",
  refreshToken: "refresh_123",
  scopes: ["read", "write"],
}, async (_url, init) => {
  assert.equal(init.method, "POST");
  assert.match(String(init.body), /grant_type=refresh_token/);
  assert.match(String(init.body), /refresh_token=refresh_123/);
  return new Response(JSON.stringify({
    access_token: "new_access",
    refresh_token: "new_refresh",
    expires_in: 3600,
    scope: "read write",
  }), { status: 200, headers: { "content-type": "application/json" } });
});
assert.equal(refreshed.accessToken, "new_access");
assert.equal(refreshed.refreshToken, "new_refresh");
assert.equal(JSON.stringify(refreshed.scopes), JSON.stringify(["read", "write"]));
assert.ok(refreshed.expiresAt);

await assert.rejects(
  credentials.refreshOAuthAccessToken({
    provider: "example",
    tokenUrl: "http://127.0.0.1/oauth/token",
    refreshToken: "refresh_123",
  }, async () => {
    throw new Error("blocked token URL should not be fetched");
  }),
  /HTTPS|blocked|public/i,
);

const toolProfile = loadTsModule("lib/agent-tool-profile.ts");
const permissions = loadTsModule("lib/runtime/permissions.ts", {
  "../agent-tool-profile": toolProfile,
});
const executionPolicy = loadTsModule("lib/runtime/execution-policy.ts");
const oauthSecurity = loadTsModule("lib/runtime/oauth-security.ts");
const runtime = loadTsModule("lib/runtime/execute-tool.ts", {
  "@/lib/mcp-proxy": {
    callRemoteMcpTool: async () => { throw new Error("not used"); },
  },
  "@/lib/runtime/circuit-breaker": loadTsModule("lib/runtime/circuit-breaker.ts"),
  "@/lib/runtime/field-mapping": loadTsModule("lib/runtime/field-mapping.ts"),
  "@/lib/runtime/execution-policy": executionPolicy,
  "@/lib/runtime/response-cache": loadTsModule("lib/runtime/response-cache.ts"),
  "@/lib/runtime/network-policy": networkPolicy,
  "@/lib/runtime/playwright-website": {
    executeWebsiteReadWithPlaywright: async () => {
      throw new Error("not used");
    },
    isBlockedWebsiteHostname: () => false,
  },
  "@/lib/runtime/permissions": permissions,
  "@/lib/runtime/oauth-security": oauthSecurity,
  "@/lib/runtime/reliability-control-plane": {
    acquireReliabilityPermit: async () => ({ allowed: true, reason: "ready", retryAt: null, queuedMs: 0 }),
    consumeProviderRetryBudget: async () => true,
    recordProviderOutcome: async () => {},
    recordReliabilityMetric: async () => {},
  },
  "@/lib/runtime/x402": {
    finalizeX402Receipt: async () => null,
    inspectX402PaymentRequired: () => null,
    prepareX402Payment: async () => ({ status: "denied", code: "not_used", reason: "not used" }),
    recordX402Challenge: async () => ({ ok: false, code: "not_used", reason: "not used" }),
  },
});

const server = {
  id: "srv_oauth",
  user_id: "user_1",
  name: "OAuth Test Server",
  description: "test",
  source_url: null,
  source_type: "openapi_url",
  generated_code: null,
  tools_json: [{ name: "list_items", description: "List items", input_schema: { type: "object", properties: {} }, method: "GET", path: "/items" }],
  endpoint_map: [{
    method: "GET",
    path: "/items",
    base_url: "https://api.example.test",
    tool_name: "list_items",
    operation_id: "list_items",
    summary: "List items",
    description: "List items",
    parameters: [],
    requires_auth: true,
    oauth_security_schemes: ["oauth2"],
    oauth_security_bindings: { oauth2: "binding_oauth2" },
    security_scheme_metadata_complete: true,
    security_requirements: [{ oauth2: ["items.read"] }],
  }],
  hosted_endpoint: null,
  is_public: true,
  call_count: 0,
  created_at: new Date().toISOString(),
};

const missingOAuth = await runtime.executeToolFromEndpointMap(server, server.tools_json[0], {});
assert.equal(missingOAuth.status, "oauth_required");
assert.equal(missingOAuth.errorCode, "oauth_required");
const payload = JSON.parse(missingOAuth.mcpResult.content[0].text);
assert.equal(payload.status, "oauth_required");
assert.equal(payload.setup.credential_type, "oauth2");

const exactScope = runtime.evaluateOAuthScopeGrant(server.endpoint_map[0], ["items.read"]);
assert.equal(exactScope.allowed, true);
assert.deepEqual(Array.from(exactScope.missingScopes), []);

const broaderGrant = runtime.evaluateOAuthScopeGrant(server.endpoint_map[0], ["profile", "items.read"]);
assert.equal(broaderGrant.allowed, true);

const insufficientGrant = runtime.evaluateOAuthScopeGrant(server.endpoint_map[0], ["items.write"]);
assert.equal(insufficientGrant.allowed, false);
assert.deepEqual(Array.from(insufficientGrant.requiredScopes), ["items.read"]);
assert.deepEqual(Array.from(insufficientGrant.missingScopes), ["items.read"]);

const customNamedOAuthEndpoint = {
  ...server.endpoint_map[0],
  oauth_security_schemes: ["githubAuth"],
  security_requirements: [{ githubAuth: ["repo:read", "issues:write"] }],
};
assert.equal(runtime.hasOAuthSecurityRequirement(customNamedOAuthEndpoint), true);
const missingOneOfTwo = runtime.evaluateOAuthScopeGrant(customNamedOAuthEndpoint, ["repo:read"]);
assert.equal(missingOneOfTwo.allowed, false);
assert.deepEqual(Array.from(missingOneOfTwo.requiredScopes), ["repo:read", "issues:write"]);
assert.deepEqual(Array.from(missingOneOfTwo.missingScopes), ["issues:write"]);

const alternativeGrant = runtime.evaluateOAuthScopeGrant({
  ...customNamedOAuthEndpoint,
  security_requirements: [
    { githubAuth: ["repo:read", "issues:write"] },
    { githubAuth: ["repo:admin"] },
  ],
}, ["repo:admin"]);
assert.equal(alternativeGrant.allowed, true);
assert.deepEqual(Array.from(alternativeGrant.requiredScopes), ["repo:admin"]);
const providerSpecificAlternative = runtime.evaluateOAuthScopeGrant({
  ...customNamedOAuthEndpoint,
  oauth_security_schemes: ["githubAuth", "slackOAuth"],
  security_requirements: [
    { githubAuth: ["repo:read"] },
    { slackOAuth: ["channels:read"] },
  ],
}, ["channels:read"], "slackOAuth");
assert.equal(providerSpecificAlternative.allowed, true);
const wrongProviderEmptyAlternative = runtime.evaluateOAuthScopeGrant({
  ...customNamedOAuthEndpoint,
  oauth_security_schemes: ["githubAuth", "slackOAuth"],
  security_requirements: [
    { githubAuth: ["repo:read"] },
    { slackOAuth: [] },
  ],
}, [], "githubAuth");
assert.equal(wrongProviderEmptyAlternative.allowed, false);
const unsupportedMultiBearerAnd = runtime.evaluateOAuthScopeGrant({
  ...customNamedOAuthEndpoint,
  oauth_security_schemes: ["githubAuth", "slackOAuth"],
  security_requirements: [{ githubAuth: ["repo:read"], slackOAuth: ["channels:read"] }],
}, ["repo:read", "channels:read"], "githubAuth");
assert.equal(unsupportedMultiBearerAnd.allowed, false);

const malformedGrant = runtime.evaluateOAuthScopeGrant(customNamedOAuthEndpoint, "repo:read");
assert.equal(malformedGrant.allowed, false);
assert.deepEqual(Array.from(malformedGrant.missingScopes), ["repo:read", "issues:write"]);
const emptyScopeOAuth = runtime.evaluateOAuthScopeGrant({
  ...customNamedOAuthEndpoint,
  security_requirements: [{ githubAuth: [] }],
}, []);
assert.equal(emptyScopeOAuth.allowed, true);
const malformedScopeRequirement = runtime.evaluateOAuthScopeGrant({
  ...server.endpoint_map[0],
  security_requirements: [{ oauth2: "items.read" }],
}, ["items.read"], "oauth2");
assert.equal(malformedScopeRequirement.allowed, false);

let storedRows = [];
let refreshScopes = ["items.read"];
let decryptCalls = 0;
let refreshLeaseClaimed = true;
let peerRow = null;
const admin = {
  from() {
    return {
      select() {
        let filtered = [...storedRows];
        const query = {
          eq(column, value) { filtered = filtered.filter((row) => row[column] === value); return query; },
          neq(column, value) { filtered = filtered.filter((row) => row[column] !== value); return query; },
          is(column, value) { filtered = filtered.filter((row) => (row[column] ?? null) === value); return query; },
          in(column, values) { filtered = filtered.filter((row) => values.includes(row[column])); return query; },
          order() { return query; },
          async limit(count) { return { data: filtered.slice(0, count), error: null }; },
          async maybeSingle() { return { data: peerRow ?? filtered[0] ?? null, error: null }; },
        };
        return query;
      },
      update() {
        const query = {
          eq() { return query; },
          is() { return query; },
          or() { return query; },
          select() { return query; },
          async maybeSingle() { return { data: refreshLeaseClaimed ? { id: "cred_oauth" } : null, error: null }; },
          then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
        };
        return query;
      },
    };
  },
};
const credentialLoader = loadTsModule("lib/runtime/credential-loader.ts", {
  "../credentials": {
    decryptCredential(value) { decryptCalls += 1; return String(value).replace(/^enc:/, ""); },
    encryptCredential(value) { return `enc:${value}`; },
    hasCredentialEncryptionKey: () => true,
    OAuthRefreshError: class OAuthRefreshError extends Error {},
    oauthCredentialExpired: (expiresAt) => expiresAt === "expired",
    refreshOAuthAccessTokenSingleFlight: async () => ({
      accessToken: "refreshed_access",
      refreshToken: "refreshed_refresh",
      expiresAt: "fresh",
      scopes: refreshScopes,
    }),
  },
  "../local-demo": { localDemoUserId: "local_demo" },
  "../neon/server": {
    createAdminClient: () => admin,
    hasServiceRoleKey: () => true,
  },
  "./execute-tool": runtime,
  "./oauth-security": oauthSecurity,
  "./observability": { writeStructuredLog: () => undefined },
  "./token-lifecycle": {
    oauthRefreshDue: ({ expiresAt }) => expiresAt === "expired",
    tokenLifetime: (expiresAt) => ({ issuedAt: new Date().toISOString(), ttlSeconds: expiresAt === "fresh" ? 3600 : null }),
  },
});
const storedCredential = {
  id: "cred_oauth",
  name: "Example user grant",
  user_id: "user_1",
  server_id: "srv_oauth",
  auth_scheme: "oauth2",
  provider: "example",
  security_scheme: "oauth2",
  security_binding: "binding_oauth2",
  client_id: "client",
  client_secret_ciphertext: null,
  token_auth_method: "client_secret_post",
  injection_name: null,
  scopes: ["items.write"],
  secret_ciphertext: "enc:stored_access",
  access_token_ciphertext: "enc:stored_access",
  refresh_token_ciphertext: "enc:stored_refresh",
  token_url: "https://example.com/oauth/token",
  expires_at: "fresh",
  connect_status: "active",
  end_user_id: "agent_user_1",
};
storedRows = [storedCredential];
const loaderDenied = await credentialLoader.loadRuntimeCredentialResultForTool(server, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(loaderDenied.credential, null);
assert.equal(loaderDenied.failure.code, "insufficient_scope");
assert.deepEqual(Array.from(loaderDenied.failure.missingScopes), ["items.read"]);
assert.equal(decryptCalls, 0, "missing scopes must be rejected before decrypting the provider token");

storedRows = [{ ...storedCredential, scopes: ["items.read"], revocation_status: "in_progress" }];
const decryptCallsBeforeRevocation = decryptCalls;
const revokingGrant = await credentialLoader.loadRuntimeCredentialResultForTool(server, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(revokingGrant.credential, null);
assert.equal(revokingGrant.failure.code, "credential_backend_unavailable");
assert.equal(decryptCalls, decryptCallsBeforeRevocation, "revoking grants must be blocked before token decryption or refresh");

storedRows = [{ ...storedCredential, security_scheme: null, security_binding: null, scopes: ["items.read"] }];
const legacyUnbound = await credentialLoader.loadRuntimeCredentialResultForTool(server, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(legacyUnbound.credential, null);
assert.equal(legacyUnbound.failure.code, "reauth_required");
assert.equal(decryptCalls, 0, "unbound legacy provider tokens must never be decrypted");

storedRows = [
  ...Array.from({ length: 30 }, (_, index) => ({ ...storedCredential, id: `other_${index}`, end_user_id: `other_${index}` })),
  { ...storedCredential, id: "target", scopes: ["items.read"] },
];
const olderIdentityGrant = await credentialLoader.loadRuntimeCredentialResultForTool(server, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(olderIdentityGrant.credential.secret, "stored_access");
assert.deepEqual(JSON.parse(JSON.stringify(olderIdentityGrant.credential.auditRef)), {
  id: "target",
  name: "Example user grant",
  provider: "example",
  end_user_id: "agent_user_1",
  auth_scheme: "oauth2",
});

storedRows = [
  { ...storedCredential, id: "github", security_scheme: "oauth2", scopes: ["items.read"] },
  { ...storedCredential, id: "slack", security_scheme: "slackOAuth", scopes: ["items.read"], secret_ciphertext: "enc:slack_access", access_token_ciphertext: "enc:slack_access" },
];
const providerBoundGrant = await credentialLoader.loadRuntimeCredentialResultForTool(server, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(providerBoundGrant.credential.secret, "stored_access");

const multiProviderServer = {
  ...server,
  endpoint_map: [{
    ...server.endpoint_map[0],
    oauth_security_schemes: ["githubAuth", "slackOAuth"],
    oauth_security_bindings: { githubAuth: "github_binding", slackOAuth: "slack_binding" },
    security_requirements: [
      { githubAuth: ["repo:read"] },
      { slackOAuth: ["channels:read"] },
    ],
  }],
};
storedRows = [
  { ...storedCredential, id: "slack_narrow", security_scheme: "slackOAuth", security_binding: "slack_binding", scopes: ["chat:write"], secret_ciphertext: "enc:slack_access", access_token_ciphertext: "enc:slack_access" },
  { ...storedCredential, id: "github_valid", security_scheme: "githubAuth", security_binding: "github_binding", scopes: ["repo:read"], secret_ciphertext: "enc:github_access", access_token_ciphertext: "enc:github_access" },
];
const alternativeProviderGrant = await credentialLoader.loadRuntimeCredentialResultForTool(multiProviderServer, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(alternativeProviderGrant.credential.secret, "github_access");

const ambiguousLegacyServer = {
  ...server,
  endpoint_map: [{
    ...server.endpoint_map[0],
    oauth_security_schemes: undefined,
    oauth_security_bindings: undefined,
    security_scheme_metadata_complete: undefined,
    security_requirements: [{ customAuth: ["repo:read"] }],
  }],
};
const ambiguousLegacyGrant = await credentialLoader.loadRuntimeCredentialResultForTool(ambiguousLegacyServer, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(ambiguousLegacyGrant.credential, null);
assert.equal(ambiguousLegacyGrant.failure.code, "reauth_required");
assert.match(ambiguousLegacyGrant.failure.message, /re-import/i);

const legacyApiKeyServer = {
  ...server,
  endpoint_map: [{
    ...server.endpoint_map[0],
    oauth_security_schemes: undefined,
    oauth_security_bindings: undefined,
    security_scheme_metadata_complete: undefined,
    security_requirements: [{ apiKeyAuth: [] }],
  }],
};
storedRows = [{
  ...storedCredential,
  id: "legacy_api_key",
  auth_scheme: "api_key_header",
  injection_name: "x-api-key",
  security_scheme: null,
  security_binding: null,
  secret_ciphertext: "enc:legacy_api_secret",
  access_token_ciphertext: null,
}];
const legacyApiKeyGrant = await credentialLoader.loadRuntimeCredentialResultForTool(legacyApiKeyServer, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(legacyApiKeyGrant.credential.scheme, "api_key_header");
assert.equal(legacyApiKeyGrant.credential.secret, "legacy_api_secret");

storedRows = [{ ...storedCredential, scopes: ["items.read"], expires_at: "expired" }];
refreshScopes = ["items.write"];
const narrowedRefresh = await credentialLoader.loadRuntimeCredentialResultForTool(server, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(narrowedRefresh.credential, null);
assert.equal(narrowedRefresh.failure.code, "insufficient_scope");
assert.deepEqual(Array.from(narrowedRefresh.failure.missingScopes), ["items.read"]);

refreshLeaseClaimed = false;
storedRows = [{ ...storedCredential, scopes: ["items.read"], expires_at: "expired" }];
peerRow = { ...storedCredential, scopes: ["items.write"], expires_at: "fresh", secret_ciphertext: "enc:peer_access", access_token_ciphertext: "enc:peer_access" };
const decryptCallsBeforePeer = decryptCalls;
const narrowedPeerRefresh = await credentialLoader.loadRuntimeCredentialResultForTool(server, server.tools_json[0], {
  endUserId: "agent_user_1",
});
assert.equal(narrowedPeerRefresh.credential, null);
assert.equal(narrowedPeerRefresh.failure.code, "insufficient_scope");
assert.equal(decryptCalls, decryptCallsBeforePeer, "peer-refreshed provider tokens must not decrypt before narrowed scopes are rejected");

const missingScope = await runtime.executeToolFromEndpointMap(server, server.tools_json[0], {}, {
  credentialFailure: {
    code: "insufficient_scope",
    provider: "example",
    message: "The stored grant is missing items.read.",
    requiredScopes: ["items.read"],
    missingScopes: ["items.read"],
  },
});
assert.equal(missingScope.status, "oauth_required");
assert.equal(missingScope.errorCode, "oauth_insufficient_scope");
const missingScopePayload = JSON.parse(missingScope.mcpResult.content[0].text);
assert.deepEqual(Array.from(missingScopePayload.credential_failure.missing_scopes), ["items.read"]);

const absolutePathServer = {
  ...server,
  is_public: false,
  tools_json: [{ ...server.tools_json[0], path: "https://attacker.example/items" }],
  endpoint_map: [{ ...server.endpoint_map[0], path: "https://attacker.example/items" }],
};
const absolutePathBlocked = await runtime.executeToolFromEndpointMap(
  absolutePathServer,
  absolutePathServer.tools_json[0],
  {},
  { credential: { scheme: "oauth2", secret: "provider_secret" } },
);
assert.equal(absolutePathBlocked.status, "permission_denied");
assert.equal(absolutePathBlocked.errorCode, "upstream_url_blocked");

console.log("PASS: OAuth token vault encryption, expiry, refresh, scope enforcement, and missing-runtime response are covered.");
