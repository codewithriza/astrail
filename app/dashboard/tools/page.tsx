import Link from "next/link";
import { Plus } from "lucide-react";
import { PageFrame, StatStrip, WarningBanner } from "@/components/control-plane/PageFrame";
import { ToolCatalog } from "@/components/control-plane/ToolCatalog";
import { controlPlaneStats, loadDashboardControlPlane } from "@/lib/dashboard-control-plane";

export default async function ToolsPage() {
  const data = await loadDashboardControlPlane();
  const stats = controlPlaneStats(data);
  return (
    <PageFrame eyebrow="Control plane" title="Tools" description="Search the complete tool surface across every integration. Method, path, risk classification, owning integration, and the effective execution policy stay visible together." actions={<Link href="/dashboard/generate" className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add integration</Link>}>
      <WarningBanner warnings={data.warnings} />
      <StatStrip items={[
        { label: "All tools", value: stats.tools },
        { label: "Allowed", value: stats.allow },
        { label: "Approval required", value: stats.approval },
        { label: "Blocked", value: stats.block },
      ]} />
      <ToolCatalog servers={data.servers} />
    </PageFrame>
  );
}
