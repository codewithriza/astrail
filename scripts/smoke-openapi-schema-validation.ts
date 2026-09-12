import Module from "node:module";
import path from "node:path";
import type { OpenApiEndpoint } from "../lib/types";

const compiledRoot = path.resolve(process.cwd(), ".tmp/schema-validation-smoke");
const moduleWithResolver = Module as unknown as {
  _resolveFilename: (request: string, parent?: unknown, isMain?: boolean, options?: unknown) => string;
};
const originalResolveFilename = moduleWithResolver._resolveFilename;

moduleWithResolver._resolveFilename = function resolveAstrailAlias(request: string, parent?: unknown, isMain?: boolean, options?: unknown) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(compiledRoot, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

function assert(condition: unknown, message: string, detail?: unknown) {
  if (!condition) {
    const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
}

async function main() {
  const [{ normalizeOpenApiSpec }, { buildEndpointInputSchema }, { validateToolInput }] = await Promise.all([
    import("../lib/openapi"),
    import("../lib/generate-mcp"),
    import("../lib/runtime/tool-input-validation"),
  ]);

  const { spec, endpoints } = normalizeOpenApiSpec({
    openapi: "3.0.3",
    info: { title: "Vendor JSON Smoke", version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
    paths: {
      "/tickets": {
        post: {
          operationId: "createTicket",
          requestBody: {
            required: true,
            content: {
              "application/vnd.astrail.ticket+json": {
                schema: {
                  type: "object",
                  required: ["subject"],
                  properties: {
                    subject: { type: "string", minLength: 3 },
                    priority: { type: "string", enum: ["low", "high"] },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Created" } },
        },
      },
    },
  });

  const endpoint = endpoints[0] as OpenApiEndpoint | undefined;
  if (!endpoint) throw new Error("Expected one endpoint from the smoke OpenAPI spec.");
  assert(endpoint.request_body_schema, "Expected vendor +json request body schema to be extracted.");

  const inputSchema = buildEndpointInputSchema(endpoint, spec);
  assert(
    Array.isArray(inputSchema.required) && inputSchema.required.includes("subject"),
    "Expected generated MCP input schema to require the vendor +json body field.",
    inputSchema,
  );

  const missing = validateToolInput(inputSchema, {});
  assert(!missing.ok && missing.issues.some((item) => item.code === "missing_required" && item.path === "subject"), "Expected missing vendor +json body field to fail runtime validation.", missing);

  const malformed = validateToolInput(inputSchema, { subject: "ok", priority: "urgent" });
  assert(!malformed.ok && malformed.issues.some((item) => item.code === "string_too_short" || item.code === "invalid_enum"), "Expected malformed vendor +json body args to fail runtime validation.", malformed);

  const valid = validateToolInput(inputSchema, { subject: "Billing issue", priority: "high" });
  assert(valid.ok, "Expected valid vendor +json body args to pass runtime validation.", valid);

  console.log("PASS: OpenAPI vendor +json body schemas feed generated MCP args and runtime validation.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
