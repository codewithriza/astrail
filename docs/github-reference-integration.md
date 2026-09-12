# GitHub reference integration: five-minute walkthrough

## Configure once

Create a GitHub OAuth App whose callback is `https://YOUR_ASTRAIL_HOST/api/oauth/callback`, then set these server-only variables:

```sh
GITHUB_TOOL_OAUTH_CLIENT_ID=...
GITHUB_TOOL_OAUTH_CLIENT_SECRET=...
AUDIT_EXPORT_SIGNING_KEY=at-least-32-random-bytes
```

Apply `neon-migration-composable-auth-lifecycle.sql` and `neon-migration-audit-evidence-github-reference.sql`.

## Walkthrough

1. Open `/dashboard/reference-integrations/github`, enter the stable end-user ID and agent ID, then click **Create and connect GitHub**.
2. Copy the one-time Astrail API key and 15-minute task token. Open **Continue to GitHub consent** and approve `public_repo` for a dedicated public demo repository.
3. Call a generated list/get tool with the MCP endpoint, `Authorization: Bearer ...`, and `X-Astrail-Task-Authorization: ...`. The read executes immediately.
4. Call `createIssue`, `updateIssue`, `sendIssueComment`, or `addLabelsToIssue`. The exact call pauses with `human_approval_required`. Approve it with an optional reason in `/dashboard/approvals`, then resume using the same agent key and task token.
5. Inspect `/dashboard/audit`: purpose, agent/task, redacted arguments, affected GitHub resource, effective `public_repo` scope, policy decision, credential reference, approval actor/reason/claim, attempts, provider result, trace, sequence, and evidence hash appear together. Export JSON to receive the signed integrity manifest. Open `/dashboard/authorization` to inspect refresh generations. Revoke from `/dashboard/connections` to confirm subsequent calls fail closed.

The agent/model receives neither the GitHub client secret nor provider access/refresh tokens. GitHub credentials are exchanged and injected only inside Astrail’s hosted runtime.

## CI verification

```sh
npm run smoke:launch-demo
npm run smoke:audit-github
npm run smoke:composable-auth
```

The deterministic provider test covers immediate reads, an approval-gated write contract, one 429 followed by success, expired-token refresh where GitHub omits a replacement refresh token, provider revocation, signed export tamper detection, append-only enforcement, and legal-hold-aware retention.
