# Astrail Competitive Moat

Last updated: 2026-07-14

YC's rejection reason was not "bad product." It was "too early, no users, crowded space." The response is to make Astrail impossible to dismiss in a live developer trial:

1. Generate a useful MCP endpoint from real API docs in under five minutes.
2. Prove the endpoint is cheaper to run than connector platforms.
3. Prove the endpoint is safer and more debuggable than raw generated code.
4. Show a concrete feature competitors do not bundle together: Code Mode, dynamic catalogs, hosted runtime, deterministic no-eval execution, SDK Factory, Worker export, website/workflow fallback, logs, policy manifests, eval artifacts, and agent-readiness diagnostics.

## Competitor Map

| Competitor | What they are strong at | What Astrail must match | Where Astrail can beat them |
| --- | --- | --- | --- |
| Stainless | Excellent OpenAPI-to-MCP story, SDK Code Mode, docs search + execute, token-efficient two-tool architecture. | `search_docs` + `execute`, SDK-shaped method docs, batch calls, client-specific schema compatibility, Cloudflare/remote deploy path, owned SDK output. | No SDK lock-in; hosted endpoint immediately; deterministic endpoint-map execution; static tools, dynamic catalog, Code Mode, and SDK Factory in one product; website/workflow fallback when there is no clean OpenAPI spec. |
| Speakeasy / Gram | OpenAPI generation, Cloudflare-ready output, Desktop Extension support, tool scoping, gateway positioning. | OpenAPI generation quality, operation scoping, Worker export, production docs. | Hosted runtime and execution logs from day one; no-eval execution; cheaper self-serve hosted endpoints for long-tail APIs; agent-readiness score before a user ships. |
| Composio | Huge managed integration catalog, auth, usage-based pricing, broad agent-tool positioning. | Managed auth, logs, reliable tool execution, simple pricing, developer onboarding. | Long-tail custom API generation instead of only prebuilt app connectors; bring any customer API docs URL; cheaper for teams that need private/customer-specific APIs; exportable runtime. |
| Executor | Open-source agent integration layer across MCP servers, OpenAPI, GraphQL, Google Discovery, local CLI, desktop, cloud, and self-hosted surfaces. | Multi-source import, one catalog, auth connections, policy hints, SDK/CLI ergonomics, and local/self-hosted options. | Hosted endpoint maps and billing-ready runtime are already first-class; Google Discovery and GraphQL introspection imports now convert into the same deterministic execution path; next gaps are MCP-server ingestion, richer policy approval UX, and local CLI/desktop packaging. |
| Arcade | Enterprise MCP runtime, auth, policy, audit, governance, deploy-anywhere story. | Per-user auth roadmap, audit logs, policy controls, secure runtime docs. | Faster bottom-up developer trial; API-to-MCP generation plus runtime in one flow; no enterprise sales call needed for the first proof. |
| Pipedream Connect | 3,000+ APIs, 10,000+ tools, hosted MCP, user auth, mature integration platform. | User credential isolation, app-auth UX, connector breadth where needed. | OpenAPI/custom API generation, not only catalog integrations; deterministic endpoint maps; cost and latency transparency per endpoint. |
| Zapier MCP | 9,000+ app connections, 30,000+ actions, governance, audit logs, no-code install. | Action toggles, audit story, broad client compatibility. | Developer-first custom API and internal-tool path; code-mode and dynamic API docs; lower-cost tool calls for generated custom endpoints. |

## Claims We Can Make Now

These are safe to say after the current implementation.

- "Astrail turns OpenAPI/docs into a hosted MCP endpoint with `search_docs` and `execute`."
- "Astrail supports three loading modes: static tools, dynamic endpoint catalogs, and Code Mode."
- "Astrail does not eval arbitrary generated TypeScript in hosted execution. SDK-shaped calls compile to endpoint-map execution."
- "Astrail can run independent read calls in parallel in Code Mode."
- "Astrail returns typecheck-style errors before unknown SDK methods touch an upstream API."
- "Astrail exposes runtime logs, trace IDs, auth-required states, and Worker export."
- "Astrail handles hosted OAuth consent and refresh, customer field mappings, bounded retries, idempotent webhooks, action permissions, schema drift, audit export, and integration-cost tracking."
- "Astrail exports owned multi-language SDK bundles with docs, install manifests, policy manifests, diagnostics, eval artifacts, smoke tests, and GitHub Actions update PR workflows."
- "Astrail is better for long-tail custom APIs and customer-specific internal APIs than connector catalogs."

## Claims We Should Not Make Yet

These need evidence or implementation before public use.

- "X times more accurate than Stainless." Needs benchmark harness with shared tasks and success criteria.
- "Y times cheaper than Composio." Safe only when citing the Dodo-backed Builder/Team call math below, not broad total-cost claims.
- "Organization-wide enterprise governance." Per-user OAuth, action policies, approvals, and audit export are built; workspace RBAC and SSO still need an organization model.
- "Production browser automation." Website-to-MCP is still alpha for public reads and candidate workflows.
- "Full arbitrary SDK Code Mode." Hosted execution is intentionally no-eval and supports compiled SDK-shaped calls, not arbitrary JS runtime semantics.

## Pricing Reality

Current in-repo Astrail pricing:

| Plan | Price | Monthly credits | Tool calls | Hosted endpoints |
| --- | ---: | ---: | ---: | ---: |
| Free | $0 | 500 | 50/mo | 3 |
| Launch | $19/mo | 25,000 | 20,000/mo | 10 |
| Scale | $99/mo | 250,000 | 200,000/mo | 100 |

Composio's public pricing as of 2026-06-12 lists:

| Plan | Price | Tool calls | Effective call price |
| --- | ---: | ---: | ---: |
| Free | $0 | 20,000/mo | Free trial |
| $29 tier | $29/mo | 200,000/mo | $0.145 / 1k |
| $229 tier | $229/mo | 2,000,000/mo | $0.1145 / 1k |

The competitor table above is a dated research snapshot and must be re-verified before publishing. Astrail should lead with hosted auth, per-user isolation, policy enforcement, logs, and owned exports rather than a raw per-call price claim:

| Plan | Price | Tool calls | Effective call price | Claim |
| --- | ---: | ---: | ---: | --- |
| Free | $0 | 50/mo | Proof tier | Validate one small integration with up to 3 hosted endpoints. |
| Launch | $19/mo | 20,000/mo | $0.95 / 1k | Production auth, logs, exports, and up to 10 hosted endpoints. |
| Scale | $99/mo | 200,000/mo | $0.495 / 1k | Customer-facing runtime capacity with up to 100 hosted endpoints. |

The business model is anchored in generation, auth, governance, and support rather than raw call metering. Paid expansion comes from endpoint capacity, team controls, private runtime, and workflow mapping.

## Feature Parity Checklist

| Capability | Status | Next step |
| --- | --- | --- |
| OpenAPI URL and raw JSON/YAML generation | Built | Improve discovery coverage and error hints. |
| Swagger UI / Redoc discovery | Built | Add more fixtures and smoke tests. |
| Google Discovery REST document import | Built | Add live fixtures for Calendar, Drive, Sheets, and Admin APIs. |
| GraphQL introspection JSON import | Built | Add live endpoint introspection, SDL parsing, and richer selection-set controls. |
| Static one-tool-per-operation generation | Built | Add better response schemas and examples. |
| Dynamic catalog tools | Built | Add pagination and exact endpoint ranking. |
| Code Mode `search_docs` + `execute` | Built | Add benchmark suite and richer docs ranking. |
| No-eval deterministic hosted execution | Built | Add argument schema validation beyond required fields. |
| Parallel read execution and partial-failure isolation | Built | Keep batch limits and retry defaults under eval coverage. |
| Client presets for Claude, Claude Code, Cursor, OpenAI | Built | Add compatibility tests with real schemas. |
| Multi-language SDK Factory export | Built | Add deeper typed model generation per language after review gates. |
| SDK update PR workflow and hosted schema watch | Built | Add notification delivery integrations after design-partner feedback. |
| SDK publish workflow template | Built | Connect first-party package registry credentials after user review. |
| MCP install manifests | Built | Add signed one-click installers after packaging format stabilizes. |
| Docs export, `llms.txt`, and docs search index | Built | Add hosted docs site generation after SDK bundle flow is stable. |
| Decorated OpenAPI with `x-codeSamples` | Built | Add full original-spec preservation when source spec is persisted. |
| Policy manifest for read/write/destructive tools | Built | Generator safety presets now persist runtime policy; add per-endpoint toggles and approval-required flow. |
| Generated eval task artifacts | Built | Add hosted benchmark UI and competitor comparison reports. |
| Cloudflare Worker export | Built | Add one-click deploy later; current manual export is fine. |
| Runtime logs, trace IDs, export, filters, and retention cleanup | Built | Add organization-level retention enforcement with workspace RBAC. |
| API-key protected private endpoints and per-user OAuth | Built | Expand provider presets from validated customer demand. |
| Customer field mapping and enum transforms | Built | Add mapping suggestions without bypassing review. |
| Retry/backoff and write idempotency policies | Built | Tune provider-specific defaults from production traces. |
| Signed idempotent webhook ingestion | Built | Add downstream event routing after event-storage validation. |
| Integration cost measurement | Built | Add aggregate workspace views after team workspaces exist. |
| Billing limits | Built | Dodo checkout, webhooks, and low-spend plan math are wired; add credit-pack ledger later. |
| Website-to-MCP fallback | Alpha | Position as FDE/workflow mapping, not production automation. |
| GraphQL schema URL and SDL import | Partial | Introspection JSON import is built; add live URL introspection, SDL parsing, and query/mutation policy defaults. |
| Existing MCP server ingestion | Partial | Streamable-HTTP MCP import/proxy is built; add stdio bridges, sessionful transports, upstream auth, and per-user credentials. |
| Local CLI, desktop, and self-host packaging | Missing | Ship after hosted generation paths have parity tests and policy manifests. |
| Agent readiness scoring | Built | Surface in generation success state and public demo flow. |
| Benchmarks | Partial | Generated bundles include eval tasks and a runner; next is hosted accuracy/token/cost benchmarking. |
| Per-user action governance | Built | Read/draft/write/send/destructive controls, per-tool allow/approval/block, and one-time approval resume are live. |
| Organization governance | Partial | Add workspace membership, RBAC, and SSO. |

## Wedge

Do not compete head-on with Zapier/Pipedream on app count. That is their home field.

Compete on:

- customer-specific APIs
- internal APIs
- APIs with docs but no MCP server
- founder/AI engineer needs an endpoint today
- agencies/FDEs mapping weird workflows into reliable agent tools
- teams that want hosted now and export later

The line:

> "Connector catalogs cover the popular apps. Astrail covers the weird long tail: your customer API, your internal system, your partner portal, your docs page, your workflow."

## Goated Features To Build

These are features that create real product distance, not landing-page noise.

1. Benchmark button
   - After generation, run 10 generated tasks against the endpoint.
   - Output accuracy, latency, token footprint, calls made, failed args, and estimated cost.
   - This gives the "X better" proof YC wanted.

2. Agent readiness report
   - Score: docs quality, auth risk, destructive actions, schema complexity, executable reads, missing base URL, response shape.
   - Show "ready for Claude/Cursor/Codex" with concrete fixes.

3. Policy compiler
   - Convert endpoint metadata into policies: read-only, require confirmation for writes, block destructive actions, allow only tagged resources, rate caps.
   - This turns endpoint maps into governance.

4. Long-tail API concierge flow
   - User pastes docs URL.
   - Astrail discovers OpenAPI or asks for missing info.
   - If no spec exists, it generates a "workflow request" for FDE review instead of pretending.

5. Reproducible eval export
   - Export benchmark JSON and curl commands.
   - Let users show their team: "Astrail generated this, here are the traces."

6. Cost simulator
   - Show current endpoint call volume at Astrail price vs Composio/Zapier task pricing vs self-hosted Worker.
   - This is where the cheaper claim becomes concrete.

7. One-click customer demo endpoint
   - Public disposable endpoint with seeded Petstore/Stripe/GitHub demo.
   - Demo must work without signup and include `search_docs`, `execute`, logs, and export.

8. Credential sandbox
   - Connect a test API key, run generated tools against a sandbox, never expose tokens to the model.
   - This is table stakes for enterprise trust.

## Next Build Sequence

Ship in this order:

1. Add table-backed Dodo credit packs after subscriptions are live.
2. Add benchmark harness for generated MCP endpoints.
3. Surface Agent Readiness in the generation result page.
4. Tune the built read/write/destructive policy controls from production traces.
5. Add cost simulator to generated server detail.
6. Improve Code Mode docs ranking and schema validation.
7. Add public "try it" demo with generated traces.
8. Start user interviews with API-heavy startups and agencies, not generic MCP users.

## Interview Response

If YC asks again, the answer should be:

> "When we interviewed, Astrail was a week-old MVP. Since then we turned it into a measurable product. Developers can paste API docs, get a hosted MCP endpoint, run `search_docs` and no-eval `execute`, see traces, export a Worker, and benchmark accuracy/cost. Connector platforms win on popular SaaS apps; Astrail wins on custom and internal APIs. We priced the wedge below connector platforms and use governance/workflow mapping as expansion."
