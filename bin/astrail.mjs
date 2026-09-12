#!/usr/bin/env node

import { createInterface } from "node:readline";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chmodSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseArguments, validateEndpoint } from "./lib/arguments.mjs";
import { createMcpTransport } from "./lib/mcp-transport.mjs";

let parsed;
try { parsed = parseArguments(process.argv.slice(2)); } catch (error) {
  process.stderr.write(`astrail: ${error.message}\n`);
  process.exit(1);
}
const option = (name, fallback) => parsed.options[name] ?? fallback;
const [command = "help", subcommand, name] = parsed.positional;
const configPath = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "astrail", "config.json");
let diskConfig = {};
try { diskConfig = JSON.parse(readFileSync(configPath, "utf8")); } catch {}
const endpoint = option("endpoint", process.env.ASTRAIL_MCP_ENDPOINT || diskConfig.endpoint);
const apiKey = option("api-key", process.env.ASTRAIL_API_KEY || diskConfig.apiKey);
const taskToken = option("task-token", process.env.ASTRAIL_TASK_AUTHORIZATION);

async function savedConfig() {
  try { return JSON.parse(await readFile(configPath, "utf8")); } catch { return {}; }
}

async function activeConfig() { return savedConfig(); }

async function saveConfig(value) {
  const directory = join(configPath, "..");
  await mkdir(directory, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(configPath, 0o600);
}

function help() {
  process.stdout.write(`Astrail CLI

Usage:
  astrail status --endpoint URL [--api-key KEY] [--task-token TOKEN]
  astrail tools list|search|describe [NAME] --endpoint URL [--query TEXT]
  astrail connectors list|search|describe|install [ID] --endpoint URL [--query TEXT]
  astrail call TOOL --endpoint URL [--args JSON]
  astrail resume EXECUTION_ID --endpoint URL
  astrail mcp --endpoint URL
  astrail config --endpoint URL
  astrail login --endpoint URL --api-key KEY [--workspace ID]
  astrail workspace use NAME --endpoint URL --api-key KEY

Environment: ASTRAIL_MCP_ENDPOINT, ASTRAIL_API_KEY, ASTRAIL_TASK_AUTHORIZATION
`);
}

function requireEndpoint() {
  if (!endpoint) throw new Error("Set --endpoint, ASTRAIL_MCP_ENDPOINT, or run `astrail login`.");
  return validateEndpoint(endpoint);
}

let transport;
function sendMessage(message) {
  transport ??= createMcpTransport({ endpoint: requireEndpoint(), apiKey, taskToken });
  return transport(message);
}

async function rpc(method, params = {}, id = 1) {
  const payload = await sendMessage({ jsonrpc: "2.0", id, method, params });
  if (payload.error) throw new Error(payload.error.message ?? "MCP request failed.");
  return payload;
}

async function marketplace() {
  const platform = new URL(requireEndpoint());
  const response = await fetch(new URL("/api/marketplace", platform.origin), {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !Array.isArray(payload.servers)) {
    throw new Error(payload?.error ?? `Marketplace returned HTTP ${response.status}.`);
  }
  return payload.servers;
}

async function installConnector(connectorId) {
  if (!apiKey) throw new Error("Connector installation requires an Astrail API key. Run `astrail login --endpoint URL --api-key KEY` first.");
  const platform = new URL(requireEndpoint());
  const response = await fetch(new URL(`/api/marketplace/${encodeURIComponent(connectorId)}/clone`, platform.origin), {
    method: "POST",
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id || !payload?.hosted_endpoint) {
    throw new Error(payload?.error ?? `Connector installation returned HTTP ${response.status}.`);
  }
  return payload;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  if (command === "help" || command === "--help" || command === "-h") return help();
  if (command === "login") {
    const config = await activeConfig();
    const next = { ...config, endpoint: endpoint || config.endpoint, apiKey: apiKey || config.apiKey, workspace: option("workspace", config.workspace) };
    if (!next.endpoint || !next.apiKey) throw new Error("login requires --endpoint and --api-key. Tokens are stored with mode 0600.");
    validateEndpoint(next.endpoint);
    await saveConfig(next); return print({ logged_in: true, endpoint: next.endpoint, workspace: next.workspace ?? null });
  }
  if (command === "workspace" && subcommand === "use") {
    if (!name) throw new Error("Workspace name is required.");
    const config = await activeConfig(); await saveConfig({ ...config, endpoint: endpoint || config.endpoint, apiKey: apiKey || config.apiKey, workspace: name });
    return print({ workspace: name, configured: true });
  }
  if (command === "workspace" && subcommand === "list") {
    return print((await rpc("tools/list")).result?.tools ? [{ name: name || "active", endpoint: requireEndpoint() }] : []);
  }
  if (command === "status") {
    const initialized = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "astrail-cli", version: "0.1.0" } });
    return print({ status: "connected", endpoint: requireEndpoint(), server: initialized.result?.serverInfo, capabilities: initialized.result?.capabilities });
  }
  if (command === "tools") {
    const tools = (await rpc("tools/list")).result?.tools ?? [];
    if (subcommand === "list") return print(tools);
    if (subcommand === "search") {
      const query = (option("query", name) ?? "").toLowerCase();
      return print(tools.filter((tool) => `${tool.name} ${tool.description ?? ""}`.toLowerCase().includes(query)));
    }
    if (subcommand === "describe") {
      const tool = tools.find((item) => item.name === name);
      if (!tool) throw new Error(`Tool not found: ${name ?? ""}`);
      return print(tool);
    }
    throw new Error("Use tools list, tools search, or tools describe.");
  }
  if (command === "connectors") {
    const servers = await marketplace();
    const connectors = servers.map((server) => {
      const warnings = server.diagnostics && typeof server.diagnostics === "object" && !Array.isArray(server.diagnostics)
        ? server.diagnostics.warnings ?? []
        : Array.isArray(server.diagnostics) ? server.diagnostics : [];
      const authHelp = warnings.find((warning) => typeof warning === "string" && warning.startsWith("Authentication: "))
        ?? (Array.isArray(server.diagnostics) ? server.diagnostics.find((line) => typeof line === "string" && line.includes("Local-bridge")) : null);
      return {
        id: server.id,
        name: server.name,
        category: server.category ?? null,
        description: server.description ?? null,
        executable: Array.isArray(server.endpoint_map) && server.endpoint_map.length > 0,
        local_bridge: Array.isArray(server.diagnostics) && server.diagnostics.some((line) => String(line).includes("Local-bridge")),
        tools: Array.isArray(server.tools_json) ? server.tools_json.map((tool) => tool.name) : [],
        credential_setup: authHelp ? String(authHelp).replace(/^Authentication:\s*/, "") : null,
        docs_url: server.source_url ?? null,
      };
    });
    if (subcommand === "list") return print(connectors);
    if (subcommand === "search") {
      const query = (option("query", name) ?? "").toLowerCase();
      return print(connectors.filter((connector) => JSON.stringify(connector).toLowerCase().includes(query)));
    }
    if (subcommand === "describe") {
      const connector = connectors.find((item) => item.id === name || item.name.toLowerCase() === (name ?? "").toLowerCase());
      if (!connector) throw new Error(`Connector not found: ${name ?? ""}`);
      return print(connector);
    }
    if (subcommand === "install") {
      const connector = connectors.find((item) => item.id === name || item.name.toLowerCase() === (name ?? "").toLowerCase());
      if (!connector) throw new Error(`Connector not found: ${name ?? ""}`);
      const platform = new URL(requireEndpoint());
      const installUrl = new URL(`/marketplace/${encodeURIComponent(connector.id)}`, platform.origin).toString();
      if (!connector.executable || connector.local_bridge) {
        return print({
          connector: connector.id, name: connector.name, installed: false, executable: false, local_bridge: true,
          install_url: installUrl, credential_setup: connector.credential_setup, docs_url: connector.docs_url,
          next: [
            "This connector requires a local bridge and cannot be installed into Astrail's hosted HTTP executor.",
            `Review the local runtime instructions: ${installUrl}`,
          ],
        });
      }
      const installed = await installConnector(connector.id);
      const config = await activeConfig();
      await saveConfig({ ...config, endpoint: installed.hosted_endpoint, apiKey });
      return print({
        connector: connector.id,
        name: connector.name,
        installed: true,
        server_id: installed.id,
        executable: true,
        local_bridge: false,
        install_url: installUrl,
        credential_setup: connector.credential_setup,
        docs_url: connector.docs_url,
        hosted_endpoint: installed.hosted_endpoint,
        config_updated: true,
        next: [
          "The connector is cloned and is now the active Astrail CLI endpoint.",
          `Attach the least-privilege provider credential: ${connector.credential_setup}`,
          "Run `astrail tools list`, then call a read-only tool to verify the connection before enabling writes.",
        ],
      });
    }
    throw new Error("Use connectors list, connectors search, connectors describe, or connectors install.");
  }
  if (command === "call") {
    if (!subcommand) throw new Error("Tool name is required.");
    const rawArgs = option("args", "{}");
    let args;
    try { args = JSON.parse(rawArgs); } catch { throw new Error("--args must be valid JSON."); }
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("--args must be a JSON object.");
    return print((await rpc("tools/call", { name: subcommand, arguments: args })).result);
  }
  if (command === "resume") {
    if (!subcommand) throw new Error("Execution ID is required.");
    return print((await rpc("astrail/resume", { execution_id: subcommand })).result);
  }
  if (command === "config") {
    return print({ mcpServers: { astrail: { command: "astrail", args: ["mcp", "--endpoint", requireEndpoint()], env: apiKey ? { ASTRAIL_API_KEY: "<set securely>" } : {} } } });
  }
  if (command === "mcp") {
    requireEndpoint();
    const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of input) {
      if (!line.trim()) continue;
      let request;
      try { request = JSON.parse(line); } catch {
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON." } })}\n`);
        continue;
      }
      if (!request || Array.isArray(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string"
        || (Object.hasOwn(request, "id") && typeof request.id !== "string" && typeof request.id !== "number")) {
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid MCP request." } })}\n`);
        continue;
      }
      try {
        const response = await sendMessage(request);
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "CLI bridge error.";
        if (Object.hasOwn(request, "id")) {
          process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message } })}\n`);
        } else {
          process.stderr.write(`astrail: ${message}\n`);
        }
      }
    }
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`astrail: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
