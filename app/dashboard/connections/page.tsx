import Link from "next/link";
import { LockKeyhole, Plus } from "lucide-react";
import { ConnectionsTable } from "@/components/control-plane/ConnectionsTable";
import { PageFrame, StatStrip, WarningBanner } from "@/components/control-plane/PageFrame";
import { loadDashboardControlPlane } from "@/lib/dashboard-control-plane";
import { providerTemplates } from "@/lib/provider-templates";

export default async function ConnectionsPage() {
  const data = await loadDashboardControlPlane();
  const serverNames = Object.fromEntries(data.servers.map((server) => [server.id, server.name]));
  const oauth = data.credentials.filter((credential) => credential.auth_scheme === "oauth2").length;
  const needsAttention = data.credentials.filter((credential) =>
    ["failed", "reauth_required"].includes(credential.connect_status ?? "")
    || Boolean(credential.revocation_status)
    || (credential.auth_scheme !== "oauth2" && credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now())
  ).length;
  return (
    <PageFrame eyebrow="Credential vault" title="Connections" description="Manage the provider accounts and secrets Astrail may inject into upstream calls. OAuth removal revokes the provider grant first, records the outcome, then deletes local ciphertext. Secret values are never returned to the browser." actions={<Link href="/dashboard/integrations" className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Choose an integration</Link>}>
      <WarningBanner warnings={data.warnings} />
      <StatStrip items={[
        { label: "Connections", value: data.credentials.length },
        { label: "OAuth accounts", value: oauth, note: "Per-user refresh" },
        { label: "API key or bearer", value: data.credentials.length - oauth },
        { label: "Needs attention", value: needsAttention, note: "Reconnect or replace" },
      ]} />
      <div className="flex gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-4 text-sm leading-6 text-neutral-700"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" /><p><strong className="text-neutral-950">Per-user OAuth boundary.</strong> Access and refresh tokens are encrypted with AES-GCM, selected by authenticated end-user scope, refreshed server-side, and withheld when a tool requires scopes the user did not grant. Caller bearer tokens are never passed through to upstream providers.</p></div>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{providerTemplates.map((provider)=><div key={provider.id} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-semibold text-neutral-950">{provider.name}</h2><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">Verified</span></div><p className="mt-2 text-xs leading-5 text-neutral-500">Authorization code + S256 PKCE · checked {provider.verifiedAt}</p><p className="mt-2 font-mono text-[11px] text-neutral-600">{provider.defaultScopes.join(" ")}</p></div>)}</section>
      <ConnectionsTable credentials={data.credentials} serverNames={serverNames} />
    </PageFrame>
  );
}
