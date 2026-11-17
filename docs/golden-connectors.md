# Golden connectors

Astrail's first production-depth connector set is GitHub, Linear, Notion, Slack, Stripe, Google Drive, and Gmail. These connectors receive stricter contract tests than the long-tail catalog.

## Install from the CLI

```bash
astrail login --endpoint https://www.astrail.dev/api/mcp/YOUR_SERVER_ID --api-key "$ASTRAIL_API_KEY"
astrail connectors list
astrail connectors install preset-github
```

`connectors install` authenticates to Astrail, clones the connector into the caller's account, saves its hosted MCP endpoint as the active CLI endpoint, and prints the provider credential step. It does not collect provider secrets on the command line.

After attaching the provider credential in the dashboard:

```bash
astrail tools list
astrail call github_list_issues --args '{"owner":"codingFreak-Adisin","repo":"astrail-launch-demo","state":"open"}'
```

Start with a read tool. Write, send, and destructive actions remain subject to the connector policy and approval flow.

## What is verified automatically

The connector smoke suite checks:

- every tool has exactly one deterministic HTTPS endpoint mapping;
- private connectors fail closed without a credential;
- required arguments build valid requests without unresolved URL templates;
- static headers never contain secrets;
- write and send operations retain approval policies;
- the seven golden connectors meet minimum useful-operation counts;
- current GitHub and Notion API versions and Notion data-source paths are pinned;
- Slack `ok: false` and Linear GraphQL `errors` are execution failures even when HTTP status is 200.

## What requires provider credentials

Contract tests cannot prove that a customer's provider account granted the requested resources and scopes. Before calling a connector production-ready for a provider account, run this credentialed acceptance flow:

1. Connect a least-privilege test account.
2. Run every read tool against known fixture data.
3. Run every write/send tool through an approval using disposable fixture data.
4. Exercise one invalid argument, insufficient-scope response, expired/revoked credential, provider rate limit, and pagination cursor.
5. Revoke the connection and confirm the next call fails closed.

Record the provider account, granted scopes, connector generation, date, tool results, and trace IDs. Never store the raw token in the report.

## Connector-specific notes

- GitHub uses REST version `2026-03-10`; use a fine-grained token restricted to test repositories.
- Linear's preset expects an OAuth Bearer token. A personal API key has a different header format and is intentionally not advertised as compatible.
- Notion uses API version `2026-03-11` and the current data-source query API. Share only the fixture pages/data sources with the integration.
- Slack message search requires a user token with `search:read`; posting requires channel membership and `chat:write`.
- Stripe is read-only and should use a restricted test-mode key.
- Google Drive separates read-only scopes from permission/copy scopes.
- Gmail separates read-only access from draft creation; the golden connector does not send mail.
