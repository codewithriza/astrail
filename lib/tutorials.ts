export type TutorialStep = {
  title: string;
  body: string;
  code?: string;
};

export type Tutorial = {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated: string;
  readingTime: string;
  category: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  searchIntent: string[];
  prerequisites: string[];
  outcome: string;
  steps: TutorialStep[];
  checks: string[];
  related: string[];
  faq: { question: string; answer: string }[];
};

export const tutorials: Tutorial[] = [
  {
    slug: "generate-mcp-from-openapi",
    title: "Generate an MCP server from OpenAPI",
    description: "A practical tutorial for turning an OpenAPI or Swagger spec into a hosted MCP endpoint agents can inspect and call.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "9 min read",
    category: "OpenAPI",
    difficulty: "Beginner",
    searchIntent: ["generate MCP from OpenAPI", "OpenAPI to MCP tutorial", "Swagger to MCP server"],
    prerequisites: ["A public OpenAPI, Swagger, or Redoc URL", "An Astrail workspace", "A test API key if the upstream API requires auth"],
    outcome: "You will have a hosted MCP endpoint with initialize, tools/list, tools/call, search_docs, and execute ready for local testing.",
    steps: [
      {
        title: "Start with a stable spec URL",
        body: "Use the canonical OpenAPI JSON or YAML URL when you have it. Swagger UI and Redoc pages can work, but the generator is more predictable when it can fetch the raw contract directly.",
        code: "https://petstore.swagger.io/v2/swagger.json",
      },
      {
        title: "Preview the spec before generating",
        body: "Run a preview first so you can confirm the discovered URL, parser mode, endpoint count, and obvious schema errors before creating a saved server.",
        code: `curl -sS -X POST https://astrail.dev/api/spec-preview \\
  -H "Content-Type: application/json" \\
  -d '{"sourceType":"openapi_url","sourceUrl":"https://petstore.swagger.io/v2/swagger.json"}'`,
      },
      {
        title: "Generate the hosted MCP endpoint",
        body: "Create the server from the validated source. Keep the first pass narrow: generate from one spec, review the tool names, then add credentials only after the endpoint map looks right.",
        code: `curl -sS -X POST https://astrail.dev/api/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_type": "openapi_url",
    "source_url": "https://petstore.swagger.io/v2/swagger.json",
    "generation_mode": "code"
  }'`,
      },
      {
        title: "Initialize the MCP server",
        body: "Use initialize to confirm that the endpoint is live and returning the server metadata your client will see.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'`,
      },
      {
        title: "Search docs before executing",
        body: "For generated Code Mode servers, search_docs gives the agent route-level context without dumping the whole API into one prompt.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_docs",
      "arguments": { "query": "list available pets" }
    }
  }'`,
      },
    ],
    checks: [
      "The preview reports the expected OpenAPI version and endpoint count.",
      "tools/list does not expose private or destructive routes you did not intend to ship.",
      "search_docs returns route names, parameters, auth requirements, and examples.",
      "tools/call returns structured errors for missing parameters instead of upstream mystery failures.",
    ],
    related: ["build-petstore-mcp-server", "add-auth-to-generated-mcp-server", "test-mcp-endpoints-before-production"],
    faq: [
      {
        question: "Can Swagger become an MCP server?",
        answer: "Yes. Swagger and OpenAPI specs are strong inputs because they already describe methods, paths, parameters, request bodies, and responses.",
      },
      {
        question: "Should every OpenAPI route become an MCP tool?",
        answer: "Usually no. Large APIs work better with search_docs and execute patterns so the agent can find a route before calling it.",
      },
    ],
  },
  {
    slug: "add-auth-to-generated-mcp-server",
    title: "Add auth to a generated MCP server",
    description: "Configure API keys, bearer tokens, and OAuth-style credentials for generated MCP tools without leaking secrets into tool metadata.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "8 min read",
    category: "Auth",
    difficulty: "Intermediate",
    searchIntent: ["MCP server auth", "OpenAPI MCP bearer token", "add API key to MCP server"],
    prerequisites: ["A generated MCP server", "A non-production upstream credential", "A clear list of public and private routes"],
    outcome: "Your generated MCP endpoint will reject unauthenticated private calls and inject credentials only at runtime.",
    steps: [
      {
        title: "Read the auth section in the source spec",
        body: "Check whether the OpenAPI document uses securitySchemes for apiKey, http bearer, OAuth2, or per-operation overrides. The generated server should preserve that intent as runtime policy, not prose.",
      },
      {
        title: "Mark private tools as auth-required",
        body: "Before attaching secrets, review which routes should require credentials. Public catalog routes can stay visible, but state-changing or account-specific calls should return auth_required until a credential is configured.",
      },
      {
        title: "Attach a credential outside the prompt path",
        body: "Credentials belong in the server credential store or environment, not in descriptions, examples, or generated docs. Use a test token first.",
        code: `curl -sS -X POST https://astrail.dev/api/credentials \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ASTRAIL_API_KEY" \\
  -d '{
    "server_id": "SERVER_ID",
    "kind": "bearer",
    "label": "staging token",
    "value": "UPSTREAM_TEST_TOKEN"
  }'`,
      },
      {
        title: "Verify unauthenticated behavior",
        body: "Call a private tool without credentials and confirm it fails closed. The error should be explicit enough for the agent to recover without revealing the missing secret.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_invoice","arguments":{}}}'`,
      },
      {
        title: "Verify authenticated behavior",
        body: "Once a credential is attached, repeat the call with the Astrail API key required by your private endpoint policy. Inspect logs for credential redaction and upstream status.",
      },
    ],
    checks: [
      "No secret appears in tools/list, search_docs, generated SDK docs, logs, or error bodies.",
      "Private routes return auth_required or permission_denied without configured credentials.",
      "Credential injection happens server-side at execution time.",
      "Destructive methods are reviewed separately from read-only methods.",
    ],
    related: ["test-mcp-endpoints-before-production", "build-stripe-mcp-server", "build-internal-api-mcp-server"],
    faq: [
      {
        question: "Can an MCP tool description include an API key?",
        answer: "No. Tool descriptions are prompt-visible metadata. Store credentials separately and inject them only during the runtime call.",
      },
      {
        question: "Should public MCP endpoints require Astrail auth?",
        answer: "Public metadata can be visible, but private tools and live upstream calls should require the workspace policy your team chooses.",
      },
    ],
  },
  {
    slug: "test-mcp-endpoints-before-production",
    title: "Test MCP endpoints before production",
    description: "A preflight checklist for generated MCP endpoints: initialize, tools/list, schema validation, auth failure, safe execution, and logging.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "10 min read",
    category: "Testing",
    difficulty: "Intermediate",
    searchIntent: ["test MCP endpoint", "MCP tools/list test", "MCP production checklist"],
    prerequisites: ["A generated MCP endpoint", "At least one read-only test route", "A staging credential for private APIs"],
    outcome: "You will have a repeatable smoke test that catches missing auth, invalid schemas, and broken agent execution paths before launch.",
    steps: [
      {
        title: "Initialize the endpoint",
        body: "Start with the protocol handshake. If initialize fails, do not debug individual tools yet.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'`,
      },
      {
        title: "Inspect the visible tools",
        body: "tools/list should show only the tools your public policy allows. Check names, descriptions, input schemas, and auth annotations.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'`,
      },
      {
        title: "Send a known-bad argument",
        body: "A production MCP endpoint should reject invalid input before making an upstream call. This catches loose JSON schema mapping and unclear required fields.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": { "name": "get_pet_by_id", "arguments": { "petId": "" } }
  }'`,
      },
      {
        title: "Run one read-only happy path",
        body: "Pick a GET route with deterministic output. The first production smoke should prove end-to-end execution without modifying upstream state.",
      },
      {
        title: "Review runtime evidence",
        body: "Check trace id, upstream status, latency, execution mode, and redaction. The goal is not just a green response; it is a debuggable response.",
      },
    ],
    checks: [
      "initialize returns server metadata and capabilities.",
      "tools/list excludes private tools from public surfaces.",
      "Invalid arguments fail locally with a clear validation error.",
      "Auth-required tools fail closed when credentials are absent.",
      "Runtime logs redact credentials and include enough context to debug.",
    ],
    related: ["add-auth-to-generated-mcp-server", "troubleshoot-openapi-to-mcp-generation", "publish-mcp-sdk"],
    faq: [
      {
        question: "What is the minimum MCP smoke test?",
        answer: "Run initialize, tools/list, one invalid tools/call, one auth failure, and one read-only happy path.",
      },
      {
        question: "Should smoke tests call destructive endpoints?",
        answer: "Only in a staging environment with test data. Production launch checks should prefer read-only paths unless you have explicit rollback behavior.",
      },
    ],
  },
  {
    slug: "publish-mcp-sdk",
    title: "Publish an SDK from a generated MCP endpoint",
    description: "Export a generated SDK bundle, verify its docs and tests, and prepare package publishing without disconnecting it from the hosted MCP endpoint.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "9 min read",
    category: "SDK",
    difficulty: "Intermediate",
    searchIntent: ["publish MCP SDK", "generated SDK from MCP endpoint", "MCP SDK tutorial"],
    prerequisites: ["A generated MCP server", "A package name and target language", "A CI environment for tests"],
    outcome: "You will have a verified SDK bundle with docs, examples, tests, manifests, and a reviewable path to package publication.",
    steps: [
      {
        title: "Export the SDK bundle",
        body: "Use the generated server as the source of truth. The SDK bundle should include reference docs, MCP setup notes, endpoint catalogs, tests, and package scaffolds.",
        code: `curl --fail --location \\
  -H "Authorization: Bearer $ASTRAIL_API_KEY" \\
  "https://astrail.dev/api/servers/SERVER_ID/sdk?format=tgz" \\
  --output generated-sdk.tar.gz
mkdir -p generated-sdk
tar -xzf generated-sdk.tar.gz -C generated-sdk`,
      },
      {
        title: "Verify the bundle contents",
        body: "Before publishing, confirm the generated files exist. Missing docs or endpoint catalogs are a release blocker because future updates become hard to review.",
        code: `test -f generated-sdk/docs/REFERENCE.md
test -f generated-sdk/docs/MCP.md
test -f generated-sdk/openapi/endpoint-catalog.json
test -f generated-sdk/mcp/manifest.json`,
      },
      {
        title: "Run package tests",
        body: "Each target language should have a local smoke path. Start with TypeScript or Python, then add other targets once the endpoint map is stable.",
        code: `cd generated-sdk/typescript
npm install
ASTRAIL_MCP_ENDPOINT=https://astrail.dev/api/mcp/SERVER_ID npm test`,
      },
      {
        title: "Prepare package metadata",
        body: "Set package name, version, repository, license, and generated-code notice. Keep publish tokens out of generated source and CI logs.",
      },
      {
        title: "Keep SDK updates reviewable",
        body: "Use generated update workflows to open PRs instead of silently replacing package code. Review endpoint-map diffs, auth changes, and breaking parameter changes.",
      },
    ],
    checks: [
      "REFERENCE.md, MCP.md, endpoint-catalog.json, and manifest.json exist.",
      "Package tests run against the intended MCP endpoint.",
      "Generated examples avoid production credentials.",
      "Update automation opens a diff for review before publishing.",
    ],
    related: ["generate-mcp-from-openapi", "test-mcp-endpoints-before-production", "build-internal-api-mcp-server"],
    faq: [
      {
        question: "Does a generated SDK replace hosted MCP?",
        answer: "No. Hosted MCP is the runtime endpoint. The SDK is the owned package surface teams can test, customize, and publish.",
      },
      {
        question: "When should I publish the SDK?",
        answer: "Publish after the endpoint map, auth policy, docs, and package tests are stable enough for customers or internal teams to rely on.",
      },
    ],
  },
  {
    slug: "build-petstore-mcp-server",
    title: "Build an MCP server for Swagger Petstore",
    description: "Use the public Petstore OpenAPI spec to create a safe demo MCP server for search_docs, execute, and read-only endpoint testing.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "7 min read",
    category: "Example",
    difficulty: "Beginner",
    searchIntent: ["Petstore MCP server", "Swagger Petstore MCP tutorial", "OpenAPI MCP example"],
    prerequisites: ["The Swagger Petstore spec URL", "A local shell for curl", "A generated Astrail server id"],
    outcome: "You will have a working Petstore MCP demo that is useful for client setup, docs search, and schema validation examples.",
    steps: [
      {
        title: "Use the Petstore raw OpenAPI URL",
        body: "The public Petstore spec is useful because it is stable, familiar, and safe for demos. It should not be treated as a production API design model.",
        code: "https://petstore.swagger.io/v2/swagger.json",
      },
      {
        title: "Generate the server",
        body: "Create the server from the raw spec. Name it clearly so teammates know it is a demo endpoint.",
        code: `curl -sS -X POST https://astrail.dev/api/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_type": "openapi_url",
    "source_url": "https://petstore.swagger.io/v2/swagger.json",
    "name": "Petstore MCP demo",
    "generation_mode": "code"
  }'`,
      },
      {
        title: "Find the list pets operation",
        body: "Use search_docs for intent-based lookup. This mirrors how an agent should discover the right route before calling it.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_docs","arguments":{"query":"list pets by status"}}}'`,
      },
      {
        title: "Execute a read-only call",
        body: "Use a read-only operation first. This proves endpoint routing, parameter mapping, and response shaping without changing demo state.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "execute",
      "arguments": {
        "code": "async function run(client) { return await client.pet.findByStatus({ status: [\\"available\\"] }); }"
      }
    }
  }'`,
      },
    ],
    checks: [
      "search_docs finds the expected Petstore operation.",
      "The read-only execute call returns a compact response.",
      "Missing or invalid status values return schema errors.",
      "Demo docs clearly label the endpoint as non-production.",
    ],
    related: ["generate-mcp-from-openapi", "test-mcp-endpoints-before-production", "troubleshoot-openapi-to-mcp-generation"],
    faq: [
      {
        question: "Why use Swagger Petstore for MCP demos?",
        answer: "It is public, familiar, and easy to reset mentally. That makes it useful for client connection examples and schema validation tutorials.",
      },
      {
        question: "Is Petstore a good production API template?",
        answer: "No. Use it for learning the MCP flow, then apply stricter auth, error, and endpoint review practices to real APIs.",
      },
    ],
  },
  {
    slug: "build-github-like-mcp-server",
    title: "Build an MCP server for a GitHub-like API",
    description: "Turn repository, issue, pull request, and workflow endpoints into agent tools with safe read defaults and reviewed write actions.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "11 min read",
    category: "Example",
    difficulty: "Advanced",
    searchIntent: ["GitHub MCP server tutorial", "repository API MCP", "issues pull requests MCP tools"],
    prerequisites: ["An OpenAPI spec for your repository platform", "A token scoped to test repositories", "A route policy for write actions"],
    outcome: "You will have a repository MCP endpoint that can search repos, inspect issues, summarize pull requests, and keep mutations behind auth policy.",
    steps: [
      {
        title: "Separate read tools from write tools",
        body: "Repository APIs usually mix safe reads with powerful mutations. Start by exposing repository lookup, issue search, pull request details, workflow status, and file reads. Keep create, merge, label, and dispatch actions private until reviewed.",
      },
      {
        title: "Normalize common path parameters",
        body: "Agents do better when owner, repo, issue_number, pull_number, and branch names are consistently described across operations.",
        code: `{
  "owner": "acme",
  "repo": "api",
  "pull_number": 42
}`,
      },
      {
        title: "Attach a least-privilege token",
        body: "Use a token that can read only the repositories needed for the demo. Add write scopes only after the read path is tested and logs are redacted.",
      },
      {
        title: "Test common agent tasks",
        body: "Search docs for realistic phrases such as open release blockers, failing checks, recent merged PRs, or files changed in a pull request.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_docs","arguments":{"query":"list failing workflow runs for a pull request"}}}'`,
      },
      {
        title: "Gate write actions",
        body: "If you expose issue comments, labels, workflow dispatch, or merge operations, require explicit auth and consider a human approval step in the calling agent.",
      },
    ],
    checks: [
      "Read routes work with repository-scoped credentials.",
      "Write routes are private or require explicit workspace auth.",
      "Issue and PR identifiers are validated before upstream calls.",
      "Logs do not contain repository tokens, webhook secrets, or file contents beyond the response policy.",
    ],
    related: ["add-auth-to-generated-mcp-server", "test-mcp-endpoints-before-production", "build-internal-api-mcp-server"],
    faq: [
      {
        question: "Should an agent be able to merge pull requests through MCP?",
        answer: "Only with a reviewed policy, narrow credentials, and human approval where appropriate. Start with read-only PR inspection first.",
      },
      {
        question: "What makes repository APIs hard for agents?",
        answer: "They have many similarly named endpoints and high-impact write actions. Good search_docs, route naming, and auth boundaries matter more than raw tool count.",
      },
    ],
  },
  {
    slug: "build-stripe-like-mcp-server",
    title: "Build an MCP server for a Stripe-like API",
    description: "Create payment and billing MCP tools with test-mode credentials, strict auth boundaries, idempotency, and safe production checks.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "11 min read",
    category: "Example",
    difficulty: "Advanced",
    searchIntent: ["Stripe MCP server tutorial", "payment API MCP", "billing API agent tools"],
    prerequisites: ["A payment API OpenAPI spec", "Test-mode credentials", "A policy for customer data and write actions"],
    outcome: "You will have a payment API MCP endpoint that can safely inspect billing state and keep money-moving actions behind stronger controls.",
    steps: [
      {
        title: "Use test mode first",
        body: "Payment APIs should never be tested first with live credentials. Generate the MCP endpoint against the same spec, but attach only test-mode keys while validating behavior.",
      },
      {
        title: "Classify money-moving routes",
        body: "List, retrieve, and search routes can be read tools. Create charge, refund, cancel subscription, update payment method, and invoice finalization routes need stricter auth and often human approval.",
      },
      {
        title: "Preserve idempotency inputs",
        body: "If the upstream API supports idempotency keys, make them explicit in the tool schema or runtime headers for mutation routes.",
        code: `{
  "customer_id": "cus_test_123",
  "amount": 4900,
  "currency": "usd",
  "idempotency_key": "demo-2026-06-25-001"
}`,
      },
      {
        title: "Redact sensitive response fields",
        body: "Billing APIs can return emails, addresses, tax ids, payment method details, and invoice URLs. Decide what the agent actually needs before exposing full responses.",
      },
      {
        title: "Run a no-money smoke suite",
        body: "Test customer lookup, subscription lookup, invoice preview, auth failure, invalid amount validation, and rate-limit behavior before enabling mutations.",
      },
    ],
    checks: [
      "Only test-mode credentials are used during generation and QA.",
      "Mutations require auth and explicit idempotency behavior.",
      "Sensitive billing fields are redacted or minimized.",
      "Production enablement has a separate review from read-only testing.",
    ],
    related: ["add-auth-to-generated-mcp-server", "test-mcp-endpoints-before-production", "troubleshoot-openapi-to-mcp-generation"],
    faq: [
      {
        question: "Can agents use payment APIs through MCP?",
        answer: "Yes, but start with read-only billing support and test-mode credentials. Treat refunds, charges, and subscription changes as high-risk actions.",
      },
      {
        question: "Why does idempotency matter for MCP payment tools?",
        answer: "Agents may retry after ambiguous failures. Idempotency helps avoid duplicate money-moving actions when a request is repeated.",
      },
    ],
  },
  {
    slug: "build-internal-api-mcp-server",
    title: "Build an MCP server for internal APIs",
    description: "Expose internal REST APIs to agents with narrow endpoint selection, network boundaries, service credentials, and audit-friendly runtime logs.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "10 min read",
    category: "Internal APIs",
    difficulty: "Advanced",
    searchIntent: ["internal API MCP server", "private API agent tools", "enterprise MCP gateway"],
    prerequisites: ["An internal OpenAPI spec or endpoint catalog", "A staging environment", "A security owner for route approval"],
    outcome: "You will have a plan for safely exposing internal API actions to agents without turning the model into a broad network client.",
    steps: [
      {
        title: "Start from an explicit endpoint allowlist",
        body: "Do not generate from every private service route at once. Pick the workflows agents actually need, such as incident lookup, account status, ticket creation, or deployment readbacks.",
      },
      {
        title: "Keep private network access server-side",
        body: "The MCP client should call Astrail, not your internal hosts directly. Runtime execution should happen through a reviewed deployment path that can enforce network, auth, and logging policy.",
      },
      {
        title: "Use service credentials with narrow scope",
        body: "Prefer credentials that are scoped to the selected endpoint group. Avoid broad admin tokens, personal tokens, or secrets copied into generated examples.",
      },
      {
        title: "Add audit fields to the response path",
        body: "For internal tools, logs should capture actor, server id, tool name, trace id, upstream status, latency, and whether a response was redacted.",
        code: `{
  "actor": "agent-workspace",
  "tool": "lookup_incident",
  "trace_id": "trace_123",
  "upstream_status": 200,
  "redacted": true
}`,
      },
      {
        title: "Promote from staging to production deliberately",
        body: "A green staging smoke test is not enough. Review route ownership, data sensitivity, rate limits, timeout behavior, and incident rollback before production access.",
      },
    ],
    checks: [
      "The generated server uses an allowlist, not a whole private network.",
      "Service credentials are narrow and stored outside prompt-visible metadata.",
      "Logs are useful for audits but do not leak secrets or sensitive payloads.",
      "Production promotion has an owner and rollback path.",
    ],
    related: ["add-auth-to-generated-mcp-server", "publish-mcp-sdk", "build-github-like-mcp-server"],
    faq: [
      {
        question: "Can MCP connect to private internal APIs?",
        answer: "Yes, but private network access should be mediated by a controlled server-side runtime, not granted directly to the agent client.",
      },
      {
        question: "What is the safest first internal MCP use case?",
        answer: "Start with read-only lookup workflows that already have clear ownership, stable schemas, and low data sensitivity.",
      },
    ],
  },
  {
    slug: "troubleshoot-openapi-to-mcp-generation",
    title: "Troubleshoot OpenAPI to MCP generation",
    description: "Fix common OpenAPI to MCP generation issues: missing specs, invalid schemas, auth confusion, oversized tool lists, and broken execute calls.",
    date: "2026-06-25",
    updated: "2026-06-25",
    readingTime: "9 min read",
    category: "Troubleshooting",
    difficulty: "Intermediate",
    searchIntent: ["OpenAPI to MCP troubleshooting", "MCP generation failed", "Swagger MCP schema errors"],
    prerequisites: ["The failing source URL or pasted spec", "The generation diagnostics output", "One failing MCP request body"],
    outcome: "You will be able to isolate whether the failure is discovery, parsing, endpoint mapping, auth, validation, or runtime execution.",
    steps: [
      {
        title: "Confirm the raw spec is reachable",
        body: "Many generation failures are discovery failures. Fetch the raw JSON or YAML URL outside the dashboard and confirm it returns OpenAPI or Swagger content, not HTML, login pages, or a blocked response.",
        code: `curl -i https://example.com/openapi.json | sed -n '1,20p'`,
      },
      {
        title: "Check parser diagnostics",
        body: "Look for invalid JSON, unsupported YAML, missing paths, circular schemas, and content types that do not describe JSON request bodies clearly.",
      },
      {
        title: "Reduce oversized specs",
        body: "Very large APIs can produce noisy tool surfaces. Start with an endpoint subset or rely on search_docs and execute rather than exposing every operation as a top-level tool.",
      },
      {
        title: "Separate auth errors from schema errors",
        body: "A 401 from upstream means the call reached the API. A local validation error means the generated MCP runtime rejected the request before upstream. Debug those paths separately.",
      },
      {
        title: "Capture one failing MCP request",
        body: "Keep the exact JSON-RPC body that fails. It lets you reproduce the issue without the agent in the loop.",
        code: `curl -sS -X POST https://astrail.dev/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d @failing-request.json`,
      },
    ],
    checks: [
      "The source URL returns raw OpenAPI or Swagger content.",
      "The spec includes paths and operation ids or clear path summaries.",
      "Auth-required failures are not mistaken for generation failures.",
      "The failing JSON-RPC request is saved and reproducible.",
    ],
    related: ["generate-mcp-from-openapi", "test-mcp-endpoints-before-production", "build-petstore-mcp-server"],
    faq: [
      {
        question: "Why does my Swagger UI page fail while the API docs look fine?",
        answer: "Swagger UI is HTML. The generator needs to discover the raw spec URL linked by that page. Use the direct JSON or YAML URL when possible.",
      },
      {
        question: "Why does tools/list look too large?",
        answer: "The source API may be too broad for a direct tool list. Use search_docs, endpoint subsets, or reviewed route groups for better agent behavior.",
      },
    ],
  },
];

export function getTutorial(slug: string) {
  return tutorials.find((tutorial) => tutorial.slug === slug);
}

export function getRelatedTutorials(tutorial: Tutorial) {
  return tutorial.related
    .map((slug) => getTutorial(slug))
    .filter((item): item is Tutorial => Boolean(item));
}
