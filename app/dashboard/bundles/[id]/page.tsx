import { notFound } from "next/navigation";
import { EndpointBox } from "@/components/EndpointBox";
import { McpClientSnippets } from "@/components/McpClientSnippets";
import { CopySnippet } from "@/components/CopySnippet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";
import type { McpServer, McpTool } from "@/lib/types";
import { resolveBundleEndpoint } from "@/lib/urls";

type BundleRow = {
  id: string;
  name: string;
  hosted_endpoint: string | null;
  is_public: boolean;
};

type BundleLink = {
  server_id: string;
};

function bundleToolName(server: McpServer, tool: McpTool) {
  const prefix = server.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || server.id;
  return `${prefix}__${tool.name}`;
}

export default async function BundleDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!hasServerNeonEnv() && params.id === "local-work-stack") {
    const typedBundle: BundleRow = {
      id: "local-work-stack",
      name: "Local work stack",
      hosted_endpoint: "/api/mcp/bundles/local-work-stack",
      is_public: false,
    };
    const typedServers: McpServer[] = [
      {
        id: "local-website-mcp",
        user_id: "local-preview",
        name: "Hacker News browser server",
        description: "Local Website-to-MCP preview generated from a public page.",
        source_url: "https://news.ycombinator.com",
        source_type: "website",
        generated_code: null,
        tools_json: [{ name: "browser_open_page", description: "Open the page and summarize visible public content." }],
        is_public: false,
        hosted_endpoint: "/api/mcp/local-website-mcp",
        call_count: 128,
        created_at: new Date().toISOString(),
      },
      {
        id: "local-openapi",
        user_id: "local-preview",
        name: "Petstore OpenAPI server",
        description: "Demo endpoint map generated from the Swagger Petstore spec.",
        source_url: "https://petstore.swagger.io/v2/swagger.json",
        source_type: "openapi_url",
        generated_code: null,
        tools_json: [{ name: "list_pets", description: "List pets from the sample Petstore API." }],
        is_public: true,
        hosted_endpoint: "/api/mcp/local-openapi",
        call_count: 42,
        created_at: new Date().toISOString(),
      },
    ];

    return <BundleDetailContent typedBundle={typedBundle} typedServers={typedServers} />;
  }

  const user = await getDashboardSessionUser();

  const admin = createUserDataClient();
  const { data: bundle, error: bundleError } = await admin
    .from("mcp_bundles")
    .select("id,name,hosted_endpoint,is_public")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (bundleError || !bundle) notFound();

  const { data: links } = await admin
    .from("mcp_bundle_servers")
    .select("server_id")
    .eq("bundle_id", params.id);
  const serverIds = ((links ?? []) as BundleLink[]).map((link) => link.server_id);
  const { data: servers } = serverIds.length > 0
    ? await admin.from("mcp_servers").select("*").in("id", serverIds)
    : { data: [] };

  const typedBundle = bundle as BundleRow;
  const typedServers = (servers ?? []) as McpServer[];
  return <BundleDetailContent typedBundle={typedBundle} typedServers={typedServers} />;
}

function BundleDetailContent({
  typedBundle,
  typedServers,
}: {
  typedBundle: BundleRow;
  typedServers: McpServer[];
}) {
  const endpoint = resolveBundleEndpoint(typedBundle.id, typedBundle.hosted_endpoint);
  const tools = typedServers.flatMap((server) =>
    (server.tools_json ?? []).map((tool) => ({
      ...tool,
      name: bundleToolName(server, tool),
      description: `${server.name}: ${tool.description}`,
    }))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-start">
        <div>
          <div className="mb-2 flex gap-2">
            <Badge>{typedBundle.is_public ? "public" : "private"}</Badge>
            <Badge>{typedServers.length} servers</Badge>
            <Badge>{tools.length} tools</Badge>
          </div>
          <h1 className="text-xl font-semibold">{typedBundle.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aggregated MCP endpoint across selected servers.</p>
        </div>
      </div>

      <EndpointBox endpoint={endpoint} />

      <Card>
        <CardHeader><CardTitle>How this bundle works</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <p><span className="font-medium text-foreground">Initialize</span> returns the bundle as one MCP server.</p>
          <p><span className="font-medium text-foreground">tools/list</span> combines tools from {typedServers.length} linked server{typedServers.length === 1 ? "" : "s"}.</p>
          <p><span className="font-medium text-foreground">tools/call</span> routes the prefixed tool name to the correct underlying runtime.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader><CardTitle>Servers</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {typedServers.map((server) => (
              <div key={server.id} className="border p-3 text-sm">
                <p className="font-medium">{server.name}</p>
                <p className="text-muted-foreground">{server.tools_json?.length ?? 0} tools</p>
              </div>
            ))}
            {typedServers.length === 0 && <p className="text-sm text-muted-foreground">No servers linked.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>MCP client snippets</CardTitle></CardHeader>
          <CardContent>
            <McpClientSnippets
              serverName={typedBundle.name}
              endpoint={endpoint}
              tools={tools}
              endpointMap={[]}
              isPublic={typedBundle.is_public}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Bundle API endpoint</CardTitle></CardHeader>
        <CardContent>
          <CopySnippet
            title="MCP bundle URL"
            code={endpoint}
          />
        </CardContent>
      </Card>
    </div>
  );
}
