import Link from "next/link";
import { ExternalLink, Server, Terminal } from "lucide-react";
import { CopyCommand } from "@/components/control-plane/CopyCommand";
import { PageFrame } from "@/components/control-plane/PageFrame";
import { loadDashboardControlPlane } from "@/lib/dashboard-control-plane";
import { resolveMcpEndpoint } from "@/lib/urls";

export default async function AgentSetupPage() {
  const data = await loadDashboardControlPlane();
  const server = data.servers[0];
  const endpoint = server
    ? resolveMcpEndpoint(server.id, server.hosted_endpoint)
    : "https://www.astrail.dev/api/mcp/YOUR_SERVER_ID";
  const curl = `curl -sS -X POST '${endpoint}' \\
  -H 'Content-Type: application/json' \\
  -H "Authorization: Bearer $ASTRAIL_API_KEY" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;
  return (
    <PageFrame eyebrow="Agent access" title="Connect an agent" description="Use the same private hosted HTTP integration from Cursor, Claude Code, OpenAI Agents, CI, or any Streamable HTTP MCP client." actions={<Link href="/docs" className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800">Read protocol docs<ExternalLink className="h-4 w-4" /></Link>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-orange-50 text-orange-700"><Server className="h-5 w-5" /></span><div><h2 className="font-semibold text-neutral-950">Hosted HTTP</h2><p className="text-sm text-neutral-500">Streamable HTTP with session-aware SSE compatibility</p></div></div>
          <div className="mt-5"><CopyCommand value={endpoint} /></div>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-neutral-500">Authentication</dt><dd className="mt-1 font-medium">Bearer ASTRAIL_API_KEY</dd></div><div><dt className="text-neutral-500">Approvals</dt><dd className="mt-1 font-medium">One-time resumable</dd></div><div><dt className="text-neutral-500">Sessions</dt><dd className="mt-1 font-medium">MCP-Session-Id transport only</dd></div><div><dt className="text-neutral-500">Protocol</dt><dd className="mt-1 font-medium">MCP 2024-11-05+</dd></div></dl>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-neutral-100 text-neutral-800"><Terminal className="h-5 w-5" /></span><div><h2 className="font-semibold text-neutral-950">Client configuration</h2><p className="text-sm text-neutral-500">Inject the key from your secret manager</p></div></div>
          <pre className="mt-5 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-6 text-neutral-700">{`{
  "mcpServers": {
    "astrail": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer <ASTRAIL_API_KEY>" }
    }
  }
}`}</pre>
          <div className="mt-4"><CopyCommand value={curl} /></div>
        </section>
      </div>
      <section className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-4"><h2 className="font-semibold text-neutral-950">Client compatibility</h2><p className="mt-1 text-sm text-neutral-500">One endpoint, whichever transport your client supports.</p></div>
        <div className="grid divide-y divide-neutral-100 md:grid-cols-4 md:divide-x md:divide-y-0">{[
          ["Cursor", "Hosted HTTP"], ["Claude Code", "Hosted HTTP"], ["OpenAI Agents", "Streamable HTTP"], ["Custom clients", "HTTP JSON-RPC"],
        ].map(([name, transport]) => <div key={name} className="p-5"><p className="font-semibold text-neutral-950">{name}</p><p className="mt-1 text-sm text-neutral-500">{transport}</p></div>)}</div>
      </section>
    </PageFrame>
  );
}
