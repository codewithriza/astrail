# Astrail

**Turn OpenAPI specs into MCP tools with explicit execution policies.**

[![CI](https://github.com/codewithriza/astrail/actions/workflows/cloud-qa.yml/badge.svg)](https://github.com/codewithriza/astrail/actions/workflows/cloud-qa.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Astrail imports API definitions, generates typed agent tools, and maps tool calls to HTTP endpoints. Its hosted runtime adds credentials, OAuth, approvals, and execution traces. Generated JavaScript is never evaluated by the hosted runtime.

## Try it without credentials

Requires **Node.js 22+** and npm. No database, model API key, or account is needed for this example.

```bash
git clone https://github.com/codewithriza/astrail.git
cd astrail
npm ci
npm run demo:offline
```

The example runs the real generation pipeline against a small [Notes API spec](examples/openapi-to-tools/openapi.json):

```text
notes_list_notes    allow
notes_create_note   approval
notes_delete_note   block
```

It validates the generated tools and their policies, with network access disabled. It generates tools; it does not execute the fictional Notes API. Read the [example](examples/openapi-to-tools/README.md), change the spec, and inspect the result.

## What is here

- **API import:** OpenAPI/Swagger, Google Discovery, GraphQL, and existing HTTP MCP servers.
- **Tool generation:** static tools, searchable endpoint catalogs, and a constrained Code Mode.
- **Runtime controls:** server authentication, encrypted credentials, OAuth scopes, request validation, network policy, approvals, bounded retries, and traces.
- **Developer interfaces:** a Next.js dashboard, CLI, SDK exports, and manual Cloudflare Worker exports.

The root `app/` and `lib/` directories are the single application source. This edition removes the divergent legacy application copy and private planning material. See [provenance](NOTICE) and the [architecture guide](docs/ARCHITECTURE.md).

## Run the dashboard

```bash
cp .env.local.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). The local environment example enables development-only demo auth. This preview does not replace a persistent backend. For stored servers, real users, and provider credentials, configure [Neon](docs/NEON_BACKEND.md) and [authentication](docs/neon-auth-setup.md), apply the schema, and follow the [platform setup guide](docs/PLATFORM_GUIDE.md#local-setup).

AI-assisted generation is optional. Deterministic generation works without `ANTHROPIC_API_KEY`. Hosted operation currently depends on Neon Auth/Data API; this is not yet a database-independent, one-command deployment.

## Connect to an endpoint

After creating a server in your own deployment:

```bash
export ASTRAIL_MCP_ENDPOINT='https://YOUR_HOST/api/mcp/YOUR_SERVER_ID'
export ASTRAIL_API_KEY='YOUR_API_KEY'
node bin/astrail.mjs status
node bin/astrail.mjs tools list
```

Use `node bin/astrail.mjs help` for calls, connector discovery, and the stdio bridge. Public package releases are not yet available; run the CLI from this checkout.

## Development

```bash
npm run test:core     # offline generation, schema, CLI, and billing checks
npm run check         # lint, types, core checks, and production build
```

CI also runs runtime security, OAuth, integration, export, and UI smoke checks. Changes to those areas require their corresponding tests; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Current boundaries

Astrail is an early project. Website automation is limited to public read workflows. Code Mode statically compiles supported calls; it cannot execute arbitrary JavaScript. Worker export has a narrower feature set than the hosted runtime. Multi-region deployments need distributed limits and external edge protection. Provider OAuth applications and scopes require operator configuration.

Do not treat tool descriptions or approval metadata alone as an authorization boundary. Read the [threat model](SECURITY_THREAT_MODEL.md), [security policy](SECURITY.md), and [runtime permissions](docs/runtime-permissions.md) before exposing a deployment.

## Contribute

Useful starting points are reproducible importer bugs, minimal OpenAPI fixtures, clearer setup instructions, and tests for provider edge cases. Start with the [contribution guide](CONTRIBUTING.md) and [roadmap](ROADMAP.md). Open a discussion before a large architectural change.

- [Report a bug](https://github.com/codewithriza/astrail/issues/new?template=bug_report.yml)
- [Propose an improvement](https://github.com/codewithriza/astrail/issues/new?template=feature_request.yml)
- [Browse technical documentation](docs/README.md)

## License

[MIT](LICENSE). Dependencies retain their own licenses. Astrail names and logos are not covered by a trademark grant.
