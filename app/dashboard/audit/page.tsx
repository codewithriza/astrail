import { AuditTimeline } from "@/components/control-plane/AuditTimeline";
import { PageFrame, StatStrip, WarningBanner } from "@/components/control-plane/PageFrame";
import { loadDashboardControlPlane } from "@/lib/dashboard-control-plane";
import { auditSigningConfigured } from "@/lib/audit-integrity";
import { hasServiceRoleKey } from "@/lib/neon/server";

export default async function AuditPage() {
  const data = await loadDashboardControlPlane();
  const serverNames = Object.fromEntries(data.servers.map((server) => [server.id, server.name]));
  const attributed = data.logs.filter((log) => log.api_key_id || log.end_user_id || (log.credential_refs?.length ?? 0) > 0).length;
  return (
    <PageFrame eyebrow="Accountability" title="Agent access audit" description="See who initiated every call, which API key and client represented the agent, which provider grant was used, what tool ran, and the final trace and outcome. Secrets stay redacted in the UI and exports.">
      <WarningBanner warnings={[
        ...data.warnings,
        ...(!hasServiceRoleKey() ? ["Audit storage gap: workspace persistence is unavailable; runtime evidence may exist only in structured application logs."] : []),
        ...(!auditSigningConfigured() ? ["Audit export signing is unavailable until AUDIT_EXPORT_SIGNING_KEY is configured. Exports include a digest but are explicitly marked unsigned."] : []),
      ]} />
      <StatStrip items={[
        { label: "Recent events", value: data.logs.length, note: "Newest 100 in this view" },
        { label: "Identity attributed", value: attributed, note: "User, key, client, or grant" },
        { label: "Successful", value: data.logs.filter((log) => log.status === "success").length },
        { label: "Blocked or failed", value: data.logs.filter((log) => log.status !== "success").length },
      ]} />
      <AuditTimeline logs={data.logs} serverNames={serverNames} />
    </PageFrame>
  );
}
