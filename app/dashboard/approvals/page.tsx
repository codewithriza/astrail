import { ApprovalQueue } from "@/components/ApprovalQueue";

export default function ApprovalsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-600">Human control</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Tool approvals</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">Review state-changing calls before Astrail sends them upstream. Arguments are redacted in the queue; the encrypted original can execute once after approval.</p>
      </div>
      <ApprovalQueue />
    </div>
  );
}
