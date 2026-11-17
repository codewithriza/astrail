const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function isResponse(message, id) {
  return message && typeof message === "object" && !Array.isArray(message)
    && message.jsonrpc === "2.0" && message.id === id
    && (Object.hasOwn(message, "result") !== Object.hasOwn(message, "error"));
}

async function readResponse(response, id) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("MCP endpoint returned an empty response.");
  const decoder = new TextDecoder();
  const streaming = response.headers.get("content-type")?.includes("text/event-stream");
  let bytes = 0;
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error("MCP response exceeds the 4 MiB limit.");
      }
      buffer += decoder.decode(value, { stream: !done });
      if (streaming) {
        // SSE events may span chunks and contain several data lines or heartbeat comments.
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = event.split(/\r?\n/).filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).replace(/^ /, "")).join("\n");
          if (!data.trim()) continue;
          let message;
          try { message = JSON.parse(data); } catch { throw new Error("MCP endpoint returned malformed SSE data."); }
          if (isResponse(message, id)) return message;
        }
      }
      if (done) break;
    }
    if (streaming) throw new Error("MCP stream ended without a matching response.");
    let payload;
    try { payload = JSON.parse(buffer); } catch { throw new Error("MCP endpoint returned an empty or malformed JSON response."); }
    if (!isResponse(payload, id)) throw new Error("MCP endpoint returned an invalid or mismatched JSON-RPC response.");
    return payload;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createMcpTransport({ endpoint, apiKey, taskToken, fetchImpl = globalThis.fetch }) {
  let sessionId;
  let protocolVersion;
  return async function send(message) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...(taskToken ? { "x-astrail-task-authorization": taskToken } : {}),
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
      },
      body: JSON.stringify(message),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`MCP endpoint returned HTTP ${response.status}.`);
    }
    if (!Object.hasOwn(message, "id")) {
      await response.body?.cancel();
      return null;
    }
    const payload = await readResponse(response, message.id);
    if (message.method === "initialize" && !payload.error) {
      sessionId = response.headers.get("mcp-session-id") ?? undefined;
      protocolVersion = payload.result?.protocolVersion;
    }
    return payload;
  };
}
