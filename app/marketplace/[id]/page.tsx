import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AddToGatewayButton } from "@/components/AddToGatewayButton";
import { CodeViewer } from "@/components/CodeViewer";
import { EndpointBox } from "@/components/EndpointBox";
import { McpClientSnippets } from "@/components/McpClientSnippets";
import { RuntimeBehavior } from "@/components/RuntimeBehavior";
import { ToolList } from "@/components/ToolList";
import { executableConnector } from "@/lib/connector-catalog";
import { findPresetServer } from "@/lib/preset-servers";
import { getRuntimeStatusSummary } from "@/lib/runtime/tool-call-logs";
import { formatDate } from "@/lib/utils";
import type { McpServer } from "@/lib/types";
import { resolveMcpEndpoint } from "@/lib/urls";

export default async function MarketplaceDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const preset = findPresetServer(params.id);
  if (preset) {
    return <MarketplaceDetail server={preset} />;
  }

  notFound();
}

async function MarketplaceDetail({ server }: { server: McpServer }) {
  const endpoint = resolveMcpEndpoint(server.id, server.hosted_endpoint);
  const endpointMap = server.endpoint_map ?? [];
  const hasAuthRequiredEndpoints = endpointMap.some((item) => item.requires_auth || hasSecurityRequirement(item.security_requirements ?? item.security));
  const hasExecutableEndpoints = endpointMap.some((item) =>
    ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(item.method) &&
    Boolean(item.base_url)
  );
  const connector = executableConnector(server.id);
  const isLocalBridge = !hasExecutableEndpoints && Array.isArray(server.diagnostics);
  const runtimeStatus = server.source_type === "preset"
    ? null
    : await safeRuntimeStatus(server.id);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Marketplace
      </Link>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="pill pill-success">{hasExecutableEndpoints ? "Executable connector" : isLocalBridge ? "Local bridge template" : "Template"}</span>
            <span className="pill pill-brand">{server.category ?? (server.source_type === "preset" ? "Template" : "Generated")}</span>
            <span className="pill pill-neutral">{formatDate(server.created_at)}</span>
            <span className="pill pill-neutral">
              <span className="font-mono tabular-nums">{server.call_count ?? 0}</span> calls
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">{server.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-500">{server.description}</p>
        </div>
        <AddToGatewayButton serverId={server.id} />
      </div>

      {(connector || isLocalBridge) && (
        <section className="section-card">
          <div className="section-card-header">
            <h2 className="text-lg font-semibold text-neutral-950">Credential setup</h2>
            <span className="pill pill-neutral">{connector ? connector.auth.scheme : "local-bridge"}</span>
          </div>
          <div className="space-y-2 text-sm text-neutral-600">
            {connector ? (
              <>
                <p>{connector.auth.help}</p>
                <p>
                  Setup docs:{" "}
                  <a href={connector.auth.setupUrl} className="font-medium text-orange-700 hover:underline" target="_blank" rel="noreferrer">
                    {connector.auth.setupUrl}
                  </a>
                </p>
                <p className="text-neutral-500">After adding this connector, attach the credential on the server page, then run <code className="font-mono text-xs">astrail tools list</code>.</p>
              </>
            ) : (
              <>
                <p>This template is not executable on Astrail cloud. Use a local MCP bridge with access to the host runtime, then point your agent client at that local endpoint.</p>
                {Array.isArray(server.diagnostics) && server.diagnostics.slice(1).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </>
            )}
          </div>
        </section>
      )}

      <EndpointBox endpoint={endpoint} />

      <section className="section-card">
        <div className="section-card-header">
          <h2 className="text-lg font-semibold text-neutral-950">MCP client snippets</h2>
          <span className="pill pill-neutral">Connect</span>
        </div>
        <McpClientSnippets
          serverName={server.name}
          endpoint={endpoint}
          tools={server.tools_json ?? []}
          endpointMap={endpointMap}
        />
      </section>

      <RuntimeBehavior
        hasEndpointMap={endpointMap.length > 0}
        hasAuthRequiredEndpoints={hasAuthRequiredEndpoints}
        hasExecutableEndpoints={hasExecutableEndpoints}
        lastStatus={runtimeStatus?.lastStatus}
        lastExecutionMode={runtimeStatus?.lastExecutionMode}
        lastToolName={runtimeStatus?.lastToolName}
        lastLatencyMs={runtimeStatus?.lastLatencyMs}
        lastUpstreamStatus={runtimeStatus?.lastUpstreamStatus}
        lastTraceId={runtimeStatus?.lastTraceId}
        lastErrorCode={runtimeStatus?.lastErrorCode}
        observabilityStorage={runtimeStatus?.observabilityStorage}
        rateLimitMode={process.env.RATE_LIMIT_MODE ?? "in_memory"}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[360px_1fr]">
        <section className="section-card self-start">
          <div className="section-card-header">
            <h2 className="text-lg font-semibold text-neutral-950">Tools</h2>
            <span className="pill pill-neutral">
              <span className="font-mono tabular-nums">{(server.tools_json ?? []).length}</span>
            </span>
          </div>
          <ToolList tools={server.tools_json ?? []} />
        </section>
        <CodeViewer code={server.generated_code ?? ""} />
      </div>
    </div>
  );
}

async function safeRuntimeStatus(serverId: string) {
  try {
    return await getRuntimeStatusSummary(serverId);
  } catch (error) {
    console.error("astrail.marketplace.runtime_status_unavailable", {
      serverId,
      message: error instanceof Error ? error.message : "Unknown runtime status error",
    });
    return null;
  }
}

function hasSecurityRequirement(security: unknown) {
  if (!security) return false;
  if (Array.isArray(security)) return security.length > 0;
  if (typeof security === "object") return Object.keys(security).length > 0;
  return Boolean(security);
}
