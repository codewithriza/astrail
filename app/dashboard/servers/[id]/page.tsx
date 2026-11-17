import { notFound } from "next/navigation";
import { AuthConfigurationPanel } from "@/components/AuthConfigurationPanel";
import { executableConnectorForServerName } from "@/lib/connector-catalog";
import { CodeViewer } from "@/components/CodeViewer";
import { EndpointBox } from "@/components/EndpointBox";
import { IntegrationOperationsPanel } from "@/components/IntegrationOperationsPanel";
import { McpClientSnippets } from "@/components/McpClientSnippets";
import { McpEndpointTester } from "@/components/McpEndpointTester";
import { PublishToggle } from "@/components/PublishToggle";
import { SdkExportPanel } from "@/components/SdkExportPanel";
import { ToolList } from "@/components/ToolList";
import { ToolMetadataEditor } from "@/components/ToolMetadataEditor";
import { WorkerExportPanel } from "@/components/WorkerExportPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { defaultToolPolicy } from "@/lib/agent-tool-profile";
import { findLocalGeneratedServer, localDemoServers } from "@/lib/local-demo";
import { loadLocalPreviewServer } from "@/lib/local-preview-servers";
import { endpointRequiresAuth, visibleEndpointsForRequest, visibleToolsForRequest } from "@/lib/runtime/permissions";
import { oauthScopePlansBySecurityScheme, oauthSecurityBinding, oauthSecurityMetadata, oauthSecuritySchemeNames } from "@/lib/runtime/oauth-security";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";
import { getOAuthCallbackUrl, resolveMcpEndpoint } from "@/lib/urls";
import { formatDate } from "@/lib/utils";
import type { McpServer, McpTool, OpenApiEndpoint } from "@/lib/types";

function localServerById(id: string): McpServer | null {
  const websiteEndpoints: OpenApiEndpoint[] = [
    {
      method: "BROWSER",
      path: "body",
      runtime_kind: "browser",
      browser_action: "open_page",
      selector: "body",
      target_url: "https://news.ycombinator.com/",
      tool_name: "browser_open_page",
      operation_id: "browser_open_page",
      summary: "Open page",
      description: "Open the inspected website and return a public page summary.",
      parameters: [],
      requires_auth: false,
    },
  ];
  const localServers: Record<string, McpServer> = {
    "local-website-mcp": {
      id: "local-website-mcp",
      user_id: "local-preview",
      name: "Hacker News browser server",
      description: "Local Website-to-MCP preview generated from a public page.",
      source_url: "https://news.ycombinator.com",
      source_type: "website",
      generated_code: null,
      tools_json: [
        {
          name: "browser_open_page",
          description: "Open the page and summarize visible public content.",
          input_schema: { type: "object", properties: {} },
          method: "BROWSER",
          path: "body",
        },
      ],
      endpoint_map: websiteEndpoints,
      diagnostics: ["Local demo server. Connect persistent workspace storage to save generated endpoint details."],
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: false,
      hosted_endpoint: "/api/mcp/local-website-mcp",
      call_count: 128,
      protocol_version: "2024-11-05",
      created_at: new Date().toISOString(),
    },
    "local-openapi": {
      id: "local-openapi",
      user_id: "local-preview",
      name: "Petstore OpenAPI server",
      description: "Demo endpoint map generated from the Swagger Petstore spec.",
      source_url: "https://petstore.swagger.io/v2/swagger.json",
      source_type: "openapi_url",
      generated_code: null,
      tools_json: [
        {
          name: "list_pets",
          description: "List pets from the sample Petstore API.",
          input_schema: { type: "object", properties: {} },
          method: "GET",
          path: "/pets",
        },
      ],
      endpoint_map: [
        {
          method: "GET",
          path: "/pets",
          base_url: "https://petstore.swagger.io/v2",
          tool_name: "list_pets",
          operation_id: "list_pets",
          summary: "List pets",
          description: "List pets from the sample Petstore API.",
          parameters: [],
          requires_auth: false,
        },
      ],
      diagnostics: ["Local demo server. Connect persistent workspace storage to save generated endpoint details."],
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: true,
      hosted_endpoint: "/api/mcp/local-openapi",
      call_count: 42,
      protocol_version: "2024-11-05",
      created_at: new Date().toISOString(),
    },
  };

  return localServers[id] ?? null;
}

function endpointForTool(server: McpServer, tool: McpTool) {
  const endpoints = Array.isArray(server.endpoint_map) ? server.endpoint_map : [];
  return endpoints.find((endpoint) => endpoint.tool_name === tool.name)
    ?? endpoints.find((endpoint) => endpoint.method === tool.method && endpoint.path === tool.path)
    ?? endpoints.find((endpoint) => endpoint.operation_id === tool.name);
}

export default async function ServerDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ auth?: string }>;
}) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const focusAuth = searchParams.auth === "1";
  if (!hasServerNeonEnv()) {
    const localServer = findLocalGeneratedServer(params.id)
      ?? (await loadLocalPreviewServer(params.id))
      ?? localDemoServers().find((server) => server.id === params.id)
      ?? localServerById(params.id);
    if (!localServer) notFound();
    return <ServerDetailContent server={localServer} focusAuth={focusAuth} />;
  }

  const user = await getDashboardSessionUser();

  const { data, error } = await createUserDataClient()
    .from("mcp_servers")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) notFound();

  const server = data as McpServer;
  return <ServerDetailContent server={server} focusAuth={focusAuth} />;
}

async function ServerDetailContent({ server, focusAuth = false }: { server: McpServer; focusAuth?: boolean }) {
  const allTools = server.tools_json ?? [];
  const endpoint = resolveMcpEndpoint(server.id, server.hosted_endpoint);
  const endpointMap = visibleEndpointsForRequest(server);
  const oauthSecuritySchemes = Array.from(new Set(endpointMap.flatMap((endpoint) => oauthSecuritySchemeNames(endpoint))));
  const oauthProviderMetadata = Object.fromEntries(oauthSecuritySchemes.map((scheme) => {
    const metadata = endpointMap.map((endpoint) => oauthSecurityMetadata(endpoint, scheme)).find(Boolean) ?? null;
    const securityBinding = endpointMap.map((endpoint) => oauthSecurityBinding(endpoint, scheme)).find(Boolean) ?? null;
    return [scheme, metadata ? { ...metadata, security_binding: securityBinding } : null];
  }));
  const scopeEligibleEndpoints = endpointMap.filter((endpoint) => {
    const tool = allTools.find((item) => endpointForTool(server, item) === endpoint);
    if (endpoint.enabled === false || tool?.enabled === false) return false;
    return (tool?.policy ?? endpoint.policy ?? defaultToolPolicy(tool ?? { method: endpoint.method }, endpoint)) !== "block";
  });
  const oauthScopePlansByScheme = oauthScopePlansBySecurityScheme(scopeEligibleEndpoints, oauthSecuritySchemes);
  const tools = visibleToolsForRequest(server, allTools, endpointForTool);
  const connector = executableConnectorForServerName(server.name);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className={server.is_public ? "border-primary text-primary" : ""}>{server.is_public ? "public" : "private"}</Badge>
            <Badge>{server.status ?? "live"}</Badge>
            <Badge>validation {server.validation_status ?? "passed"}</Badge>
            <Badge>generation {server.generation_status ?? "passed"}</Badge>
            <Badge>{formatDate(server.created_at)}</Badge>
            <Badge>{server.call_count ?? 0} calls</Badge>
            {server.schema_drift_detected ? <Badge className="border-amber-500 text-amber-700">schema drift</Badge> : null}
          </div>
          <h1 className="text-2xl font-semibold">{server.name}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">{server.description}</p>
        </div>
        <PublishToggle serverId={server.id} isPublic={server.is_public} />
      </div>

      <EndpointBox endpoint={endpoint} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle as="h2">Validation</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{server.validation_status ?? "passed"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2">Generation</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{server.generation_status ?? "passed"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2">Runtime</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{server.protocol_version ?? "2024-11-05"}</CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle as="h2">{server.is_public ? "Callable tools" : "Generated tools"}</CardTitle>
            <Badge>{tools.length} tools</Badge>
          </CardHeader>
          <CardContent className="max-h-[720px] overflow-y-auto pr-3">
            <ToolList tools={tools} />
          </CardContent>
        </Card>
        <CodeViewer code={server.generated_code ?? ""} />
      </div>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader><CardTitle as="h2">Per-tool policy</CardTitle></CardHeader>
          <CardContent>
            <ToolMetadataEditor
              serverId={server.id}
              tools={allTools}
              initialBusinessContext={server.runtime_policy?.business_context}
            />
          </CardContent>
        </Card>
        <Card id="connection-credentials" className={`min-w-0${focusAuth ? " ring-2 ring-orange-400/70" : ""}`}>
          <CardHeader><CardTitle as="h2">Connection credentials</CardTitle></CardHeader>
          <CardContent>
            {focusAuth && (
              <p className="mb-3 text-sm text-orange-800">
                Attach the provider credential here, then use <code className="font-mono text-xs">astrail tools list</code> against this server endpoint.
              </p>
            )}
            <AuthConfigurationPanel
              serverId={server.id}
              hasAuthRequiredEndpoints={endpointMap.some(endpointRequiresAuth) || server.source_type === "mcp_url"}
              oauthSecuritySchemes={oauthSecuritySchemes}
              oauthProviderMetadata={oauthProviderMetadata}
              oauthScopePlansByScheme={oauthScopePlansByScheme}
              oauthCallbackUrl={getOAuthCallbackUrl()}
              recommendedAuthScheme={connector?.auth.scheme}
              recommendedProvider={connector?.provider}
              recommendedInjectionName={connector?.auth.injectionName}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle as="h2">Integration operations</CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationOperationsPanel
            serverId={server.id}
            initialMappings={server.field_mappings ?? {}}
            initialExecutionPolicy={server.execution_policy ?? {}}
            initialRuntimePolicy={server.runtime_policy ?? {}}
            canCheckSchema={Boolean(server.source_url && ["url", "openapi_url"].includes(server.source_type ?? ""))}
          />
        </CardContent>
      </Card>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="min-w-0">
            <CardHeader><CardTitle as="h2">Runtime proof</CardTitle></CardHeader>
            <CardContent>
              <McpEndpointTester
                endpoint={endpoint}
                tools={tools}
                endpointMap={endpointMap}
                isPublic={server.is_public}
              />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle as="h2">Connect clients</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              <McpClientSnippets
                serverName={server.name}
                endpoint={endpoint}
                tools={tools}
                endpointMap={endpointMap}
                isPublic={server.is_public}
                x402Enabled={server.runtime_policy?.x402?.enabled === true}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <details className="group rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-base font-semibold text-neutral-950">
          Advanced exports
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Generate SDK packages or export a manual Worker bundle when this endpoint needs to move into a long-lived production integration.
        </p>
        <div className="mt-4 grid min-w-0 items-start gap-6 xl:grid-cols-2">
          <SdkExportPanel serverId={server.id} serverName={server.name} />
          <WorkerExportPanel serverId={server.id} serverName={server.name} />
        </div>
      </details>
    </div>
  );
}
