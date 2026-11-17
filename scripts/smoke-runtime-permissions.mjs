const baseUrl = (process.env.ASTRAIL_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/mcp/runtime-permissions-demo`;

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function postJson(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://smoke.astrail.local" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function parseToolText(payload) {
  const text = payload?.result?.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function callTool(id, name, args) {
  return postJson({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

async function assertMetadataPolicy() {
  const response = await fetch(endpoint, { headers: { origin: "https://smoke.astrail.local" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.agent_profile?.supports_runtime_permissions !== true) {
    fail("metadata does not advertise runtime permissions", JSON.stringify(payload, null, 2));
  }
  const allowedResource = payload?.runtime_policy?.allowed_resources?.[0];
  if (allowedResource?.pattern !== "^store$" || allowedResource?.regex !== true) {
    fail("runtime policy did not expose allowed resource regex", JSON.stringify(payload?.runtime_policy, null, 2));
  }
  console.log("metadata-policy: ok");
}

async function assertAllowedGetAndResourceRegex() {
  const result = await callTool(1, "list_inventory", {});
  const parsed = parseToolText(result.payload);
  if (!result.response.ok || result.payload?.result?.isError || parsed.status !== "success") {
    fail("allowed GET with matching resource regex did not execute", JSON.stringify(parsed, null, 2));
  }
  if (parsed.request?.method !== "GET" || parsed.runtime?.trace_id == null) {
    fail("allowed GET result missing method or trace id", JSON.stringify(parsed, null, 2));
  }
  console.log("allowed-get-resource-regex: ok");
}

async function assertBlockedDeleteTool() {
  const result = await callTool(2, "delete_pet", { petId: 1 });
  const parsed = parseToolText(result.payload);
  if (result.response.status !== 200 || result.payload?.result?.isError !== true || parsed.status !== "permission_denied") {
    fail("blocked delete did not return permission_denied MCP result", JSON.stringify(parsed, null, 2));
  }
  if (parsed.error_code !== "runtime_permission_denied" || parsed.runtime?.trace_id == null) {
    fail("blocked delete missing permission error code or trace id", JSON.stringify(parsed, null, 2));
  }
  console.log("blocked-delete: ok");
}

async function assertCodeModeBlockedMethod() {
  const result = await callTool(3, "execute", {
    code: "async function run(client) { return await client.pet.deletePet({ petId: 1 }); }",
  });
  const parsed = parseToolText(result.payload);
  if (result.response.status !== 200 || result.payload?.result?.isError !== true || parsed.status !== "permission_denied") {
    fail("Code Mode blocked method did not return permission_denied", JSON.stringify(parsed, null, 2));
  }
  if (!parsed.trace_id || parsed.results?.[0]?.sdk_method !== "client.pet.deletePet") {
    fail("Code Mode permission denial missing trace id or SDK method", JSON.stringify(parsed, null, 2));
  }
  console.log("code-mode-blocked-method: ok");
}

async function main() {
  console.log(`base_url: ${baseUrl}`);
  await assertMetadataPolicy();
  await assertAllowedGetAndResourceRegex();
  await assertBlockedDeleteTool();
  await assertCodeModeBlockedMethod();
  console.log("PASS: runtime permissions guard allowed GETs, blocked deletes, resource regexes, and Code Mode compiled calls.");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown runtime permissions smoke failure"));
