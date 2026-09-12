# Executor Parity Notes

Last updated: 2026-07-13

Executor positions itself as an open integration layer that connects agents to MCP servers, OpenAPI specs, GraphQL APIs, Google Discovery APIs, and plugin-backed toolkits across cloud, CLI, desktop, and self-hosted surfaces.

Astrail should not copy that product shape blindly. Astrail's stronger wedge is the hosted deterministic runtime: one generated MCP endpoint, endpoint-map execution, managed auth boundaries, billing limits, logs, SDK export, and no-eval Code Mode. Parity work should pull in the useful source coverage from Executor while keeping Astrail's runtime stricter.

## Built Now

- OpenAPI and Swagger URL/raw import.
- Swagger UI, Redoc, and docs-page discovery.
- Google Discovery REST document import, including common Discovery parameters, schemas, OAuth scopes, and API-key security.
- GraphQL introspection JSON import, including query/mutation endpoint maps and variable-only tool inputs.
- Live GraphQL introspection and GraphQL SDL import with deterministic query/mutation endpoint maps.
- Existing streamable-HTTP/SSE MCP endpoint import with initialize/session negotiation, authenticated catalog inspection, encrypted credential persistence, and private hosted proxy execution.
- Static tools, dynamic catalog tools, and Code Mode.
- Hosted MCP endpoint with endpoint-map execution.
- Generator safety presets for hosted runtime policy: guarded, read-only, and open.
- Per-tool allow/approval/block policies, dashboard approvals, atomic one-time resume, and identical enforcement in unified bundle catalogs.
- Encrypted bearer, API-key, and refreshable OAuth credentials. Multiple credentials can be attached to a server without returning secrets to the browser.
- Dependency-free CLI for status, tool listing/search/description, calls, approval resume, client config, and an HTTP-to-stdio MCP bridge.
- Docker/Compose self-host packaging, health checks, and an installable standalone desktop web manifest.
- SDK export and first-party TypeScript/Python clients with timeout, custom headers, environment API-key fallback, and structured errors.

## Intentional Differences And Remaining Expansion

- Astrail does not execute generated or user-supplied JavaScript. Code Mode compiles a constrained SDK-shaped language into mapped calls.
- The desktop surface is an installable web app instead of a separately privileged Electron process.
- Local MCP clients get a stdio bridge through `astrail mcp`; hosted Astrail never launches arbitrary user binaries or ingests arbitrary native stdio processes.
- Organization-wide connection sharing and provider-specific interactive OAuth authorization screens remain product expansion areas; the runtime token vault, refresh, tenant ownership checks, and least-privilege scope storage are built.

## Product Rule

Only claim a source type as supported when it can generate a real endpoint map and pass local generation smoke tests. Roadmap items can be named, but they should not appear as completed capabilities in public copy.
