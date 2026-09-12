# Architecture

Astrail is a Next.js application with a shared TypeScript generation and runtime layer.

```text
OpenAPI / docs / imported MCP
            |
     spec-input + openapi
            |
     generation-pipeline
            |
  tool schemas + endpoint maps
            |
   app/api/mcp/[serverId]
            |
 auth → policy → credentials → execution → trace
            |
       upstream provider
```

`lib/generation-pipeline.ts` coordinates discovery, normalization, endpoint selection, tool generation, and validation. `lib/generate-mcp.ts` supports deterministic generation and optional model assistance. The offline example selects the deterministic path.

`app/api/mcp/` exposes the protocol routes. Runtime helpers in `lib/runtime/` apply network restrictions, permission checks, OAuth metadata, and execution policies. Hosted execution follows endpoint maps; generated source is an export artifact and is not evaluated in the application process.

`lib/neon/` handles the current hosted persistence and authentication integration. `database/schema.sql` defines the schema; `database/migrations/` holds incremental migrations. Smoke-test compiler configurations live in `config/typescript/`. `lib/billing/` contains hosted plan and usage behavior; billing is still coupled to parts of the application.

`app/dashboard/` and `components/` contain the user interface. `bin/astrail.mjs` provides the CLI and stdio bridge. `sdk/` and export helpers provide client artifacts. `scripts/smoke-*` contain focused checks; `tests/` contains browser tests.

The root tree is canonical. The obsolete `apps/agentgateway` copy was excluded from the application build and has been removed from this edition. Add functionality once, with a test at the relevant boundary.

See `AGENTS.md` for security invariants and change-specific validation commands.
