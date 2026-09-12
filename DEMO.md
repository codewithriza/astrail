# Astrail Demo Script

This script verifies the current demo path for Astrail as a hosted MCP gateway runtime.

## 1. Apply Neon Migrations

Connect to the Neon branch and run:

```sql
-- Use the full contents of neon-migration-mcp-metadata.sql.
```

This migration must create or update:

- `mcp_servers.endpoint_map`
- `mcp_servers.diagnostics`
- `mcp_servers.status`
- `mcp_servers.validation_status`
- `mcp_servers.generation_status`
- `mcp_servers.generation_version`
- `mcp_servers.protocol_version`
- `tool_call_logs`
- `mcp_bundles`
- `mcp_bundle_servers`
- `api_credentials`

Checklist:

1. Open the Neon SQL Editor.
2. Paste the full migration file.
3. Run the query.
4. Verify locally:

```bash
npm run verify:schema
```

Expected:

```text
ready
Neon schema has required Astrail runtime tables and columns.
rls_behavior_ready
Anonymous clients cannot read protected runtime tables.
```

The verifier also confirms the migration's expected indexes and RLS policies through the Neon connection.

## 2. Start Local App

```bash
npm install
npm run dev
```

For credential storage demos, set:

```bash
CREDENTIAL_ENCRYPTION_KEY=<32-byte hex or base64:... key>
RATE_LIMIT_MODE=in_memory
```

Open:

```text
http://localhost:3000
```

## 3. Demo Flow

1. Open the landing page.
2. Sign up or log in.
3. Go to `/dashboard/generate`.
4. Paste this Petstore spec URL:

```text
https://petstore.swagger.io/v2/swagger.json
```

5. Click `Inspect endpoints`.
6. Choose a small endpoint group for generation.
7. Generate the MCP server.
8. Open the generated server detail page.
9. Verify:
   - diagnostics trace is visible
   - endpoint map is visible
   - generated code is visible
   - hosted endpoint is visible
   - Claude Desktop and cURL snippets are visible
   - runtime behavior shows endpoint mapping and execution mode
   - Cloudflare Worker export is visible

## 4. MCP Runtime Checks

Replace `SERVER_ID` with the generated server id.

Initialize:

```bash
curl -sS -X POST "http://localhost:3000/api/mcp/SERVER_ID" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Expected shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": {
      "name": "SERVER_NAME",
      "version": "1.0.0"
    },
    "capabilities": {
      "tools": {}
    }
  }
}
```

List tools:

```bash
curl -sS -X POST "http://localhost:3000/api/mcp/SERVER_ID" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Expected shape:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "tool_name",
        "description": "Agent-friendly description",
        "inputSchema": {}
      }
    ]
  }
}
```

No-auth deterministic REST execution example:

```bash
curl -sS -X POST "http://localhost:3000/api/mcp/995e77e7-2924-4af2-8666-ad76627fa72c" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"login_user","arguments":{"username":"demo","password":"demo"}}}'
```

Expected response includes:

```json
{
  "status": "success",
  "tool": "login_user",
  "runtime": {
    "execution_mode": "safe_rest_execution",
    "trace_id": "agt_..."
  }
}
```

Auth-required endpoint example:

```bash
curl -sS -X POST "http://localhost:3000/api/mcp/5eda516b-a206-4450-90c6-4400c1d02a89" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_pets_by_status","arguments":{"status":"available"}}}'
```

Expected response includes:

```json
{
  "status": "auth_required",
  "tool": "find_pets_by_status",
  "error_code": "auth_required",
  "note": "Tool validated, but live execution requires auth configuration."
}
```

## 5. Endpoint Catalog Demo

1. Open `/marketplace`.
2. Verify preset servers are visible:
   - GitHub
   - Linear
   - Notion
   - Slack
   - Airtable
3. Use category filters.
4. Open `GitHub MCP Template`.
5. Verify:
   - hosted endpoint is visible
   - Claude Desktop config is visible
   - cURL snippets are visible
   - `Add to my gateway` button is visible

## 6. Bundle Demo

After applying `mcp_bundles` and `mcp_bundle_servers` migration:

1. Open `/dashboard/bundles`.
2. Create a bundle from two or more generated servers.
3. Open the bundle detail page.
4. Copy the bundle endpoint.
5. Call:

```bash
curl -sS -X POST "http://localhost:3000/api/mcp/bundles/BUNDLE_ID" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected:

- tools from selected servers are aggregated
- bundled tool names are prefixed with the source server name
- `tools/call` routes to the matching underlying server/tool

## 7. Cloudflare Worker Export

On a generated server detail page:

1. Find `Cloudflare Worker export`.
2. Click `Export Worker bundle`.
3. Confirm the downloaded JSON contains:
   - `src/worker.ts`
   - `wrangler.toml`
   - `README.md`

This is a manual export path. It does not claim automated Cloudflare deployment.

The export should contain:

```text
src/worker.ts
wrangler.toml
package.json
.env.example
README.md
```

## 8. Analytics and Observability

Open `/dashboard` and confirm:

- total endpoint calls
- logged calls if `tool_call_logs` exists
- runtime storage backend
- success/auth_required/mapping_required/error counts
- trace IDs and error codes for recent executions
- recent activity when DB logs are available

## Known Limitations

- Cloudflare Workers automated deployment is not implemented yet; manual Worker export is available.
- Generated TypeScript is exportable but not executed inside Next.js.
- Hosted runtime uses deterministic endpoint maps, not arbitrary generated code.
- Website-to-MCP creates browser workflow candidates from public HTML. Safe public page reads may execute through `website_browser_runtime`; interactive workflows return `browser_runtime_required` until isolated Playwright runtime is attached.
- OAuth provider apps and least-privilege scopes still require configuration in each upstream provider.
- Bundle creation UI requires the Neon bundle migration.
