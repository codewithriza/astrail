import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runGenerationPipeline } from "../../lib/generation-pipeline";

async function main() {
  // Fail immediately if a future change adds a network dependency to this example.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("The offline demo must not access the network."); };
  try {
    const rawJson = await readFile(new URL("./openapi.json", import.meta.url), "utf8");
    const result = await runGenerationPipeline({
      sourceType: "json_paste",
      rawJson,
      generationMode: "static",
      clientPreset: "openai",
    });
    assert.equal(result.validationStatus, "passed");
    assert.equal(result.endpointMap.length, 3);
    assert.equal(result.generated.tools.length, 3);
    const toolFor = (operation: string) => {
      const endpoint = result.endpointMap.find((item) => item.operation_id === operation);
      assert.ok(endpoint, `Missing endpoint: ${operation}`);
      const tool = result.generated.tools.find((item) => item.name === endpoint.tool_name);
      assert.ok(tool, `Missing tool: ${operation}`);
      return tool;
    };
    assert.equal(toolFor("listNotes").policy, "allow");
    assert.equal(toolFor("createNote").policy, "approval");
    assert.equal(toolFor("deleteNote").policy, "block");
    console.log("OpenAPI → validated MCP tools (no API key, database, or network)");
    console.table(result.generated.tools.map((tool) => ({
      tool: tool.name,
      policy: tool.policy,
    })));
    console.log("Read allowed. Write requires approval. Delete blocked. No upstream calls executed.");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
