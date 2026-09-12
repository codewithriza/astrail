import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageFrame, StatStrip, WarningBanner } from "@/components/control-plane/PageFrame";
import { ToolCatalog } from "@/components/control-plane/ToolCatalog";
import { controlPlaneStats, loadDashboardControlPlane } from "@/lib/dashboard-control-plane";

export default async function PoliciesPage() {
  const data = await loadDashboardControlPlane();
  const stats = controlPlaneStats(data);
  return (
    <PageFrame eyebrow="Governance" title="Tool policies" description="Set the enforced action for every mapped tool. Allow executes normally, approval pauses with a one-time resumable decision, and block rejects the call before it reaches the provider." actions={<Link href="/dashboard/approvals" className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800"><ShieldCheck className="h-4 w-4" />Open approval queue</Link>}>
      <WarningBanner warnings={data.warnings} />
      <StatStrip items={[
        { label: "Allowed", value: stats.allow, note: "Executes within runtime limits" },
        { label: "Approval required", value: stats.approval, note: "Pauses before upstream call" },
        { label: "Blocked", value: stats.block, note: "Rejected at the gateway" },
        { label: "Pending decisions", value: stats.pendingApprovals, note: "One-time resumable calls" },
      ]} />
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950"><strong>Defense in depth:</strong> these operational policies supplement endpoint visibility, provider scopes, credential ownership, SSRF protection, request limits, and billing controls. They are not used as a substitute for least-privilege credentials.</div>
      <ToolCatalog servers={data.servers} policyMode />
    </PageFrame>
  );
}
