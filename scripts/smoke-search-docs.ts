import { searchDocs } from "../lib/codeModeDocs";
import type { McpServer, OpenApiEndpoint } from "../lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function endpoint(input: Partial<OpenApiEndpoint> & Pick<OpenApiEndpoint, "method" | "path">): OpenApiEndpoint {
  return {
    operation_id: null,
    summary: null,
    description: null,
    parameters: [],
    requires_auth: false,
    operation_kind: input.method === "GET" ? "read" : input.method === "DELETE" ? "destructive" : "write",
    ...input,
  };
}

const endpoints: OpenApiEndpoint[] = [
  endpoint({
    method: "GET",
    path: "/pets",
    operation_id: "listPets",
    summary: "List pets with optional status filters.",
    resource: "pets",
    parameters: [
      { name: "status", in: "query", schema: { type: "string", enum: ["available", "sold"] } },
      { name: "limit", in: "query", schema: { type: "integer" } },
      { name: "cursor", in: "query", schema: { type: "string" } },
    ],
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["available", "sold"], "x-astrail-in": "query", "x-astrail-name": "status" },
        limit: { type: "integer", "x-astrail-in": "query", "x-astrail-name": "limit" },
        cursor: { type: "string", "x-astrail-in": "query", "x-astrail-name": "cursor" },
      },
    },
    response_hints: [{ status: "200", description: "A paginated list of pets.", content_types: ["application/json"] }],
  }),
  endpoint({
    method: "GET",
    path: "/pets/{petId}",
    operation_id: "getPetById",
    summary: "Info for a specific pet by ID.",
    description: "Retrieve one pet record, including name, status, and tags.",
    resource: "pets",
    parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
    input_schema: {
      type: "object",
      properties: {
        petId: { type: "string", description: "Pet identifier.", "x-astrail-in": "path", "x-astrail-name": "petId" },
      },
      required: ["petId"],
    },
    response_hints: [{ status: "200", description: "Pet object.", content_types: ["application/json"] }],
  }),
  endpoint({
    method: "GET",
    path: "/incidents",
    operation_id: "listIncidents",
    summary: "List active incidents.",
    description: "Search active incidents with status and cursor pagination.",
    resource: "incidents",
    parameters: [
      { name: "status", in: "query", schema: { type: "string" } },
      { name: "cursor", in: "query", schema: { type: "string" } },
    ],
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "active", "x-astrail-in": "query", "x-astrail-name": "status" },
        cursor: { type: "string", "x-astrail-in": "query", "x-astrail-name": "cursor" },
        api_key: { type: "string", example: "sk_live_should_not_leak", description: "Never expose api_key=sk_live_should_not_leak.", "x-astrail-in": "query", "x-astrail-name": "api_key" },
      },
    },
    security_requirements: [{ ApiKeyAuth: [] }],
    requires_auth: true,
    response_hints: [{ status: "200", description: "Incident collection. Authorization: Bearer secret-token-value", content_types: ["application/json"] }],
  }),
  endpoint({
    method: "DELETE",
    path: "/admin/private-delete-everything",
    operation_id: "privateDeleteEverything",
    summary: "Private destructive admin endpoint that should never appear on public docs search.",
    resource: "admin",
    visibility: "private",
    input_schema: {
      type: "object",
      properties: {
        confirmation: { type: "string", "x-astrail-in": "body", "x-astrail-name": "confirmation" },
      },
      required: ["confirmation"],
    },
  }),
  endpoint({
    method: "GET",
    path: "/internal/hidden-config",
    operation_id: "hiddenConfig",
    summary: "Hidden tool endpoint that should never appear on public docs search.",
    description: "Includes internal auth config details that should not leak from hidden tools.",
    resource: "internal",
    tool_name: "hidden_config",
    input_schema: {
      type: "object",
      properties: {},
    },
  }),
];

const server: McpServer = {
  id: "search-smoke",
  user_id: "test",
  name: "Search Smoke",
  description: "Search docs smoke server.",
  source_url: null,
  source_type: "openapi_url",
  generated_code: null,
  tools_json: [
    {
      name: "hidden_config",
      description: "Hidden internal config reader.",
      input_schema: { type: "object", properties: {} },
      method: "GET",
      path: "/internal/hidden-config",
      visibility: "private",
    },
  ],
  endpoint_map: endpoints,
  diagnostics: [],
  is_public: false,
  hosted_endpoint: null,
  call_count: 0,
  created_at: new Date(0).toISOString(),
};

const ranked = searchDocs(server, { query: "retrieve pet by id", limit: 2 });
assert(ranked.docs[0]?.sdk_method === "client.pets.getPetById", "Expected getPetById to rank first for a specific ID lookup.");
const topScore = ranked.docs[0]?.score ?? 0;
const secondScore = ranked.docs[1]?.score ?? 0;
assert(topScore > secondScore, "Expected the top ranked result to have a higher score.");

const paginated = searchDocs(server, { query: "active incidents pagination", detail: "compact" });
assert(paginated.docs[0]?.sdk_method === "client.incidents.listIncidents", "Expected incident pagination query to rank incidents first.");
assert(paginated.docs[0]?.pagination?.type === "cursor", "Expected cursor pagination hint.");

const schema = searchDocs(server, { query: "pet id", detail: "schema", limit: 1 });
assert(schema.detail === "schema", "Expected schema detail mode.");
const schemaDoc = schema.docs[0] as { input_schema?: { required?: string[] } } | undefined;
assert(schemaDoc?.input_schema?.required?.includes("petId"), "Expected schema mode to include required petId.");

const examples = searchDocs(server, { query: "list active incidents", detail: "examples", limit: 1 });
assert(examples.detail === "examples", "Expected examples detail mode.");
const examplesDoc = examples.docs[0] as { examples?: { arguments?: { status?: unknown } } } | undefined;
assert(examplesDoc?.examples?.arguments?.status === "active", "Expected examples mode to include example arguments.");

const auth = searchDocs(server, { query: "active incidents", detail: "auth", limit: 1 });
assert(auth.detail === "auth", "Expected auth detail mode.");
const authDoc = auth.docs[0] as { auth?: { required?: boolean; schemes?: string[] } } | undefined;
assert(authDoc?.auth?.required === true, "Expected auth mode to expose required auth.");
assert(authDoc?.auth?.schemes?.includes("ApiKeyAuth"), "Expected auth mode to expose security scheme names.");
const authText = JSON.stringify(auth);
assert(!authText.includes("sk_live_should_not_leak"), "Expected auth detail to redact secret-looking schema examples.");
assert(!authText.includes("secret-token-value"), "Expected auth detail to redact bearer tokens from response hints.");
assert(authText.includes("[redacted]"), "Expected auth detail to include redaction markers for sensitive values.");

const publicServer = { ...server, is_public: true };
const publicPrivateLeak = searchDocs(publicServer, { query: "private delete everything", limit: 5 });
assert(publicPrivateLeak.total_matches === 0, "Expected public search_docs to hide visibility=private endpoints.");
assert(publicPrivateLeak.docs_corpus.total_endpoints === 5, "Expected docs corpus to report the full non-meta endpoint count.");
assert(publicPrivateLeak.docs_corpus.searched_endpoints === 2, "Expected public docs search to include only public read endpoints.");

const publicAuthLeak = searchDocs(publicServer, { query: "active incidents ApiKeyAuth", detail: "auth", limit: 5 });
assert(publicAuthLeak.total_matches === 0, "Expected public search_docs to hide auth-required endpoint docs.");

const publicHiddenToolLeak = searchDocs(publicServer, { query: "hidden internal auth config", detail: "examples", limit: 5 });
assert(publicHiddenToolLeak.total_matches === 0, "Expected public search_docs to hide endpoints matched to private tools.");
assert(!JSON.stringify(publicHiddenToolLeak).includes("hidden_config"), "Expected public docs results not to mention hidden tool names.");

console.log("PASS: search_docs ranking and detail modes smoke test passed.");
