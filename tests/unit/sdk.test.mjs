import assert from "node:assert/strict";
import test from "node:test";
import { AstrailClient, AstrailError, parseToolResult } from "../../sdk/typescript/src/index.ts";

const errorResult = { isError: true, content: [{ type: "text", text: "Permission denied" }], structuredContent: { status: "denied" } };

test("SDK never unwraps failed tools as successful structured results", () => {
  assert.throws(() => parseToolResult(errorResult), error => error instanceof AstrailError && error.data === errorResult);
  assert.deepEqual(parseToolResult({ structuredContent: { ok: true } }), { ok: true });
  assert.deepEqual(parseToolResult({ content: [{ type: "text", text: '{"ok":true}' }] }), { ok: true });
});

test("SDK raw calls preserve error envelopes for callers that need them", async () => {
  const client = new AstrailClient({ endpoint: "https://example.test/mcp", fetch: async () => Response.json({ jsonrpc: "2.0", id: 1, result: errorResult }) });
  assert.deepEqual(await client.tools.raw("write"), errorResult);
});

test("SDK rejects mismatched IDs and HTTP errors, and does not follow redirects", async () => {
  let redirect;
  const client = new AstrailClient({ endpoint: "https://example.test/mcp", fetch: async (_url, options) => {
    redirect = options.redirect;
    return Response.json({ jsonrpc: "2.0", id: 99, result: {} });
  } });
  await assert.rejects(client.listTools(), /mismatched/);
  assert.equal(redirect, "manual");
  const failing = new AstrailClient({ endpoint: "https://example.test/mcp", fetch: async () => Response.json({ jsonrpc: "2.0", id: 1, result: {} }, { status: 500 }) });
  await assert.rejects(failing.listTools(), error => error instanceof AstrailError && error.status === 500);
});

test("SDK timeout remains active while the response body is being read", async () => {
  const client = new AstrailClient({ endpoint: "https://example.test/mcp", timeoutMs: 10, fetch: async (_url, options) => ({
    status: 200, ok: true,
    text: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  }) });
  await assert.rejects(client.listTools(), /timed out/);
});

test("generated curl commands quote endpoints and expand the key environment variable", () => {
  const client = new AstrailClient({ endpoint: "https://example.test/it's", apiKey: "not-for-output" });
  const command = client.curlInitialize();
  assert.ok(command.includes("'https://example.test/it'\\''s'"));
  assert.ok(command.includes('-H "Authorization: Bearer $ASTRAIL_API_KEY"'));
  assert.ok(!command.includes("not-for-output"));
});

test("SDK rejects unsafe endpoint syntax while allowing relative browser routes", () => {
  for (const endpoint of ["https://user:pass@example.test", "//example.test/mcp", "https://example.test/#x", "https://bad host/mcp"]) assert.throws(() => new AstrailClient({ endpoint }));
  assert.ok(new AstrailClient({ endpoint: "/api/mcp/local" }));
});

test("SDK rejects timeouts that overflow or silently disable timers", () => {
  for (const timeoutMs of [NaN, Infinity, -1, 2147483648]) assert.throws(() => new AstrailClient({ endpoint: "/api/mcp/x", timeoutMs }), RangeError);
  assert.ok(new AstrailClient({ endpoint: "/api/mcp/x", timeoutMs: 0 }));
});
