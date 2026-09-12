import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PageFrame, StatStrip, WarningBanner } from "@/components/control-plane/PageFrame";
import { controlPlaneStats, loadDashboardControlPlane } from "@/lib/dashboard-control-plane";

const groups = [
  {
    title: "Connect and import",
    description: "Turn existing systems into deterministic MCP integrations.",
    features: [
      ["OpenAPI", "URL discovery, JSON/YAML paste, operation mapping"],
      ["GraphQL", "Live introspection URL or SDL import"],
      ["Remote MCP", "Authenticated HTTP/SSE import and proxy"],
      ["Websites", "Inspection, browser actions, and safe browsing runtime"],
      ["Curated presets", "Prebuilt provider integrations and Google discovery"],
    ],
  },
  {
    title: "Run and govern",
    description: "Execute mapped calls under explicit security and human-control boundaries.",
    features: [
      ["Hosted MCP gateway", "Streamable HTTP, sessions, SSE compatibility"],
      ["Static Code Mode", "SDK-looking calls compiled without eval"],
      ["Per-tool policies", "Allow, one-time approval, or block"],
      ["Non-custodial x402", "Caller wallets, verified domains, spend limits, approvals, and receipts"],
      ["Runtime permissions", "Read-only and allow/block resource patterns"],
      ["Network safety", "Private IP, metadata, protocol, and redirect protection"],
      ["Limits and billing", "Bounded bodies, batches, loops, retries, and plan usage"],
    ],
  },
  {
    title: "Identity and credentials",
    description: "Keep Astrail access separate from upstream provider authorization.",
    features: [
      ["Astrail API keys", "Hashed storage and one-time plaintext display"],
      ["Encrypted provider vault", "AES-GCM bearer and API-key storage"],
      ["OAuth 2.0", "Encrypted access/refresh tokens and safe refresh"],
      ["Scoped injection", "Credential ownership and scheme-aware headers/query values"],
      ["Redaction", "Authorization, cookies, tokens, secrets, and query credentials"],
    ],
  },
  {
    title: "Ship and observe",
    description: "Operate integrations from local development through production.",
    features: [
      ["Activity and traces", "Status, latency, trace IDs, retries, and safe errors"],
      ["Bundles", "Combine integrations behind one governed endpoint"],
      ["CLI and stdio", "Login, connect, inspect, and bridge local MCP clients"],
      ["Exports", "Typed SDKs, manifests, docs, workers, and source bundles"],
      ["Self-hosting", "Dockerfile and Docker Compose deployment"],
      ["Installable dashboard", "PWA manifest and mobile-ready console"],
    ],
  },
] as const;

export default async function CapabilitiesPage() {
  const data = await loadDashboardControlPlane();
  const stats = controlPlaneStats(data);
  const featureCount = groups.reduce((sum, group) => sum + group.features.length, 0);
  return (
    <PageFrame eyebrow="Platform map" title="Capabilities" description="A complete, inspectable map of what Astrail can import, secure, execute, govern, distribute, and observe. Each capability links back to the operational view where it is configured or verified." actions={<Link href="/dashboard/integrations" className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white">Open control plane<ArrowRight className="h-4 w-4" /></Link>}>
      <WarningBanner warnings={data.warnings} />
      <StatStrip items={[
        { label: "Platform capabilities", value: featureCount, note: "Visible below" },
        { label: "Connected integrations", value: stats.integrations },
        { label: "Governed tools", value: stats.tools },
        { label: "Recent runtime events", value: data.logs.length },
      ]} />
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-neutral-950">{group.title}</h2>
            <p className="mt-1 text-sm text-neutral-500">{group.description}</p>
            <div className="mt-5 divide-y divide-neutral-100 border-y border-neutral-100">
              {group.features.map(([name, detail]) => (
                <div key={name} className="flex gap-3 py-3.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div><p className="text-sm font-semibold text-neutral-900">{name}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{detail}</p></div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="rounded-xl border border-neutral-200 bg-neutral-950 p-6 text-white">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div><h2 className="text-lg font-semibold">Nothing important is hidden behind the capability map</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-300">Use Integrations for systems, Connections for encrypted accounts, Tools for the global catalog, Policies and Approvals for governance, Activity for execution evidence, and Agent setup for client configuration.</p></div><Link href="/dashboard/setup" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-neutral-950">Connect an agent<ArrowRight className="h-4 w-4" /></Link></div>
      </section>
    </PageFrame>
  );
}
