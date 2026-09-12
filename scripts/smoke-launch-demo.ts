import { runGenerationPipeline, previewSpec } from "../lib/generation-pipeline";
import { validateRuntimeEnv } from "../lib/env-validation";
import { githubIssuesLaunchSpec } from "../lib/launch-demos/github-issues";
import { recommendedOAuthScopeValue } from "../lib/oauth-scope-recommendation";
import { oauthRequiredScopes, oauthScopePlansBySecurityScheme, oauthScopesBySecurityScheme, oauthSecurityBinding, oauthSecurityMetadata, oauthSecuritySchemeNames } from "../lib/runtime/oauth-security";
import { visibleEndpointsForRequest } from "../lib/runtime/permissions";
import { assessToolGovernance } from "../lib/tool-governance";
import type { McpServer, OpenApiEndpoint } from "../lib/types";
import { getOAuthCallbackUrl } from "../lib/urls";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const preview = await previewSpec({ sourceType: "json_paste", rawJson: githubIssuesLaunchSpec });
  assert(preview.endpoint_count === 7, `Expected 7 focused endpoints, got ${preview.endpoint_count}.`);
  assert(preview.recommended_mode === "static", `Expected static tools, got ${preview.recommended_mode}.`);
  assert(preview.groups.some((group) => group.name === "Issue operations" && group.count === 7), "Expected one focused Issue operations group.");

  const result = await runGenerationPipeline({
    sourceType: "json_paste",
    rawJson: githubIssuesLaunchSpec,
    generationMode: "static",
    clientPreset: "openai",
  });

  assert(result.endpointMap.length === 7, `Expected 7 endpoint mappings, got ${result.endpointMap.length}.`);
  assert(result.generated.tools.length === 7, `Expected 7 generated tools, got ${result.generated.tools.length}.`);

  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalFetch = globalThis.fetch;
  delete process.env.ANTHROPIC_API_KEY;
  const anthropicReadiness = validateRuntimeEnv().checks.find((check) => check.name === "ANTHROPIC_API_KEY");
  assert(anthropicReadiness?.required === false && anthropicReadiness.status === "ready", "Anthropic must remain optional in production readiness because deterministic generation is available.");
  process.env.ANTHROPIC_API_KEY = "smoke-unreachable-anthropic-key";
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  try {
    const fallbackResult = await runGenerationPipeline({
      sourceType: "json_paste",
      rawJson: githubIssuesLaunchSpec,
      generationMode: "static",
      clientPreset: "default",
    });
    assert(fallbackResult.generated.tools.length === 7, "Anthropic transport failures must fall back to seven deterministic tools.");
    assert(fallbackResult.diagnostics.warnings.some((warning) => warning.includes("Deterministic MCP generation")), "Anthropic fallback must be visible as a non-blocking diagnostic warning.");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }

  for (const endpoint of result.endpointMap) {
    assert(endpoint.base_url === "https://api.github.com", `Unexpected base URL for ${endpoint.operation_id}.`);
    assert(endpoint.requires_auth, `${endpoint.operation_id} should require OAuth.`);
    assert(oauthSecuritySchemeNames(endpoint).includes("githubOAuth"), `${endpoint.operation_id} lost its OAuth scheme.`);
    assert(oauthRequiredScopes(endpoint, "githubOAuth").includes("public_repo"), `${endpoint.operation_id} lost public_repo scope enforcement.`);
    const metadata = oauthSecurityMetadata(endpoint, "githubOAuth");
    assert(metadata?.authorization_url === "https://github.com/login/oauth/authorize", "GitHub authorization URL was not preserved.");
    assert(metadata?.token_url === "https://github.com/login/oauth/access_token", "GitHub token URL was not preserved.");
    assert(metadata?.resource_origin === "https://api.github.com", "GitHub resource origin was not preserved.");
    assert(/^[a-f0-9]{64}$/.test(oauthSecurityBinding(endpoint, "githubOAuth") ?? ""), "GitHub security binding was not generated.");
  }

  const endpointByOperation = (operationId: string) => {
    const endpoint = result.endpointMap.find((item) => item.operation_id === operationId);
    assert(endpoint, `Missing endpoint ${operationId}.`);
    return endpoint;
  };
  const toolForOperation = (operationId: string) => {
    const endpoint = endpointByOperation(operationId);
    const tool = result.generated.tools.find((item) => item.name === endpoint.tool_name);
    assert(tool, `Missing generated tool for ${operationId}.`);
    return tool;
  };

  const listTool = toolForOperation("listRepositoryIssues");
  assert(listTool.policy === "allow", "Safe reads should be allowed by default.");
  assert(!JSON.stringify(listTool.input_schema).includes('"owner"'), "The demo repository owner must not be caller-controlled.");
  assert(!JSON.stringify(listTool.input_schema).includes('"repo"'), "The demo repository name must not be caller-controlled.");
  assert(endpointByOperation("listRepositoryIssues").path === "/repos/codingFreak-Adisin/astrail-launch-demo/issues", "The demo must be deterministically restricted to its disposable repository.");

  const createTool = toolForOperation("createIssue");
  assert(createTool.policy === "approval", "Issue creation should require approval.");
  assert(JSON.stringify(createTool.input_schema).includes('"title"'), "Issue title input must be generated.");

  const commentTool = toolForOperation("sendIssueComment");
  assert(commentTool.x_astrail?.action_level === "send", "Comment publishing should be classified as an outward-facing send action.");
  assert(commentTool.policy === "approval", "Comment publishing should require approval.");

  const deleteTool = toolForOperation("deleteIssueComment");
  const deletion = assessToolGovernance(deleteTool);
  assert(deleteTool.policy === "block", "Destructive comment deletion should be blocked by default.");
  assert(deleteTool.enabled === false, "Destructive comment deletion should be hidden from tools/list by the launch contract.");
  assert(deletion.actionLevel === "destructive" && !deletion.recommendedEnabled, "Destructive comment deletion should be recommended hidden.");
  const staticServer = {
    id: "launch-demo-static",
    name: "GitHub Issues Production Agent",
    description: "Launch demo",
    is_public: false,
    tools_json: result.generated.tools,
    endpoint_map: result.endpointMap,
  } as McpServer;
  assert(!visibleEndpointsForRequest(staticServer).some((endpoint) => endpoint.operation_id === "deleteIssueComment"), "Static mode must hide the disabled destructive endpoint from endpoint discovery.");

  const getTool = toolForOperation("getIssue");
  assert(getTool.policy === "allow" && JSON.stringify(getTool.input_schema).includes('"issue_number"'), "Get issue should be an allowed, typed read.");
  const updateTool = toolForOperation("updateIssue");
  assert(updateTool.policy === "approval" && JSON.stringify(updateTool.input_schema).includes('"state_reason"'), "Update issue should be approval-gated with its state schema.");
  const labelsTool = toolForOperation("addLabelsToIssue");
  assert(labelsTool.policy === "approval" && JSON.stringify(labelsTool.input_schema).includes('"labels"'), "Label changes should be approval-gated and typed.");

  const codeResult = await runGenerationPipeline({
    sourceType: "json_paste",
    rawJson: githubIssuesLaunchSpec,
    generationMode: "code",
    clientPreset: "openai",
  });
  const codeServer = {
    id: "launch-demo-code",
    name: "GitHub Issues Production Agent",
    description: "Launch demo",
    is_public: false,
    tools_json: codeResult.generated.tools,
    endpoint_map: codeResult.endpointMap,
  } as McpServer;
  const visibleCodeEndpoints = visibleEndpointsForRequest(codeServer);
  assert(!visibleCodeEndpoints.some((endpoint) => endpoint.operation_id === "deleteIssueComment"), "Code Mode must not expose an endpoint disabled by the imported contract.");
  const codeSchemes = Array.from(new Set(visibleCodeEndpoints.flatMap((endpoint) => oauthSecuritySchemeNames(endpoint))));
  const codeEligibleEndpoints = visibleCodeEndpoints.filter((endpoint) => endpoint.enabled !== false && endpoint.policy !== "block");
  const codeScopePlan = oauthScopePlansBySecurityScheme(codeEligibleEndpoints, codeSchemes).githubOAuth;
  assert(codeScopePlan.status === "ready" && codeScopePlan.scopes.join(" ") === "public_repo", "Code Mode must preserve its contract-derived GitHub scope plan without per-endpoint static tools.");

  const alternativeEndpoint = {
    method: "GET",
    path: "/example",
    security: [{ githubOAuth: ["public_repo", "read:user"] }, { githubOAuth: ["repo"] }],
    oauth_security_schemes: ["githubOAuth"],
  } as OpenApiEndpoint;
  assert(oauthRequiredScopes(alternativeEndpoint, "githubOAuth").length === 0, "Ambiguous OAuth alternatives must require an explicit choice instead of guessing by scope count.");
  const malformedEndpoint = {
    method: "GET",
    path: "/malformed",
    security: [{ githubOAuth: "public_repo" }],
    oauth_security_schemes: ["githubOAuth"],
  } as unknown as OpenApiEndpoint;
  assert(oauthRequiredScopes(malformedEndpoint, "githubOAuth").length === 0, "Malformed scope requirements must not become recommendations.");
  const andedProviders = {
    method: "GET",
    path: "/multi-provider",
    security: [{ googleOAuth: ["calendar.read"], slackOAuth: ["chat:write"] }],
    oauth_security_schemes: ["googleOAuth", "slackOAuth"],
  } as OpenApiEndpoint;
  assert(oauthRequiredScopes(andedProviders, "googleOAuth").length === 0, "Unsupported ANDed OAuth requirements must not appear connectable.");
  assert(oauthRequiredScopes(andedProviders, "slackOAuth").length === 0, "Unsupported ANDed OAuth requirements must fail closed for every scheme.");
  const oauthAndApiKey = {
    method: "GET",
    path: "/mixed-auth",
    security: [{ githubOAuth: ["public_repo"], apiKey: [] }],
    oauth_security_schemes: ["githubOAuth"],
  } as OpenApiEndpoint;
  assert(oauthScopePlansBySecurityScheme([oauthAndApiKey], ["githubOAuth"]).githubOAuth.status === "unsupported", "OAuth plus API-key AND requirements must fail closed.");

  const scopesByScheme = oauthScopesBySecurityScheme([
    ...result.endpointMap,
    { ...alternativeEndpoint, security: [{ secondaryOAuth: ["account.read"] }], oauth_security_schemes: ["secondaryOAuth"] },
  ], ["githubOAuth", "secondaryOAuth"]);
  assert(scopesByScheme.githubOAuth.join(" ") === "public_repo", "GitHub scopes should be deduplicated per scheme.");
  assert(scopesByScheme.secondaryOAuth.join(" ") === "account.read", "Alternative provider scopes must remain isolated.");
  assert(recommendedOAuthScopeValue("github", scopesByScheme.githubOAuth) === "public_repo", "Contract scopes must override generic provider presets.");
  assert(recommendedOAuthScopeValue("github", []) === "read:user", "Provider preset should remain the fallback without contract scopes.");

  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const previousRuntimeUrl = process.env.NEXT_PUBLIC_RUNTIME_BASE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_RUNTIME_BASE_URL = "https://runtime.astrail.example/path";
  assert(getOAuthCallbackUrl("https://request.example/api/oauth/connect") === "https://runtime.astrail.example/api/oauth/callback", "Displayed and exchanged OAuth callbacks must share runtime-origin precedence.");
  process.env.NEXT_PUBLIC_APP_URL = "https://app.astrail.example";
  assert(getOAuthCallbackUrl("https://request.example/api/oauth/connect") === "https://app.astrail.example/api/oauth/callback", "Configured app origin must be the canonical OAuth callback.");
  process.env.NEXT_PUBLIC_APP_URL = "://malformed";
  delete process.env.NEXT_PUBLIC_RUNTIME_BASE_URL;
  assert(getOAuthCallbackUrl("https://request.example/api/oauth/connect") === "https://request.example/api/oauth/callback", "Malformed configured origins must fall back to the request origin.");
  if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
  if (previousRuntimeUrl === undefined) delete process.env.NEXT_PUBLIC_RUNTIME_BASE_URL;
  else process.env.NEXT_PUBLIC_RUNTIME_BASE_URL = previousRuntimeUrl;

  console.log("PASS: launch demo generates seven governed GitHub tools with contract-derived OAuth scopes.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
