# Contributing to Astrail

Start with `npm ci` on Node.js 22.18 or newer, then `npm run demo:offline`. The offline example is the shortest way to understand the generator without provisioning services.

## Pick a focused change

For bugs, include a minimal spec or request, expected behavior, actual behavior, and the commit you tested. Replace real tokens, user data, and provider URLs with fixtures. For new features, explain the workflow and discuss the interface before building a large change.

Keep pull requests focused. Explain the problem, resulting behavior, and how you verified it. Generated or AI-assisted code is welcome when the author can explain it and has reviewed and tested it. Avoid unrelated rewrites, speculative abstractions, and claims unsupported by runnable examples.

## Before opening a pull request

```bash
npm run check
```

`npm test` runs unit regressions and core smoke tests. `npm run verify:repo` checks versions, tracked environment files, script references, and local documentation links. CI also checks the CLI on Linux and Windows and builds the Docker image.

Run additional checks for the area you changed:

| Area | Checks |
| --- | --- |
| Python SDK | `python3 -m unittest discover -s tests/python -v` |
| Runtime / authorization / network policy | `node scripts/smoke-mcp-endpoint-security.mjs` |
| OAuth and credentials | `npm run smoke:oauth` and `npm run smoke:oauth-revocation` |
| Mappings, retries, permissions | `npm run smoke:integration-hardening` |
| Webhooks, drift, execution policy | `npm run smoke:integration-operations` |
| Code Mode | `npm run smoke:code-mode` and `npm run eval:mcp` |
| Search and visibility | `npm run smoke:search-docs` |
| UI | Relevant Playwright checks from `docs/ui-testing.md` |

Tests requiring a configured backend should use a disposable environment you own. Document checks you could not run. Do not weaken an assertion simply to get CI green.

## Code organization

Use the root application tree. Put import and generation logic in `lib/`, runtime behavior in `lib/runtime/`, route adapters in `app/api/`, and small reproducible examples in `examples/`. Preserve the security invariants in `AGENTS.md`.

Do not commit credentials, database dumps, browser session data, or production logs. Schema changes need an explicit migration and rollout notes. Tool behavior changes need a fixture that distinguishes the old and new behavior.

## Review and releases

Maintainers review public API and security changes before merging. A green build is required for release. Package publishing and production deployment are separate operator actions, not side effects of contributor CI. Contributions are accepted under the repository's MIT license.

Be respectful, specific, and patient in reviews. Report sensitive vulnerabilities through the process in `SECURITY.md`.
