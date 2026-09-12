import { emptyDiagnostics } from "@/lib/diagnostics";
import { analyzeWebsiteWithPlaywright, assertPublicWebsiteUrl, redactWebsiteUrlForLog, type PageControl } from "@/lib/runtime/playwright-website";
import type { GeneratedMcpServer, GenerationDiagnostics, McpTool, OpenApiEndpoint } from "@/lib/types";

export type WebsiteMcpResult = {
  generated: GeneratedMcpServer;
  endpointMap: OpenApiEndpoint[];
  diagnostics: GenerationDiagnostics;
  sourceUrl: string;
  pageTitle: string;
};

const MAX_TOOLS = 12;

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 42) || "element";
}

function safeArgumentName(value: string, fallback: string, seen: Set<string>) {
  const base = slug(value).replace(/^(\d)/, "field_$1") || fallback;
  const reserved = new Set(["__proto__", "constructor", "prototype", "instruction"]);
  const safeBase = reserved.has(base) ? `${base}_value` : base;
  let candidate = safeBase;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${safeBase}_${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

function inputSchemaFor(control: PageControl) {
  const properties: Record<string, unknown> = {
    instruction: {
      type: "string",
      description: "Optional instruction for the browser runtime before executing this website workflow.",
    },
  };
  const required: string[] = [];
  const seen = new Set(Object.keys(properties));

  const inputs = control.inputs ?? [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const originalName = input.name || `field_${index + 1}`;
    const name = safeArgumentName(originalName, `field_${index + 1}`, seen);
    properties[name] = {
      type: input.type === "number" ? "number" : "string",
      description: `Value for ${originalName}.`,
      "x-astrail-name": originalName,
      "x-astrail-in": "browser_form",
    };
    if (input.required) required.push(name);
  }

  return { type: "object", properties, required };
}

function buildTools(controls: PageControl[], title: string): { tools: McpTool[]; endpointMap: OpenApiEndpoint[] } {
  const deduped = new Map<string, PageControl>();
  for (const control of controls) {
    const key = `${control.kind}:${slug(control.label)}`;
    if (!deduped.has(key)) deduped.set(key, control);
  }

  const selected = Array.from(deduped.values()).slice(0, MAX_TOOLS);
  const tools = selected.map((control) => {
    const name = `browser_${control.kind}_${slug(control.label)}`;
    return {
      name,
      description: `Browser workflow for ${title}: ${control.label}. Safe public reads execute in Playwright; interactive/auth flows require runtime review.`,
      input_schema: inputSchemaFor(control),
      method: "BROWSER",
      path: control.selector ?? control.href ?? "/",
    };
  });

  const endpointMap = selected.map((control, index) => ({
    method: "BROWSER",
    path: control.selector ?? control.href ?? "/",
    runtime_kind: "browser" as const,
    browser_action: control.kind,
    selector: control.selector,
    target_url: control.href ?? control.action ?? null,
    tool_name: tools[index].name,
    operation_id: tools[index].name,
    summary: control.label,
    description: tools[index].description,
    parameters: control.inputs?.map((input) => ({
      name: input.name,
      in: "browser_form",
      required: input.required,
      schema: { type: input.type === "number" ? "number" : "string" },
    })) ?? [],
    request_body: control.kind === "submit_form" ? { method: control.method ?? "GET" } : undefined,
    responses: {
      website_browser_runtime: { description: "Playwright-backed public page read for open/link/GET form workflows." },
      browser_runtime_required: { description: "Requires reviewed isolated Playwright execution for interactive workflows." },
    },
    requires_auth: false,
  }));

  return { tools, endpointMap };
}

function generatedCodeFor(name: string, tools: McpTool[]) {
  const toolNames = tools.map((tool) => tool.name).join(", ");
  return `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: ${JSON.stringify(name)}, version: "0.1.0" });

// Website-to-MCP hosted runtime template.
// Tools discovered: ${toolNames}
// Hosted execution uses Astrail's Playwright-backed runtime, not generated JS eval.

server.tool("browser_runtime_status", "Check whether this website MCP server is attached to Astrail's browser runtime.", z.object({}), async () => ({
  content: [{ type: "text", text: "Website to MCP template installed. Hosted execution is handled by Astrail's Playwright runtime." }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
`;
}

export async function inspectWebsiteForMcp(inputUrl: string): Promise<WebsiteMcpResult> {
  const input = assertPublicWebsiteUrl(inputUrl);
  const traceId = `analysis_${Date.now().toString(36)}`;
  const diagnostics = emptyDiagnostics(input.toString());
  diagnostics.discovery_method = "playwright_website_inspection";

  const analysis = await analyzeWebsiteWithPlaywright(input.toString(), traceId);
  const controls: PageControl[] = [
    { kind: "open_page", label: "open page", selector: "body", href: analysis.finalUrl },
    ...analysis.forms,
    ...analysis.buttons,
    ...analysis.links,
  ];
  const { tools, endpointMap } = buildTools(controls, analysis.title);

  diagnostics.spec_size_bytes = analysis.visibleTextSummary.length;
  diagnostics.endpoint_count = endpointMap.length;
  diagnostics.tools_generated = tools.length;
  diagnostics.selected_group = "Browser workflows";
  diagnostics.warnings.push("Website-to-MCP is experimental. Playwright can execute safe public reads; auth, sessions, JS-only clicks, and complex workflows require sandbox review.");
  diagnostics.raw = [
    `Input URL checked: ${redactWebsiteUrlForLog(input.toString())}.`,
    `Final URL: ${redactWebsiteUrlForLog(analysis.finalUrl)}.`,
    `Page title: ${analysis.title}.`,
    `Links found: ${analysis.links.length}.`,
    `Forms found: ${analysis.forms.length}.`,
    `Buttons found: ${analysis.buttons.length}.`,
    `Screenshot: ${analysis.screenshotPath ?? "unavailable"}.`,
    `Visible text summary: ${analysis.visibleTextSummary.slice(0, 240)}.`,
    ...analysis.actionHistory.map((item) => `Action: ${item}`),
  ];
  diagnostics.trace.push(
    { label: "Website opened with Playwright", status: "passed", detail: analysis.finalUrl },
    { label: `${controls.length} browser actions detected`, status: "passed", detail: "links, buttons, forms, inputs" },
    { label: `${tools.length} MCP tools generated`, status: "passed" },
    { label: "Screenshot captured", status: analysis.screenshotPath ? "passed" : "warning", detail: analysis.screenshotPath ?? "Screenshot unavailable" },
    { label: "Experimental Playwright runtime enabled", status: "warning", detail: "Safe public reads work; complex workflows need sandbox review." }
  );
  diagnostics.timestamps.completed_at = new Date().toISOString();

  const name = `${slug(analysis.title).replace(/_/g, "-") || input.hostname}-browser-server`;
  return {
    generated: {
      name,
      description: `Playwright-backed MCP workflow candidates discovered from ${analysis.title}.`,
      tools,
      generated_code: generatedCodeFor(name, tools),
    },
    endpointMap,
    diagnostics,
    sourceUrl: input.toString(),
    pageTitle: analysis.title,
  };
}
