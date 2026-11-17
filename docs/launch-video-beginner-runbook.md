# Astrail launch video: beginner runbook

This is the recommended launch story. Rehearse it once without recording, reset the GitHub issue, and then record it in one continuous narrative with cuts only for secret entry and OAuth loading.

## What the viewer should understand

By the end, the viewer should understand one sentence:

> Codex can write an integration. Astrail turns it into a persistent, per-user, governed production action with OAuth, approvals, and evidence.

Do not try to demonstrate every dashboard page. The story is: **generate → connect → use → approve → audit**.

## Before you begin

### 1. Production configuration

Run:

```bash
npm run verify:env
npm run verify:schema
npm run audit:prod
npm run build
```

Do not record until `verify:env` reports ready. In particular, production needs credential encryption, billing variables, distributed rate limiting, Turnstile, and edge/WAF configuration. Never show any secret value in the video.

### 2. GitHub OAuth application

1. Open GitHub Settings.
2. Open **Developer settings → OAuth Apps → New OAuth App**.
3. Name it `Astrail Launch Demo`.
4. Homepage: your deployed Astrail URL.
5. Callback: `https://YOUR_ASTRAIL_HOST/api/oauth/callback`.
6. Put its client ID and secret in `GITHUB_TOOL_OAUTH_CLIENT_ID` and `GITHUB_TOOL_OAUTH_CLIENT_SECRET` on the Astrail deployment.
7. Redeploy. Do not show the secret-entry screen.

### 3. Demo repository

Use only `codingFreak-Adisin/astrail-launch-demo`. Confirm before recording:

- issue #1 is open;
- labels `bug`, `customer`, and `priority` exist;
- the test comment is absent;
- no real customer or secret data is present.

### 4. Recording setup

Open these before recording:

1. Astrail dashboard.
2. GitHub issue #1.
3. A terminal with a large readable font.
4. `/dashboard/approvals` in a background tab.
5. `/dashboard/audit` in a background tab.

Hide bookmarks, notifications, environment files, password-manager windows, tokens, and browser extensions that display private information.

## Rehearsal: learn the product first

### Step 1: generate an MCP server

1. Sign in to Astrail.
2. Open **Integrations → Generate from API**, or visit `/dashboard/generate`.
3. Select the preset **GitHub Issues production demo**.
4. Choose **Guarded** safety.
5. Choose **Static tools** for the clearest demo.
6. Click **Inspect endpoints**.
7. Confirm Astrail finds seven Issue operations.
8. Generate the server.

Explain it simply: Astrail read an OpenAPI contract, created typed tools, bound them to exact GitHub URLs, marked reads safe, made writes approval-required, and hid destructive deletion.

### Step 2: inspect the generated server

On the server page show:

- the hosted MCP URL;
- seven generated tools;
- `listRepositoryIssues` and `getIssue` as reads;
- `createIssue`, `updateIssue`, `sendIssueComment`, and `addLabelsToIssue` as approval-gated actions;
- `deleteIssueComment` as blocked/hidden;
- OAuth scope `public_repo`;
- endpoint diagnostics and deterministic mappings.

Do not spend time reading generated code. The runtime and policy boundary are the product.

### Step 3: create the locked reference integration

1. Visit `/dashboard/reference-integrations/github`.
2. End-user ID: `launch_demo_user`.
3. Trusted agent ID: `github-issues-agent`.
4. Click **Create and connect GitHub**.
5. Copy the one-time Astrail API key, task token, and MCP endpoint into a temporary password-manager note.
6. Click **Continue to GitHub consent**.
7. Review the requested repository permission and authorize.

The three identities are different:

- GitHub OAuth proves which GitHub user Astrail may act for.
- The Astrail API key proves which agent may access the private MCP endpoint.
- The short-lived task token restricts that agent to this task.

### Step 4: connect the CLI

In a fresh terminal, enter the values off-camera:

```bash
export ASTRAIL_MCP_ENDPOINT='YOUR_MCP_ENDPOINT'
export ASTRAIL_API_KEY='YOUR_ONE_TIME_ASTRAIL_KEY'
export ASTRAIL_TASK_AUTHORIZATION='YOUR_15_MINUTE_TASK_TOKEN'
```

Then, on camera:

```bash
astrail status
astrail tools list
```

`status` proves the private endpoint is reachable. `tools list` proves the client sees only the reviewed tool surface.

### Step 5: perform a safe read

Using an MCP-capable agent, ask:

```text
Read issue #1 in codingFreak-Adisin/astrail-launch-demo. Summarize it. Do not write, label, close, or comment on anything.
```

Alternatively call the CLI directly using the exact name shown by `tools list`:

```bash
astrail call getIssue --args '{"issue_number":1}'
```

Open **Activity/Audit** and show:

- successful read;
- tool and provider;
- agent and end-user identity;
- trace ID and latency;
- OAuth credential reference;
- redacted arguments;
- no access token or client secret.

### Step 6: demonstrate human approval

Ask the agent:

```text
Draft this comment for issue #1, but do not publish it:
"Thanks, I reproduced this and added it to the launch checklist."
```

After it shows the draft, say:

```text
Publish that exact comment to issue #1.
```

The call should return `approval_required` and an execution ID. Immediately show GitHub: the comment is not there.

Then:

1. Open **Approvals**.
2. Inspect the destination, tool, redacted inputs, agent and action level.
3. Approve it with reason `Launch demo: exact comment reviewed`.
4. Resume the same execution:

```bash
astrail resume EXECUTION_ID
```

5. Refresh GitHub and show the comment exactly once.
6. Return to Audit and show the approval actor, reason, provider result and trace.

This is the strongest part of the demo: the model requested an action, but Astrail—not the prompt—enforced the boundary.

### Step 7: show connector installation

Use a separate disposable connector or perform this before the GitHub reference setup:

```bash
astrail connectors list
astrail connectors describe preset-notion
astrail connectors install preset-notion
```

Explain that install now clones a real hosted connector and makes its MCP endpoint active. Provider credentials are still connected through Astrail so they do not enter shell history or the model context.

If you do not have a disposable Notion account ready, show `describe` but do not claim the upstream connection was tested live.

### Step 8: revoke access

1. Open **Connections**.
2. Locate `launch_demo_user`'s GitHub connection.
3. Revoke it.
4. Repeat the read call.
5. Show that Astrail returns reconnect/auth-required instead of silently using a stale token.

This proves the connection has a lifecycle, not merely a token pasted into generated code.

## Recommended three-minute recording

### 0:00–0:15 — Problem and promise

Say:

> Coding agents can generate API wrappers. Production agents still need user OAuth, policy, approvals, revocation and audit evidence. Astrail adds that operating layer.

### 0:15–0:45 — Generate

Select the GitHub preset, inspect seven operations, generate, and briefly show reads versus approval-gated writes and blocked deletion.

### 0:45–1:10 — Connect

Show the reference setup result, cut across secrets, show GitHub consent, then run `astrail status` and `astrail tools list`.

### 1:10–1:35 — Read

Read issue #1 and show its successful trace with identity and credential attribution.

### 1:35–2:25 — Governed write

Request the exact comment, show `approval_required`, prove GitHub is unchanged, approve, resume, and show the new comment.

### 2:25–2:45 — Audit and revoke

Show the linked approval/provider evidence, then briefly show that connections can be revoked.

### 2:45–3:00 — Closing

Say:

> Codex can write the integration. Astrail operates it safely for every user of your product—from API contract to OAuth, approval, execution and evidence.

## What not to show or claim

- Do not call all 34 connectors production-verified; seven are the golden contract-tested set and live acceptance still depends on provider credentials.
- Do not claim enterprise-grade or 100% uptime without operational evidence.
- Do not show Website-to-MCP as production browser automation.
- Do not enter credentials on screen.
- Do not demonstrate billing, x402, SCIM, SDK Factory, bundles and website automation in the same launch video.
- Do not say Astrail replaces Codex or Claude. Astrail operates the tools they use.

## Cleanup

1. Delete the demo comment if you want to reset the repository.
2. Revoke the temporary GitHub connection.
3. Delete temporary Astrail API keys and task grants.
4. Close the terminal so exported variables disappear.
5. Review the recording frame-by-frame for secrets before publishing.
