# Dependency Security

Astrail treats package updates, generated SDK bundles, and exported containers as supply-chain surfaces.

## Reproducible Installs

- Use `npm ci` in CI and release checks.
- Commit `package-lock.json` changes with the dependency change that produced them.
- Do not hand-edit lockfiles except to resolve merge conflicts.
- Do not use generated SDK bundle dependencies as proof that the app dependency tree is safe; generated packages have their own package metadata and publish gates.

## Audit Gate

Cloud QA runs:

```bash
npm run audit:prod
```

That command maps to:

```bash
npm audit --omit=dev --audit-level=moderate
```

The gate checks production dependencies at moderate severity and above. Review development advisories and low-severity findings during dependency updates.

## Dependency Updates

Dependabot opens weekly grouped minor/patch PRs for:

- root npm dependencies
- GitHub Actions

Do not blindly major-upgrade. Major dependency updates should include a short risk note, relevant smoke tests, and rollback expectations.

## Generated SDK and MCP Bundles

Generated bundle artifacts must stay publish-safe:

- No real secrets in generated docs, examples, manifests, Dockerfiles, or workflows.
- Private endpoint snippets must include `ASTRAIL_API_KEY` placeholders rather than encouraging unauthenticated access.
- Publish workflows must require explicit target inputs and `confirm_publish=publish`.
- Package-manager tokens must be read from GitHub Actions secrets at publish time only.
- MCPB and deeplink docs are placeholders until a target client schema is confirmed.

## Container Templates

Generated Docker templates should:

- run as a non-root user
- avoid baking secrets into layers
- expose only the MCP proxy port needed by the generated runtime
- include a healthcheck when practical
- accept credentials through runtime environment variables or a platform secret manager

The generated Docker runtime proxy forwards JSON-RPC requests to hosted Astrail MCP. It is not a standalone execution runtime.

## Review Checklist

Before merging supply-chain changes:

1. Run `npm ci` or confirm CI will use it.
2. Run `npm run audit:prod`.
3. Run `npm run lint`.
4. Run `npx tsc --noEmit --pretty false`.
5. Run `npm run smoke:sdk-edge`.
6. Run `npm run build`.
