import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const taskManifestPath = join(appRoot, "scripts/eval-fixtures/mcp-code-mode.tasks.json");
const reportDirDefault = join(appRoot, "reports/evals");
const nextBin = join(appRoot, "node_modules/.bin/next");
const startedAt = new Date();
const LOCAL_PORT_SCAN_WINDOW = 240;

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.ASTRAIL_EVAL_BASE_URL ?? process.env.ASTRAIL_BASE_URL ?? null,
    port: Number(process.env.ASTRAIL_EVAL_PORT ?? 3217),
    noStart: process.env.ASTRAIL_EVAL_NO_START === "1",
    reportDir: process.env.ASTRAIL_EVAL_REPORT_DIR ?? reportDirDefault,
    keepServer: process.env.ASTRAIL_EVAL_KEEP_SERVER === "1",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") options.baseUrl = argv[++index];
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--no-start") options.noStart = true;
    else if (arg === "--keep-server") options.keepServer = true;
    else if (arg === "--report-dir") options.reportDir = resolve(argv[++index]);
    else if (arg === "--help") {
      console.log(`Usage: npm run eval:mcp -- [--base-url http://localhost:3000] [--no-start] [--port 3217] [--report-dir reports/evals]\n\nBy default this starts a local Next dev server with production secrets blanked.`);
      process.exit(0);
    }
  }

  return {
    ...options,
    baseUrl: options.baseUrl ? options.baseUrl.replace(/\/$/, "") : null,
  };
}

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function postJson(url, body) {
  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://eval.astrail.local",
      "x-astrail-client": "local-eval-harness",
      authorization: "Bearer ag_demo_secret",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload, latencyMs: Math.round(performance.now() - started) };
}

async function rpc(endpoint, method, params = {}, id = 1) {
  const result = await postJson(endpoint, { jsonrpc: "2.0", id, method, params });
  return {
    ...result,
    turns: 1,
  };
}

function parseToolPayload(payload) {
  const text = payload?.result?.content?.[0]?.text;
  if (typeof text !== "string") return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function rpcWithApproval(endpoint, params, id) {
  const initial = await rpc(endpoint, "tools/call", params, id);
  const parsed = parseToolPayload(initial.payload);
  if (parsed.status !== "approval_required" || typeof parsed.execution_id !== "string") return initial;

  const approvalStarted = performance.now();
  const approval = await fetch(new URL(`/api/approvals/${parsed.execution_id}`, endpoint), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved" }),
  });
  if (!approval.ok) throw new Error(`Eval approval failed with HTTP ${approval.status}.`);
  const resumed = await rpc(endpoint, "astrail/resume", { execution_id: parsed.execution_id }, id + 1000);
  return {
    ...resumed,
    turns: initial.turns + resumed.turns,
    latencyMs: initial.latencyMs + resumed.latencyMs + Math.round(performance.now() - approvalStarted),
  };
}

async function probe(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/mcp/petstore-code-mode`, {
      headers: { origin: "https://eval.astrail.local" },
      signal: AbortSignal.timeout(1500),
    });
    const payload = await response.json().catch(() => null);
    return response.ok && payload?.agent_profile?.hosted === true;
  } catch {
    return false;
  }
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + LOCAL_PORT_SCAN_WINDOW; port += 1) {
    const available = await new Promise((resolveAvailable) => {
      const server = createServer();
      server.once("error", () => resolveAvailable(false));
      server.once("listening", () => {
        server.close(() => resolveAvailable(true));
      });
      server.listen(port, "127.0.0.1");
    });
    if (available) return port;
  }
  throw new Error(`No open local port found from ${startPort} to ${startPort + LOCAL_PORT_SCAN_WINDOW - 1}.`);
}

async function startLocalServer(options) {
  if (options.baseUrl) {
    if (!(await probe(options.baseUrl))) {
      fail(`ASTRAIL_EVAL_BASE_URL is not serving the expected local MCP endpoint: ${options.baseUrl}`);
    }
    return { baseUrl: options.baseUrl, child: null, reused: true };
  }

  if (options.noStart) {
    const baseUrl = `http://localhost:${options.port}`;
    if (!(await probe(baseUrl))) fail(`--no-start was set, but ${baseUrl} is not reachable.`);
    return { baseUrl, child: null, reused: true };
  }

  if (!existsSync(nextBin)) fail("Next.js binary missing. Run npm install first.");
  const port = await findOpenPort(options.port);
  const baseUrl = `http://localhost:${port}`;
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: appRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: baseUrl,
      NEXT_PUBLIC_APP_URL: baseUrl,
      NEXT_PUBLIC_RUNTIME_BASE_URL: baseUrl,
      ASTRAIL_APP_URL: baseUrl,
      ASTRAIL_CORS_ORIGINS: "https://eval.astrail.local",
      NEXT_PUBLIC_NEON_AUTH_URL: "",
      NEXT_PUBLIC_NEON_DATA_API_URL: "",
      NEON_AUTH_SERVICE_EMAIL: "",
      NEON_AUTH_SERVICE_PASSWORD: "",
      ANTHROPIC_API_KEY: "",
      ASTRAIL_REQUIRE_AUTH: "false",
      ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES: "1",
      ASTRAIL_LOCAL_MCP_API_KEY: "ag_demo_secret",
      ASTRAIL_LOCAL_PROVIDER_CREDENTIALS_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  const collect = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (logs.join("").length > 12000) logs.splice(0, logs.length - 10);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail("Local Next dev server exited before the eval could run.", logs.join(""));
    }
    if (await probe(baseUrl)) return { baseUrl, child, reused: false };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  child.kill("SIGTERM");
  fail("Timed out waiting for local Next dev server.", logs.join(""));
}

function endpointUrl(baseUrl, endpoint) {
  if (!endpoint) throw new Error("Generated server did not include hosted_endpoint.");
  return endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, value);
}

function normalizeScalar(value) {
  return value === undefined || value === null ? value : String(value);
}

function check(condition, label, details, checks) {
  checks.push({ label, passed: Boolean(condition), details: details ?? null });
}

function summarizeTask(task, checks, metrics) {
  const passed = checks.every((item) => item.passed);
  return {
    id: task.id,
    mode: task.mode,
    fixture: task.fixture,
    prompt: task.prompt,
    passed,
    checks,
    metrics,
  };
}

function responseArgs(parsed) {
  return parsed?.response?.body?.args ?? parsed?.output?.response?.body_preview?.sample?.args ?? {};
}

async function generateServer(baseUrl, fixturePath, generationMode) {
  const rawJson = await readFile(join(appRoot, fixturePath), "utf8");
  const runtimePolicy = fixturePath.includes("helpdesk")
    ? {
        read_only: true,
        allow_http_gets: true,
        allowed_resources: [{ pattern: "^tickets$", regex: true, match: "resource" }],
      }
    : undefined;
  const generated = await postJson(`${baseUrl}/api/generate`, {
    sourceType: "json_paste",
    rawJson,
    generationMode,
    clientPreset: "claude-code",
    endpointLimit: 20,
    ...(runtimePolicy ? { runtimePolicy } : {}),
  });

  if (!generated.response.ok || !generated.payload?.server?.hosted_endpoint) {
    throw new Error(`Failed to generate ${generationMode} server from ${fixturePath}: ${JSON.stringify(generated.payload, null, 2)}`);
  }

  return {
    server: generated.payload.server,
    endpoint: endpointUrl(baseUrl, generated.payload.server.hosted_endpoint),
    generationLatencyMs: generated.latencyMs,
  };
}

function findTool(server, hint) {
  const tools = server.tools_json ?? [];
  return tools.find((tool) => tool.name.includes(hint))
    ?? tools.find((tool) => `${tool.description ?? ""} ${tool.path ?? ""}`.toLowerCase().includes(hint.replace(/_/g, " ")))
    ?? tools[0];
}

async function runStaticListTask(task, context) {
  const target = await context.generated("helpdesk", "static");
  const tool = findTool(target.server, "list_tickets");
  const checks = [];
  let turns = 0;

  const list = await rpc(target.endpoint, "tools/list", {}, 1);
  turns += list.turns;
  check(list.response.ok, "tools/list succeeds", null, checks);
  check(Boolean(tool?.name), "generated static list ticket tool exists", tool?.name, checks);

  const called = await rpc(target.endpoint, "tools/call", {
    name: tool.name,
    arguments: { status: "open", assignee_id: "u_123", limit: 2 },
  }, 2);
  turns += called.turns;
  const parsed = parseToolPayload(called.payload);
  const args = responseArgs(parsed);

  check(called.response.ok, "tools/call returns HTTP 200", called.response.status, checks);
  check(parsed.status === "success", "runtime status is success", parsed.status, checks);
  check(args.status === "open", "status argument echoed exactly", args.status, checks);
  check(args.assignee_id === "u_123", "assignee argument echoed exactly", args.assignee_id, checks);
  check(normalizeScalar(args.limit) === "2", "limit argument echoed exactly", args.limit, checks);

  return summarizeTask(task, checks, {
    turns,
    latency_ms: list.latencyMs + called.latencyMs,
    generation_latency_ms: target.generationLatencyMs,
    deterministic_exactness_checks: 3,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runStaticValidationTask(task, context) {
  const target = await context.generated("helpdesk", "static");
  const tool = findTool(target.server, "list_tickets");
  const checks = [];

  const called = await rpc(target.endpoint, "tools/call", {
    name: tool.name,
    arguments: { assignee_id: "u_123" },
  }, 3);
  const parsed = parseToolPayload(called.payload);

  check(called.response.ok, "validation failure is represented as MCP tool result", called.response.status, checks);
  check(called.payload?.result?.isError === true, "MCP result is marked isError", called.payload?.result?.isError, checks);
  check(parsed.status === "validation_failed", "status is validation_failed", parsed.status, checks);
  check(parsed.error_code === "invalid_tool_arguments", "error code is exact", parsed.error_code, checks);
  check((parsed.issues ?? []).some((issue) => issue.path === "status"), "missing status issue is reported", parsed.issues, checks);

  return summarizeTask(task, checks, {
    turns: 1,
    latency_ms: called.latencyMs,
    deterministic_exactness_checks: 3,
    expected_errors: 1,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runDynamicTask(task, context) {
  const target = await context.generated("helpdesk", "dynamic");
  const checks = [];
  let turns = 0;

  const listed = await rpc(target.endpoint, "tools/call", {
    name: "list_api_endpoints",
    arguments: { query: "support tickets", operation: "read", limit: 5 },
  }, 4);
  turns += listed.turns;
  const catalog = parseToolPayload(listed.payload);
  const endpointId = catalog.endpoints?.find((endpoint) => endpoint.operation_id === "listTickets")?.endpoint_id
    ?? catalog.endpoints?.[0]?.endpoint_id;
  check(catalog.status === "success", "catalog search succeeds", catalog.status, checks);
  check(Boolean(endpointId), "catalog returns endpoint id", endpointId, checks);
  check(catalog.endpoints?.some((endpoint) => endpoint.operation_id === "listTickets"), "catalog contains listTickets", catalog.endpoints, checks);

  const schema = await rpc(target.endpoint, "tools/call", {
    name: "get_api_endpoint_schema",
    arguments: { endpoint_id: endpointId },
  }, 5);
  turns += schema.turns;
  const schemaPayload = parseToolPayload(schema.payload);
  check(schemaPayload.status === "success", "schema lookup succeeds", schemaPayload.status, checks);
  check(Boolean(schemaPayload.input_schema?.properties?.status), "schema exposes required status argument", schemaPayload.input_schema, checks);

  const invoked = await rpc(target.endpoint, "tools/call", {
    name: "invoke_api_endpoint",
    arguments: {
      endpoint_id: endpointId,
      arguments: { status: "open", assignee_id: "u_123", limit: 2 },
    },
  }, 6);
  turns += invoked.turns;
  const parsed = parseToolPayload(invoked.payload);
  const args = responseArgs(parsed);
  check(parsed.status === "success", "dynamic invoke succeeds", parsed.status, checks);
  check(args.status === "open", "dynamic status echoed exactly", args.status, checks);
  check(args.assignee_id === "u_123", "dynamic assignee echoed exactly", args.assignee_id, checks);
  check(normalizeScalar(args.limit) === "2", "dynamic limit echoed exactly", args.limit, checks);

  return summarizeTask(task, checks, {
    turns,
    latency_ms: listed.latencyMs + schema.latencyMs + invoked.latencyMs,
    generation_latency_ms: target.generationLatencyMs,
    deterministic_exactness_checks: 4,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runDynamicInvalidArgumentsTask(task, context) {
  const target = await context.generated("helpdesk", "dynamic");
  const checks = [];
  let turns = 0;

  const listed = await rpc(target.endpoint, "tools/call", {
    name: "list_api_endpoints",
    arguments: { query: "support tickets", operation: "read", limit: 5 },
  }, 12);
  turns += listed.turns;
  const catalog = parseToolPayload(listed.payload);
  const endpointId = catalog.endpoints?.find((endpoint) => endpoint.operation_id === "listTickets")?.endpoint_id
    ?? catalog.endpoints?.[0]?.endpoint_id;
  check(catalog.status === "success", "catalog search succeeds", catalog.status, checks);
  check(Boolean(endpointId), "catalog returns endpoint id", endpointId, checks);

  const invalid = await rpc(target.endpoint, "tools/call", {
    name: "invoke_api_endpoint",
    arguments: {
      endpoint_id: endpointId,
      arguments: { status: "open", assignee_id: "u_123", limit: "bad" },
    },
  }, 13);
  turns += invalid.turns;
  const parsed = parseToolPayload(invalid.payload);
  const issues = parsed.issues ?? [];

  check(invalid.response.ok, "invalid dynamic invoke returns HTTP 200 MCP result", invalid.response.status, checks);
  check(invalid.payload?.result?.isError === true, "invalid dynamic invoke is marked isError", invalid.payload?.result?.isError, checks);
  check(parsed.status === "validation_failed", "dynamic invalid status is validation_failed", parsed.status, checks);
  check(parsed.error_code === "invalid_tool_arguments", "dynamic invalid error code is exact", parsed.error_code, checks);
  check(issues.some((issue) => issue.path === "limit" && issue.code === "invalid_type"), "dynamic invalid limit issue is exact", issues, checks);

  return summarizeTask(task, checks, {
    turns,
    latency_ms: listed.latencyMs + invalid.latencyMs,
    generation_latency_ms: target.generationLatencyMs,
    deterministic_exactness_checks: 3,
    expected_errors: 1,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runStaticAuthRequiredTask(task, context) {
  const target = await context.generated("helpdesk", "static");
  const tool = findTool(target.server, "get_sensitive_ticket");
  const checks = [];

  check(Boolean(tool?.name), "generated sensitive ticket tool exists", tool?.name, checks);
  const called = await rpc(target.endpoint, "tools/call", {
    name: tool.name,
    arguments: { ticket_id: "t_123" },
  }, 14);
  const parsed = parseToolPayload(called.payload);

  check(called.response.ok, "auth-required call returns HTTP 200 MCP result", called.response.status, checks);
  check(called.payload?.result?.isError === true, "auth-required call is marked isError", called.payload?.result?.isError, checks);
  check(parsed.status === "auth_required", "status is auth_required", parsed.status, checks);
  check(parsed.error_code === "auth_required" || parsed.runtime?.error_code === "auth_required", "auth error code is exact", parsed.error_code ?? parsed.runtime?.error_code, checks);
  check(parsed.path === "/get/{ticket_id}/secret", "auth-required endpoint path is exact", parsed.path, checks);
  check(parsed.response === undefined, "auth-required call has no upstream response", parsed.response, checks);

  return summarizeTask(task, checks, {
    turns: 1,
    latency_ms: called.latencyMs,
    generation_latency_ms: target.generationLatencyMs,
    deterministic_exactness_checks: 4,
    expected_errors: 1,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runCodeHelpdeskTask(task, context) {
  const target = await context.generated("helpdesk", "code");
  const checks = [];
  let turns = 0;

  const docs = await rpc(target.endpoint, "tools/call", {
    name: "search_docs",
    arguments: { query: "tickets", detail: "schema", limit: 3 },
  }, 7);
  turns += docs.turns;
  const docsPayload = parseToolPayload(docs.payload);
  const docMethods = (docsPayload.docs ?? []).map((doc) => doc.sdk_method);
  check(docsPayload.status === "success", "search_docs succeeds", docsPayload.status, checks);
  check(docMethods.includes("client.tickets.listTickets"), "docs include exact SDK method", docMethods, checks);

  const executed = await rpcWithApproval(target.endpoint, {
    name: "execute",
    arguments: {
      code: "async function run(client) { return await client.tickets.listTickets({ status: \"open\", assignee_id: \"u_123\", limit: 2 }); }",
      result_mode: "full",
    },
  }, 8);
  turns += executed.turns;
  const parsed = parseToolPayload(executed.payload);
  const first = parsed.results?.[0];
  const args = first?.output?.response?.body?.args ?? {};

  check(parsed.status === "success", "execute succeeds", parsed.status, checks);
  check(parsed.analysis?.execution_model === "static-analysis-no-eval", "execute uses no-eval model", parsed.analysis, checks);
  check(parsed.analysis?.execution_strategy === "parallel_safe_reads", "safe read strategy is parallel", parsed.analysis, checks);
  check(first?.sdk_method === "client.tickets.listTickets", "executed SDK method is exact", first?.sdk_method, checks);
  check(args.status === "open", "Code Mode status echoed exactly", args.status, checks);
  check(args.assignee_id === "u_123", "Code Mode assignee echoed exactly", args.assignee_id, checks);

  return summarizeTask(task, checks, {
    turns,
    latency_ms: docs.latencyMs + executed.latencyMs,
    generation_latency_ms: target.generationLatencyMs,
    deterministic_exactness_checks: 5,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runCodePetstoreDemoTask(task, context) {
  const endpoint = `${context.baseUrl}/api/mcp/petstore-code-mode`;
  const checks = [];
  let turns = 0;

  const metadataStarted = performance.now();
  const metadataResponse = await fetch(endpoint, { headers: { origin: "https://eval.astrail.local" } });
  const metadata = await metadataResponse.json().catch(() => null);
  const metadataLatency = Math.round(performance.now() - metadataStarted);
  check(metadataResponse.ok, "metadata GET succeeds", metadataResponse.status, checks);
  check(metadata?.agent_profile?.supports_code_mode === true, "metadata advertises Code Mode", metadata?.agent_profile, checks);

  const docs = await rpc(endpoint, "tools/call", {
    name: "search_docs",
    arguments: { query: "inventory", limit: 3 },
  }, 9);
  turns += docs.turns;
  const docsPayload = parseToolPayload(docs.payload);
  check(docsPayload.docs?.some((doc) => doc.sdk_method === "client.store.getInventory"), "Petstore docs include inventory method", docsPayload.docs, checks);

  const executed = await rpcWithApproval(endpoint, {
    name: "execute",
    arguments: {
      code: "async function run(client) { return await client.store.getInventory({}); }",
      result_mode: "compact",
    },
  }, 10);
  turns += executed.turns;
  const parsed = parseToolPayload(executed.payload);
  check(parsed.status === "success", "Petstore execute succeeds", parsed.status, checks);
  check(parsed.results?.[0]?.sdk_method === "client.store.getInventory", "Petstore SDK method is exact", parsed.results?.[0]?.sdk_method, checks);
  check(parsed.results?.[0]?.output?.status === "success", "Petstore upstream output succeeds", parsed.results?.[0]?.output?.status, checks);

  return summarizeTask(task, checks, {
    turns,
    latency_ms: metadataLatency + docs.latencyMs + executed.latencyMs,
    deterministic_exactness_checks: 2,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runCodeTypecheckTask(task, context) {
  const target = await context.generated("helpdesk", "code");
  const checks = [];

  const executed = await rpcWithApproval(target.endpoint, {
    name: "execute",
    arguments: {
      code: "async function run(client) { return await client.tickets.closeTicket({ ticket_id: \"t_404\" }); }",
    },
  }, 11);
  const parsed = parseToolPayload(executed.payload);
  const first = parsed.results?.[0] ?? {};

  check(executed.response.ok, "typecheck result returns HTTP 200", executed.response.status, checks);
  check(executed.payload?.result?.isError === true, "unknown method is marked isError", executed.payload?.result?.isError, checks);
  check(parsed.status === "mapping_required", "status is mapping_required", parsed.status, checks);
  check(first.error_code === "sdk_method_not_found", "exact error code is sdk_method_not_found", first.error_code, checks);
  check((first.suggestions ?? []).includes("client.tickets.listTickets"), "suggestions include known listTickets method", first.suggestions, checks);

  return summarizeTask(task, checks, {
    turns: 1,
    latency_ms: executed.latencyMs,
    deterministic_exactness_checks: 3,
    expected_errors: 1,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runCodeSandboxRuntimeBlockTask(task, context) {
  const target = await context.generated("helpdesk", "code");
  const checks = [];

  const executed = await rpcWithApproval(target.endpoint, {
    name: "execute",
    arguments: {
      code: "async function run(client) { return await fetch(\"https://example.com/should-not-run\"); }",
    },
  }, 15);
  const parsed = parseToolPayload(executed.payload);
  const diagnostic = parsed.diagnostics?.[0] ?? {};
  const first = parsed.results?.[0] ?? {};

  check(executed.response.ok, "sandbox denial returns HTTP 200 MCP result", executed.response.status, checks);
  check(executed.payload?.result?.isError === true, "sandbox denial is marked isError", executed.payload?.result?.isError, checks);
  check(parsed.status === "mapping_required", "sandbox denial status is mapping_required", parsed.status, checks);
  check(parsed.analysis?.sdk_calls_found === 0, "sandbox denial finds zero SDK calls", parsed.analysis?.sdk_calls_found, checks);
  check(diagnostic.code === "sandbox_network_access_blocked", "sandbox diagnostic code is exact", diagnostic, checks);
  check(first.error_code === "sandbox_network_access_blocked", "sandbox result error code is exact", first.error_code, checks);
  check(parsed.analysis?.sandbox === "No user JavaScript was evaluated.", "sandbox confirms no JavaScript eval", parsed.analysis?.sandbox, checks);

  return summarizeTask(task, checks, {
    turns: 1,
    latency_ms: executed.latencyMs,
    generation_latency_ms: target.generationLatencyMs,
    deterministic_exactness_checks: 5,
    expected_errors: 1,
    unexpected_errors: checks.some((item) => !item.passed) ? 1 : 0,
  });
}

async function runTask(task, context) {
  if (task.id === "static.helpdesk.list_tickets") return runStaticListTask(task, context);
  if (task.id === "static.helpdesk.validation") return runStaticValidationTask(task, context);
  if (task.id === "dynamic.helpdesk.catalog_invoke") return runDynamicTask(task, context);
  if (task.id === "dynamic.helpdesk.invalid_arguments") return runDynamicInvalidArgumentsTask(task, context);
  if (task.id === "static.helpdesk.auth_required") return runStaticAuthRequiredTask(task, context);
  if (task.id === "code.helpdesk.search_execute") return runCodeHelpdeskTask(task, context);
  if (task.id === "code.petstore.public_demo") return runCodePetstoreDemoTask(task, context);
  if (task.id === "code.helpdesk.typecheck") return runCodeTypecheckTask(task, context);
  if (task.id === "code.helpdesk.sandbox_runtime_block") return runCodeSandboxRuntimeBlockTask(task, context);
  throw new Error(`Unknown eval task: ${task.id}`);
}

function aggregate(results, serverInfo) {
  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const failed = total - passed;
  const totalTurns = results.reduce((sum, result) => sum + (result.metrics.turns ?? 0), 0);
  const totalLatency = results.reduce((sum, result) => sum + (result.metrics.latency_ms ?? 0), 0);
  const unexpectedErrors = results.reduce((sum, result) => sum + (result.metrics.unexpected_errors ?? 0), 0);
  const exactChecks = results.reduce((sum, result) => sum + (result.metrics.deterministic_exactness_checks ?? 0), 0);
  const exactPassed = results.reduce((sum, result) =>
    sum + result.checks.filter((checkItem) =>
      checkItem.passed && /exact|no-eval|parallel|schema|suggestions|error code|status is validation_failed|status is mapping_required/i.test(checkItem.label)
    ).length, 0);

  return {
    generated_at: startedAt.toISOString(),
    base_url: serverInfo.baseUrl,
    local_server_started: !serverInfo.reused,
    summary: {
      total_tasks: total,
      passed_tasks: passed,
      failed_tasks: failed,
      completeness: total === 0 ? 0 : passed / total,
      total_turns: totalTurns,
      average_turns: total === 0 ? 0 : totalTurns / total,
      total_latency_ms: totalLatency,
      average_latency_ms: total === 0 ? 0 : Math.round(totalLatency / total),
      unexpected_error_rate: total === 0 ? 0 : unexpectedErrors / total,
      deterministic_exactness_checks: exactChecks,
      deterministic_exactness_observed_passes: exactPassed,
    },
    results,
  };
}

function markdownReport(report) {
  const status = report.summary.failed_tasks === 0 ? "PASS" : "FAIL";
  const rows = report.results.map((result) => [
    result.passed ? "PASS" : "FAIL",
    result.id,
    result.mode,
    result.metrics.turns,
    result.metrics.latency_ms,
    result.checks.filter((checkItem) => !checkItem.passed).map((checkItem) => checkItem.label).join("; ") || "-",
  ]);

  return `# Astrail MCP Code Mode Eval

Status: **${status}**

Generated at: ${report.generated_at}

Base URL: \`${report.base_url}\`

## Summary

| Metric | Value |
| --- | ---: |
| Tasks passed | ${report.summary.passed_tasks}/${report.summary.total_tasks} |
| Completeness | ${(report.summary.completeness * 100).toFixed(1)}% |
| Average turns | ${report.summary.average_turns.toFixed(2)} |
| Unexpected error rate | ${(report.summary.unexpected_error_rate * 100).toFixed(1)}% |
| Average latency | ${report.summary.average_latency_ms} ms |
| Deterministic exactness checks | ${report.summary.deterministic_exactness_checks} |

## Task Results

| Status | Task | Mode | Turns | Latency | Failed checks |
| --- | --- | --- | ---: | ---: | --- |
${rows.map((row) => `| ${row[0]} | \`${row[1]}\` | ${row[2]} | ${row[3]} | ${row[4]} ms | ${row[5]} |`).join("\n")}

## Metric Notes

- Completeness: fraction of tasks whose required checks passed.
- Efficiency/turn count: MCP JSON-RPC calls made by the task flow, excluding fixture generation.
- Unexpected error rate: tasks with failed checks, excluding expected validation/typecheck failures that returned the correct structured error.
- Latency: wall-clock HTTP latency observed by the harness for MCP calls.
- Deterministic exactness: exact checks against stable fields such as echoed arguments, SDK method names, execution model, and error codes.
`;
}

async function writeReports(report, reportDir) {
  await mkdir(reportDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(reportDir, "mcp-code-mode-latest.json");
  const markdownPath = join(reportDir, "mcp-code-mode-latest.md");
  const stampedJsonPath = join(reportDir, `mcp-code-mode-${stamp}.json`);
  const stampedMarkdownPath = join(reportDir, `mcp-code-mode-${stamp}.md`);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = markdownReport(report);

  await writeFile(jsonPath, json);
  await writeFile(markdownPath, markdown);
  await writeFile(stampedJsonPath, json);
  await writeFile(stampedMarkdownPath, markdown);

  return { jsonPath, markdownPath, stampedJsonPath, stampedMarkdownPath };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const serverInfo = await startLocalServer(options);
  const manifest = await readJson(taskManifestPath);
  const generatedCache = new Map();
  const context = {
    baseUrl: serverInfo.baseUrl,
    async generated(fixture, mode) {
      const key = `${fixture}:${mode}`;
      if (!generatedCache.has(key)) {
        const fixturePath = getPath(manifest, `fixtures.${fixture}`);
        generatedCache.set(key, generateServer(serverInfo.baseUrl, fixturePath, mode));
      }
      return generatedCache.get(key);
    },
  };

  const results = [];
  try {
    for (const task of manifest.tasks) {
      const result = await runTask(task, context);
      results.push(result);
      console.log(`${result.passed ? "PASS" : "FAIL"} ${task.id} (${result.metrics.turns} turns, ${result.metrics.latency_ms} ms)`);
    }

    const report = aggregate(results, serverInfo);
    const paths = await writeReports(report, options.reportDir);
    console.log(`JSON report: ${paths.jsonPath}`);
    console.log(`Markdown report: ${paths.markdownPath}`);

    if (report.summary.failed_tasks > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (serverInfo.child && !options.keepServer) {
      serverInfo.child.kill("SIGTERM");
    }
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown eval failure", error?.stack));
