import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let observedTaskToken = null;
const configHome = await mkdtemp(join(tmpdir(), "astrail-cli-smoke-"));

const server = createServer(async (request, response) => {
  observedTaskToken = request.headers["x-astrail-task-authorization"] ?? observedTaskToken;
  if (request.method === "GET" && request.url === "/api/marketplace") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ servers: [{
      id: "preset-github",
      name: "GitHub Connector",
      category: "Code",
      description: "Executable GitHub connector",
      source_url: "https://docs.github.com/en/rest",
      endpoint_map: [{ method: "GET", path: "/search/repositories" }],
      tools_json: [{ name: "github_search_repositories" }],
      diagnostics: { warnings: ["Authentication: Use a fine-grained token restricted to the repositories and read permissions these tools need."] },
    }] }));
    return;
  }
  if (request.method === "POST" && request.url === "/api/marketplace/preset-github/clone") {
    assert.equal(request.headers.authorization, "Bearer ag_cli_smoke_key");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "installed-github", hosted_endpoint: `http://127.0.0.1:${server.address().port}/api/mcp/installed-github` }));
    return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  const rpc = JSON.parse(body);
  const result = rpc.method === "initialize"
    ? { serverInfo: { name: "CLI smoke", version: "1" }, capabilities: { tools: {} } }
    : rpc.method === "tools/list"
      ? { tools: [{ name: "hello", description: "Say hello", inputSchema: { type: "object" } }] }
      : rpc.method === "tools/call"
        ? { content: [{ type: "text", text: `hello ${rpc.params.arguments.name}` }] }
        : { resumed: rpc.params.execution_id };
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const endpoint = `http://127.0.0.1:${address.port}/mcp`;

async function run(args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["bin/astrail.mjs", ...args, "--endpoint", endpoint], { cwd: process.cwd(), env: { ...process.env, XDG_CONFIG_HOME: configHome } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    if (input !== null) child.stdin.end(input); else child.stdin.end();
  });
}

try {
  assert.match(await run(["status"]), /CLI smoke/);
  assert.match(await run(["status", "--task-token", "atask_cli_smoke_token"]), /CLI smoke/);
  assert.equal(observedTaskToken, "atask_cli_smoke_token");
  assert.match(await run(["tools", "search", "--query", "hello"]), /Say hello/);
  assert.match(await run(["call", "hello", "--args", '{"name":"Astrail"}']), /hello Astrail/);
  assert.match(await run(["resume", "approval-1"]), /approval-1/);
  assert.match(await run(["connectors", "list"]), /GitHub Connector/);
  assert.match(await run(["connectors", "describe", "preset-github"]), /github_search_repositories/);
  const installed = await run(["connectors", "install", "preset-github", "--api-key", "ag_cli_smoke_key"]);
  assert.match(installed, /"installed": true/);
  assert.match(installed, /installed-github/);
  assert.match(await run(["mcp"], '{"jsonrpc":"2.0","id":7,"method":"tools/list","params":{}}\n'), /"id":7/);
  console.log("PASS: Astrail CLI status, tool and connector discovery, call, resume, and stdio bridge.");
} finally {
  server.close();
  await rm(configHome, { recursive: true, force: true });
}
