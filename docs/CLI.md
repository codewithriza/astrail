# CLI and stdio bridge

Run `node bin/astrail.mjs help` from the checkout. The root package is not published to npm.

```bash
export ASTRAIL_MCP_ENDPOINT='https://YOUR_HOST/api/mcp/YOUR_SERVER_ID'
export ASTRAIL_API_KEY='YOUR_API_KEY'
node bin/astrail.mjs status
node bin/astrail.mjs tools list
node bin/astrail.mjs tools describe TOOL_NAME
node bin/astrail.mjs call TOOL_NAME --args '{"name":"example"}'
```

`--args` requires a JSON object. Unknown options, missing option values, and malformed endpoint URLs fail before the request. Local HTTP endpoints are supported for development. URLs with embedded credentials are rejected; supply an API key through the environment or explicit option.

## Saved configuration

`login --endpoint URL --api-key KEY --workspace NAME` stores configuration in `$XDG_CONFIG_HOME/astrail/config.json`, or `~/.config/astrail/config.json`. The file contains the API key in plaintext with file mode 0600 on systems supporting Unix permissions; this is not an operating-system keychain. Environment variables or options override saved values. Use your operating system's access controls on Windows.

`workspace use NAME` changes the stored workspace label. It does not provision a remote workspace or switch provider credentials automatically.

## Stdio bridge

Run `node bin/astrail.mjs mcp`. Standard input and output carry one JSON-RPC message per line. Diagnostics go to standard error. Notifications retain their missing ID and never produce a reply. Request failures retain the caller's ID; upstream JSON-RPC error codes and data are preserved.

The bridge reuses an initialization session header and negotiated protocol version. HTTP responses can be JSON or SSE, with bounded parsing and a 30-second request deadline. It reads matching responses from streams without waiting for the connection to close.

This is a sequential request/response bridge for Astrail endpoints. It does not implement concurrent calls, server-initiated requests, independent GET event streams, or automatic session reconnection. Use a full MCP client when those capabilities are required. A failed write is never retried automatically.

## Tests

`npm run test:unit` tests argument parsing and transport edge cases without a server. `npm run smoke:cli` launches an isolated local HTTP fixture and exercises the actual CLI process, including notification and error handling. CI runs the unit suite on Node 22/24 on Linux and Windows.
