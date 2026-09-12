# P1 standards and operations

## MCP OAuth resource server

Astrail is a resource server, not a token issuer. Configure an established OAuth/OIDC authorization server with `MCP_AUTHORIZATION_SERVER_ISSUER` and `MCP_RESOURCE_IDENTIFIER`; Astrail discovers its metadata and JWKS, requires exact issuer and single-resource audience matching, verifies RS256 signatures and expiry, and requires `mcp:tools` plus the configured tenant claim. This avoids hand-rolled signing and delegates key rotation to the authorization server.

Start with pre-registered confidential/public clients in that provider. Public clients must use authorization code with S256 PKCE. CIMD and DCR are deliberately disabled until a concrete interoperability requirement justifies their larger redirect and registration attack surface.

The protected-resource document is at `/.well-known/oauth-protected-resource`. Invalid MCP bearer requests return a `WWW-Authenticate: Bearer` challenge pointing to it.

## Operations

Apply `database/migrations/p1-control-plane.sql`. Runtime admission is coordinated by tenant, provider, and credential. The queue is capped at 20, waits at most five seconds with ten polls, supports cancellation, and retry budgets reset to 20/minute. Circuit state opens after five provider failures. Retry delay uses full jitter; writes remain single-attempt unless the policy opts in and a durable idempotency key is present.

Provider lifecycle templates and health checks cover GitHub, Slack, Google, and Stripe. Health checks keep tokens server-side, detect upstream rejection, compare expected/granted scopes, show refresh degradation, and create alerts. Users revoke from Connections; workspace admins may use `POST /api/credentials/:id/admin-revoke`.
