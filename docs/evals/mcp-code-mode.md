# MCP Code Mode Eval Harness

Run the local eval harness before claiming Code Mode quality or Stainless-style parity.

```bash
npm run eval:mcp
```

By default the runner starts a local Next dev server on an open high port, blanks Supabase and Anthropic environment variables for that child process, generates preview MCP servers from checked-in OpenAPI fixtures, and writes reports to:

```text
reports/evals/mcp-code-mode-latest.json
reports/evals/mcp-code-mode-latest.md
```

It also writes timestamped copies in the same directory for historical comparisons.

## What It Tests

Fixtures live in `scripts/eval-fixtures/`:

- `petstore.openapi.json`: small Petstore inventory read fixture plus the built-in public Petstore Code Mode demo.
- `helpdesk.openapi.json`: realistic support-ticket fixture backed by Postman Echo so query and body fields can be checked exactly.
- `mcp-code-mode.tasks.json`: task manifest and expected deterministic checks.

The harness covers:

- static one-tool-per-operation generation and execution
- static tool argument validation
- auth-required stops before upstream execution when credentials are missing
- dynamic catalog discovery, schema lookup, and endpoint invocation
- dynamic endpoint argument validation before invocation
- Code Mode `search_docs` plus no-eval `execute`
- Code Mode typecheck-style errors before upstream execution
- Code Mode sandbox denial for direct runtime/network access

## Metrics

- Completeness: fraction of tasks whose required checks passed.
- Efficiency/turn count: MCP JSON-RPC calls used by each task flow. Fixture generation is excluded because it is setup, not agent work.
- Unexpected error rate: failed task checks. Expected validation/typecheck failures count as passing when the structured error is exact.
- Latency: wall-clock HTTP latency observed by the harness for MCP calls.
- Deterministic exactness: exact assertions for stable fields such as SDK method names, echoed arguments, execution strategy, and error codes.

## Options

Use an already-running local server:

```bash
ASTRAIL_EVAL_BASE_URL=http://localhost:3000 npm run eval:mcp
```

Pick a starting port:

```bash
npm run eval:mcp -- --port 3300
```

Write reports somewhere else:

```bash
npm run eval:mcp -- --report-dir /tmp/astrail-evals
```

Keep the dev server alive after the run:

```bash
npm run eval:mcp -- --keep-server
```

The harness is intentionally local and demo-safe. It should not require production API keys, Supabase auth, customer credentials, or arbitrary generated-code execution.
