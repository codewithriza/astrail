import assert from "node:assert/strict";
import { executableConnectorPreset, executableConnectors } from "../lib/connector-catalog";
import { findPresetServer, presetServers } from "../lib/preset-servers";
import { buildRequest, executeToolFromEndpointMap, findEndpointForTool, inspectUpstreamApplicationError } from "../lib/runtime/execute-tool";

const sensitiveHeader = /^(authorization|cookie|host|proxy-authorization|set-cookie|x-api-key)$/i;

async function main() {
  const goldenMinimums: Record<string, number> = {
    "preset-github": 10, "preset-linear": 8, "preset-notion": 6, "preset-slack": 7,
    "preset-stripe": 9, "preset-google-drive": 6, "preset-gmail": 8,
  };
  const presetIds = presetServers.map((server) => server.id);
  assert.equal(new Set(presetIds).size, presetIds.length, "marketplace preset ids must be unique");
  assert.equal(presetServers.length, executableConnectors.length + 2, "website marketplace must expose every connector plus two local bridges");
  for (const connector of executableConnectors) {
    if (connector.presetId in goldenMinimums) {
      assert.ok(connector.tools.length >= goldenMinimums[connector.presetId], `${connector.provider}: golden connector is too shallow`);
    }
    const listing = findPresetServer(connector.presetId);
    assert.ok(listing, `${connector.provider}: missing from website/dashboard marketplace`);
    assert.equal(listing.endpoint_map?.length, connector.endpoints.length, `${connector.provider}: marketplace detail lost executable endpoints`);
  }

  const notion = executableConnectors.find((item) => item.presetId === "preset-notion");
  assert.ok(notion?.endpoints.every((item) => item.static_headers?.["Notion-Version"] === "2026-03-11"), "Notion must use the current API version");
  assert.ok(notion?.endpoints.some((item) => item.path.includes("/data_sources/")), "Notion must use data-source queries");
  assert.ok(!notion?.endpoints.some((item) => item.path.includes("/databases/") && item.path.endsWith("/query")), "legacy Notion database query must stay removed");
  const github = executableConnectors.find((item) => item.presetId === "preset-github");
  assert.ok(github?.endpoints.every((item) => item.static_headers?.["X-GitHub-Api-Version"] === "2026-03-10"), "GitHub must use the current REST version");
  assert.deepEqual(inspectUpstreamApplicationError(new URL("https://slack.com/api/conversations.list"), { ok: false, error: "invalid_auth" }), {
    code: "slack_invalid_auth", message: "Slack API error: invalid_auth",
  });
  assert.deepEqual(inspectUpstreamApplicationError(new URL("https://api.linear.app/graphql"), { errors: [{ message: "Limited", extensions: { code: "RATELIMITED" } }] }), {
    code: "linear_ratelimited", message: "Linear API error: Limited",
  });
  for (const localBridgeId of ["preset-docker", "preset-kubernetes"]) {
    const listing = findPresetServer(localBridgeId);
    assert.ok(listing, `${localBridgeId}: missing local-bridge marketplace listing`);
    assert.equal(listing.endpoint_map?.length, 0, `${localBridgeId}: local bridge must not claim hosted execution`);
  }

  for (const connector of executableConnectors) {
    const server = executableConnectorPreset(connector);
    assert.equal(server.status, "preset", `${connector.provider}: catalog entries remain installable presets`);
    assert.equal(server.is_public, false, `${connector.provider}: authenticated connectors must be private`);
    assert.equal(server.tools_json?.length, connector.endpoints.length, `${connector.provider}: every tool needs one endpoint`);
    assert.match(connector.baseUrl, /^https:\/\//, `${connector.provider}: upstream must use HTTPS`);

    for (const tool of server.tools_json ?? []) {
      const endpoint = findEndpointForTool(server, tool);
      assert.ok(endpoint, `${connector.provider}/${tool.name}: endpoint missing`);
      assert.equal(endpoint.requires_auth, true, `${connector.provider}/${tool.name}: credential must be required`);
      assert.equal(endpoint.visibility, "private", `${connector.provider}/${tool.name}: tool must remain private`);
      assert.deepEqual(tool.x_astrail?.auth_schemes, [connector.auth.scheme], `${connector.provider}/${tool.name}: tool auth metadata`);
      for (const [name, value] of Object.entries(endpoint.static_headers ?? {})) {
        assert.doesNotMatch(name, sensitiveHeader, `${connector.provider}/${tool.name}: static secret header`);
        assert.doesNotMatch(value, /[\r\n]/, `${connector.provider}/${tool.name}: invalid static header`);
      }

      const result = await executeToolFromEndpointMap(server, tool, {});
      assert.equal(
        result.status,
        connector.auth.scheme === "oauth2" ? "oauth_required" : "auth_required",
        `${connector.provider}/${tool.name}: should fail closed without a credential`,
      );

      const inputSchema = tool.input_schema ?? { type: "object", properties: {} };
      const properties = inputSchema.properties ?? {};
      const required = new Set(Array.isArray(inputSchema.required) ? inputSchema.required : []);
      const args = Object.fromEntries(Object.entries(properties).flatMap(([name, rawSchema]) => {
        if (!required.has(name)) return [];
        const schema = rawSchema && typeof rawSchema === "object" ? rawSchema as Record<string, unknown> : {};
        const value = name === "endpoint" ? "ep-example"
          : name === "region" ? "us-east-1"
            : name === "project_ref" ? "abcdefghijklmnopqrst"
              : name === "shop" || name === "subdomain" ? "example"
                : schema.type === "integer" || schema.type === "number" ? 1
                  : schema.type === "array" ? [[]]
                    : schema.type === "object" ? {}
                      : "example";
        return [[name, value]];
      }));
      const request = buildRequest(endpoint, tool, args);
      assert.ok(!("error" in request), `${connector.provider}/${tool.name}: required example arguments must build a request${"error" in request ? ` (${request.error})` : ""}`);
      if (!("error" in request)) {
        assert.doesNotMatch(request.url.toString(), /%7B|%7D|\{|\}/i, `${connector.provider}/${tool.name}: unresolved URL template`);
        assert.equal(request.url.protocol, "https:", `${connector.provider}/${tool.name}: built URL must use HTTPS`);
        if (!["GET", "HEAD"].includes(String(request.init.method))) {
          assert.doesNotThrow(() => JSON.parse(String(request.init.body)), `${connector.provider}/${tool.name}: request body must be valid JSON`);
        }
      }
    }

    if (connector.baseUrl.includes("{")) {
      const firstTool = server.tools_json?.[0];
      assert.ok(firstTool, `${connector.provider}: dynamic connector needs a tool`);
      const tenantParams = (connector.endpoints[0]?.parameters ?? []).filter((parameter): parameter is { name: string; in: string } =>
        Boolean(parameter && typeof parameter === "object" && "in" in parameter && (parameter as { in?: string }).in === "base_url" && typeof (parameter as { name?: string }).name === "string")
      );
      assert.ok(tenantParams.length > 0, `${connector.provider}: braced base URL needs base_url parameters`);
      const invalidTenantArgs = Object.fromEntries(tenantParams.map((parameter) => [parameter.name, "attacker.example.com"]));
      const invalidTenant = await executeToolFromEndpointMap(server, firstTool, invalidTenantArgs, {
        credential: { scheme: "api_key_header", injectionName: "Authorization", secret: "test-secret" },
      });
      assert.equal(invalidTenant.status, "mapping_required", `${connector.provider}: multi-label tenant must be rejected`);
      assert.equal(invalidTenant.errorCode, "invalid_base_url_parameter", `${connector.provider}: tenant validation code`);
    }
  }

  console.log(`PASS: ${executableConnectors.length} executable connectors and 2 local bridges are exposed in the website marketplace; hosted mappings are private and fail closed without credentials.`);
}

void main();
