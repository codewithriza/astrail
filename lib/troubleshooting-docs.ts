export type TroubleshootingStep = {
  title: string;
  body: string;
};

export type TroubleshootingDoc = {
  slug: string;
  title: string;
  description: string;
  category: string;
  symptom: string;
  primaryCheck: string;
  quickFix: string;
  keywords: string[];
  sections: TroubleshootingStep[];
  faq: { question: string; answer: string }[];
  related: string[];
};

export const troubleshootingDocs: TroubleshootingDoc[] = [
  {
    slug: "mcp-endpoint-401-unauthorized",
    title: "MCP endpoint returns 401 unauthorized",
    description: "Fix 401 unauthorized responses from a private Astrail MCP endpoint by checking bearer tokens, server visibility, and client config.",
    category: "Auth",
    symptom: "The MCP client can reach the endpoint but every initialize, tools/list, or tools/call request returns 401 unauthorized.",
    primaryCheck: "Confirm the request sends Authorization: Bearer with an active Astrail API key for the same workspace as the server.",
    quickFix: "Create a fresh API key in settings, paste it into the MCP client config without quotes or extra spaces, and retry tools/list.",
    keywords: ["MCP 401", "MCP unauthorized", "private MCP endpoint", "Authorization bearer"],
    sections: [
      {
        title: "Confirm the endpoint is private",
        body: "A public demo endpoint can answer without a bearer token. A private endpoint must receive a workspace API key on every JSON-RPC request. If initialize works locally but fails from Claude, Cursor, or an agent runtime, compare the exact URL and headers each client sends.",
      },
      {
        title: "Check the Authorization header shape",
        body: "Use one Authorization header with the value Bearer followed by the raw key. Do not send the key as X-API-Key, query parameters, Basic auth, or a JSON-RPC field. A copied newline at the end of the key is enough to make a valid key fail.",
      },
      {
        title: "Regenerate stale keys",
        body: "Keys can be deleted, rotated, or scoped to a different account. Generate a new key from the dashboard, update the client config, restart the client process, and retry tools/list before debugging the generated tools themselves.",
      },
      {
        title: "Separate upstream auth from Astrail auth",
        body: "Astrail API keys authorize access to the MCP endpoint. Provider credentials authorize the upstream API behind a tool. If the MCP endpoint accepts tools/list but a tool call says auth_required, fix provider credentials instead of rotating the Astrail key.",
      },
    ],
    faq: [
      {
        question: "Does 401 mean the generated API tool is broken?",
        answer: "Usually no. A 401 at the MCP boundary means the Astrail endpoint rejected the client request before a generated tool ran.",
      },
      {
        question: "Should private endpoint keys be placed in the prompt?",
        answer: "No. Store the key in the MCP client or runtime secret manager so it is sent as an HTTP header, not model-visible text.",
      },
    ],
    related: ["auth-header-problems", "private-mcp-endpoint-setup", "tools-list-empty"],
  },
  {
    slug: "tools-list-empty",
    title: "tools/list returns an empty tool list",
    description: "Diagnose an empty MCP tools/list response from generated OpenAPI, Code Mode, or private endpoint policy settings.",
    category: "Tool discovery",
    symptom: "initialize succeeds, but tools/list returns no callable tools or only a smaller set than expected.",
    primaryCheck: "Open the server details and confirm the generated endpoint has approved public tools or Code Mode search_docs and execute enabled.",
    quickFix: "Regenerate from a valid OpenAPI spec, review the public tool policy, then call tools/list again with the same server ID.",
    keywords: ["tools/list empty", "MCP no tools", "empty MCP tools", "generated tools missing"],
    sections: [
      {
        title: "Check generation mode",
        body: "Large APIs can use Code Mode instead of exposing every route as a top-level MCP tool. In that mode, tools/list should include search_docs and execute. Use search_docs to inspect the endpoint catalog before calling execute.",
      },
      {
        title: "Review public exposure policy",
        body: "Astrail can hide private, destructive, or unapproved endpoints from public MCP clients. If every discovered operation is blocked by policy, tools/list can be empty even though the server record exists.",
      },
      {
        title: "Inspect the source spec",
        body: "An OpenAPI file with no paths, unsupported methods only, malformed operation objects, or invalid schemas can generate a server with no usable tools. Preview the spec and confirm Astrail detected paths before generating.",
      },
      {
        title: "Verify the server ID",
        body: "It is common to copy a URL for a draft, deleted, or local preview server. Compare the server ID in the MCP URL with the dashboard server page and regenerate if the record is stale.",
      },
    ],
    faq: [
      {
        question: "Why do I only see search_docs and execute?",
        answer: "That is expected for Code Mode servers. The endpoint catalog is searched at call time instead of loading many tools into the client context.",
      },
      {
        question: "Can private tools be hidden from tools/list?",
        answer: "Yes. Hidden tools should not appear in public metadata, tools/list, generated docs, or direct tools/call dispatch.",
      },
    ],
    related: ["tools-call-validation-error", "openapi-schema-issues", "private-mcp-endpoint-setup"],
  },
  {
    slug: "tools-call-validation-error",
    title: "tools/call returns a validation error",
    description: "Fix MCP tools/call validation errors by matching generated schemas, JSON-RPC params, and Code Mode execute arguments.",
    category: "Tool calls",
    symptom: "tools/list works, but tools/call returns invalid arguments, schema validation failed, or missing required parameter.",
    primaryCheck: "Call tools/list or search_docs with schema detail and compare the tool arguments against the generated input schema.",
    quickFix: "Send params.name as the exact tool name and params.arguments as a JSON object with only schema-supported fields.",
    keywords: ["tools/call validation", "MCP invalid arguments", "tool schema error", "required parameter missing"],
    sections: [
      {
        title: "Validate the JSON-RPC envelope",
        body: "The method should be tools/call. The params object should include name and arguments. Arguments must be an object, not a JSON string, not an array, and not nested under input unless the generated schema explicitly asks for input.",
      },
      {
        title: "Match required parameters exactly",
        body: "Generated schemas preserve required path, query, header, and body fields from the OpenAPI source. Case, enum values, and nested object names matter. Use search_docs with schema detail when you are not sure which field the agent should send.",
      },
      {
        title: "Do not guess Code Mode execute shape",
        body: "For Code Mode servers, execute expects a constrained code snippet and optional result controls. The snippet should call methods returned by search_docs. Arbitrary JavaScript, unsupported loops, or unknown client methods will fail before any upstream API call.",
      },
      {
        title: "Look for model-added fields",
        body: "Agents often add explanatory keys such as reason, query, or payload. If those keys are not in the schema and the tool is strict, remove them or ask the agent to retry with the exact schema.",
      },
    ],
    faq: [
      {
        question: "Should I relax every schema to avoid validation errors?",
        answer: "No. Validation errors are useful guardrails. Fix the call shape or source OpenAPI schema instead of accepting unknown fields globally.",
      },
      {
        question: "How do I debug a missing path parameter?",
        answer: "Search docs for the operation, inspect schema detail, then send the path parameter as a normal argument field using the exact generated name.",
      },
    ],
    related: ["tools-list-empty", "openapi-schema-issues", "generated-sdk-build-failures"],
  },
  {
    slug: "openapi-schema-issues",
    title: "OpenAPI schema issues during MCP generation",
    description: "Resolve OpenAPI parsing, schema validation, missing paths, circular refs, and unsupported content-type issues before generating MCP tools.",
    category: "Generation",
    symptom: "Generation fails, produces incomplete tools, or reports that no OpenAPI or Swagger spec could be found.",
    primaryCheck: "Open the direct OpenAPI JSON or YAML URL and confirm it returns a valid spec with info, paths, operations, and schemas.",
    quickFix: "Paste the raw OpenAPI JSON or YAML into Astrail, fix validation warnings, and regenerate before using a docs landing page URL.",
    keywords: ["OpenAPI schema issue", "Swagger MCP generation failed", "OpenAPI validation", "no OpenAPI found"],
    sections: [
      {
        title: "Use the direct spec when discovery fails",
        body: "Swagger UI and Redoc pages often load the real spec from a script or config. If automatic discovery cannot find it, copy the direct JSON or YAML spec URL and generate from that endpoint instead of the human docs page.",
      },
      {
        title: "Fix required OpenAPI fields",
        body: "The spec should include a version, info, paths, methods, operation metadata, parameters, and request body schemas. Empty paths or non-object path entries leave Astrail without enough structure to generate reliable tools.",
      },
      {
        title: "Normalize content types",
        body: "Prefer application/json request and response schemas for agent tools. Multipart uploads, binary streams, form-encoded bodies, and vendor-specific content types may need explicit examples or a narrower endpoint policy.",
      },
      {
        title: "Resolve ambiguous refs",
        body: "Broken refs, circular schemas, oneOf branches without discriminators, and deeply nested allOf chains can produce unclear tool schemas. Inline the specific request schema for high-value operations when a full ref graph is too loose.",
      },
    ],
    faq: [
      {
        question: "Can Astrail generate from Swagger 2.0?",
        answer: "Yes, but the generated result is strongest when the Swagger spec has explicit operation IDs, parameters, auth schemes, and response examples.",
      },
      {
        question: "What should I do with huge enterprise specs?",
        answer: "Start with Code Mode or a reduced spec containing the endpoints the agent actually needs, then expand after search_docs and smoke tests pass.",
      },
    ],
    related: ["tools-list-empty", "tools-call-validation-error", "generated-sdk-build-failures"],
  },
  {
    slug: "auth-header-problems",
    title: "Auth header problems in MCP clients",
    description: "Fix Authorization header forwarding, bearer token formatting, and client-specific MCP auth configuration problems.",
    category: "Auth",
    symptom: "The same endpoint works with curl but fails from an MCP client, local script, or hosted agent runtime.",
    primaryCheck: "Capture or log the outgoing request and verify the client forwards Authorization: Bearer to the Astrail MCP URL.",
    quickFix: "Move the key into the client secret field or environment variable expected by the MCP adapter, restart the client, and retry initialize.",
    keywords: ["MCP auth header", "Authorization bearer problem", "MCP client token", "auth header forwarding"],
    sections: [
      {
        title: "Compare curl to the client",
        body: "A passing curl request proves the endpoint and key can work together. The next step is to verify the client sends the same method, URL, content type, and Authorization header. Many client bugs are config shape problems, not endpoint failures.",
      },
      {
        title: "Avoid prompt-visible secrets",
        body: "Do not ask the model to include the token in tool arguments. The Authorization header should be configured outside the prompt so agents cannot leak it through logs, memory, generated docs, or error messages.",
      },
      {
        title: "Restart after config changes",
        body: "Desktop MCP clients often cache configs at process start. After editing a JSON config or environment file, fully restart the client and any local proxy before retesting.",
      },
      {
        title: "Check proxies and adapters",
        body: "If you route hosted HTTP MCP through a local stdio bridge, confirm the bridge copies headers to the remote HTTP request. A bridge that only forwards the JSON body will make private endpoints look broken.",
      },
    ],
    faq: [
      {
        question: "Can I put the API key in the endpoint URL?",
        answer: "No. Use an Authorization header. Query-string keys are easier to leak through logs, browser history, screenshots, and analytics.",
      },
      {
        question: "Why does the client still fail after I changed the key?",
        answer: "The client may be using a cached config or a different profile. Restart it and verify the active server entry points at the updated key.",
      },
    ],
    related: ["mcp-endpoint-401-unauthorized", "private-mcp-endpoint-setup", "cors-origin-issues"],
  },
  {
    slug: "cors-origin-issues",
    title: "CORS and origin issues with hosted MCP",
    description: "Resolve browser CORS failures, blocked origins, preflight requests, and private network restrictions when calling hosted MCP endpoints.",
    category: "Networking",
    symptom: "A browser-based app cannot call the MCP endpoint, but server-side curl or a backend worker can.",
    primaryCheck: "Confirm whether the request is coming from a browser origin, a backend runtime, or a desktop MCP client because each path has different CORS rules.",
    quickFix: "Proxy browser calls through your backend or configure an allowed origin for the exact production domain before exposing the endpoint to users.",
    keywords: ["MCP CORS", "origin blocked", "browser MCP request", "preflight failed"],
    sections: [
      {
        title: "Separate browser CORS from endpoint reachability",
        body: "A CORS error means the browser blocked access to the response. It does not prove the MCP endpoint is down. Test the same initialize request from a server-side runtime to confirm network reachability.",
      },
      {
        title: "Use backend calls for private endpoints",
        body: "Private MCP endpoints usually need bearer tokens. Browser apps should avoid holding those tokens directly. Put the key in a backend route, call Astrail server-side, and return only the safe result to the browser.",
      },
      {
        title: "Match exact origins",
        body: "Origins include scheme, host, and port. https://app.example.com and https://www.example.com are different origins. Preview domains, localhost ports, and staging domains need their own policy during testing.",
      },
      {
        title: "Handle preflight requests",
        body: "Authorization and JSON content types can trigger OPTIONS preflight requests. If the preflight is blocked by a proxy or WAF before it reaches the MCP route, the browser will fail before the JSON-RPC body is sent.",
      },
    ],
    faq: [
      {
        question: "Does a desktop MCP client need CORS?",
        answer: "Usually no. CORS is a browser enforcement model. Desktop and server runtimes still need network access and valid auth.",
      },
      {
        question: "Should I allow every origin?",
        answer: "No. Use exact production and staging origins, especially when the endpoint can trigger billable or state-changing tool calls.",
      },
    ],
    related: ["auth-header-problems", "private-mcp-endpoint-setup", "rate-limit-errors"],
  },
  {
    slug: "rate-limit-errors",
    title: "MCP rate limit errors and 429 responses",
    description: "Debug 429 rate limit responses from hosted MCP endpoints, generated tools, and edge abuse protections.",
    category: "Reliability",
    symptom: "The endpoint returns 429, too_many_requests, billing_required, or intermittent failures during agent retries.",
    primaryCheck: "Check whether the 429 came from Astrail edge limits, workspace billing limits, or the upstream provider API.",
    quickFix: "Slow the client retry loop, reduce concurrent tool calls, and confirm production uses a distributed limiter for public MCP traffic.",
    keywords: ["MCP 429", "rate limit error", "too many requests", "MCP abuse guard"],
    sections: [
      {
        title: "Identify which layer rejected the request",
        body: "Astrail can rate-limit the MCP edge, enforce workspace billing limits, and surface upstream provider limits. The response code, error_code, and trace details should tell you whether the request reached the generated tool runtime.",
      },
      {
        title: "Control agent retry behavior",
        body: "Agents can turn a single missing parameter into many fast retries. Add backoff, cap retries, and ask the agent to inspect schema detail before retrying a failed tools/call.",
      },
      {
        title: "Use distributed limits for production",
        body: "Per-instance memory buckets are acceptable for protected previews. Public production endpoints should use shared Redis-backed limits plus provider edge protection so traffic is enforced across all instances.",
      },
      {
        title: "Tune limits by endpoint risk",
        body: "Read-only metadata can usually tolerate higher rates than expensive or state-changing tools. Keep stricter caps for auth failures, tool calls, large request bodies, and anonymous public traffic.",
      },
    ],
    faq: [
      {
        question: "Is every 429 an Astrail limit?",
        answer: "No. Some 429 responses come from the upstream API. Check the trace and execution mode before raising Astrail MCP limits.",
      },
      {
        question: "Can I disable rate limits during launch?",
        answer: "Do not disable them for public endpoints. Use temporary higher limits only with monitoring and provider-level protection in place.",
      },
    ],
    related: ["cors-origin-issues", "private-mcp-endpoint-setup", "tools-call-validation-error"],
  },
  {
    slug: "private-mcp-endpoint-setup",
    title: "Private MCP endpoint setup checklist",
    description: "Set up a private Astrail MCP endpoint with API keys, hidden metadata, allowed tools, credentials, and production verification.",
    category: "Setup",
    symptom: "You need a generated MCP endpoint that only approved clients can discover and call.",
    primaryCheck: "Confirm the server is private, public metadata is filtered, and every client has a scoped Astrail API key.",
    quickFix: "Set the endpoint private, create a fresh API key, configure the MCP client Authorization header, and run initialize plus tools/list.",
    keywords: ["private MCP endpoint", "MCP setup checklist", "secure MCP endpoint", "hosted MCP auth"],
    sections: [
      {
        title: "Start with endpoint visibility",
        body: "Private endpoints should require an Astrail API key for initialize, tools/list, and tools/call. Public catalog metadata should not reveal private tool names, internal paths, credentials, or generated SDK details.",
      },
      {
        title: "Create client-specific keys",
        body: "Use separate keys for local testing, staging, production agents, and automation. That makes rotation easier and helps you isolate a noisy or compromised client without taking every integration offline.",
      },
      {
        title: "Attach upstream credentials separately",
        body: "Provider API keys, OAuth tokens, and customer secrets should live in Astrail credentials storage or your backend secret manager. They should not appear in generated tool descriptions or MCP client config.",
      },
      {
        title: "Verify before sharing the URL",
        body: "Run initialize, tools/list, one safe tools/call, one unauthorized request, and one invalid argument request. A private endpoint is ready when valid clients work and invalid clients fail clearly.",
      },
    ],
    faq: [
      {
        question: "Can the same MCP URL be used by multiple clients?",
        answer: "Yes, but give each production client its own API key so usage and rotation are not coupled.",
      },
      {
        question: "Should tools/list expose private operations?",
        answer: "Only to authorized clients. Anonymous public metadata should stay filtered for private endpoints.",
      },
    ],
    related: ["mcp-endpoint-401-unauthorized", "auth-header-problems", "rate-limit-errors"],
  },
  {
    slug: "generated-sdk-build-failures",
    title: "Generated SDK build failures",
    description: "Fix build, typecheck, package, and smoke-test failures in generated Astrail SDK bundles.",
    category: "SDK Factory",
    symptom: "The SDK bundle downloads, but npm test, TypeScript build, Python packaging, or generated smoke tests fail.",
    primaryCheck: "Run the bundle verification script first, then inspect the first compiler error instead of chasing every generated file.",
    quickFix: "Regenerate the bundle from the current hosted endpoint, verify endpoint availability, install dependencies cleanly, and rerun the target SDK build.",
    keywords: ["generated SDK build failed", "SDK Factory failure", "TypeScript SDK typecheck", "MCP SDK build"],
    sections: [
      {
        title: "Verify the bundle source",
        body: "SDK bundles are generated from a hosted MCP endpoint. If the endpoint changed, was deleted, or has missing metadata, the generated package can be incomplete. Pull a fresh bundle from the current server ID before editing generated code.",
      },
      {
        title: "Run the top-level verifier",
        body: "The verifier checks required docs, manifests, endpoint catalogs, examples, and target directories. Fix missing bundle artifacts before debugging language-specific compiler errors.",
      },
      {
        title: "Check target-specific dependencies",
        body: "TypeScript, Python, Go, Java, Kotlin, Ruby, C#, PHP, and CLI targets each have their own package metadata. Install dependencies from inside the generated target directory and use the target README commands.",
      },
      {
        title: "Trace schema problems back to OpenAPI",
        body: "Many SDK type errors come from ambiguous OpenAPI schemas, duplicate operation IDs, unnamed request bodies, or impossible enum unions. Fix the source spec and regenerate so the hosted endpoint, docs, and SDK stay aligned.",
      },
    ],
    faq: [
      {
        question: "Should I hand-edit generated SDK files?",
        answer: "Only for local diagnosis. Durable fixes should go into the source OpenAPI spec, Astrail endpoint metadata, or SDK generator so the next bundle does not reintroduce the failure.",
      },
      {
        question: "Why does the hosted endpoint work but the SDK fails?",
        answer: "Runtime calls can succeed with looser JSON, while SDK builds require stable names, types, package metadata, examples, and tests.",
      },
    ],
    related: ["openapi-schema-issues", "tools-call-validation-error", "private-mcp-endpoint-setup"],
  },
];

export function getTroubleshootingDoc(slug: string) {
  return troubleshootingDocs.find((doc) => doc.slug === slug);
}

export function getRelatedTroubleshootingDocs(doc: TroubleshootingDoc) {
  return doc.related
    .map((slug) => getTroubleshootingDoc(slug))
    .filter((item): item is TroubleshootingDoc => Boolean(item));
}
