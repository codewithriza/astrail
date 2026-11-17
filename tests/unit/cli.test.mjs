import assert from "node:assert/strict";
import test from "node:test";
import { parseArguments, validateEndpoint } from "../../bin/lib/arguments.mjs";
import { createMcpTransport } from "../../bin/lib/mcp-transport.mjs";

const request = { jsonrpc: "2.0", id: 0, method: "tools/list", params: {} };
const response = (id = 0) => ({ jsonrpc: "2.0", id, result: { tools: [] } });
const makeTransport = fetchImpl => createMcpTransport({ endpoint: "https://example.test/mcp", fetchImpl });

test("options do not consume workspace names as positional commands", () => {
  assert.deepEqual(parseArguments(["--workspace", "team", "login", "--api-key", "test"]), {
    options: { workspace: "team", "api-key": "test" }, positional: ["login"],
  });
  for (const args of [["--endpoint"], ["--endpoint", "--api-key", "test"], ["--unknown"], ["--query", "a", "--query", "b"]]) {
    assert.throws(() => parseArguments(args));
  }
  assert.deepEqual(parseArguments(["tools", "--help"]).positional, ["help"]);
});

test("endpoint validation permits local development and rejects embedded credentials", () => {
  assert.equal(validateEndpoint("http://localhost:3000/mcp"), "http://localhost:3000/mcp");
  for (const endpoint of ["invalid", "file:///tmp/key", "https://user:secret@example.test", "https://example.test/#fragment"]) {
    assert.throws(() => validateEndpoint(endpoint));
  }
});

test("empty HTTP errors and empty successful requests fail explicitly", async () => {
  await assert.rejects(makeTransport(async () => new Response(null, { status: 500 }))(request), /HTTP 500/);
  await assert.rejects(makeTransport(async () => new Response(null, { status: 204 }))(request), /empty response/);
});

test("JSON-RPC IDs and upstream errors are preserved", async () => {
  const error = { jsonrpc: "2.0", id: 0, error: { code: -32602, message: "Invalid params", data: { field: "name" } } };
  assert.deepEqual(await makeTransport(async () => Response.json(error))(request), error);
  await assert.rejects(makeTransport(async () => Response.json(response(9)))(request), /mismatched/);
  await assert.rejects(makeTransport(async () => Response.json(null))(request), /invalid/);
});

test("notifications have no request ID and produce no response", async () => {
  let sent;
  const send = makeTransport(async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(null, { status: 202 });
  });
  assert.equal(await send({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal(Object.hasOwn(sent, "id"), false);
});

test("initialization session and negotiated protocol are reused", async () => {
  const headers = [];
  const send = makeTransport(async (_url, init) => {
    headers.push(init.headers);
    const message = JSON.parse(init.body);
    return message.method === "initialize"
      ? Response.json({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25" } }, { headers: { "mcp-session-id": "session-test" } })
      : Response.json(response());
  });
  await send({ jsonrpc: "2.0", id: 1, method: "initialize" });
  await send(request);
  assert.equal(headers[1]["mcp-session-id"], "session-test");
  assert.equal(headers[1]["mcp-protocol-version"], "2025-11-25");
});

test("SSE handles heartbeats, multi-line data and split chunks without waiting for stream closure", async () => {
  const text = ': heartbeat\r\n\r\ndata: \r\n\r\ndata: {"jsonrpc":"2.0",\r\ndata: "id":0,"result":{"tools":[]}}\r\n\r\n';
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      for (const char of text) controller.enqueue(new TextEncoder().encode(char));
    },
    cancel() { cancelled = true; },
  });
  const send = makeTransport(async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }));
  assert.deepEqual(await send(request), response());
  assert.equal(cancelled, true);
});

test("oversized responses and malformed SSE fail with bounded errors", async () => {
  const send = makeTransport(async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)));
  await assert.rejects(send(request), /4 MiB/);
  const malformed = makeTransport(async () => new Response('data: broken\n\n', { headers: { "content-type": "text/event-stream" } }));
  await assert.rejects(malformed(request), /malformed SSE/);
});

test("CLI accepts equals syntax without splitting values", () => {
  assert.deepEqual(parseArguments(["tools", "--query=a=b"]).options, { query: "a=b" });
  assert.throws(() => parseArguments(["--query=a", "--query", "b"]), /only once/);
});

test("CLI respects the end-of-options marker", () => {
  assert.deepEqual(parseArguments(["call", "--", "--help", "--tool"]).positional, ["call", "--help", "--tool"]);
});
