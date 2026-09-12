# Production Tool Governance

Astrail treats generated tools as a draft catalog, not an automatic production boundary. API owners decide which operations agents can see, what context agents receive, and which actions need human approval before any provider request runs.

## Curate the tool surface

Open a server and use **Production tool curation** under **Per-tool policy**:

1. Select **Apply safe defaults** to allow reads and drafts, approval-gate writes and sends, and hide destructive operations.
2. Turn **Expose to agents** off for tools that should not appear in `tools/list`. Hidden tools are also rejected by direct `tools/call` requests.
3. Choose `allow`, `approval`, or `block` for every exposed tool. These checks happen before credential injection and upstream execution.
4. Review the recommendation rather than treating it as a security guarantee. Provider credentials and OAuth scopes must remain least-privilege.

## Add business context

Shared business context is appended to MCP initialization instructions. Per-tool fields are appended to the tool description:

- **Business context** explains customer terminology and workflow meaning.
- **Use when** tells the agent when this operation is the right choice.
- **Do not use when** defines a decision boundary or escalation condition.
- **API edge cases** records partial-success states, ordering requirements, provider quirks, and non-obvious responses.

Never store credentials, tokens, secrets, or private customer data in these fields. Context is visible to every caller that can initialize or list the server's tools.

## Export and self-host

The Worker export includes `astrail-governance.json`, a production checklist, the curated tool catalog, and the fixed endpoint map. The standalone Worker can execute reviewed, unauthenticated HTTPS REST reads and uses bounded timeouts, response sizes, and retries.

The export fails closed when an endpoint needs provider credentials, a tool needs approval, a tool is blocked, a URL is private or local, or the mapping is incomplete. Private exports also require an `ASTRAIL_API_KEY` Worker secret. Standalone REST execution is disabled until `ASTRAIL_ALLOW_PUBLIC_REST_EXECUTION=true` and the exact endpoint origins are listed in `ASTRAIL_ALLOWED_ORIGINS`. The generated Wrangler config enables `global_fetch_strictly_public`; do not remove it or add VPC bindings without a new network-security review. Keep authenticated integrations on Astrail's hosted per-user credential runtime, or implement and review an equivalent secret store and OAuth boundary before extending the exported Worker.

## Verification

Run:

```bash
npm run smoke:production-governance
node scripts/smoke-mcp-endpoint-security.mjs
```

The governance smoke verifies exposure filtering, context delivery, policy recommendations, export contents, safe REST execution, and fail-closed sensitive actions.
