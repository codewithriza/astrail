export type DocsToolExample = {
  name: string;
  description: string;
  inputSchema: string;
  sampleCall: string;
};

export type DocsGuideSection = {
  heading: string;
  body: string[];
  examples?: DocsToolExample[];
};

export type DocsGuide = {
  slug: string;
  title: string;
  description: string;
  category: string;
  updated: string;
  readingTime: string;
  intent: string[];
  intro: string;
  steps: string[];
  sections: DocsGuideSection[];
  faq: { question: string; answer: string }[];
};

export const docsGuides: DocsGuide[] = [
  {
    slug: "production-tool-governance",
    title: "Choose what your agent can safely do",
    description: "Hide unsafe API operations, add business context, require approval for sensitive actions, and export the reviewed policy.",
    category: "Security",
    updated: "2026-07-15",
    readingTime: "5 min read",
    intent: ["MCP tool permissions", "safe agent tools", "MCP human approval", "self-host MCP server"],
    intro: "A generated API catalog is a starting point, not a production permission boundary. Astrail lets you choose exactly what agents see, explain when each tool should be used, and stop sensitive actions before an upstream request runs.",
    steps: [
      "Open a generated server and find Production tool curation under Per-tool policy.",
      "Select Apply safe defaults, then review every recommendation. Reads stay available, writes and sends require approval, and destructive operations start hidden and blocked.",
      "Add shared business context plus a Use when, Do not use when, and API edge cases note for important tools.",
      "Save, then run tools/list or the endpoint tester to verify hidden tools are absent and sensitive calls pause before execution.",
      "Use Export Worker bundle only after reviewing astrail-governance.json and the included production checklist.",
    ],
    sections: [
      {
        heading: "Exposure and permission are separate",
        body: [
          "Turn Expose to agents off when an operation should not exist in the agent's catalog. Hidden tools are removed from tools/list and direct calls to their mapped endpoints are rejected.",
          "For exposed tools, Allow executes normally, Require approval pauses before provider access, and Block always refuses the call. Provider OAuth scopes still need to be least-privilege because runtime policy is an operational guardrail, not the provider's authorization system.",
        ],
      },
      {
        heading: "Teach the agent the business workflow",
        body: [
          "Shared context explains terminology and rules for the whole server. Tool-specific context says what the operation means, when it is the right choice, when another tool or a human is required, and which provider responses are easy to misread.",
          "Do not paste credentials, tokens, or private customer records into context. Every caller allowed to initialize or list the server can receive it.",
        ],
      },
      {
        heading: "Export without dropping the safety decisions",
        body: [
          "The Worker bundle carries the curated catalog, business context, action policy, governance manifest, and production checklist. Private exports require a deployment bearer secret, and provider-authenticated tools stay on Astrail's hosted per-user OAuth runtime unless you build an equivalent reviewed credential adapter.",
          "Standalone public REST execution is off by default. Enable it only for exact reviewed HTTPS origins and keep the generated Cloudflare strict-public routing flag in place.",
        ],
      },
    ],
    faq: [
      {
        question: "Does Apply safe defaults make every API safe automatically?",
        answer: "No. It gives you a conservative first pass. Review descriptions, provider scopes, business rules, and every state-changing action before production use.",
      },
      {
        question: "What happens when I hide a tool?",
        answer: "It disappears from tools/list, its endpoint is removed from the callable map, and direct calls to that tool name fail before any provider request.",
      },
      {
        question: "Can I self-host the export?",
        answer: "Yes. The bundle includes a Cloudflare Worker and Docker proxy path. Review the governance manifest and checklist, configure caller auth for private exports, and keep provider credentials in the hosted runtime unless you implement an equivalent secure vault.",
      },
    ],
  },
  {
    slug: "third-party-saas-oauth",
    title: "Third-party SaaS OAuth for agents",
    description:
      "Give agents per-user access to Slack, Google, GitHub, HubSpot, Salesforce, and other OAuth providers without token passthrough or shared identities.",
    category: "Security",
    updated: "2026-07-15",
    readingTime: "7 min read",
    intent: ["agent OAuth", "per-user OAuth MCP", "secure SaaS agent integrations", "OAuth token vault"],
    intro:
      "The difficult part of connecting agents to third-party SaaS is not drawing an OAuth button. It is preserving user identity across consent, scopes, refresh rotation, revocation, permissions, and audit logs. Astrail keeps that lifecycle at the hosted MCP boundary so provider tokens never enter prompts or pass through from the caller.",
    steps: [
      "Design the smallest agent-facing tool surface the workflow needs. Do not mirror a poor provider API when a clearer tool contract is safer.",
      "Register an OAuth app with the provider and configure Astrail's callback URL, client credentials, and least-privilege scopes.",
      "Connect each end user through hosted consent. Astrail stores a separate encrypted grant instead of one shared workspace token.",
      "Bind the caller's Astrail API key to the same end-user identity and an appropriate actor role.",
      "Monitor scope denials, refresh failures, reauthorization state, and redacted audit logs before enabling write or send actions.",
    ],
    sections: [
      {
        heading: "Internal OBO and third-party SaaS are different problems",
        body: [
          "Inside one Microsoft Entra tenant, an MCP resource server can validate a user token minted for its own audience and exchange it on-behalf-of for a downstream internal API. Keep that audience validation and OBO exchange in the identity layer that owns those app registrations.",
          "Slack, Google, GitHub, Stripe, HubSpot, and other third-party systems do not accept your internal OBO chain. They require separate provider consent and per-user grants. That cross-provider lifecycle is the problem Astrail is designed to operate.",
        ],
      },
      {
        heading: "No token passthrough",
        body: [
          "The agent authenticates to Astrail with an Astrail API key scoped to an end user and actor role. Astrail rejects mismatched identity headers, requires that user's matching provider grant, and injects that decrypted token for the mapped upstream request. End-user OAuth calls never fall back to a workspace-wide provider identity.",
          "A client-provided bearer token is never forwarded to a provider. This prevents one caller token from silently becoming every downstream identity and keeps provider credentials out of model context, browser storage, and logs.",
        ],
      },
      {
        heading: "Provider boundaries are explicit",
        body: [
          "Astrail derives OAuth authorization and token endpoints from the imported API contract and binds every grant to a fingerprint of that scheme, those endpoints, and the upstream API origin. Changing the provider or API origin requires a new connection instead of silently reusing an old token.",
          "Known SaaS providers enforce approved OAuth hosts. For custom providers, the dashboard shows the exact authorization, token, and API origins and requires an explicit trust confirmation before Astrail accepts a client secret or starts consent.",
        ],
      },
      {
        heading: "Scopes fail closed",
        body: [
          "Generated tools preserve operation-level OAuth scope requirements from the API contract. Before execution, Astrail compares those requirements with the scopes recorded on the selected end-user grant.",
          "If no allowed OAuth alternative is satisfied, the provider token is withheld and the tool returns oauth_insufficient_scope with required_scopes and missing_scopes. The user can reconnect with the smallest additional consent needed instead of granting broad access by default.",
        ],
      },
      {
        heading: "Refresh, reauthorization, and revocation",
        body: [
          "Expired access tokens refresh server-side with a cross-instance lease so providers that rotate refresh tokens are not raced by concurrent tool calls. Permanent invalid_grant and invalid_client responses mark the connection reauth_required and stop repeated refresh attempts.",
          "Revoking a connection first invalidates the grant at the provider, records the revocation outcome in the audit trail, and only then removes Astrail's encrypted token ciphertext. Google, GitHub, Slack, HubSpot, and Salesforce use verified provider adapters; custom providers must bind a trusted HTTPS revocation endpoint into their imported OAuth metadata.",
        ],
      },
    ],
    faq: [
      {
        question: "Should the agent hold the provider token?",
        answer:
          "No. The agent should authenticate to the MCP boundary. Astrail keeps the provider token encrypted server-side and injects it only for the selected upstream request.",
      },
      {
        question: "Does Astrail replace Entra on-behalf-of exchange?",
        answer:
          "No. OBO is a strong fit for same-tenant internal APIs. Astrail focuses on third-party SaaS where each provider requires its own consent, token lifecycle, scopes, and revocation behavior.",
      },
      {
        question: "What happens when the user did not grant a required scope?",
        answer:
          "Astrail withholds the token and returns oauth_insufficient_scope with the missing scope names before any provider request executes.",
      },
    ],
  },
  {
    slug: "openapi-to-mcp",
    title: "OpenAPI to MCP",
    description:
      "Generate a hosted MCP server from an OpenAPI, Swagger, Redoc, YAML, or JSON API contract.",
    category: "Generator",
    updated: "2026-06-25",
    readingTime: "6 min read",
    intent: ["OpenAPI to MCP", "Swagger to MCP", "generate MCP server from API docs"],
    intro:
      "OpenAPI is the cleanest starting point for agent tools because it already describes routes, parameters, request bodies, auth, and response shapes. Astrail turns that contract into a hosted MCP endpoint with reviewable tool metadata and runtime logs.",
    steps: [
      "Paste a direct OpenAPI URL, Swagger UI page, Redoc page, YAML file, or JSON file.",
      "Review discovered endpoints, auth requirements, parameters, and generated tool names.",
      "Generate a hosted MCP server, then connect an MCP client through HTTP JSON-RPC.",
      "Attach provider credentials only when the upstream API needs them.",
    ],
    sections: [
      {
        heading: "When OpenAPI works best",
        body: [
          "Use OpenAPI when your API already has a stable contract and the agent needs precise actions instead of browser guessing. The generated MCP layer gives the agent names, schemas, and structured errors without asking it to improvise raw HTTP requests.",
          "For small APIs, direct tool exposure can be enough. For large APIs, pair endpoint search with focused tool calls so the agent does not load hundreds of operations into one context window.",
        ],
      },
      {
        heading: "What to review before production",
        body: [
          "Check destructive methods, private endpoints, auth injection, request size, response size, and rate limits. A generated MCP endpoint should still behave like production infrastructure.",
          "Astrail keeps endpoint maps, diagnostics, and logs visible so teams can audit what the agent was allowed to call and what happened at runtime.",
        ],
      },
    ],
    faq: [
      {
        question: "Can Astrail discover a spec from Swagger UI?",
        answer:
          "Yes. Astrail can start from direct OpenAPI files as well as docs pages that expose Swagger UI, Redoc, YAML, or JSON specs.",
      },
      {
        question: "Should every OpenAPI route become a tool?",
        answer:
          "No. Large APIs usually work better with search, endpoint inspection, and a smaller active tool surface.",
      },
    ],
  },
  {
    slug: "website-to-mcp",
    title: "Website to MCP",
    description:
      "Turn public pages and same-origin links into safe read tools for agents when a clean API is not available yet.",
    category: "Generator",
    updated: "2026-06-25",
    readingTime: "5 min read",
    intent: ["Website to MCP", "browser MCP tools", "turn website into MCP server"],
    intro:
      "Website-to-MCP is useful when the workflow starts on public pages, docs, forms, or product surfaces rather than a formal API. Astrail discovers safe read paths and turns them into bounded MCP tools.",
    steps: [
      "Enter the public URL you want the agent to understand.",
      "Let Astrail crawl same-origin pages within safe limits.",
      "Review generated read/search tools and remove anything irrelevant.",
      "Connect the hosted MCP endpoint to an agent and inspect logs after calls.",
    ],
    sections: [
      {
        heading: "Good fits",
        body: [
          "Website-to-MCP is strongest for documentation retrieval, public search, support content, product catalogs, and early workflow discovery. It helps teams map what an agent should read before a full API integration exists.",
          "It is also useful for comparing what users see in the browser with what the API claims to expose.",
        ],
      },
      {
        heading: "Safety boundaries",
        body: [
          "Browser-backed tools should not become unrestricted automation. Keep public read tools separate from state-changing workflows, block private-network targets, and require explicit review for anything that submits data.",
          "Astrail labels website-generated runtime behavior so teams know which tools came from browser discovery and which are mapped API calls.",
        ],
      },
    ],
    faq: [
      {
        question: "Can a public website become an MCP server?",
        answer:
          "Yes. Astrail can turn public website content into MCP read and search tools, then host them behind an MCP endpoint.",
      },
      {
        question: "Is website-to-MCP for private dashboards?",
        answer:
          "Only with strict review and credentials. Public read workflows are the safer default starting point.",
      },
    ],
  },
  {
    slug: "code-mode",
    title: "Code Mode for large APIs",
    description:
      "Use search_docs and no-eval execute so agents can work with large APIs without hundreds of tool definitions.",
    category: "Runtime",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["MCP Code Mode", "search_docs execute", "large API MCP tools"],
    intro:
      "Large APIs overwhelm agents when every route becomes a separate tool. Code Mode gives the agent two focused capabilities: search documentation, then submit constrained SDK-shaped code that Astrail routes through endpoint maps.",
    steps: [
      "Generate an MCP server with Code Mode enabled.",
      "Call search_docs to find the relevant method, parameters, and auth notes.",
      "Call execute with a small SDK-shaped snippet for the selected operation.",
      "Inspect the structured result, trace id, and runtime mode after execution.",
    ],
    sections: [
      {
        heading: "Why Code Mode exists",
        body: [
          "A huge tool list looks powerful but usually hurts agent performance. The model has to choose from too many names, context gets crowded, and parameter mistakes become more common.",
          "Code Mode keeps the active interface small. The agent searches docs when it needs detail, then asks Astrail to execute a constrained call path.",
        ],
      },
      {
        heading: "No arbitrary eval",
        body: [
          "Astrail does not need arbitrary JavaScript evaluation for Code Mode execution. Supported SDK-shaped calls are parsed and routed through generated endpoint maps.",
          "That gives teams a safer path for expressive agent calls while preserving auth, policy checks, observability, and rate limits at the MCP boundary.",
        ],
      },
    ],
    faq: [
      {
        question: "Does Code Mode run arbitrary code?",
        answer:
          "No. Astrail supports constrained SDK-shaped calls and routes them through endpoint maps rather than open-ended eval.",
      },
      {
        question: "When should I use Code Mode?",
        answer:
          "Use it for large APIs where a searchable catalog plus focused execution is clearer than exposing every route as an active tool.",
      },
    ],
  },
  {
    slug: "sdk-factory",
    title: "SDK Factory",
    description:
      "Export owned TypeScript, Python, CLI, docs, manifests, tests, and update workflows from a hosted MCP server.",
    category: "SDK",
    updated: "2026-06-25",
    readingTime: "6 min read",
    intent: ["MCP SDK generator", "generate SDK from MCP", "owned SDK export"],
    intro:
      "A hosted MCP endpoint is the fastest way to prove an agent tool. SDK Factory is for the moment the integration becomes important enough to own in your repo, CI, docs, and package workflow.",
    steps: [
      "Open a generated MCP server in Astrail.",
      "Export the SDK bundle for TypeScript, Python, CLI, docs, tests, and manifests.",
      "Run the generated verification script locally or in CI.",
      "Use the update workflow to regenerate SDK changes through pull requests.",
    ],
    sections: [
      {
        heading: "What the bundle contains",
        body: [
          "SDK exports include typed client scaffolds, endpoint reference docs, MCP client setup notes, examples, smoke tests, manifests, and a GitHub workflow for update PRs.",
          "The hosted endpoint remains the source of truth, while the exported code gives engineering teams ownership over packaging, review, and deployment.",
        ],
      },
      {
        heading: "When to export",
        body: [
          "Start with hosted MCP while validating the workflow. Export an SDK when the integration becomes part of a customer-facing product, internal platform, or long-lived automation.",
          "This keeps early experiments fast without trapping production work inside a black box.",
        ],
      },
    ],
    faq: [
      {
        question: "Does SDK Factory replace the hosted MCP endpoint?",
        answer:
          "No. It complements the hosted endpoint by giving teams owned code, docs, tests, and package scaffolds.",
      },
      {
        question: "Can SDK updates be automated?",
        answer:
          "Yes. Astrail exports a workflow that can pull a fresh bundle, verify it, and open an update PR.",
      },
    ],
  },
  {
    slug: "runtime-permissions",
    title: "Runtime permissions",
    description:
      "Control which generated tools can call upstream APIs, require auth, access networks, and return runtime evidence.",
    category: "Security",
    updated: "2026-06-25",
    readingTime: "6 min read",
    intent: ["MCP runtime permissions", "agent tool permissions", "runtime_permission_denied"],
    intro:
      "Generated tools need explicit runtime boundaries. Astrail permissions keep public and private surfaces separate, require credentials where needed, and return structured denial states instead of silent failures.",
    steps: [
      "Review each generated tool before making it available to agents.",
      "Keep private endpoints behind bearer auth and provider credentials.",
      "Block disallowed network targets and destructive calls unless reviewed.",
      "Use logs and trace ids to prove whether a call executed or was denied.",
    ],
    sections: [
      {
        heading: "Why permissions matter",
        body: [
          "Agents are good at intent, not implicit policy. If a runtime boundary is not explicit, the agent may try calls that look reasonable in context but are unsafe for the system.",
          "Permission checks make the boundary observable. A denied call should say why it was denied, whether an upstream request was attempted, and what trace id connects the decision to logs.",
        ],
      },
      {
        heading: "Production defaults",
        body: [
          "Public MCP surfaces should expose only reviewed public tools. Private calls should require Astrail API keys and provider credentials, and risky actions should stay behind approval or policy gates.",
          "For website-derived tools, block private-network targets and keep browser-backed behavior labeled separately from API-backed execution.",
        ],
      },
    ],
    faq: [
      {
        question: "What should a denied runtime call return?",
        answer:
          "It should return a structured permission denial with evidence that no upstream call was made when policy blocked execution.",
      },
      {
        question: "Are public and private MCP endpoints the same?",
        answer:
          "No. Public surfaces should be filtered to reviewed public tools, while private endpoints require bearer auth and stronger runtime checks.",
      },
    ],
  },
  {
    slug: "mcp-client-setup",
    title: "MCP client setup",
    description:
      "Connect Astrail-hosted MCP endpoints to agents, editors, scripts, and internal runtimes over HTTP JSON-RPC.",
    category: "Reference",
    updated: "2026-06-25",
    readingTime: "5 min read",
    intent: ["MCP client setup", "hosted MCP endpoint", "HTTP JSON-RPC MCP"],
    intro:
      "Astrail-hosted MCP endpoints expose a small HTTP JSON-RPC surface. Start with initialize and tools/list, then call reviewed tools through tools/call.",
    steps: [
      "Copy the MCP endpoint URL from the generated server.",
      "Add an Authorization bearer token when the server is private.",
      "Call initialize, then tools/list to inspect the available surface.",
      "Call tools/call with validated arguments and inspect the structured response.",
    ],
    sections: [
      {
        heading: "Connection model",
        body: [
          "Hosted MCP keeps the server online for agents that can call HTTP endpoints. That avoids local process setup for early testing and gives teams one place to review logs, credentials, and generated metadata.",
          "The same endpoint can also feed SDK exports when a team needs code ownership.",
        ],
      },
      {
        heading: "What to test first",
        body: [
          "Test initialize, tools/list, a harmless public read call, and an auth-required call. The expected result for missing credentials should be explicit rather than a vague upstream error.",
          "After that, verify trace ids and logs so the team can debug real agent behavior.",
        ],
      },
    ],
    faq: [
      {
        question: "What transport does Astrail use for hosted MCP?",
        answer:
          "Astrail exposes hosted MCP over HTTP JSON-RPC for initialize, tools/list, tools/call, search_docs, and execute.",
      },
      {
        question: "Do private servers need a bearer token?",
        answer:
          "Yes. Private MCP servers should be called with an Astrail API key in the Authorization header.",
      },
    ],
  },
  {
    slug: "chatgpt-openai-agents-mcp",
    title: "ChatGPT and OpenAI Agents MCP setup",
    description:
      "Use Astrail-hosted MCP endpoints with ChatGPT, OpenAI Agents, and custom agent runtimes that need reviewed tools.",
    category: "Clients",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["ChatGPT MCP", "OpenAI Agents MCP", "MCP tools for ChatGPT"],
    intro:
      "Astrail gives OpenAI agent workflows a stable hosted tool boundary. Generate or install an MCP server, review the callable surface, require auth when needed, and expose a predictable endpoint for agent runs.",
    steps: [
      "Generate an Astrail MCP endpoint from OpenAPI, website content, a preset, or Code Mode docs.",
      "Review tool names, input schemas, visibility, auth requirements, and destructive actions.",
      "Connect the hosted endpoint from your OpenAI agent runtime or compatible MCP bridge.",
      "Use logs, trace ids, and structured errors to debug each agent tool call.",
    ],
    sections: [
      {
        heading: "Why OpenAI agent tools need a boundary",
        body: [
          "A model can reason over a user request, but production systems still need a narrow interface for real actions. MCP gives that interface a discoverable shape: tools/list for capabilities and tools/call for execution.",
          "Astrail adds the hosted runtime, endpoint maps, permission checks, credential handling, and evidence a team needs before letting an agent call internal or customer-facing systems.",
        ],
      },
      {
        heading: "Recommended setup",
        body: [
          "Start with read-only tools and one harmless execution path. Confirm initialize, tools/list, tools/call, auth-required behavior, and trace logs before widening access.",
          "For large APIs, use Code Mode so the agent searches documentation first and executes only supported SDK-shaped calls. That keeps context small and avoids dumping hundreds of operations into one run.",
        ],
      },
    ],
    faq: [
      {
        question: "Can ChatGPT use Astrail-generated tools?",
        answer:
          "Astrail exposes hosted MCP endpoints and generated SDK assets that can be connected through agent runtimes and MCP-compatible clients that support external tools.",
      },
      {
        question: "What should I expose first?",
        answer:
          "Expose reviewed read tools first, then add private or write tools only after auth, permission, logging, and rollback behavior are clear.",
      },
    ],
  },
  {
    slug: "claude-cursor-mcp-setup",
    title: "Claude and Cursor MCP setup",
    description:
      "Connect Astrail-hosted MCP servers to Claude, Cursor, editors, and local developer workflows.",
    category: "Clients",
    updated: "2026-06-25",
    readingTime: "6 min read",
    intent: ["Claude MCP setup", "Cursor MCP setup", "hosted MCP endpoint setup"],
    intro:
      "Claude, Cursor, and editor agents work best when tools are named clearly, schemas are tight, and private actions require credentials. Astrail lets teams prepare that surface before connecting the client.",
    steps: [
      "Generate or install a server in Astrail and copy the hosted MCP endpoint URL.",
      "Decide whether the endpoint is public read-only or private bearer-authenticated.",
      "Add the endpoint to the client through its MCP configuration or bridge layer.",
      "Run initialize and tools/list, then test one read call and one auth-required path.",
    ],
    sections: [
      {
        heading: "Client compatibility checklist",
        body: [
          "Check that the client can reach HTTP JSON-RPC endpoints, send authorization headers when needed, and display structured tool errors. If a client has strict schema requirements, keep tool inputs rooted at objects.",
          "Astrail-generated SDK bundles also include MCP setup docs, manifests, and install assets so teams can keep client configuration next to generated code.",
        ],
      },
      {
        heading: "What developers should verify",
        body: [
          "Developers should confirm the tool list is small enough to understand, parameter names match the API, and auth-required responses are explicit. Silent upstream 401s make agents retry poorly.",
          "After connection, inspect logs for execution mode, latency, upstream status, and trace id. These details are what turn a demo into a debuggable integration.",
        ],
      },
    ],
    faq: [
      {
        question: "Do Claude and Cursor need the same MCP shape?",
        answer:
          "They share the MCP idea, but clients can vary in transport and schema strictness. Astrail keeps generated schemas conservative and exposes hosted HTTP JSON-RPC endpoints.",
      },
      {
        question: "Can I use one Astrail endpoint across clients?",
        answer:
          "Yes. One hosted endpoint can serve multiple compatible clients as long as auth and policy settings match the intended use.",
      },
    ],
  },
  {
    slug: "agent-readiness-score",
    title: "Agent readiness score",
    description:
      "Evaluate whether an API, website, or workflow is ready to become reliable agent tooling.",
    category: "Evaluation",
    updated: "2026-06-25",
    readingTime: "6 min read",
    intent: ["agent readiness score", "agent tool evaluation", "MCP readiness"],
    intro:
      "Agent readiness is the difference between a tool that works once in a demo and a tool a team can trust in production. Astrail evaluates docs quality, auth clarity, runtime safety, and observable behavior.",
    steps: [
      "Inspect the source docs or website for stable routes, parameters, and examples.",
      "Identify auth requirements, destructive actions, and missing response schemas.",
      "Generate a server and review diagnostics before exposing it to an agent.",
      "Run smoke tests and compare logs against expected runtime behavior.",
    ],
    sections: [
      {
        heading: "What readiness measures",
        body: [
          "A ready tool has a clear name, object-shaped input schema, known auth mode, bounded request size, bounded response size, and examples that match real API behavior.",
          "A tool is not ready if it depends on ambiguous docs, hidden browser state, unrestricted network access, or a model inventing parameters that were never described.",
        ],
      },
      {
        heading: "How Astrail uses the score",
        body: [
          "Astrail uses readiness signals to show which generated tools are safe to call, which need credentials, which require mapping work, and which should stay hidden from public clients.",
          "The score is a product and engineering aid. It helps a team decide whether to ship, refine docs, add policy, or keep the integration in review.",
        ],
      },
    ],
    faq: [
      {
        question: "Is agent readiness only about security?",
        answer:
          "No. Security matters, but readiness also includes docs quality, schema clarity, latency, errors, examples, and observability.",
      },
      {
        question: "What is the fastest way to improve readiness?",
        answer:
          "Add accurate examples, mark auth requirements, bound inputs and outputs, and hide destructive operations until they have explicit policy.",
      },
    ],
  },
  {
    slug: "mcp-vs-api-vs-sdk",
    title: "MCP vs API vs SDK",
    description:
      "Understand when agents should use MCP, when developers should call APIs directly, and when teams should export SDKs.",
    category: "Strategy",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["MCP vs API", "MCP vs SDK", "agent tools vs API"],
    intro:
      "MCP, APIs, and SDKs solve different parts of the same integration problem. APIs are the system contract, SDKs are developer ergonomics, and MCP is the agent-facing tool boundary.",
    steps: [
      "Use the API contract as the source of truth when it exists.",
      "Expose reviewed operations through MCP when an agent needs to discover and call tools.",
      "Export an SDK when engineering teams need owned code, tests, packages, and CI.",
      "Keep generated docs, manifests, and endpoint maps synced so behavior does not drift.",
    ],
    sections: [
      {
        heading: "API first",
        body: [
          "An API is built for deterministic callers. It exposes paths, methods, parameters, auth, and responses. Agents can call APIs, but raw API surfaces are often too broad and ambiguous for good model behavior.",
          "Astrail uses API contracts as source material, then narrows them into agent-usable MCP tools with reviewable names, schemas, and runtime checks.",
        ],
      },
      {
        heading: "MCP for agents, SDKs for teams",
        body: [
          "MCP lets an agent ask what tools exist and call them through a predictable protocol. SDKs let engineers own clients, tests, docs, and packaging in their own repos.",
          "The practical path is to prove behavior through hosted MCP, then export SDKs when the integration deserves long-lived engineering ownership.",
        ],
      },
    ],
    faq: [
      {
        question: "Is MCP a replacement for APIs?",
        answer:
          "No. MCP usually wraps APIs, websites, or workflows so agents can use them through a safer and more discoverable interface.",
      },
      {
        question: "When should I export an SDK?",
        answer:
          "Export an SDK when the tool becomes part of a product, internal platform, customer integration, or package workflow that your team needs to own.",
      },
    ],
  },
  {
    slug: "secure-agent-tool-deployment",
    title: "Secure agent tool deployment",
    description:
      "Ship MCP tools with auth, permission checks, network limits, logging, and review gates before agents call production systems.",
    category: "Security",
    updated: "2026-06-25",
    readingTime: "8 min read",
    intent: ["secure MCP deployment", "agent tool security", "production MCP security"],
    intro:
      "Agent tools are production integration surfaces. A secure deployment keeps public read tools separate from private actions, protects credentials, blocks unsafe networks, and records evidence for every runtime call.",
    steps: [
      "Separate public MCP servers from private bearer-authenticated servers.",
      "Store provider credentials outside prompts and inject them only at runtime.",
      "Block loopback, private network, metadata service, and unsupported protocol targets.",
      "Log trace ids, execution modes, denials, upstream status, and redacted errors.",
    ],
    sections: [
      {
        heading: "Security baseline",
        body: [
          "Public tools should be read-safe and reviewed. Private tools should require Astrail API keys and provider credentials. Destructive operations should require explicit policy, confirmation, or a narrower endpoint.",
          "Never treat a model prompt as a security boundary. The runtime must enforce auth, permissions, network policy, request bounds, response bounds, and credential redaction.",
        ],
      },
      {
        heading: "Evidence over trust",
        body: [
          "A secure tool call should explain whether it executed, why it was denied, which runtime mode handled it, and where to find the trace. This evidence lets teams debug without exposing secrets.",
          "Astrail returns structured states such as auth_required, permission_denied, mapping_required, and validation_failed so agent clients do not have to guess what happened.",
        ],
      },
    ],
    faq: [
      {
        question: "Can runtime permissions replace provider scopes?",
        answer:
          "No. Runtime permissions are operational guardrails. Provider OAuth scopes and API keys should still be least-privilege.",
      },
      {
        question: "What is the safest launch posture?",
        answer:
          "Launch with reviewed read tools, bearer auth for private endpoints, redacted logs, bounded calls, and explicit denial states.",
      },
    ],
  },
  {
    slug: "openapi-spec-quality-checklist",
    title: "OpenAPI spec quality checklist",
    description:
      "Improve OpenAPI specs before generating MCP tools, SDKs, docs, endpoint maps, and agent-readable schemas.",
    category: "OpenAPI",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["OpenAPI checklist", "OpenAPI quality for agents", "MCP schema quality"],
    intro:
      "Better specs produce better agent tools. Clear operation ids, parameter descriptions, auth schemes, examples, and response schemas help Astrail generate safer MCP endpoints and better SDK exports.",
    steps: [
      "Add stable operation ids and human-readable summaries for every important route.",
      "Describe required parameters, request bodies, auth schemes, and error responses.",
      "Include examples for common success and failure paths.",
      "Mark destructive or private operations so policy review is straightforward.",
    ],
    sections: [
      {
        heading: "Spec fields agents care about",
        body: [
          "Agents benefit from names, summaries, descriptions, required fields, enum values, examples, and response shapes. Missing detail forces the model to infer behavior from route names alone.",
          "Astrail can generate from imperfect specs, but high-quality specs reduce review work and improve search_docs results for large APIs.",
        ],
      },
      {
        heading: "Common fixes",
        body: [
          "Replace vague operation ids with action-oriented names, add examples for nested objects, document pagination, and make auth requirements explicit at route level when they differ from the global default.",
          "If a route changes state, label it clearly. That makes it easier to require confirmation, hide it from public surfaces, or keep it out of early agent trials.",
        ],
      },
    ],
    faq: [
      {
        question: "Can Astrail generate MCP from incomplete OpenAPI?",
        answer:
          "Yes, but incomplete specs usually need more review. Better schemas and examples produce more reliable generated tools.",
      },
      {
        question: "Which OpenAPI field matters most for tool names?",
        answer:
          "Stable operation ids help, followed by clear summaries and route descriptions.",
      },
    ],
  },
  {
    slug: "website-crawler-safety",
    title: "Website crawler safety",
    description:
      "Use website-to-MCP without giving agents unrestricted browser access or unsafe network reach.",
    category: "Security",
    updated: "2026-06-25",
    readingTime: "6 min read",
    intent: ["website crawler safety", "browser MCP security", "website to MCP safety"],
    intro:
      "Website-to-MCP is powerful because it starts from real public pages. It also needs strict limits so browser discovery does not become unrestricted automation.",
    steps: [
      "Start with public http or https pages and same-origin crawl limits.",
      "Block local, private network, metadata service, file, and unsupported protocol targets.",
      "Keep browser-read tools separate from state-changing workflows.",
      "Promote stable workflows into reviewed API-backed or policy-backed tools.",
    ],
    sections: [
      {
        heading: "Safe discovery",
        body: [
          "Safe website discovery reads public content, extracts useful links, and produces bounded tools for search or inspection. It should not silently submit forms, bypass login, or crawl arbitrary third-party domains.",
          "Astrail labels website-generated behavior so teams can tell when a tool came from browser inspection rather than a deterministic API endpoint map.",
        ],
      },
      {
        heading: "Production path",
        body: [
          "Use browser discovery to map the workflow. Once the workflow is important, move stable actions into explicit APIs, reviewed MCP tools, or SDK methods with auth and logs.",
          "This keeps the speed of website-to-MCP while avoiding a production surface that depends on fragile page behavior.",
        ],
      },
    ],
    faq: [
      {
        question: "Should website-to-MCP submit forms automatically?",
        answer:
          "Not by default. Public read workflows are the safer starting point. State-changing browser actions should require review and policy.",
      },
      {
        question: "Why block private network targets?",
        answer:
          "Blocking private targets prevents website discovery from reaching internal services, loopback apps, and cloud metadata endpoints.",
      },
    ],
  },
  {
    slug: "mcp-observability",
    title: "MCP observability",
    description:
      "Trace hosted MCP calls with execution modes, latency, upstream status, structured denials, and redacted runtime logs.",
    category: "Operations",
    updated: "2026-06-25",
    readingTime: "6 min read",
    intent: ["MCP observability", "agent tool logs", "MCP runtime tracing"],
    intro:
      "Agents need runtime evidence. Observability turns each MCP call into a debuggable event with trace ids, execution modes, status, latency, and structured errors.",
    steps: [
      "Capture initialize, tools/list, search_docs, execute, and tools/call events.",
      "Record execution mode, upstream method, upstream status, latency, and trace id.",
      "Redact API keys, bearer tokens, cookies, OAuth secrets, and credential query params.",
      "Expose enough detail for debugging without leaking upstream secrets or user data.",
    ],
    sections: [
      {
        heading: "What to log",
        body: [
          "Useful MCP logs show what the agent asked for, which tool handled it, whether the call reached upstream, and what structured result came back. They should also show when policy blocked execution.",
          "Astrail runtime modes make behavior easier to interpret: safe REST execution, Code Mode, website browser runtime, auth required, permission denied, validation failed, and mapping required.",
        ],
      },
      {
        heading: "What not to log",
        body: [
          "Do not log plaintext credentials, authorization headers, OAuth tokens, cookies, client secrets, or provider API keys. Observability should reduce risk, not create a second secret store.",
          "For production, pair structured logs with dashboard analytics so teams can spot failing tools, slow upstreams, and repeated permission denials.",
        ],
      },
    ],
    faq: [
      {
        question: "Why do agents need trace ids?",
        answer:
          "Trace ids let humans connect an agent answer to the exact tool call, runtime decision, upstream status, and log event.",
      },
      {
        question: "Should denied calls appear in logs?",
        answer:
          "Yes. Denials are important evidence, especially when the runtime correctly prevented an upstream request.",
      },
    ],
  },
  {
    slug: "internal-api-to-mcp",
    title: "Internal API to MCP",
    description:
      "Turn private internal APIs into reviewed MCP tools for support, operations, sales engineering, and internal agents.",
    category: "Enterprise",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["internal API to MCP", "private MCP server", "enterprise agent tools"],
    intro:
      "Internal APIs often have the most useful business actions and the least polished public docs. Astrail helps teams wrap those APIs in private MCP endpoints with auth, policy, logs, and SDK exports.",
    steps: [
      "Start from internal OpenAPI, service docs, or a curated endpoint map.",
      "Keep the generated server private and require Astrail API keys.",
      "Attach provider credentials through encrypted runtime storage rather than prompts.",
      "Ship read tools first, then add write tools with policy and audit expectations.",
    ],
    sections: [
      {
        heading: "Good internal use cases",
        body: [
          "Support agents can look up accounts, operations agents can inspect workflow state, and sales engineering agents can gather integration context. These are high-value tasks when the tool surface is narrow.",
          "Internal APIs should not be exposed wholesale. Review each operation, split public from private behavior, and keep destructive actions out of early agent access.",
        ],
      },
      {
        heading: "Governance model",
        body: [
          "Use bearer auth at the MCP boundary, least-privilege provider credentials upstream, and trace logs for every call. Keep policy decisions visible to the team that owns the underlying system.",
          "SDK Factory is useful after the internal integration stabilizes because it moves generated clients, docs, tests, and update workflows into the engineering repo.",
        ],
      },
    ],
    faq: [
      {
        question: "Can internal APIs become MCP tools without public docs?",
        answer:
          "Yes, but teams should provide enough route, parameter, auth, and example detail for safe generation and review.",
      },
      {
        question: "Should private MCP endpoints be public URLs?",
        answer:
          "They can be reachable URLs, but they should require bearer auth, reviewed tools, credential controls, and runtime logging.",
      },
    ],
  },
  {
    slug: "mcp-marketplace-templates",
    title: "MCP marketplace templates",
    description:
      "Use curated MCP templates for common apps, presets, and repeatable agent workflows before building custom servers.",
    category: "Marketplace",
    updated: "2026-06-25",
    readingTime: "5 min read",
    intent: ["MCP marketplace", "MCP templates", "agent tool catalog"],
    intro:
      "Templates give teams a faster starting point for common apps and workflows. Astrail combines marketplace presets with generated servers so teams can install known patterns or build custom endpoints from docs.",
    steps: [
      "Browse marketplace presets for apps and workflows close to your use case.",
      "Clone a preset into your workspace and review tool metadata.",
      "Attach credentials only when the upstream provider requires them.",
      "Customize or export an SDK once the workflow is stable.",
    ],
    sections: [
      {
        heading: "When templates help",
        body: [
          "Templates are useful for common SaaS actions, repeated internal workflows, and examples that teach teams what good MCP tool metadata looks like.",
          "They also help non-specialists start from a reviewed shape instead of inventing tool names, schemas, and auth behavior from scratch.",
        ],
      },
      {
        heading: "When to generate instead",
        body: [
          "Generate a custom server when the API is proprietary, customer-specific, internal, or too different from a generic template. The long tail of custom APIs is where OpenAPI-to-MCP and website-to-MCP matter most.",
          "Astrail lets both paths coexist: install a preset for common patterns, generate custom tools for everything else, and manage them in one workspace.",
        ],
      },
    ],
    faq: [
      {
        question: "Are marketplace templates enough for custom APIs?",
        answer:
          "Usually no. Templates are a starting point. Custom APIs often need generation from the actual docs or endpoint map.",
      },
      {
        question: "Can templates be cloned?",
        answer:
          "Yes. Astrail supports cloning curated presets into a workspace so teams can review and adapt them.",
      },
    ],
  },
  {
    slug: "answer-engine-optimization-for-agent-tools",
    title: "Answer engine optimization for agent tools",
    description:
      "Make MCP, API, SDK, and agent-tool documentation easier for search engines and AI answer systems to understand.",
    category: "SEO",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["answer engine optimization", "AI search optimization", "MCP SEO"],
    intro:
      "Answer engines need clear entities, canonical pages, structured data, concise definitions, and machine-readable summaries. Astrail docs are organized so humans, search crawlers, and AI systems can understand what the product does.",
    steps: [
      "Create canonical pages for each search intent instead of one vague marketing page.",
      "Use descriptive titles, summaries, FAQ answers, and structured article metadata.",
      "Expose machine-readable docs through llms.txt, docs JSON, sitemap, and internal links.",
      "Keep claims concrete: generated MCP endpoints, SDK exports, Code Mode, logs, auth, and runtime policy.",
    ],
    sections: [
      {
        heading: "What AI answer systems need",
        body: [
          "AI answer systems work best when pages define the product category in plain language and repeat the entity relationship consistently. For Astrail, that means hosted MCP endpoints, OpenAPI-to-MCP, website-to-MCP, Code Mode, SDK Factory, and runtime observability.",
          "Dense but useful documentation gives crawlers more evidence than a short landing page. Each guide should answer one clear question and link to adjacent guides.",
        ],
      },
      {
        heading: "What this docs system exposes",
        body: [
          "The Astrail site exposes canonical docs pages, article and FAQ schema, sitemap entries, blog guides, llms.txt, llms-full.txt, and docs.json. Together they provide both HTML pages and machine-readable summaries.",
          "This does not guarantee placement in any AI answer product, but it gives crawlers a cleaner source of truth than scattered marketing copy.",
        ],
      },
    ],
    faq: [
      {
        question: "Can documentation guarantee that Astrail appears in ChatGPT answers?",
        answer:
          "No. No site can guarantee inclusion in a specific answer engine. Clear, crawlable, authoritative documentation improves the quality of discoverable source material.",
      },
      {
        question: "Why create many focused docs pages?",
        answer:
          "Focused pages match specific search intents, create internal links, and give both search engines and AI systems precise answers to cite or summarize.",
      },
    ],
  },
    {
    slug: "crm-api-to-mcp",
    title: "CRM API to MCP",
    description:
      "Turn account, contact, deal, and activity APIs into MCP tools an agent can use without guessing raw CRM routes.",
    category: "Examples",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["CRM API to MCP", "Salesforce MCP tools", "HubSpot MCP server", "CRM agent tools"],
    intro:
      "A CRM MCP server should help an agent find the right customer record, summarize context, and create bounded updates. The useful tools are narrow, named around sales work, and explicit about which calls write data.",
    steps: [
      "Import the CRM OpenAPI spec or a focused endpoint collection for accounts, contacts, deals, notes, and tasks.",
      "Generate read tools first, then add write tools only for reviewed actions like notes, tasks, and stage updates.",
      "Require provider credentials for private records and keep destructive operations out of the public tool list.",
      "Test lead lookup, account summary, and a harmless note creation before connecting a sales agent.",
    ],
    sections: [
      {
        heading: "Recommended tool surface",
        body: [
          "Start with read tools that answer common sales questions: find an account, list contacts, inspect open opportunities, and fetch recent activity. These are safe, high-frequency calls that make an agent immediately useful.",
          "For writes, prefer specific tools such as create_follow_up_task or add_account_note. Avoid generic update_record tools unless the runtime policy can restrict fields and object types.",
        ],
        examples: [
          {
            name: "crm_find_account",
            description: "Searches accounts by domain, company name, or CRM id and returns a compact account profile.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Company name, domain, or account id." },
    "include_open_deals": { "type": "boolean", "default": true }
  },
  "required": ["query"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "crm_find_account",
    "arguments": {
      "query": "acme.com",
      "include_open_deals": true
    }
  }
}`,
          },
          {
            name: "crm_create_follow_up_task",
            description: "Creates a dated follow-up task on a contact or account after an agent conversation.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "record_id": { "type": "string" },
    "owner_email": { "type": "string" },
    "due_date": { "type": "string", "format": "date" },
    "task": { "type": "string", "maxLength": 500 }
  },
  "required": ["record_id", "owner_email", "due_date", "task"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "crm_create_follow_up_task",
    "arguments": {
      "record_id": "acct_42",
      "owner_email": "rep@example.com",
      "due_date": "2026-07-01",
      "task": "Send security review notes and pricing options."
    }
  }
}`,
          },
        ],
      },
      {
        heading: "Production guardrails",
        body: [
          "Keep merge, delete, ownership transfer, mass update, and stage rollback endpoints disabled until a human approves the exact workflow. Those calls are business-critical and easy for an agent to misuse from incomplete context.",
          "Log the CRM object id, tool name, authenticated user, and trace id for every write. A sales team needs to know exactly why a task or note appeared in the CRM.",
        ],
      },
    ],
    faq: [
      {
        question: "Should an agent be allowed to update CRM stages?",
        answer:
          "Only through a reviewed tool with an explicit allowed stage list and audit logs. Do not expose a broad generic record update tool by default.",
      },
      {
        question: "What CRM endpoints are safest to expose first?",
        answer:
          "Search, account lookup, contact lookup, opportunity summary, and recent activity reads are the safest first surface.",
      },
    ],
  },
  {
    slug: "ticketing-api-to-mcp",
    title: "Ticketing API to MCP",
    description:
      "Expose support tickets, comments, status changes, and escalation workflows as safe MCP tools for customer support agents.",
    category: "Examples",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["ticketing API to MCP", "Zendesk MCP server", "Jira Service Management MCP", "support agent tools"],
    intro:
      "Ticketing APIs become useful MCP servers when the tools match support work: find the ticket, inspect history, add an internal note, draft a reply, or escalate with a reason. The agent should not need to know every ticketing route.",
    steps: [
      "Generate tools from ticket search, ticket detail, comments, status, tags, and assignment endpoints.",
      "Separate customer-visible replies from internal notes so the agent cannot publish accidentally.",
      "Require credentials for private ticket data and redact customer secrets in returned logs.",
      "Test a read-only triage flow before enabling comment or status writes.",
    ],
    sections: [
      {
        heading: "Recommended tool surface",
        body: [
          "A support agent usually needs context before action. The first tools should search tickets, fetch one ticket with comments, and list similar issues by tag, customer, or product area.",
          "Write tools should be intentionally narrow. Add an internal note is safer than update ticket. Escalate ticket with a reason is safer than arbitrary field mutation.",
        ],
        examples: [
          {
            name: "ticketing_get_ticket_context",
            description: "Fetches ticket fields, requester, status, tags, and the latest comments in chronological order.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "ticket_id": { "type": "string" },
    "max_comments": { "type": "integer", "minimum": 1, "maximum": 25, "default": 10 }
  },
  "required": ["ticket_id"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "ticketing_get_ticket_context",
    "arguments": {
      "ticket_id": "TCK-10892",
      "max_comments": 12
    }
  }
}`,
          },
          {
            name: "ticketing_add_internal_note",
            description: "Adds a private internal note for human support staff without sending a customer-visible reply.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "ticket_id": { "type": "string" },
    "note": { "type": "string", "maxLength": 2000 },
    "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 8 }
  },
  "required": ["ticket_id", "note"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "ticketing_add_internal_note",
    "arguments": {
      "ticket_id": "TCK-10892",
      "note": "Customer hit rate limit during bulk import. Suggested retry after quota reset.",
      "tags": ["rate-limit", "import"]
    }
  }
}`,
          },
        ],
      },
      {
        heading: "Production guardrails",
        body: [
          "Do not expose public reply tools until you have a review step or a strong policy around tone, attachments, and PII. A ticketing MCP server can make customer-visible mistakes very quickly.",
          "Status change tools should require an allowed transition list. If the ticket is already solved, closed, or assigned to another team, the tool should return a recoverable policy error.",
        ],
      },
    ],
    faq: [
      {
        question: "Should an MCP support agent send customer replies directly?",
        answer:
          "Usually no at first. Start with internal notes and draft generation, then add customer-visible replies behind approval.",
      },
      {
        question: "What is the most useful ticketing tool?",
        answer:
          "A ticket context tool that returns fields, requester, tags, and comments is usually the highest-leverage first tool.",
      },
    ],
  },
  {
    slug: "payments-api-to-mcp",
    title: "Payments API to MCP",
    description:
      "Wrap payment customers, invoices, subscriptions, refunds, and dispute endpoints as auditable MCP tools.",
    category: "Examples",
    updated: "2026-06-25",
    readingTime: "8 min read",
    intent: ["payments API to MCP", "Stripe MCP server", "billing MCP tools", "payments agent tools"],
    intro:
      "Payments APIs need the tightest MCP boundary. Read tools are useful for support and finance agents, but money-moving tools must be narrow, audited, and often require explicit approval.",
    steps: [
      "Generate read tools for customers, subscriptions, invoices, charges, payment status, and disputes.",
      "Keep refunds, credits, cancellations, and payment method changes behind private auth and approval.",
      "Add amount limits, currency checks, idempotency keys, and trace ids to every write-capable tool.",
      "Test missing credentials, invalid amount, duplicate idempotency key, and successful read calls.",
    ],
    sections: [
      {
        heading: "Recommended tool surface",
        body: [
          "Start with payment status reads: find customer, list invoices, inspect subscription state, and retrieve a charge. These tools help agents answer billing questions without touching funds.",
          "For writes, expose specific actions with strict limits. A refund tool should require charge id, amount, reason, idempotency key, and policy evidence.",
        ],
        examples: [
          {
            name: "payments_get_customer_billing_state",
            description: "Returns customer, subscription, invoice, and payment status in one compact support view.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "customer_id": { "type": "string" },
    "email": { "type": "string" }
  },
  "oneOf": [
    { "required": ["customer_id"] },
    { "required": ["email"] }
  ]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "payments_get_customer_billing_state",
    "arguments": {
      "email": "buyer@example.com"
    }
  }
}`,
          },
          {
            name: "payments_create_limited_refund",
            description: "Creates a bounded refund with amount, reason, idempotency key, and audit metadata.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "charge_id": { "type": "string" },
    "amount_cents": { "type": "integer", "minimum": 1, "maximum": 50000 },
    "currency": { "type": "string", "enum": ["usd", "eur", "gbp"] },
    "reason": { "type": "string", "enum": ["duplicate", "fraudulent", "requested_by_customer"] },
    "idempotency_key": { "type": "string" }
  },
  "required": ["charge_id", "amount_cents", "currency", "reason", "idempotency_key"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "payments_create_limited_refund",
    "arguments": {
      "charge_id": "ch_123",
      "amount_cents": 2500,
      "currency": "usd",
      "reason": "requested_by_customer",
      "idempotency_key": "refund-ch_123-2026-06-25"
    }
  }
}`,
          },
        ],
      },
      {
        heading: "Production guardrails",
        body: [
          "Block broad create, update, and delete routes unless they are wrapped in a policy-specific tool. The agent should never improvise payment mutations from raw endpoint docs.",
          "Return exact denial reasons for blocked money movement. The result should say whether a provider call was attempted, which policy blocked it, and which trace id connects the denial to logs.",
        ],
      },
    ],
    faq: [
      {
        question: "Can an MCP agent issue refunds?",
        answer:
          "Yes, but only through a bounded private tool with amount limits, idempotency, audit logs, and usually a human approval policy.",
      },
      {
        question: "What payment tools should stay read-only?",
        answer:
          "Customer lookup, invoice status, subscription state, dispute detail, and charge retrieval are good read-only tools.",
      },
    ],
  },
  {
    slug: "calendar-api-to-mcp",
    title: "Calendar API to MCP",
    description:
      "Convert availability, event search, scheduling, and RSVP APIs into MCP tools for assistant-style agents.",
    category: "Examples",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["calendar API to MCP", "Google Calendar MCP server", "scheduling MCP tools", "calendar agent tools"],
    intro:
      "Calendar MCP tools are valuable because scheduling is structured but full of edge cases: time zones, attendees, conflicts, privacy, recurrence, and user consent. Good tools make those constraints explicit.",
    steps: [
      "Generate availability and event read tools before enabling event creation.",
      "Normalize time zones and require ISO timestamps for all scheduling calls.",
      "Separate draft meeting creation from direct send if your workflow needs approval.",
      "Test conflicts, missing attendees, daylight saving boundaries, and private event summaries.",
    ],
    sections: [
      {
        heading: "Recommended tool surface",
        body: [
          "The safest first calendar tools find free time, list upcoming events, and inspect one event. They help the agent reason about time without changing anyone's schedule.",
          "For writes, use create_draft_event or create_meeting_with_attendees rather than a generic event mutation tool. Include attendees, timezone, duration, and conflict policy as required fields.",
        ],
        examples: [
          {
            name: "calendar_find_free_windows",
            description: "Finds free windows across one or more calendars for a date range and duration.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "calendar_ids": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "start": { "type": "string", "format": "date-time" },
    "end": { "type": "string", "format": "date-time" },
    "duration_minutes": { "type": "integer", "minimum": 15, "maximum": 240 },
    "timezone": { "type": "string" }
  },
  "required": ["calendar_ids", "start", "end", "duration_minutes", "timezone"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "calendar_find_free_windows",
    "arguments": {
      "calendar_ids": ["primary", "team-sales"],
      "start": "2026-07-02T09:00:00-07:00",
      "end": "2026-07-02T17:00:00-07:00",
      "duration_minutes": 30,
      "timezone": "America/Los_Angeles"
    }
  }
}`,
          },
          {
            name: "calendar_create_meeting_draft",
            description: "Creates a meeting draft with attendees and conference details without sending invites automatically.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "calendar_id": { "type": "string" },
    "title": { "type": "string" },
    "start": { "type": "string", "format": "date-time" },
    "end": { "type": "string", "format": "date-time" },
    "attendees": { "type": "array", "items": { "type": "string" }, "maxItems": 25 },
    "description": { "type": "string", "maxLength": 2000 }
  },
  "required": ["calendar_id", "title", "start", "end", "attendees"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "calendar_create_meeting_draft",
    "arguments": {
      "calendar_id": "primary",
      "title": "Security review",
      "start": "2026-07-02T13:00:00-07:00",
      "end": "2026-07-02T13:30:00-07:00",
      "attendees": ["alex@example.com", "sam@example.com"],
      "description": "Draft created by support agent. Human approval required before send."
    }
  }
}`,
          },
        ],
      },
      {
        heading: "Production guardrails",
        body: [
          "Private event details should be summarized cautiously. If an event is marked private, the tool should return busy status and time bounds without leaking title, notes, guests, or attachments.",
          "Recurring event edits need separate review. A single bad recurrence update can damage an entire calendar series.",
        ],
      },
    ],
    faq: [
      {
        question: "Should calendar tools send invites automatically?",
        answer:
          "Only after the workflow is proven. Draft-first tools are safer for assistants that need human approval.",
      },
      {
        question: "What calendar edge case matters most?",
        answer:
          "Time zone handling. Require ISO date-times and an explicit timezone in every scheduling tool.",
      },
    ],
  },
  {
    slug: "analytics-api-to-mcp",
    title: "Analytics API to MCP",
    description:
      "Expose metrics, funnels, cohorts, dashboards, and event queries as MCP tools that return bounded analysis-ready data.",
    category: "Examples",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["analytics API to MCP", "metrics MCP tools", "dashboard MCP server", "product analytics agent"],
    intro:
      "Analytics APIs are strong MCP candidates because agents can answer business questions from structured metrics. The danger is unbounded queries, expensive scans, and ambiguous metric names.",
    steps: [
      "Generate tools around approved metrics, saved dashboards, event search, and funnel summaries.",
      "Add date range, granularity, row limits, and workspace id to every query tool.",
      "Return compact tables and links to source dashboards rather than huge raw event dumps.",
      "Test empty results, large date ranges, invalid metric names, and permission-denied workspaces.",
    ],
    sections: [
      {
        heading: "Recommended tool surface",
        body: [
          "The best analytics MCP tools are metric-specific and bounded: get_active_users, query_funnel, compare_conversion, and list_dashboard_cards. They give the agent reliable names and limits.",
          "Avoid exposing a raw SQL-style analytics endpoint unless you also enforce allowed datasets, max rows, max time range, and query cost limits.",
        ],
        examples: [
          {
            name: "analytics_query_metric",
            description: "Queries an approved product metric over a bounded date range with explicit granularity.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "workspace_id": { "type": "string" },
    "metric": { "type": "string", "enum": ["active_users", "new_signups", "activation_rate", "paid_conversion"] },
    "start_date": { "type": "string", "format": "date" },
    "end_date": { "type": "string", "format": "date" },
    "granularity": { "type": "string", "enum": ["day", "week", "month"] }
  },
  "required": ["workspace_id", "metric", "start_date", "end_date", "granularity"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "analytics_query_metric",
    "arguments": {
      "workspace_id": "ws_prod",
      "metric": "activation_rate",
      "start_date": "2026-06-01",
      "end_date": "2026-06-24",
      "granularity": "day"
    }
  }
}`,
          },
          {
            name: "analytics_get_funnel_summary",
            description: "Returns step counts and conversion rates for an approved funnel.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "workspace_id": { "type": "string" },
    "funnel_id": { "type": "string" },
    "start_date": { "type": "string", "format": "date" },
    "end_date": { "type": "string", "format": "date" },
    "segment": { "type": "string", "maxLength": 80 }
  },
  "required": ["workspace_id", "funnel_id", "start_date", "end_date"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "analytics_get_funnel_summary",
    "arguments": {
      "workspace_id": "ws_prod",
      "funnel_id": "signup_to_first_server",
      "start_date": "2026-06-01",
      "end_date": "2026-06-24",
      "segment": "source:docs"
    }
  }
}`,
          },
        ],
      },
      {
        heading: "Production guardrails",
        body: [
          "Analytics tools should enforce maximum date windows, row limits, and cost controls. A helpful agent should not accidentally run a warehouse-sized query for a casual question.",
          "Metric definitions should be returned with the data. If an agent explains activation_rate, it needs the numerator, denominator, timezone, and freshness timestamp.",
        ],
      },
    ],
    faq: [
      {
        question: "Should an analytics MCP server expose raw events?",
        answer:
          "Usually no. Start with metric and funnel tools, then add event samples only with strict row limits and redaction.",
      },
      {
        question: "What should every analytics result include?",
        answer:
          "Metric definition, date range, timezone, freshness, row count, and any filters applied.",
      },
    ],
  },
  {
    slug: "database-api-to-mcp",
    title: "Database API to MCP",
    description:
      "Wrap database read APIs, admin queries, and approved mutations as MCP tools without handing agents raw database access.",
    category: "Examples",
    updated: "2026-06-25",
    readingTime: "8 min read",
    intent: ["database API to MCP", "Postgres MCP tools", "database agent tools", "SQL MCP server"],
    intro:
      "Database MCP servers are useful for internal agents, but raw database access is too much power. The safer pattern is approved views, named queries, strict parameters, and separate write tools with explicit policy.",
    steps: [
      "Start from a database API, query service, or read-only OpenAPI layer rather than direct unrestricted SQL.",
      "Generate tools for approved views, lookup queries, health checks, and narrow operational actions.",
      "Enforce read-only credentials for read tools and separate write credentials for reviewed mutations.",
      "Test SQL injection attempts, empty results, row limits, and blocked table access.",
    ],
    sections: [
      {
        heading: "Recommended tool surface",
        body: [
          "Good database MCP tools read like operations, not SQL. get_customer_health, list_failed_jobs, lookup_order_by_id, and explain_recent_errors are easier for an agent to choose than query_database.",
          "If you need a flexible query tool, bind it to approved views and parameterized filters. Never pass model-authored SQL directly to production.",
        ],
        examples: [
          {
            name: "database_lookup_customer_health",
            description: "Reads an approved customer health view by account id and returns bounded operational fields.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "account_id": { "type": "string" },
    "include_recent_errors": { "type": "boolean", "default": true }
  },
  "required": ["account_id"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "database_lookup_customer_health",
    "arguments": {
      "account_id": "acct_42",
      "include_recent_errors": true
    }
  }
}`,
          },
          {
            name: "database_list_failed_jobs",
            description: "Lists recent failed background jobs from an approved operations view with limit and service filters.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "service": { "type": "string" },
    "since": { "type": "string", "format": "date-time" },
    "limit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 20 }
  },
  "required": ["since"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "database_list_failed_jobs",
    "arguments": {
      "service": "billing",
      "since": "2026-06-25T00:00:00Z",
      "limit": 20
    }
  }
}`,
          },
        ],
      },
      {
        heading: "Production guardrails",
        body: [
          "Use parameterized queries, approved views, row limits, response redaction, and read-only roles. The MCP layer should refuse arbitrary SQL, table names, and unbounded exports.",
          "For mutation tools, require idempotency, explicit resource ids, and audit metadata. Direct delete, truncate, migration, and permission changes should stay outside the agent surface.",
        ],
      },
    ],
    faq: [
      {
        question: "Can an MCP server safely query a database?",
        answer:
          "Yes, if it uses approved views, strict schemas, parameterized queries, row limits, and read-only credentials.",
      },
      {
        question: "Should an agent write SQL?",
        answer:
          "Not against production. Use named tools or constrained query builders instead of model-authored SQL.",
      },
    ],
  },
  {
    slug: "ecommerce-api-to-mcp",
    title: "Ecommerce API to MCP",
    description:
      "Generate MCP tools for products, inventory, orders, customers, fulfillment, and refunds while keeping store operations safe.",
    category: "Examples",
    updated: "2026-06-25",
    readingTime: "7 min read",
    intent: ["ecommerce API to MCP", "Shopify MCP server", "commerce MCP tools", "order support agent"],
    intro:
      "Ecommerce APIs make strong support and ops tools. Agents can answer order questions, check inventory, summarize fulfillment, and draft customer updates, but write tools need careful limits.",
    steps: [
      "Generate read tools for product search, inventory lookup, order status, customer profile, and fulfillment events.",
      "Add write tools only for bounded operations such as draft refund, add order note, or update fulfillment tag.",
      "Require credentials for customer and order data, and redact payment details from tool responses.",
      "Test order not found, split shipments, partial refunds, out-of-stock variants, and duplicate writes.",
    ],
    sections: [
      {
        heading: "Recommended tool surface",
        body: [
          "The first ecommerce MCP tools should help support answer where is my order, is this in stock, and what happened with fulfillment. Those are high-volume questions with clear API backing.",
          "Avoid exposing raw product update, price update, refund, and cancellation endpoints until each action is wrapped with business policy and approval.",
        ],
        examples: [
          {
            name: "ecommerce_get_order_status",
            description: "Returns order, fulfillment, shipment, and payment status without exposing full payment details.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "order_id": { "type": "string" },
    "email": { "type": "string" }
  },
  "oneOf": [
    { "required": ["order_id"] },
    { "required": ["email"] }
  ]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "ecommerce_get_order_status",
    "arguments": {
      "order_id": "100492"
    }
  }
}`,
          },
          {
            name: "ecommerce_check_variant_inventory",
            description: "Checks available inventory for a product variant across approved fulfillment locations.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "sku": { "type": "string" },
    "location_ids": { "type": "array", "items": { "type": "string" }, "maxItems": 10 }
  },
  "required": ["sku"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "ecommerce_check_variant_inventory",
    "arguments": {
      "sku": "TEE-BLACK-M",
      "location_ids": ["warehouse-west", "store-sf"]
    }
  }
}`,
          },
        ],
      },
      {
        heading: "Production guardrails",
        body: [
          "Refunds, cancellations, price changes, inventory adjustments, and customer data exports should be private write tools with amount limits, idempotency, and audit logging.",
          "Tool responses should avoid exposing card details, full addresses, or unnecessary customer PII. Give the agent enough context to help, not a full data dump.",
        ],
      },
    ],
    faq: [
      {
        question: "What ecommerce MCP tools are safest first?",
        answer:
          "Product search, inventory lookup, order status, fulfillment status, and order note creation are good first tools.",
      },
      {
        question: "Can an agent cancel orders?",
        answer:
          "Only through a private policy-checked tool with order state checks, idempotency, and human approval when needed.",
      },
    ],
  },
  {
    slug: "internal-admin-api-to-mcp",
    title: "Internal admin API to MCP",
    description:
      "Expose internal admin workflows as MCP tools with tight permissions, audit logs, and safe operational defaults.",
    category: "Examples",
    updated: "2026-06-25",
    readingTime: "8 min read",
    intent: ["internal admin API to MCP", "admin MCP tools", "internal tool agent", "ops MCP server"],
    intro:
      "Internal admin APIs are where MCP can save teams hours, and where loose tool design can hurt production. Build these tools around specific operational jobs, not generic admin power.",
    steps: [
      "Inventory admin endpoints by risk: read, write, destructive, permission-changing, and money-moving.",
      "Generate read tools for lookup, diagnostics, flags, job status, and audit history first.",
      "Wrap write tools with explicit ids, allowed fields, idempotency, actor identity, and reason fields.",
      "Test blocked dangerous endpoints, missing auth, invalid actor, duplicate request, and audit log creation.",
    ],
    sections: [
      {
        heading: "Recommended tool surface",
        body: [
          "Internal admin MCP tools should map to operational tasks: look up user, inspect account flags, retry failed job, add admin note, or disable feature flag for one account. These tools are easier to audit than a generic admin API caller.",
          "Keep permission changes, bulk edits, deletes, impersonation, and production config changes out of the agent surface unless there is a human approval path.",
        ],
        examples: [
          {
            name: "admin_get_account_diagnostics",
            description: "Returns account status, feature flags, billing state, recent errors, and support-safe diagnostics.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "account_id": { "type": "string" },
    "include_recent_errors": { "type": "boolean", "default": true }
  },
  "required": ["account_id"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "admin_get_account_diagnostics",
    "arguments": {
      "account_id": "acct_42",
      "include_recent_errors": true
    }
  }
}`,
          },
          {
            name: "admin_retry_failed_job",
            description: "Retries one failed background job after policy checks and records the actor and reason.",
            inputSchema: `{
  "type": "object",
  "properties": {
    "job_id": { "type": "string" },
    "actor_email": { "type": "string" },
    "reason": { "type": "string", "maxLength": 500 },
    "idempotency_key": { "type": "string" }
  },
  "required": ["job_id", "actor_email", "reason", "idempotency_key"]
}`,
            sampleCall: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "admin_retry_failed_job",
    "arguments": {
      "job_id": "job_9xn",
      "actor_email": "ops@example.com",
      "reason": "Retry after provider outage resolved.",
      "idempotency_key": "retry-job_9xn-2026-06-25"
    }
  }
}`,
          },
        ],
      },
      {
        heading: "Production guardrails",
        body: [
          "Require private auth, actor identity, reason fields, trace ids, and audit logs for every admin write. If the agent cannot explain why it is doing the action, the tool should refuse the call.",
          "Use allowlists for fields and resources. Generic patch endpoints are risky because agents can mutate fields that were never intended for automation.",
        ],
      },
    ],
    faq: [
      {
        question: "Should internal admin MCP tools be public?",
        answer:
          "No. They should require private bearer auth, provider credentials where needed, and strict runtime policy.",
      },
      {
        question: "What admin endpoints should stay blocked?",
        answer:
          "Permission changes, impersonation, deletes, bulk edits, billing changes, and production config updates should stay blocked unless explicitly reviewed.",
      },
    ],
  },
];

export function getDocsGuide(slug: string) {
  return docsGuides.find((guide) => guide.slug === slug);
}
