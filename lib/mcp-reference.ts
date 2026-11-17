export type McpReferenceEntry = {
  slug: string;
  term: string;
  shortTitle: string;
  metaTitle: string;
  metaDescription: string;
  category: "Core" | "Protocol" | "Runtime" | "Security" | "Packaging";
  definition: string;
  astrailUsage: string;
  checklist: string[];
  example?: string;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  related: string[];
  sources: Array<{
    label: string;
    href: string;
  }>;
};

const specBase = "https://modelcontextprotocol.io/specification/2025-11-25";

export const mcpReferenceEntries: McpReferenceEntry[] = [
  {
    slug: "tool",
    term: "Tool",
    shortTitle: "MCP tool",
    metaTitle: "MCP Tool Definition and FAQ",
    metaDescription: "Learn what an MCP tool is, how tools/list exposes tool schemas, and how Astrail turns API operations into safe hosted MCP tools.",
    category: "Core",
    definition:
      "A tool is an MCP server capability that a model can invoke to interact with an external system. In practice, tools wrap API calls, computations, search operations, workflow actions, or other bounded operations with a machine-readable name, description, and input schema.",
    astrailUsage:
      "Astrail generates tools from OpenAPI operations, website read actions, and owned SDK endpoints. Each generated tool is routed through endpoint maps, auth policy, input validation, rate limits, and runtime logging before it reaches an upstream system.",
    checklist: [
      "Give every tool a stable name that describes the action, not the implementation.",
      "Keep descriptions concrete enough for an agent to decide when to use the tool.",
      "Validate tool input before dispatching to an upstream API.",
      "Separate public tools from private or credential-gated tools.",
    ],
    example: `{
  "name": "list_pets",
  "description": "List pets available in the store.",
  "inputSchema": {
    "type": "object",
    "properties": { "limit": { "type": "integer" } }
  }
}`,
    faqs: [
      {
        question: "How is an MCP tool different from a normal API endpoint?",
        answer:
          "An API endpoint is designed for application code. An MCP tool adds agent-facing metadata, schemas, and invocation semantics so a model can discover and request the operation through a standard protocol.",
      },
      {
        question: "Should every API operation become a separate MCP tool?",
        answer:
          "Not always. Large APIs often work better with fewer high-signal tools, docs search, or Code Mode execution so the model is not flooded with hundreds of low-value choices.",
      },
    ],
    related: ["tools-list", "tools-call", "schema", "endpoint-map"],
    sources: [{ label: "MCP tools specification", href: `${specBase}/server/tools` }],
  },
  {
    slug: "resource",
    term: "Resource",
    shortTitle: "MCP resource",
    metaTitle: "MCP Resource Definition and FAQ",
    metaDescription: "Understand MCP resources, resource URIs, when to use resources instead of tools, and how hosted MCP servers expose contextual data.",
    category: "Core",
    definition:
      "A resource is context that an MCP server can expose to a client, such as a file, database record, generated report, or application-specific object. Resources are identified by URIs and are typically selected by the host application rather than invoked as actions.",
    astrailUsage:
      "Astrail focuses on hosted tool execution, but generated bundles and manifests can link durable artifacts such as endpoint catalogs, docs, and resources that help clients understand the generated server.",
    checklist: [
      "Use resources for read-only context that should be referenced, not executed.",
      "Choose durable URIs that remain stable across deployments.",
      "Include a useful MIME type when clients need to render the content.",
      "Avoid exposing secrets, local files, or tenant-private data as public resources.",
    ],
    faqs: [
      {
        question: "When should I use a resource instead of a tool?",
        answer:
          "Use a resource when the client needs context to read or attach. Use a tool when the model needs to request an action, query, calculation, or upstream API call.",
      },
      {
        question: "Can a tool return a resource link?",
        answer:
          "Yes. A tool result can include resource links or embedded resources when the result should point the client to richer context.",
      },
    ],
    related: ["tool", "prompt", "schema", "ssrf"],
    sources: [{ label: "MCP resources specification", href: `${specBase}/server/resources` }],
  },
  {
    slug: "prompt",
    term: "Prompt",
    shortTitle: "MCP prompt",
    metaTitle: "MCP Prompt Definition and FAQ",
    metaDescription: "Learn what MCP prompts are, how they package reusable workflows, and when to use prompts with generated MCP tools.",
    category: "Core",
    definition:
      "A prompt is a reusable interaction template exposed by an MCP server. Prompts help clients start a task with structured instructions, expected arguments, and context rather than forcing each user or agent to invent the workflow from scratch.",
    astrailUsage:
      "Astrail-generated docs and SDK bundles can describe recommended prompts for common operations, while hosted endpoints keep the actual execution path inside tools and endpoint maps.",
    checklist: [
      "Use prompts to package repeatable workflows, not to bypass tool authorization.",
      "Keep prompt arguments explicit and validated.",
      "Link prompts to the tools and resources they expect to use.",
      "Avoid embedding secrets or tenant-specific values in reusable prompts.",
    ],
    faqs: [
      {
        question: "Are prompts required for an MCP server?",
        answer:
          "No. Prompts are optional. Many production servers start with tools only, then add prompts for common workflows once usage patterns are clear.",
      },
      {
        question: "Can prompts call tools directly?",
        answer:
          "Prompts describe a workflow for the client and model. Tool calls still happen through the MCP tool invocation path, where validation and authorization should be enforced.",
      },
    ],
    related: ["tool", "resource", "json-rpc", "auth-scopes"],
    sources: [{ label: "MCP prompts specification", href: `${specBase}/server/prompts` }],
  },
  {
    slug: "json-rpc",
    term: "JSON-RPC",
    shortTitle: "JSON-RPC in MCP",
    metaTitle: "JSON-RPC in MCP: Methods, Params, IDs, and Errors",
    metaDescription: "A practical explanation of how MCP uses JSON-RPC 2.0 for initialize, tools/list, tools/call, errors, and hosted HTTP endpoints.",
    category: "Protocol",
    definition:
      "JSON-RPC is the message envelope MCP uses for requests, responses, notifications, and errors. Each request includes a jsonrpc version, method name, optional params, and an id that lets the client match the response.",
    astrailUsage:
      "Astrail hosted MCP endpoints accept JSON-RPC over HTTP. The endpoint parses the method, enforces public/private access, validates params, dispatches allowed operations, and returns structured JSON-RPC results or errors.",
    checklist: [
      "Always send jsonrpc as 2.0.",
      "Use stable request IDs so clients can match responses.",
      "Return structured errors instead of raw upstream exceptions.",
      "Treat method names like a protocol boundary, not arbitrary function names.",
    ],
    example: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}`,
    faqs: [
      {
        question: "Is MCP a REST API?",
        answer:
          "MCP can run over HTTP, but the protocol payload is JSON-RPC. Methods such as initialize, tools/list, and tools/call are carried inside JSON-RPC messages.",
      },
      {
        question: "Why does tools/call use params instead of a REST path?",
        answer:
          "The JSON-RPC method is stable across servers. The requested tool name and arguments live in params so MCP clients can use the same protocol shape for many servers.",
      },
    ],
    related: ["tools-list", "tools-call", "hosted-mcp-endpoint", "sse-http"],
    sources: [
      { label: "MCP base specification", href: specBase },
      { label: "MCP transport specification", href: `${specBase}/basic/transports` },
    ],
  },
  {
    slug: "tools-list",
    term: "tools/list",
    shortTitle: "tools/list",
    metaTitle: "tools/list in MCP: Discovery, Schemas, and Tool Metadata",
    metaDescription: "Learn how tools/list lets MCP clients discover available tools, schemas, descriptions, and safe invocation metadata.",
    category: "Protocol",
    definition:
      "tools/list is the MCP method clients use to discover which tools a server exposes. A useful tools/list response gives the model enough names, descriptions, schemas, and metadata to decide which operation to request.",
    astrailUsage:
      "Astrail uses tools/list as the public catalog for generated servers. Private tools are filtered at the hosted MCP boundary so unauthenticated or unauthorized clients do not see operations they cannot call.",
    checklist: [
      "Return only tools the current caller is allowed to know about.",
      "Keep tool names and descriptions stable across generations when possible.",
      "Include input schemas that match runtime validation.",
      "For large APIs, consider a small tools/list surface plus search_docs and execute.",
    ],
    faqs: [
      {
        question: "Does tools/list execute anything?",
        answer:
          "No. tools/list is discovery. Execution happens through tools/call after the client selects a specific tool and sends arguments.",
      },
      {
        question: "Can tools/list be different for different users?",
        answer:
          "Yes. A hosted MCP endpoint can filter tools based on auth, tenancy, plan limits, or server visibility policy.",
      },
    ],
    related: ["tool", "tools-call", "schema", "auth-scopes"],
    sources: [{ label: "MCP tools specification", href: `${specBase}/server/tools` }],
  },
  {
    slug: "tools-call",
    term: "tools/call",
    shortTitle: "tools/call",
    metaTitle: "tools/call in MCP: Invocation, Arguments, Results, and Errors",
    metaDescription: "Understand MCP tools/call, including argument validation, tool routing, structured results, and hosted runtime safeguards.",
    category: "Protocol",
    definition:
      "tools/call is the MCP method used to invoke a named tool with arguments. It is the action boundary where model intent becomes a concrete upstream request, computation, website read, or generated SDK operation.",
    astrailUsage:
      "Astrail routes tools/call through schema validation, runtime permissions, auth checks, endpoint-map dispatch, observability, credential redaction, and rate limits. That keeps model-requested actions bounded and auditable.",
    checklist: [
      "Validate arguments against the same schema advertised in tools/list.",
      "Reject blocked or unknown tool names before reaching upstream code.",
      "Return structured errors that agents can reason about.",
      "Log trace IDs and policy decisions without leaking secrets.",
    ],
    example: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "list_pets",
    "arguments": { "limit": 10 }
  }
}`,
    faqs: [
      {
        question: "Who decides whether a tool call is allowed?",
        answer:
          "The server must enforce policy. Clients can ask to invoke a tool, but the hosted runtime should still check auth, schemas, network policy, and server configuration.",
      },
      {
        question: "Should tools/call expose raw upstream errors?",
        answer:
          "No. Errors should be structured and useful, but secrets, credentials, internal stack traces, and sensitive upstream payloads should be redacted.",
      },
    ],
    related: ["tool", "tools-list", "endpoint-map", "rate-limit"],
    sources: [{ label: "MCP tools specification", href: `${specBase}/server/tools` }],
  },
  {
    slug: "schema",
    term: "Schema",
    shortTitle: "MCP schema",
    metaTitle: "Schemas in MCP: Tool Inputs, Output Schemas, and Validation",
    metaDescription: "Learn how MCP schemas describe tool inputs and structured outputs, and why schema validation matters for generated MCP endpoints.",
    category: "Protocol",
    definition:
      "A schema is the machine-readable contract that describes a tool's accepted input, and sometimes its structured output. In MCP, schemas help the model form valid arguments and help the server reject invalid or unsafe calls.",
    astrailUsage:
      "Astrail generates schemas from OpenAPI, website forms, endpoint catalogs, and SDK metadata. Runtime validation treats the schema as an enforcement point, not just documentation.",
    checklist: [
      "Prefer precise types, required fields, enums, and useful descriptions.",
      "Keep generated schemas aligned with runtime validators.",
      "Avoid permissive catch-all objects when the upstream API expects a narrow shape.",
      "Document auth-required fields separately from user-provided arguments.",
    ],
    faqs: [
      {
        question: "Is a schema only for documentation?",
        answer:
          "No. A schema guides the model and should also drive server-side validation before a tool call reaches the upstream system.",
      },
      {
        question: "Can MCP tools have output schemas?",
        answer:
          "Yes. Output schemas are useful when clients need predictable structured content rather than only free-form text results.",
      },
    ],
    related: ["tool", "tools-list", "tools-call", "endpoint-map"],
    sources: [
      { label: "MCP schema reference", href: `${specBase}/schema` },
      { label: "MCP tools specification", href: `${specBase}/server/tools` },
    ],
  },
  {
    slug: "endpoint-map",
    term: "Endpoint map",
    shortTitle: "Endpoint map",
    metaTitle: "Endpoint Maps for Generated MCP Servers",
    metaDescription: "A practical guide to endpoint maps, the routing layer that connects MCP tool names to upstream API operations and SDK methods.",
    category: "Runtime",
    definition:
      "An endpoint map is the generated routing table that connects MCP tool names and SDK-shaped methods to the upstream operation they represent. It records method, path, parameters, auth requirements, content types, and runtime behavior.",
    astrailUsage:
      "Astrail uses endpoint maps as the source of truth for generated tools, Code Mode execution, docs search, SDK exports, and runtime dispatch. This keeps the hosted endpoint and owned SDK bundle aligned.",
    checklist: [
      "Keep operation IDs stable so regenerated tools do not churn names unnecessarily.",
      "Record auth, path params, query params, body shape, and response expectations.",
      "Use endpoint maps for dispatch instead of evaluating arbitrary model code.",
      "Version or diff endpoint maps when upstream specs change.",
    ],
    faqs: [
      {
        question: "Is endpoint map an MCP standard term?",
        answer:
          "No. It is an implementation pattern used by generated MCP runtimes to safely route standard MCP tool calls to concrete upstream operations.",
      },
      {
        question: "Why does Code Mode need an endpoint map?",
        answer:
          "The endpoint map lets Astrail translate constrained SDK-shaped calls into known operations without running arbitrary code from the model.",
      },
    ],
    related: ["tool", "schema", "hosted-mcp-endpoint", "tools-call"],
    sources: [{ label: "MCP tools specification", href: `${specBase}/server/tools` }],
  },
  {
    slug: "hosted-mcp-endpoint",
    term: "Hosted MCP endpoint",
    shortTitle: "Hosted MCP endpoint",
    metaTitle: "Hosted MCP Endpoint Definition and FAQ",
    metaDescription: "Learn what a hosted MCP endpoint is, how HTTP JSON-RPC works, and how Astrail secures generated MCP servers for agents.",
    category: "Runtime",
    definition:
      "A hosted MCP endpoint is a network-accessible MCP server URL that clients call over HTTP. It lets agents connect to tools without installing a local server process on the user's machine.",
    astrailUsage:
      "Astrail hosts generated MCP endpoints at server-specific URLs. Each endpoint handles JSON-RPC methods, filters public and private tools, applies rate limits, validates inputs, and dispatches safe calls to upstream APIs or website reads.",
    checklist: [
      "Require authorization for private servers and sensitive operations.",
      "Return clear errors for unauthenticated or unauthorized calls.",
      "Apply body-size, per-route, per-identity, and abuse limits.",
      "Expose only intended tools through metadata and tools/list.",
    ],
    faqs: [
      {
        question: "Do hosted MCP endpoints replace local stdio servers?",
        answer:
          "No. They are a deployment choice. Hosted HTTP endpoints are better for managed services, auth, shared infrastructure, and server-side execution. stdio remains useful for local tools.",
      },
      {
        question: "Can a hosted MCP endpoint be public?",
        answer:
          "Yes, but public endpoints should expose only non-sensitive tools and should still enforce validation, rate limits, and network safety boundaries.",
      },
    ],
    related: ["json-rpc", "sse-http", "auth-scopes", "rate-limit"],
    sources: [{ label: "MCP transport specification", href: `${specBase}/basic/transports` }],
  },
  {
    slug: "mcpb",
    term: "MCPB",
    shortTitle: "MCPB",
    metaTitle: "MCPB: MCP Bundle Format Definition and FAQ",
    metaDescription: "Understand MCPB, the MCP Bundle format for packaging local MCP servers with a manifest for one-click installation.",
    category: "Packaging",
    definition:
      "MCPB is the MCP Bundle packaging format. An MCPB file is a zip-style archive that contains a local MCP server and a manifest describing the server and its capabilities.",
    astrailUsage:
      "Astrail focuses on hosted endpoints and owned SDK bundles, but MCPB matters when a team wants a portable local server package for desktop clients instead of a hosted HTTP endpoint.",
    checklist: [
      "Include a manifest that accurately describes the local server.",
      "Package only the files required to run the server.",
      "Treat install commands and startup commands as a security boundary.",
      "Prefer hosted endpoints when server-side auth, tenancy, or centralized rate limits are required.",
    ],
    faqs: [
      {
        question: "Is MCPB the same as a hosted MCP endpoint?",
        answer:
          "No. MCPB packages a local server for installation. A hosted MCP endpoint is a remote HTTP server URL that clients call over the network.",
      },
      {
        question: "When should I choose MCPB?",
        answer:
          "Choose MCPB when the integration must run locally, ship as a one-click desktop extension, or access local-only resources under user control.",
      },
    ],
    related: ["stdio", "hosted-mcp-endpoint", "sse-http", "auth-scopes"],
    sources: [{ label: "MCPB repository", href: "https://github.com/modelcontextprotocol/mcpb" }],
  },
  {
    slug: "stdio",
    term: "stdio",
    shortTitle: "stdio transport",
    metaTitle: "stdio Transport in MCP",
    metaDescription: "Learn how MCP stdio transport works, when local MCP servers use stdin/stdout, and how it compares with hosted HTTP endpoints.",
    category: "Protocol",
    definition:
      "stdio is an MCP transport where a client launches or connects to a local server process and exchanges JSON-RPC messages over standard input and standard output.",
    astrailUsage:
      "Astrail's hosted servers primarily use HTTP transport, while generated bundles and local development workflows may still reference stdio for client compatibility or local package scenarios.",
    checklist: [
      "Keep protocol messages on stdout and logs on stderr.",
      "Treat startup commands as trusted code that runs on the user's machine.",
      "Use stdio for local integrations that need local files or tools.",
      "Use hosted HTTP when the runtime should live behind server-side auth and monitoring.",
    ],
    faqs: [
      {
        question: "Does stdio require a public URL?",
        answer:
          "No. stdio usually runs locally, with the MCP client communicating directly with a child process or local executable.",
      },
      {
        question: "Is stdio safer than HTTP?",
        answer:
          "It has different risks. stdio avoids a public network endpoint but can execute local code with the user's privileges, so package trust and install review matter.",
      },
    ],
    related: ["json-rpc", "sse-http", "mcpb", "hosted-mcp-endpoint"],
    sources: [{ label: "MCP transport specification", href: `${specBase}/basic/transports` }],
  },
  {
    slug: "sse-http",
    term: "SSE/HTTP",
    shortTitle: "SSE and HTTP transport",
    metaTitle: "SSE and Streamable HTTP in MCP",
    metaDescription: "Understand MCP Streamable HTTP, SSE response streams, POST requests, GET streams, and hosted MCP endpoint behavior.",
    category: "Protocol",
    definition:
      "SSE/HTTP describes MCP communication over HTTP where clients send JSON-RPC messages with POST and servers may return JSON or open a server-sent events stream. The current MCP transport is commonly described as Streamable HTTP.",
    astrailUsage:
      "Astrail hosted MCP endpoints accept HTTP JSON-RPC requests and are designed for agents that connect to remote MCP servers. The runtime can return structured JSON responses and enforce HTTP-layer security controls.",
    checklist: [
      "Accept JSON-RPC requests through POST at the MCP endpoint.",
      "Set and validate content types and Accept headers consistently.",
      "Use explicit authorization and origin checks for remote transports.",
      "Plan for reconnects, timeouts, and resumability when using SSE streams.",
    ],
    faqs: [
      {
        question: "Is SSE required for every MCP HTTP response?",
        answer:
          "No. HTTP MCP responses can be ordinary JSON for a completed request, or an SSE stream when streaming server messages is needed.",
      },
      {
        question: "Why do people still say SSE/HTTP?",
        answer:
          "Older and transitional implementations often used SSE terminology. The current specification describes Streamable HTTP with optional SSE streams.",
      },
    ],
    related: ["hosted-mcp-endpoint", "json-rpc", "stdio", "rate-limit"],
    sources: [{ label: "MCP transport specification", href: `${specBase}/basic/transports` }],
  },
  {
    slug: "auth-scopes",
    term: "Auth scopes",
    shortTitle: "Auth scopes",
    metaTitle: "Auth Scopes for MCP Servers and Hosted Tools",
    metaDescription: "Learn how OAuth scopes, API keys, public tools, and private hosted MCP endpoints shape authorization for tool discovery and invocation.",
    category: "Security",
    definition:
      "Auth scopes are permission labels that describe what a caller is allowed to access. In MCP deployments, scopes can come from OAuth flows, API keys, tenant policy, or server configuration.",
    astrailUsage:
      "Astrail supports private hosted servers with bearer-token access and separates upstream provider credentials from MCP endpoint authorization. Tool visibility and invocation can be filtered by caller and server policy.",
    checklist: [
      "Separate MCP endpoint access from upstream provider credentials.",
      "Filter tools/list based on the caller's authorization.",
      "Return clear auth_required or permission_denied states when credentials are missing.",
      "Use least-privilege scopes for sensitive write or admin tools.",
    ],
    faqs: [
      {
        question: "Are auth scopes required for public MCP tools?",
        answer:
          "Public tools may not require caller auth, but they should still enforce validation, rate limits, and limits on what public users can discover or execute.",
      },
      {
        question: "Should agents see tools they are not allowed to call?",
        answer:
          "Usually no. Filtering tools/list reduces confusion and prevents private capability names from leaking to unauthorized clients.",
      },
    ],
    related: ["hosted-mcp-endpoint", "tools-list", "tools-call", "rate-limit"],
    sources: [
      { label: "MCP authorization specification", href: `${specBase}/basic/authorization` },
      { label: "MCP authorization tutorial", href: "https://modelcontextprotocol.io/docs/tutorials/security/authorization" },
    ],
  },
  {
    slug: "rate-limit",
    term: "Rate limit",
    shortTitle: "MCP rate limit",
    metaTitle: "Rate Limits for Hosted MCP Endpoints",
    metaDescription: "Understand MCP rate limits for hosted endpoints, abuse protection, per-route buckets, global spray limits, and Retry-After behavior.",
    category: "Security",
    definition:
      "A rate limit bounds how many requests a caller, route, token, IP, or global traffic source can make over a time window. It protects hosted MCP endpoints from accidental loops, abuse, and resource exhaustion.",
    astrailUsage:
      "Astrail applies rate limits around hosted MCP routes so tools/list, tools/call, and unknown-server traffic cannot cheaply overwhelm runtime resources. Limits pair with validation, auth checks, and body-size controls.",
    checklist: [
      "Limit by identity when authenticated and by IP or route when anonymous.",
      "Add a global bucket for spray attacks across random server IDs.",
      "Return consistent 429 responses and Retry-After guidance.",
      "Keep expensive upstream calls behind cheap early rejection checks.",
    ],
    faqs: [
      {
        question: "Is a rate limit the same as DDoS protection?",
        answer:
          "No. Application rate limits reduce abuse and accidental loops, but network-layer DDoS protection still belongs at the edge or infrastructure layer.",
      },
      {
        question: "Should tools/list and tools/call have the same limits?",
        answer:
          "Not necessarily. tools/call is usually more expensive and may deserve tighter limits, while tools/list still needs protection against catalog scraping or server-ID spraying.",
      },
    ],
    related: ["hosted-mcp-endpoint", "tools-call", "auth-scopes", "ssrf"],
    sources: [{ label: "MCP transport specification", href: `${specBase}/basic/transports` }],
  },
  {
    slug: "ssrf",
    term: "SSRF",
    shortTitle: "SSRF protection",
    metaTitle: "SSRF Protection for MCP and Website-to-Tool Runtimes",
    metaDescription: "Learn what SSRF means for hosted MCP tools, website-to-MCP generation, private network blocking, and safe URL handling.",
    category: "Security",
    definition:
      "SSRF, or server-side request forgery, is a vulnerability where an attacker makes a server request internal, private, or sensitive network targets. For hosted MCP runtimes, SSRF matters whenever a tool fetches URLs or follows user-controlled links.",
    astrailUsage:
      "Astrail blocks local and private-network targets in website-to-MCP and runtime fetch paths. This prevents generated tools from being used to probe metadata services, loopback addresses, internal dashboards, or tenant-private services.",
    checklist: [
      "Resolve hostnames before fetch and block private, loopback, link-local, and metadata IP ranges.",
      "Re-check redirects instead of trusting only the first URL.",
      "Bound crawl depth, response size, and request time.",
      "Log blocked destinations without returning sensitive infrastructure details.",
    ],
    faqs: [
      {
        question: "Why is SSRF a risk for MCP?",
        answer:
          "Agents can request tool calls with URLs or source documents. If the server fetches those URLs unchecked, an attacker can turn the hosted runtime into a network probe.",
      },
      {
        question: "Does auth fully solve SSRF?",
        answer:
          "No. Auth tells you who called the tool. Network policy still needs to decide which destinations the server is allowed to reach.",
      },
    ],
    related: ["hosted-mcp-endpoint", "resource", "rate-limit", "tools-call"],
    sources: [{ label: "MCP security best practices", href: "https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices" }],
  },
];

export const mcpReferenceBySlug = new Map(mcpReferenceEntries.map((entry) => [entry.slug, entry]));

export function getMcpReferenceEntry(slug: string) {
  return mcpReferenceBySlug.get(slug);
}

export function getRelatedMcpEntries(entry: McpReferenceEntry) {
  return entry.related
    .map((slug) => mcpReferenceBySlug.get(slug))
    .filter((relatedEntry): relatedEntry is McpReferenceEntry => Boolean(relatedEntry));
}
