import type { ApiKey, McpServer, RuntimeLog } from "@/lib/types";

export const localDemoUserId = "local-preview";

declare global {
  // Shared by Next route bundles in local demo mode.
  var __astrailLocalGeneratedServers: Map<string, McpServer> | undefined;
}

function localGeneratedServers() {
  globalThis.__astrailLocalGeneratedServers ??= new Map<string, McpServer>();
  return globalThis.__astrailLocalGeneratedServers;
}

export function saveLocalGeneratedServer(server: McpServer) {
  localGeneratedServers().set(server.id, server);
  return server;
}

export function findLocalGeneratedServer(serverId: string) {
  return localGeneratedServers().get(serverId) ?? null;
}

export function updateLocalDemoServer(serverId: string, updates: Partial<McpServer>) {
  const server = localDemoServers().find((item) => item.id === serverId);
  if (!server) return null;
  return saveLocalGeneratedServer({ ...server, ...updates });
}

export function localDemoServers(): McpServer[] {
  const now = new Date().toISOString();
  const generatedServers = Array.from(localGeneratedServers().values())
    .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")));
  const securityFixtures: McpServer[] = process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES === "1"
    ? [
        {
          id: "security-private",
          user_id: localDemoUserId,
          name: "Security private MCP fixture",
          description: "Smoke-test private endpoint auth and runtime policy.",
          source_url: "https://example.com/openapi.json",
          source_type: "openapi_url",
          category: "Security",
          generated_code: null,
          tools_json: [
            {
              name: "private_status",
              description: "Private read fixture.",
              input_schema: { type: "object", properties: {} },
              method: "GET",
              path: "/",
              policy: "block",
            },
            {
              name: "write_probe",
              description: "Write fixture used to verify actor-role enforcement through endpoint catalog calls.",
              input_schema: { type: "object", properties: {} },
              method: "PATCH",
              path: "/api/security-smoke/write-probe",
              policy: "allow",
            },
            {
              name: "invoke_api_endpoint",
              description: "Invoke one reviewed endpoint by ID.",
              input_schema: {
                type: "object",
                properties: {
                  endpoint_id: { type: "string" },
                  arguments: { type: "object" },
                },
                required: ["endpoint_id"],
              },
              method: "ASTRAIL_META",
              path: "/_meta/invoke",
              policy: "allow",
            },
            {
              name: "ssrf_probe",
              description: "Blocked SSRF target fixture.",
              input_schema: { type: "object", properties: {} },
              method: "GET",
              path: "/metadata",
            },
            {
              name: "credential_error",
              description: "Credential redaction fixture.",
              input_schema: { type: "object", properties: {} },
              method: "GET",
              path: "/not-found",
            },
            {
              name: "argument_secret_echo",
              description: "Sensitive argument redaction fixture.",
              input_schema: {
                type: "object",
                properties: {
                  access_token: {
                    type: "string",
                    minLength: 8,
                    "x-astrail-name": "x-echo-value",
                    "x-astrail-in": "header",
                  },
                },
                required: ["access_token"],
                additionalProperties: false,
              },
              method: "GET",
              path: "/api/security-smoke/argument-secret-echo",
            },
          ],
          endpoint_map: [
            {
              method: "GET",
              path: "/",
              base_url: "https://example.com",
              tool_name: "private_status",
              operation_id: "private_status",
              summary: "Private status",
              description: "Private read fixture.",
              parameters: [],
              input_schema: { type: "object", properties: {} },
              operation_kind: "read",
              requires_auth: false,
            },
            {
              method: "PATCH",
              path: "/api/security-smoke/write-probe",
              base_url: process.env.ASTRAIL_SECURITY_SMOKE_UPSTREAM_BASE_URL ?? "http://127.0.0.1:3000",
              tool_name: "write_probe",
              operation_id: "write_probe",
              summary: "Write probe",
              description: "Must be denied for read-only actor roles, including through invoke_api_endpoint.",
              parameters: [],
              input_schema: { type: "object", properties: {} },
              operation_kind: "write",
              requires_auth: false,
            },
            {
              method: "GET",
              path: "/metadata",
              base_url: "http://169.254.169.254",
              tool_name: "ssrf_probe",
              operation_id: "ssrf_probe",
              summary: "SSRF probe",
              description: "Blocked metadata service target.",
              parameters: [],
              input_schema: { type: "object", properties: {} },
              operation_kind: "read",
              requires_auth: false,
            },
            {
              method: "GET",
              path: "/not-found",
              base_url: "https://example.com",
              tool_name: "credential_error",
              operation_id: "credential_error",
              summary: "Credential error",
              description: "Forces an upstream error while provider credentials are injected.",
              parameters: [],
              input_schema: { type: "object", properties: {} },
              operation_kind: "read",
              requires_auth: true,
            },
            {
              method: "GET",
              path: "/api/security-smoke/argument-secret-echo",
              base_url: process.env.ASTRAIL_SECURITY_SMOKE_UPSTREAM_BASE_URL ?? "http://127.0.0.1:3000",
              tool_name: "argument_secret_echo",
              operation_id: "argument_secret_echo",
              summary: "Sensitive argument echo",
              description: "Echoes a sensitive tool argument through a non-sensitive upstream header name.",
              parameters: [
                { name: "x-echo-value", in: "header", required: true, schema: { type: "string" } },
              ],
              input_schema: {
                type: "object",
                properties: {
                  access_token: {
                    type: "string",
                    minLength: 8,
                    "x-astrail-name": "x-echo-value",
                    "x-astrail-in": "header",
                  },
                },
                required: ["access_token"],
                additionalProperties: false,
              },
              operation_kind: "read",
              requires_auth: false,
            },
          ],
          diagnostics: ["Local security smoke fixture."],
          status: "live",
          validation_status: "passed",
          generation_status: "completed",
          is_public: false,
          hosted_endpoint: "/api/mcp/security-private",
          call_count: 0,
          protocol_version: "2024-11-05",
          runtime_policy: {
            roles: { operator: { max_action_level: "read" } },
          },
          created_at: now,
        },
        {
          id: "security-public",
          user_id: localDemoUserId,
          name: "Security public MCP fixture",
          description: "Smoke-test public endpoint filtering and permission denial.",
          source_url: "https://example.com/openapi.json",
          source_type: "openapi_url",
          category: "Security",
          generated_code: null,
          tools_json: [
            {
              name: "public_echo",
              description: "Public read fixture.",
              input_schema: {
                type: "object",
                properties: {
                  q: { type: "string", description: "Public query." },
                },
                required: ["q"],
                additionalProperties: false,
              },
              method: "GET",
              path: "/",
              x_astrail: {
                visibility: "public",
                risk: "read",
                requires_auth: false,
                auth_schemes: [],
                required_scopes: [],
                prerequisites: [],
                agent_instructions: ["Read-only public fixture."],
                example_arguments: { q: "hello" },
              },
            },
            {
              name: "private_delete_everything",
              description: "Private destructive fixture SECRET_DO_NOT_LEAK.",
              input_schema: {
                type: "object",
                properties: {
                  confirmation: { type: "string", description: "SECRET_DO_NOT_LEAK" },
                },
                required: ["confirmation"],
              },
              method: "DELETE",
              path: "/private",
              visibility: "private",
              x_astrail: {
                visibility: "private",
                risk: "destructive",
                requires_auth: true,
                auth_schemes: ["bearer"],
                required_scopes: ["SECRET_DO_NOT_LEAK"],
                prerequisites: ["SECRET_DO_NOT_LEAK"],
                agent_instructions: ["SECRET_DO_NOT_LEAK"],
                example_arguments: { confirmation: "SECRET_DO_NOT_LEAK" },
              },
            },
          ],
          endpoint_map: [
            {
              method: "GET",
              path: "/",
              base_url: "https://example.com",
              tool_name: "public_echo",
              operation_id: "public_echo",
              summary: "Public echo",
              description: "Public read fixture.",
              parameters: [
                { name: "q", in: "query", required: true, schema: { type: "string" } },
              ],
              input_schema: {
                type: "object",
                properties: {
                  q: { type: "string" },
                },
                required: ["q"],
                additionalProperties: false,
              },
              operation_kind: "read",
              requires_auth: false,
              visibility: "public",
            },
            {
              method: "DELETE",
              path: "/private",
              base_url: "https://example.com",
              tool_name: "private_delete_everything",
              operation_id: "private_delete_everything",
              summary: "Private destructive endpoint",
              description: "SECRET_DO_NOT_LEAK",
              parameters: [],
              input_schema: {
                type: "object",
                properties: {
                  confirmation: { type: "string" },
                },
                required: ["confirmation"],
              },
              operation_kind: "destructive",
              requires_auth: true,
              visibility: "private",
            },
          ],
          diagnostics: ["Local security smoke fixture."],
          status: "live",
          validation_status: "passed",
          generation_status: "completed",
          is_public: true,
          hosted_endpoint: "/api/mcp/security-public",
          call_count: 0,
          protocol_version: "2024-11-05",
          created_at: now,
        },
      ]
    : [];
  const demoServers: McpServer[] = [
    {
      id: "local-website-mcp",
      user_id: localDemoUserId,
      name: "Hacker News browser server",
      description: "Website-to-MCP preview generated from a public website.",
      source_url: "https://news.ycombinator.com",
      source_type: "website",
      category: "Website",
      generated_code: null,
      tools_json: [
        {
          name: "browser_open_page",
          description: "Open the page and summarize visible public content.",
          input_schema: { type: "object", properties: {} },
          method: "BROWSER",
          path: "body",
        },
      ],
      endpoint_map: [
        {
          method: "BROWSER",
          path: "body",
          runtime_kind: "browser",
          browser_action: "open_page",
          selector: "body",
          target_url: "https://news.ycombinator.com/",
          tool_name: "browser_open_page",
          operation_id: "browser_open_page",
          summary: "Open page",
          description: "Open the inspected website and return a public page summary.",
          parameters: [],
          requires_auth: false,
        },
      ],
      diagnostics: ["Local demo server. Connect persistent workspace storage to save generated endpoint details."],
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: true,
      hosted_endpoint: "/api/mcp/local-website-mcp",
      call_count: 128,
      protocol_version: "2024-11-05",
      created_at: now,
    },
    {
      id: "local-openapi",
      user_id: localDemoUserId,
      name: "Petstore OpenAPI server",
      description: "Demo endpoint map generated from the Swagger Petstore spec.",
      source_url: "https://petstore.swagger.io/v2/swagger.json",
      source_type: "openapi_url",
      category: "OpenAPI",
      generated_code: null,
      tools_json: [
        {
          name: "list_inventory",
          description: "List inventory counts from the sample Petstore API.",
          input_schema: { type: "object", properties: {} },
          method: "GET",
          path: "/store/inventory",
        },
      ],
      endpoint_map: [
        {
          method: "GET",
          path: "/store/inventory",
          base_url: "https://petstore.swagger.io/v2",
          tool_name: "list_inventory",
          operation_id: "list_inventory",
          summary: "List inventory",
          description: "List inventory counts from the sample Petstore API.",
          parameters: [],
          requires_auth: false,
        },
      ],
      diagnostics: ["Local demo server. Connect persistent workspace storage to save generated endpoint details."],
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: true,
      hosted_endpoint: "/api/mcp/local-openapi",
      call_count: 42,
      protocol_version: "2024-11-05",
      created_at: now,
    },
    {
      id: "local-code-mode",
      user_id: localDemoUserId,
      name: "Petstore Code Mode server",
      description: "Demo Code Mode MCP endpoint with search_docs and execute over a Petstore endpoint map.",
      source_url: "https://petstore.swagger.io/v2/swagger.json",
      source_type: "openapi_url",
      category: "OpenAPI",
      generated_code: null,
      tools_json: [
        {
          name: "search_docs",
          description: "Search SDK-style documentation for the generated Petstore API.",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search text." },
              limit: { type: "integer", description: "Maximum docs to return." },
            },
          },
          method: "ASTRAIL_CODE",
          path: "search_docs",
        },
        {
          name: "execute",
          description: "Run SDK-style TypeScript calls compiled through Astrail's no-eval endpoint map.",
          input_schema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "Example: async function run(client) { return await client.store.getInventory({}); }",
              },
            },
            required: ["code"],
          },
          method: "ASTRAIL_CODE",
          path: "execute",
        },
      ],
      endpoint_map: [
        {
          method: "GET",
          path: "/store/inventory",
          base_url: "https://petstore.swagger.io/v2",
          tool_name: "petstore_openapi_server_get_inventory",
          operation_id: "getInventory",
          summary: "List inventory",
          description: "Returns pet inventories by status from the sample Petstore API.",
          tags: ["store"],
          resource: "store",
          operation_kind: "read",
          parameters: [],
          input_schema: { type: "object", properties: {} },
          requires_auth: false,
        },
      ],
      diagnostics: ["Local Code Mode demo server. Connect persistent workspace storage to save generated endpoint details."],
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: true,
      hosted_endpoint: "/api/mcp/local-code-mode",
      call_count: 17,
      protocol_version: "2024-11-05",
      created_at: now,
    },
    {
      id: "runtime-permissions-demo",
      user_id: localDemoUserId,
      name: "Petstore Runtime Permissions demo",
      description: "Local demo endpoint for Astrail runtime method permissions.",
      source_url: "https://petstore.swagger.io/v2/swagger.json",
      source_type: "openapi_url",
      category: "OpenAPI",
      generated_code: null,
      tools_json: [
        {
          name: "list_inventory",
          description: "List inventory counts from the sample Petstore API.",
          input_schema: { type: "object", properties: {} },
          method: "GET",
          path: "/store/inventory",
        },
        {
          name: "delete_pet",
          description: "Delete a pet from the sample Petstore API.",
          input_schema: {
            type: "object",
            properties: {
              petId: { type: "integer", description: "Pet ID to delete.", "x-astrail-name": "petId", "x-astrail-in": "path" },
            },
            required: ["petId"],
          },
          method: "DELETE",
          path: "/pet/{petId}",
        },
        {
          name: "search_docs",
          description: "Search SDK-style documentation for the generated Petstore API.",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search text." },
              limit: { type: "integer", description: "Maximum docs to return." },
            },
          },
          method: "ASTRAIL_CODE",
          path: "search_docs",
        },
        {
          name: "execute",
          description: "Run SDK-style TypeScript calls compiled through Astrail's no-eval endpoint map.",
          input_schema: {
            type: "object",
            properties: {
              code: { type: "string", description: "Example: await client.store.getInventory({});" },
              result_mode: { type: "string", enum: ["compact", "full"] },
            },
            required: ["code"],
          },
          method: "ASTRAIL_CODE",
          path: "execute",
        },
      ],
      endpoint_map: [
        {
          method: "GET",
          path: "/store/inventory",
          base_url: "https://petstore.swagger.io/v2",
          tool_name: "list_inventory",
          operation_id: "getInventory",
          summary: "List inventory",
          description: "Returns pet inventories by status from the sample Petstore API.",
          tags: ["store"],
          resource: "store",
          operation_kind: "read",
          parameters: [],
          input_schema: { type: "object", properties: {} },
          requires_auth: false,
        },
        {
          method: "DELETE",
          path: "/pet/{petId}",
          base_url: "https://petstore.swagger.io/v2",
          tool_name: "delete_pet",
          operation_id: "deletePet",
          summary: "Delete pet",
          description: "Deletes a pet from the sample Petstore API.",
          tags: ["pet"],
          resource: "pet",
          operation_kind: "destructive",
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
          input_schema: {
            type: "object",
            properties: {
              petId: { type: "integer", description: "Pet ID to delete.", "x-astrail-name": "petId", "x-astrail-in": "path" },
            },
            required: ["petId"],
          },
          requires_auth: false,
        },
      ],
      runtime_policy: {
        read_only: true,
        allow_http_gets: true,
        allowed_resources: [{ pattern: "^store$", regex: true, match: "resource" }],
        blocked_methods: [
          "client.pet.deletePet",
          { pattern: "delete_pet", match: "endpoint_id" },
        ],
      },
      diagnostics: ["Local runtime permissions demo server."],
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: true,
      hosted_endpoint: "/api/mcp/runtime-permissions-demo",
      call_count: 0,
      protocol_version: "2024-11-05",
      created_at: now,
    },
  ];

  const generatedIds = new Set(generatedServers.map((server) => server.id));
  return [
    ...generatedServers,
    ...securityFixtures,
    ...demoServers.filter((server) => !generatedIds.has(server.id)),
  ];
}

export function localDemoApiKeys(): ApiKey[] {
  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      user_id: localDemoUserId,
      name: "Anthropic demo key",
      key_preview: "ag_demo...ready",
      last_used: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    },
  ];
}

export function localDemoLogs(): RuntimeLog[] {
  return [
    {
      id: "log_1",
      server_id: "local-website-mcp",
      user_id: localDemoUserId,
      tool_name: "browser_open_page",
      status: "success",
      method: "BROWSER",
      path: "body",
      execution_mode: "website_browser_runtime",
      upstream_status: 200,
      trace_id: "agt_demo_browser_01",
      attempt_count: 1,
      error_code: null,
      error: null,
      latency_ms: 1180,
      created_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    },
    {
      id: "log_2",
      server_id: "local-openapi",
      user_id: localDemoUserId,
      tool_name: "list_pets",
      status: "success",
      method: "GET",
      path: "/pets",
      execution_mode: "safe_rest_execution",
      upstream_status: 200,
      trace_id: "agt_demo_openapi_01",
      attempt_count: 1,
      error_code: null,
      error: null,
      latency_ms: 243,
      created_at: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
    },
  ];
}
