"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readJsonResponse } from "@/lib/client-json";
import type { ToolApprovalRequest } from "@/lib/runtime/tool-approvals";

function statusClass(status: ToolApprovalRequest["status"]) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "denied" || status === "expired") return "border-red-200 bg-red-50 text-red-800";
  if (status === "executed") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function ApprovalQueue() {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const queryClient=useQueryClient();
  const approvals=useQuery({queryKey:["approvals"],queryFn:async()=>{
      const response = await fetch("/api/approvals", { cache: "no-store" });
      const result = await readJsonResponse<{ approvals?: ToolApprovalRequest[]; error?: string }>(response);
      if (!response.ok) throw new Error(result.error ?? "Could not load approvals.");
      return result.approvals??[];
  },refetchInterval:10_000});
  const decisionMutation=useMutation({mutationFn:async(input:{id:string;decision:"approved"|"denied"})=>{const response=await fetch(`/api/approvals/${input.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({decision:input.decision,reason:reasons[input.id]?.trim()||undefined})});const result=await readJsonResponse<{error?:string}>(response);if(!response.ok)throw new Error(result.error??"Could not update approval.");},onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:["approvals"]});}});

  async function decide(id: string, decision: "approved" | "denied") {
    decisionMutation.mutate({id,decision});
  }

  if (approvals.isPending) return <p className="text-sm text-muted-foreground">Loading approval queue...</p>;
  const items=approvals.data??[];const error=approvals.error?.message??decisionMutation.error?.message??null;const acting=decisionMutation.isPending?decisionMutation.variables?.id:null;
  return (
    <div className="space-y-4">
      {error ? <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
          <Clock3 className="mx-auto h-6 w-6 text-neutral-400" />
          <p className="mt-3 font-medium">No approval requests yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Calls marked Require approval appear here before any upstream request is made.</p>
        </div>
      ) : items.map((item) => (
        <article key={item.id} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-semibold text-neutral-950">{item.tool_name}</code>
                <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${statusClass(item.status)}`}>{item.status}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Execution {item.id} · expires {new Date(item.expires_at).toLocaleString()}</p>
            </div>
            {item.status === "pending" ? (
              <div className="flex min-w-[280px] flex-col gap-2">
                <input value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={500} placeholder="Decision reason (optional)" className="h-9 rounded border border-neutral-300 px-2 text-sm" />
                <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => void decide(item.id, "denied")} disabled={acting === item.id}><X className="h-4 w-4" /> Deny</Button>
                <Button type="button" onClick={() => void decide(item.id, "approved")} disabled={acting === item.id}><Check className="h-4 w-4" /> Approve</Button>
                </div>
              </div>
            ) : null}
          </div>
          <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-700">{JSON.stringify(item.arguments_redacted, null, 2)}</pre>
        </article>
      ))}
    </div>
  );
}
