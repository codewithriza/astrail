import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function loadTsModule(relativePath, requireShim) {
  const source = await readFile(join(appRoot, relativePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", "require", output)(module.exports, module, requireShim);
  return module.exports;
}

function parseToolResult(execution) {
  const text = execution?.mcpResult?.content?.[0]?.text;
  if (typeof text !== "string") fail("Execution did not return text content.", JSON.stringify(execution, null, 2));
  return JSON.parse(text);
}

function endpointFixture() {
  return [
    {
      method: "GET",
      path: "/widgets/{id}",
      base_url: "https://api.example.test",
      tool_name: "get_widget",
      operation_id: "getWidget",
      summary: "Get widget",
      description: "Fetch one widget by id.",
      tags: ["widgets"],
      resource: "widgets",
      operation_kind: "read",
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Widget id." },
          request_id: { type: "string", format: "uuid", description: "Optional request correlation id." },
          view: { const: "summary", description: "Only summary views are supported in this fixture." },
        },
        required: ["id"],
        additionalProperties: false,
      },
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requires_auth: false,
    },
    {
      method: "GET",
      path: "/widgets",
      base_url: "https://api.example.test",
      tool_name: "list_widgets",
      operation_id: "listWidgets",
      summary: "List widgets",
      description: "List widgets.",
      tags: ["widgets"],
      resource: "widgets",
      operation_kind: "read",
      input_schema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Maximum rows." },
        },
        additionalProperties: false,
      },
      parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
      requires_auth: false,
    },
    {
      method: "GET",
      path: "/internal/hidden-config",
      base_url: "https://api.example.test",
      tool_name: "hidden_config",
      operation_id: "hiddenConfig",
      summary: "Hidden internal config",
      description: "Fetch hidden auth configuration details.",
      tags: ["internal"],
      resource: "internal",
      operation_kind: "read",
      input_schema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      parameters: [],
      requires_auth: false,
    },
  ];
}

function serverFixture() {
  return {
    id: "code-mode-fixture",
    user_id: "local-preview",
    name: "Fixture Code Mode server",
    description: "Smoke fixture.",
    source_url: "https://api.example.test/openapi.json",
    source_type: "openapi_url",
    category: "Test",
    generated_code: null,
    tools_json: [
      {
        name: "search_docs",
        description: "Search SDK docs.",
        input_schema: { type: "object", properties: { query: { type: "string" } } },
        method: "ASTRAIL_CODE",
        path: "search_docs",
      },
      {
        name: "execute",
        description: "Execute SDK-shaped TypeScript.",
        input_schema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
        method: "ASTRAIL_CODE",
        path: "execute",
      },
      {
        name: "hidden_config",
        description: "Hidden internal config reader.",
        input_schema: { type: "object", properties: {} },
        method: "GET",
        path: "/internal/hidden-config",
        visibility: "private",
      },
    ],
    endpoint_map: endpointFixture(),
    diagnostics: [],
    status: "live",
    validation_status: "passed",
    generation_status: "completed",
    is_public: true,
    hosted_endpoint: "https://api.example.test/api/mcp/code-mode-fixture",
    call_count: 0,
    protocol_version: "2024-11-05",
    created_at: new Date(0).toISOString(),
  };
}

function makeExecutionMock() {
  const calls = [];
  let active = 0;
  let maxConcurrent = 0;

  async function executeToolFromEndpointMap(_server, tool, args, options) {
    calls.push({ tool, args, options });
    active += 1;
    maxConcurrent = Math.max(maxConcurrent, active);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    active -= 1;

    return {
      mcpResult: {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            tool: tool.name,
            request: { method: tool.method, path: tool.path },
            response: { status: 200, headers: { content_type: "application/json" }, body: { ok: true, args } },
          }),
        }],
      },
      status: "success",
      latencyMs: 25,
      method: tool.method,
      path: tool.path,
      executionMode: "safe_rest_execution",
      upstreamStatus: 200,
      traceId: "agt_smoke",
      attemptCount: 1,
      errorCode: null,
      error: null,
    };
  }

  return {
    executeToolFromEndpointMap,
    stats() {
      return { calls: [...calls], maxConcurrent };
    },
    reset() {
      calls.length = 0;
      active = 0;
      maxConcurrent = 0;
    },
  };
}

async function main() {
  const validation = await loadTsModule("lib/runtime/tool-input-validation.ts", (id) => {
    throw new Error(`Unexpected validation import: ${id}`);
  });
  const codeModeDocs = await loadTsModule("lib/codeModeDocs.ts", (id) => {
    if (id === "./types" || id === "@/lib/types") return {};
    throw new Error(`Unexpected code-mode-docs import: ${id}`);
  });
  const toolProfile = await loadTsModule("lib/agent-tool-profile.ts", (id) => {
    if (id === "./types" || id === "@/lib/types") return {};
    throw new Error(`Unexpected agent-tool-profile import: ${id}`);
  });
  const permissions = await loadTsModule("lib/runtime/permissions.ts", (id) => {
    if (id === "@/lib/types" || id === "../types") return {};
    if (id === "../agent-tool-profile") return toolProfile;
    throw new Error(`Unexpected permissions import: ${id}`);
  });
  const executionMock = makeExecutionMock();
  const sdkCodeMode = await loadTsModule("lib/runtime/sdk-code-mode.ts", (id) => {
    if (id === "@/lib/codeModeDocs" || id === "../codeModeDocs") return codeModeDocs;
    if (id === "@/lib/runtime/execute-tool") return executionMock;
    if (id === "@/lib/runtime/permissions") return permissions;
    if (id === "@/lib/runtime/tool-input-validation") return validation;
    if (id === "@/lib/types") return {};
    throw new Error(`Unexpected sdk-code-mode import: ${id}`);
  });

  const server = serverFixture();
  const loadCredentialForTool = async () => ({ credential: null, failure: null });

  const docs = sdkCodeMode.searchSdkDocs(server, { query: "widget", limit: 2 });
  if (docs.status !== "success" || docs.returned !== 2 || docs.adapter !== "static-no-eval-sdk-compiler") {
    fail("search_docs did not return SDK docs.", JSON.stringify(docs, null, 2));
  }
  const hiddenDocs = sdkCodeMode.searchSdkDocs(server, { query: "hidden auth config", limit: 5 });
  if (hiddenDocs.total_matches !== 0 || JSON.stringify(hiddenDocs).includes("hidden_config")) {
    fail("search_docs exposed a private tool-backed endpoint on a public Code Mode server.", JSON.stringify(hiddenDocs, null, 2));
  }

  const valid = await sdkCodeMode.executeSdkCodeMode(server, {
    code: "async function run(client) { return await client.widgets.getWidget({ id: 'w1' }); }",
  }, { loadCredentialForTool });
  const validPayload = parseToolResult(valid);
  if (valid.status !== "success" || validPayload.status !== "success" || validPayload.results?.[0]?.sdk_method !== "client.widgets.getWidget") {
    fail("Valid SDK call failed.", JSON.stringify(validPayload, null, 2));
  }
  executionMock.reset();
  await sdkCodeMode.executeSdkCodeMode(server, {
    code: "await client.widgets.getWidget({ id: 'w1' })",
  }, {
    loadCredentialForTool: async () => ({
      credential: null,
      failure: { code: "insufficient_scope", provider: "example", message: "missing scope", requiredScopes: ["widgets.read"], missingScopes: ["widgets.read"] },
    }),
  });
  if (executionMock.stats().calls[0]?.options?.credentialFailure?.code !== "insufficient_scope") {
    fail("Code Mode discarded the credential failure contract.", JSON.stringify(executionMock.stats(), null, 2));
  }

  const badMethod = await sdkCodeMode.executeSdkCodeMode(server, {
    code: "await client.widgets.deleteWidget({ id: 'w1' })",
  }, { loadCredentialForTool });
  const badMethodPayload = parseToolResult(badMethod);
  if (badMethodPayload.status !== "mapping_required" || badMethodPayload.diagnostics?.[0]?.code !== "sdk_method_not_found") {
    fail("Bad SDK method did not produce typecheck suggestion.", JSON.stringify(badMethodPayload, null, 2));
  }
  if (!badMethodPayload.diagnostics[0].suggestions?.includes("client.widgets.getWidget")) {
    fail("Bad method suggestions did not include the closest SDK method.", JSON.stringify(badMethodPayload, null, 2));
  }

  executionMock.reset();
  const hiddenMethod = await sdkCodeMode.executeSdkCodeMode(server, {
    code: "await client.internal.hiddenConfig({})",
  }, { loadCredentialForTool });
  const hiddenMethodPayload = parseToolResult(hiddenMethod);
  if (
    hiddenMethodPayload.status !== "mapping_required"
    || hiddenMethodPayload.diagnostics?.[0]?.code !== "sdk_method_not_found"
    || executionMock.stats().calls.length !== 0
  ) {
    fail("Code Mode execute exposed a private tool-backed endpoint on a public server.", JSON.stringify({
      payload: hiddenMethodPayload,
      stats: executionMock.stats(),
    }, null, 2));
  }

  const invalidArgs = await sdkCodeMode.executeSdkCodeMode(server, {
    code: "await client.widgets.getWidget({ id: 123 })",
  }, { loadCredentialForTool });
  const invalidArgsPayload = parseToolResult(invalidArgs);
  if (invalidArgsPayload.status !== "mapping_required" || invalidArgsPayload.diagnostics?.[0]?.code !== "typecheck_invalid_arguments") {
    fail("Invalid SDK args did not fail before execution.", JSON.stringify(invalidArgsPayload, null, 2));
  }

  const invalidFormat = await sdkCodeMode.executeSdkCodeMode(server, {
    code: "await client.widgets.getWidget({ id: 'w1', request_id: 'not-a-uuid' })",
  }, { loadCredentialForTool });
  const invalidFormatPayload = parseToolResult(invalidFormat);
  if (
    invalidFormatPayload.status !== "mapping_required"
    || invalidFormatPayload.diagnostics?.[0]?.code !== "typecheck_invalid_arguments"
    || invalidFormatPayload.diagnostics?.[0]?.issues?.[0]?.code !== "invalid_string_format"
  ) {
    fail("Invalid SDK string format did not fail before execution.", JSON.stringify(invalidFormatPayload, null, 2));
  }

  const invalidConst = await sdkCodeMode.executeSdkCodeMode(server, {
    code: "await client.widgets.getWidget({ id: 'w1', view: 'full' })",
  }, { loadCredentialForTool });
  const invalidConstPayload = parseToolResult(invalidConst);
  if (
    invalidConstPayload.status !== "mapping_required"
    || invalidConstPayload.diagnostics?.[0]?.code !== "typecheck_invalid_arguments"
    || invalidConstPayload.diagnostics?.[0]?.issues?.[0]?.code !== "invalid_const"
  ) {
    fail("Invalid SDK const argument did not fail before execution.", JSON.stringify(invalidConstPayload, null, 2));
  }

  executionMock.reset();
  const multipleReads = await sdkCodeMode.executeSdkCodeMode(server, {
    code: `
      const one = await client.widgets.getWidget({ id: "w1" });
      const many = await client.widgets.listWidgets({ limit: 2 });
      return { one, many };
    `,
  }, { loadCredentialForTool });
  const multipleReadsPayload = parseToolResult(multipleReads);
  if (
    multipleReads.status !== "success"
    || multipleReadsPayload.analysis?.execution_strategy !== "parallel_safe_reads"
    || executionMock.stats().maxConcurrent < 2
  ) {
    fail("Multiple read SDK calls were not executed through the parallel safe-read path.", JSON.stringify({
      payload: multipleReadsPayload,
      stats: executionMock.stats(),
    }, null, 2));
  }

  executionMock.reset();
  const policyServer = {
    ...server,
    runtime_policy: {
      blocked_methods: ["client.widgets.listWidgets"],
    },
  };
  const blockedPolicy = await sdkCodeMode.executeSdkCodeMode(policyServer, {
    code: `
      const one = await client.widgets.getWidget({ id: "w1" });
      const many = await client.widgets.listWidgets({ limit: 2 });
      return { one, many };
    `,
  }, { loadCredentialForTool });
  const blockedPolicyPayload = parseToolResult(blockedPolicy);
  if (
    blockedPolicy.status !== "permission_denied"
    || blockedPolicyPayload.status !== "permission_denied"
    || blockedPolicyPayload.analysis?.execution_strategy !== "blocked_before_upstream_execution"
    || executionMock.stats().calls.length !== 0
  ) {
    fail("Runtime policy denial did not preflight all Code Mode calls before upstream execution.", JSON.stringify({
      payload: blockedPolicyPayload,
      stats: executionMock.stats(),
    }, null, 2));
  }

  const blocked = await sdkCodeMode.executeSdkCodeMode(server, {
    code: "const response = await fetch('https://evil.example'); return client.widgets.getWidget({ id: 'w1' });",
  }, { loadCredentialForTool });
  const blockedPayload = parseToolResult(blocked);
  if (blockedPayload.status !== "mapping_required" || blockedPayload.diagnostics?.[0]?.code !== "sandbox_network_access_blocked") {
    fail("Blocked runtime access was not rejected by the sandbox plan.", JSON.stringify(blockedPayload, null, 2));
  }

  console.log("PASS: Code Mode sandbox adapter handles valid calls, bad methods, invalid args, schema formats, const args, parallel reads, runtime policy preflight, and blocked runtime access.");
}

main().catch((error) => fail(error instanceof Error ? error.stack ?? error.message : "unknown smoke failure"));
