import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);

function loadTsModule(relativePath, requireMap = {}, globals = {}) {
  const source = readFileSync(join(root, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: relativePath,
  });
  const module = { exports: {} };
  const context = vm.createContext({
    AbortSignal,
    Buffer,
    Headers,
    Request,
    Response,
    TextEncoder,
    URL,
    URLSearchParams,
    console,
    crypto: globalThis.crypto,
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
    ...globals,
  });
  vm.runInContext(outputText, context, { filename: relativePath });
  return module.exports;
}

const agentProfile = loadTsModule("lib/agent-tool-profile.ts");
const governance = loadTsModule("lib/tool-governance.ts", {
  "./agent-tool-profile": agentProfile,
});
const permissions = loadTsModule("lib/runtime/permissions.ts", {
  "../agent-tool-profile": agentProfile,
});
const workerExport = loadTsModule("lib/worker-export.ts", {
  "@/lib/tool-governance": governance,
  "@/lib/runtime/execute-tool": {
    findEndpointForTool(server, tool) {
      return (server.endpoint_map ?? []).find((endpoint) => endpoint.tool_name === tool.name || endpoint.operation_id === tool.name || (endpoint.method === tool.method && endpoint.path === tool.path));
    },
  },
  "@/lib/runtime/permissions": permissions,
  "@/lib/urls": {
    resolveMcpEndpoint(serverId, storedEndpoint) {
      return storedEndpoint ?? `/api/mcp/${serverId}`;
    },
  },
});

const tools = [
  {
    name: "get_customer",
    description: "Get one customer.",
    enabled: true,
    policy: "allow",
    method: "GET",
    path: "/customers/{id}",
    input_schema: { type: "object", properties: { id: { type: "string" }, expand: { type: "string" } }, required: ["id"] },
    x_astrail: {
      risk: "read",
      action_level: "read",
      requires_auth: false,
      auth_schemes: [],
      required_scopes: [],
      prerequisites: [],
      agent_instructions: [],
      example_arguments: {},
      business_context: "Customers are paying accounts in the billing system.",
      use_when: "A support agent needs the canonical customer record.",
      avoid_when: "The user only needs a fuzzy customer search.",
      edge_case_notes: "A deleted customer returns 404 and should not be recreated automatically.",
    },
  },
  {
    name: "update_customer",
    description: "Update one customer.",
    enabled: true,
    policy: "approval",
    method: "PATCH",
    path: "/customers/{id}",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", "x-astrail-name": "id", "x-astrail-in": "path" },
        body: { type: "object", "x-astrail-name": "body", "x-astrail-in": "body" },
      },
      required: ["id", "body"],
    },
    x_astrail: { risk: "write", action_level: "write", requires_auth: false, auth_schemes: [], required_scopes: [], prerequisites: [], agent_instructions: [], example_arguments: {} },
  },
  {
    name: "get_sensitive_customer",
    description: "Get a sensitive customer record.",
    enabled: true,
    policy: "block",
    method: "GET",
    path: "/sensitive-customers/{id}",
    x_astrail: { risk: "read", action_level: "read", requires_auth: false, auth_schemes: [], required_scopes: [], prerequisites: [], agent_instructions: [], example_arguments: {} },
  },
  {
    name: "get_private_customer",
    description: "Get a provider-authenticated customer record.",
    enabled: true,
    policy: "allow",
    method: "GET",
    path: "/private-customers/{id}",
    x_astrail: { risk: "read", action_level: "read", requires_auth: true, auth_schemes: ["oauth"], required_scopes: ["customers:read"], prerequisites: [], agent_instructions: [], example_arguments: {} },
  },
  {
    name: "get_local_customer",
    description: "Get a customer from a blocked local target.",
    enabled: true,
    policy: "allow",
    method: "GET",
    path: "/local-customers/{id}",
    x_astrail: { risk: "read", action_level: "read", requires_auth: false, auth_schemes: [], required_scopes: [], prerequisites: [], agent_instructions: [], example_arguments: {} },
  },
  {
    name: "get_fc_customer",
    description: "Get a customer from a public hostname beginning with fc.",
    enabled: true,
    policy: "allow",
    method: "GET",
    path: "/customers/{customer-id}",
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", "x-astrail-name": "customer-id", "x-astrail-in": "path" },
      },
      required: ["customer_id"],
    },
    x_astrail: { risk: "read", action_level: "read", requires_auth: false, auth_schemes: [], required_scopes: [], prerequisites: [], agent_instructions: [], example_arguments: {} },
  },
  {
    name: "invoke_api_endpoint",
    description: "Invoke one reviewed endpoint by ID.",
    enabled: true,
    policy: "allow",
    method: "ASTRAIL_META",
    path: "/_meta/invoke",
    x_astrail: { risk: "read", action_level: "read", requires_auth: false, auth_schemes: [], required_scopes: [], prerequisites: [], agent_instructions: [], example_arguments: {} },
  },
  {
    name: "delete_customer",
    description: "Delete one customer.",
    enabled: false,
    policy: "block",
    method: "DELETE",
    path: "/customers/{id}",
    x_astrail: { risk: "destructive", action_level: "destructive", requires_auth: false, auth_schemes: [], required_scopes: [], prerequisites: [], agent_instructions: [], example_arguments: {} },
  },
];

const endpoints = tools.map((tool) => ({
  method: tool.method,
  path: tool.path,
  tool_name: tool.name === "get_sensitive_customer" ? "provider_sensitive_customer" : tool.name,
  operation_id: tool.name === "get_sensitive_customer" ? "provider_sensitive_customer" : tool.name,
  operation_kind: tool.x_astrail.action_level === "destructive" ? "destructive" : tool.x_astrail.action_level === "read" ? "read" : "write",
  base_url: tool.name === "get_local_customer" ? "https://localhost" : tool.name === "get_fc_customer" ? "https://fc.example.com/v1" : "https://api.example.com/v1",
  parameters: [
    { name: "X-Auth-Token", in: "header" },
    { name: "If-Match", in: "header" },
  ],
  path_params: [{ name: tool.name === "get_fc_customer" ? "customer-id" : "id", in: "path", required: true }],
  query_params: [{ name: "expand", in: "query" }],
  requires_auth: tool.name === "get_private_customer",
}));

const server = {
  id: "server_governance",
  user_id: "user_1",
  name: "Customer API",
  description: "Customer operations",
  source_url: "https://api.example.com/openapi.json",
  source_type: "openapi_url",
  generated_code: null,
  tools_json: tools,
  endpoint_map: endpoints,
  execution_policy: { max_attempts: 2, timeout_ms: 5000, base_delay_ms: 0, retry_statuses: [429, 503] },
  runtime_policy: {
    allowed_actions: ["read", "write"],
    business_context: "Support agents may inspect customer data but writes require a human.",
  },
  is_public: false,
  hosted_endpoint: "/api/mcp/server_governance",
  call_count: 0,
  created_at: new Date().toISOString(),
};

assert.equal(governance.assessToolGovernance(tools[0]).recommendedPolicy, "allow");
assert.equal(governance.assessToolGovernance(tools[1]).recommendedPolicy, "approval");
assert.equal(governance.assessToolGovernance(tools.find((tool) => tool.name === "delete_customer")).recommendedEnabled, false);
assert.equal(governance.assessToolGovernance({
  ...tools[0],
  name: "send_customer_email",
  x_astrail: { ...tools[0].x_astrail, action_level: "send", requires_auth: true, complexity: { parameter_count: 12, body_mode: "schema", compressed: true } },
}).recommendedPolicy, "approval");
assert.equal(governance.assessToolGovernance({ ...tools[0], name: "draft_customer_reply", x_astrail: { ...tools[0].x_astrail, action_level: "draft" } }).recommendedPolicy, "allow");
const recommendedDelete = governance.applyToolGovernanceRecommendation(tools.find((tool) => tool.name === "delete_customer"));
assert.equal(recommendedDelete.enabled, false);
assert.equal(recommendedDelete.policy, "block");
assert.match(governance.agentFacingToolDescription(tools[0]), /Business context: Customers are paying accounts/);
assert.match(governance.agentFacingToolDescription(tools[0]), /Do not use when:/);

const visibleTools = permissions.visibleToolsForRequest(server, tools, (_server, tool) => endpoints.find((endpoint) => endpoint.tool_name === tool.name));
assert.deepEqual(Array.from(visibleTools, (tool) => tool.name), ["get_customer", "update_customer", "get_sensitive_customer", "get_private_customer", "get_local_customer", "get_fc_customer", "invoke_api_endpoint"]);
assert.deepEqual(Array.from(permissions.visibleEndpointsForRequest(server), (endpoint) => endpoint.tool_name), ["get_customer", "update_customer", "provider_sensitive_customer", "get_private_customer", "get_local_customer", "get_fc_customer"]);

const bundle = workerExport.buildWorkerBundle(server);
const governanceFile = bundle.files.find((file) => file.path === "astrail-governance.json");
const workerFile = bundle.files.find((file) => file.path === "src/worker.ts");
const dockerServerFile = bundle.files.find((file) => file.path === "src/docker-server.mjs");
assert.ok(governanceFile && workerFile && dockerServerFile, "Worker export must include runtime, Docker proxy, and governance files.");
const manifest = JSON.parse(governanceFile.content);
assert.equal(manifest.business_context, server.runtime_policy.business_context);
assert.equal(manifest.tools.find((tool) => tool.name === "delete_customer").enabled, false);
assert.ok(bundle.files.some((file) => file.path === "docs/PRODUCTION_CHECKLIST.md"));
assert.match(dockerServerFile.content, /ASTRAIL_PROXY_INBOUND_KEY/, "Docker proxy must require its own inbound caller key.");
assert.match(dockerServerFile.content, /timingSafeEqual/, "Docker proxy bearer checks must use constant-time comparison.");
assert.match(dockerServerFile.content, /maxRequestBytes = 64 \* 1024/, "Docker proxy request bodies must be bounded.");
assert.match(dockerServerFile.content, /maxResponseBytes = 1024 \* 1024/, "Docker proxy responses must be bounded.");
assert.match(dockerServerFile.content, /request\.resume\(\)/, "Docker proxy must drain oversized requests before returning 413.");
assert.doesNotMatch(dockerServerFile.content, /request\.destroy\(\)/, "Docker proxy must not reset the client socket before returning 413.");
assert.match(dockerServerFile.content, /AbortSignal\.timeout\(upstreamTimeoutMs\)/, "Docker proxy upstream calls must time out.");
assert.match(dockerServerFile.content, /redirect: "error"/, "Docker proxy redirects must fail closed.");
assert.doesNotMatch(dockerServerFile.content, /await upstream\.text\(\)/, "Docker proxy must not buffer an unbounded upstream response.");
const dockerDiagnostics = ts.transpileModule(dockerServerFile.content, {
  compilerOptions: { allowJs: true, checkJs: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "docker-server.mjs",
  reportDiagnostics: true,
}).diagnostics ?? [];
assert.equal(dockerDiagnostics.length, 0, dockerDiagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n"));

const requests = [];
const attemptsByUrl = new Map();
const generatedFetch = async (url, init) => {
  const requestUrl = String(url);
  requests.push({ url: requestUrl, init });
  attemptsByUrl.set(requestUrl, (attemptsByUrl.get(requestUrl) ?? 0) + 1);
  if (requestUrl.includes("/redirect")) return new Response(null, { status: 302, headers: { location: "https://evil.example" } });
  if (requestUrl.includes("/oversized")) return new Response("too large", { status: 200, headers: { "content-length": "1000001" } });
  if (requestUrl.includes("/retry") && attemptsByUrl.get(requestUrl) === 1) return new Response("retry", { status: 503 });
  if (requestUrl.includes("/not-found")) return new Response(JSON.stringify({ error: "missing" }), { status: 404, headers: { "content-type": "application/json" } });
  if (requestUrl.includes("/network-failure")) throw new Error("simulated network failure");
  return new Response(JSON.stringify({ id: "cus_123", ok: true }), { status: 200, headers: { "content-type": "application/json" } });
};
const virtualWorkerFile = "/virtual/worker.ts";
const compilerOptions = {
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
};
const compilerHost = ts.createCompilerHost(compilerOptions);
const originalGetSourceFile = compilerHost.getSourceFile.bind(compilerHost);
const originalFileExists = compilerHost.fileExists.bind(compilerHost);
const originalReadFile = compilerHost.readFile.bind(compilerHost);
compilerHost.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => fileName === virtualWorkerFile
  ? ts.createSourceFile(fileName, workerFile.content, languageVersion, true)
  : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
compilerHost.fileExists = (fileName) => fileName === virtualWorkerFile || originalFileExists(fileName);
compilerHost.readFile = (fileName) => fileName === virtualWorkerFile ? workerFile.content : originalReadFile(fileName);
const workerProgram = ts.createProgram([virtualWorkerFile], compilerOptions, compilerHost);
const workerDiagnostics = ts.getPreEmitDiagnostics(workerProgram).filter((diagnostic) => diagnostic.file?.fileName === virtualWorkerFile);
assert.equal(workerDiagnostics.length, 0, workerDiagnostics.map((diagnostic) => {
  const position = diagnostic.file && diagnostic.start !== undefined ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start) : null;
  const context = position ? workerFile.content.split("\n").slice(Math.max(0, position.line - 1), position.line + 2).join("\n") : "";
  return `${position ? `${position.line + 1}:${position.character + 1} ` : ""}${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}\n${context}`;
}).join("\n"));
function instantiateWorker(source, fetchImplementation) {
  const { outputText: workerJs } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "worker.ts",
  });
  const workerModule = { exports: {} };
  const workerContext = vm.createContext({
    AbortSignal,
    Headers,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    console,
    crypto: globalThis.crypto,
    fetch: fetchImplementation,
    setTimeout,
    module: workerModule,
    exports: workerModule.exports,
  });
  vm.runInContext(workerJs, workerContext, { filename: "generated-worker.js" });
  return workerModule.exports.default;
}

const worker = instantiateWorker(workerFile.content, generatedFetch);
const workerEnv = {
  ASTRAIL_API_KEY: "worker-test-key",
  ASTRAIL_ALLOW_PUBLIC_REST_EXECUTION: "true",
  ASTRAIL_ALLOWED_ORIGINS: "https://api.example.com,https://fc.example.com",
};

async function rpcResponse(method, params = {}, bodyOverride) {
  return worker.fetch(new Request("https://worker.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
    body: bodyOverride ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), workerEnv);
}

async function rpc(method, params = {}) {
  const response = await rpcResponse(method, params);
  return response.json();
}

const unauthorizedResponse = await worker.fetch(new Request("https://worker.example/mcp", { method: "GET" }), {});
assert.equal(unauthorizedResponse.status, 401, "Private exports must preserve caller authentication.");

const listed = await rpc("tools/list");
assert.deepEqual(Array.from(listed.result.tools, (tool) => tool.name), ["get_customer", "update_customer", "get_sensitive_customer", "get_private_customer", "get_local_customer", "get_fc_customer", "invoke_api_endpoint"]);
assert.match(listed.result.tools[0].description, /Use when:/);

const readResult = await rpc("tools/call", { name: "get_customer", arguments: { id: "cus 123", expand: "billing", "X-Auth-Token": "must-not-forward", "If-Match": "etag-1" } });
const readPayload = JSON.parse(readResult.result.content[0].text);
assert.equal(readPayload.status, "success");
assert.equal(requests[0].url, "https://api.example.com/v1/customers/cus%20123?expand=billing");
assert.equal(requests[0].init.headers.get("x-auth-token"), null);
assert.equal(requests[0].init.headers.get("if-match"), "etag-1");

const writeResult = await rpc("tools/call", { name: "update_customer", arguments: { id: "cus_123", body: { name: "New" } } });
const writePayload = JSON.parse(writeResult.result.content[0].text);
assert.equal(writePayload.status, "approval_required");
assert.equal(requests.length, 1, "Approval-gated writes must not reach the provider.");

const hiddenResult = await rpc("tools/call", { name: "delete_customer", arguments: { id: "cus_123" } });
assert.equal(hiddenResult.error.code, -32602);
assert.equal(requests.length, 1, "Hidden tools must not reach the provider.");

const blockedResult = await rpc("tools/call", { name: "get_sensitive_customer", arguments: { id: "cus_123" } });
assert.equal(JSON.parse(blockedResult.result.content[0].text).error_code, "tool_blocked");
assert.equal(requests.length, 1, "Blocked tools must not reach the provider.");

const catalogBlockedResult = await rpc("tools/call", {
  name: "invoke_api_endpoint",
  arguments: { endpoint_id: "provider_sensitive_customer", arguments: { id: "cus_123" } },
});
assert.equal(JSON.parse(catalogBlockedResult.result.content[0].text).error_code, "tool_blocked");
assert.equal(requests.length, 1, "The endpoint catalog must not bypass per-tool policy.");

const privateResult = await rpc("tools/call", { name: "get_private_customer", arguments: { id: "cus_123" } });
assert.equal(JSON.parse(privateResult.result.content[0].text).error_code, "auth_required");
assert.equal(requests.length, 1, "Authenticated endpoints must fail closed in standalone exports.");

const localResult = await rpc("tools/call", { name: "get_local_customer", arguments: { id: "cus_123" } });
assert.equal(JSON.parse(localResult.result.content[0].text).error_code, "upstream_url_blocked");
assert.equal(requests.length, 1, "Local and private-network hostnames must be blocked before fetch.");

const missingArgumentResult = await rpc("tools/call", { name: "get_customer", arguments: {} });
assert.equal(JSON.parse(missingArgumentResult.result.content[0].text).error_code, "missing_required_argument");
assert.equal(requests.length, 1);

const parentPathResult = await rpc("tools/call", { name: "get_customer", arguments: { id: ".." } });
assert.equal(JSON.parse(parentPathResult.result.content[0].text).error_code, "path_normalization_blocked");
assert.equal(requests.length, 1, "Path normalization segments must be rejected before fetch.");

const currentPathResult = await rpc("tools/call", { name: "get_customer", arguments: { id: "." } });
assert.equal(JSON.parse(currentPathResult.result.content[0].text).error_code, "path_normalization_blocked");
assert.equal(requests.length, 1, "Current-directory path segments must be rejected before fetch.");

const fcHostnameResult = await rpc("tools/call", { name: "get_fc_customer", arguments: { customer_id: "cus_123" } });
assert.equal(JSON.parse(fcHostnameResult.result.content[0].text).status, "success");
assert.equal(requests.at(-1).url, "https://fc.example.com/v1/customers/cus_123");

const redirectResult = await rpc("tools/call", { name: "get_customer", arguments: { id: "redirect" } });
assert.equal(JSON.parse(redirectResult.result.content[0].text).error_code, "upstream_redirect_blocked");

const oversizedResponse = await rpc("tools/call", { name: "get_customer", arguments: { id: "oversized" } });
assert.equal(JSON.parse(oversizedResponse.result.content[0].text).error_code, "upstream_response_too_large");

const retryResult = await rpc("tools/call", { name: "get_customer", arguments: { id: "retry" } });
assert.equal(JSON.parse(retryResult.result.content[0].text).attempt_count, 2);
assert.equal(attemptsByUrl.get("https://api.example.com/v1/customers/retry"), 2);

const notFoundResult = await rpc("tools/call", { name: "get_customer", arguments: { id: "not-found" } });
const notFoundPayload = JSON.parse(notFoundResult.result.content[0].text);
assert.equal(notFoundPayload.status, "error");
assert.equal(notFoundPayload.upstream_status, 404);
assert.equal(notFoundPayload.data.error, "missing");

const networkFailureResult = await rpc("tools/call", { name: "get_customer", arguments: { id: "network-failure" } });
assert.equal(JSON.parse(networkFailureResult.result.content[0].text).error_code, "upstream_network_error");
assert.equal(attemptsByUrl.get("https://api.example.com/v1/customers/network-failure"), 2);

const oversizedRpcResponse = await rpcResponse("tools/call", {}, "x".repeat(65 * 1024));
assert.equal(oversizedRpcResponse.status, 413);
assert.equal((await oversizedRpcResponse.json()).error.message, "JSON-RPC payload too large.");

const restrictedBundle = workerExport.buildWorkerBundle({
  ...server,
  runtime_policy: {
    business_context: server.runtime_policy.business_context,
    roles: { support: { max_action_level: "read" } },
  },
});
const restrictedWorkerFile = restrictedBundle.files.find((file) => file.path === "src/worker.ts");
assert.ok(restrictedWorkerFile);
let restrictedFetches = 0;
const restrictedWorker = instantiateWorker(restrictedWorkerFile.content, async () => {
  restrictedFetches += 1;
  return new Response("unexpected");
});
const restrictedResponse = await restrictedWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_customer", arguments: { id: "cus_123" } } }),
}), workerEnv);
assert.equal(JSON.parse((await restrictedResponse.json()).result.content[0].text).error_code, "runtime_policy_requires_hosted_identity");
assert.equal(restrictedFetches, 0);

const readOnlyTools = tools.map((tool) => tool.name === "update_customer" ? { ...tool, policy: "allow" } : tool);
const readOnlyBundle = workerExport.buildWorkerBundle({
  ...server,
  tools_json: readOnlyTools,
  runtime_policy: { business_context: server.runtime_policy.business_context, read_only: true },
});
const readOnlyWorkerFile = readOnlyBundle.files.find((file) => file.path === "src/worker.ts");
assert.ok(readOnlyWorkerFile);
let readOnlyFetches = 0;
const readOnlyWorker = instantiateWorker(readOnlyWorkerFile.content, async () => {
  readOnlyFetches += 1;
  return new Response("unexpected");
});
const readOnlyResponse = await readOnlyWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "update_customer", arguments: { id: "cus_123", body: { name: "New" } } } }),
}), workerEnv);
assert.equal(JSON.parse((await readOnlyResponse.json()).result.content[0].text).error_code, "runtime_policy_denied");
assert.equal(readOnlyFetches, 0);

const getDisabledTools = tools.map((tool) => {
  if (tool.name === "get_customer") return { ...tool, x_astrail: { ...tool.x_astrail, action_level: "write" } };
  if (tool.name === "update_customer") return { ...tool, policy: "allow", x_astrail: { ...tool.x_astrail, action_level: "read" } };
  return tool;
});
const getDisabledBundle = workerExport.buildWorkerBundle({
  ...server,
  tools_json: getDisabledTools,
  runtime_policy: { business_context: server.runtime_policy.business_context, allow_http_gets: false },
});
const getDisabledWorkerFile = getDisabledBundle.files.find((file) => file.path === "src/worker.ts");
assert.ok(getDisabledWorkerFile);
let getDisabledFetches = 0;
const getDisabledWorker = instantiateWorker(getDisabledWorkerFile.content, async () => {
  getDisabledFetches += 1;
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
});
const getDisabledResponse = await getDisabledWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_customer", arguments: { id: "cus_123" } } }),
}), workerEnv);
assert.equal(JSON.parse((await getDisabledResponse.json()).result.content[0].text).error_code, "runtime_policy_denied");
assert.equal(getDisabledFetches, 0, "allow_http_gets=false must deny standalone GET execution.");

const readClassifiedWriteResponse = await getDisabledWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "update_customer", arguments: { id: "cus_123", body: { name: "New" } } } }),
}), workerEnv);
assert.equal(JSON.parse((await readClassifiedWriteResponse.json()).result.content[0].text).status, "success");
assert.equal(getDisabledFetches, 1, "allow_http_gets=false must not deny non-GET endpoints solely because their action is classified as read.");

const publicBundle = workerExport.buildWorkerBundle({ ...server, is_public: true });
const publicWorkerFile = publicBundle.files.find((file) => file.path === "src/worker.ts");
assert.ok(publicWorkerFile);
const publicWorker = instantiateWorker(publicWorkerFile.content, generatedFetch);
const publicListResponse = await publicWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
}), workerEnv);
const publicNames = Array.from((await publicListResponse.json()).result.tools, (tool) => tool.name);
assert.deepEqual(publicNames, ["get_customer", "get_sensitive_customer", "get_local_customer", "get_fc_customer", "invoke_api_endpoint"]);
assert.ok(!publicNames.includes("update_customer") && !publicNames.includes("get_private_customer"), "Public exports must omit write and authenticated tools.");

const publicFetchCount = requests.length;
const anonymousPublicExecution = await publicWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_customer", arguments: { id: "cus_123" } } }),
}), workerEnv);
assert.equal(anonymousPublicExecution.status, 401, "Public exports must authenticate every upstream execution call.");
assert.equal(requests.length, publicFetchCount, "Anonymous public execution must not reach an allow-listed provider.");

const authenticatedPublicExecution = await publicWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_customer", arguments: { id: "cus_123" } } }),
}), workerEnv);
assert.equal(JSON.parse((await authenticatedPublicExecution.json()).result.content[0].text).status, "success");

const deniedOriginResponse = await worker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_customer", arguments: { id: "cus_123" } } }),
}), { ...workerEnv, ASTRAIL_ALLOWED_ORIGINS: "https://fc.example.com" });
assert.equal(JSON.parse((await deniedOriginResponse.json()).result.content[0].text).error_code, "upstream_origin_not_allowed");

const writeAllowedTools = tools.map((tool) => tool.name === "update_customer" ? { ...tool, policy: "allow" } : tool);
const writeAllowedBundle = workerExport.buildWorkerBundle({ ...server, tools_json: writeAllowedTools });
const writeAllowedWorkerFile = writeAllowedBundle.files.find((file) => file.path === "src/worker.ts");
assert.ok(writeAllowedWorkerFile);
const writeRequests = [];
const writeAllowedWorker = instantiateWorker(writeAllowedWorkerFile.content, async (url, init) => {
  writeRequests.push({ url: String(url), init });
  return new Response(JSON.stringify({ updated: true }), { status: 200 });
});
const missingWriteBodyResponse = await writeAllowedWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/call", params: { name: "update_customer", arguments: { id: "cus_123" } } }),
}), workerEnv);
assert.equal(JSON.parse((await missingWriteBodyResponse.json()).result.content[0].text).error_code, "missing_required_argument");
assert.equal(writeRequests.length, 0, "Missing required mutation body fields must fail before fetch.");
const writeAllowedResponse = await writeAllowedWorker.fetch(new Request("https://worker.example/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer worker-test-key" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "update_customer", arguments: { id: "cus_123", body: { name: "New" } } } }),
}), workerEnv);
assert.equal(JSON.parse((await writeAllowedResponse.json()).result.content[0].text).status, "success");
assert.equal(writeRequests[0].init.method, "PATCH");
assert.deepEqual(JSON.parse(writeRequests[0].init.body), { name: "New" });

console.log("production tool governance smoke passed");
