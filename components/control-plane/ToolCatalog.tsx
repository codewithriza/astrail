"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { McpServer, McpTool, McpToolPolicy } from "@/lib/types";

type ToolRow = {
  serverId: string;
  serverName: string;
  sourceType: string;
  tool: McpTool;
};

const policyTone: Record<McpToolPolicy, string> = {
  allow: "border-emerald-200 bg-emerald-50 text-emerald-800",
  approval: "border-amber-200 bg-amber-50 text-amber-900",
  block: "border-red-200 bg-red-50 text-red-800",
};

export function ToolCatalog({ servers, policyMode = false }: { servers: McpServer[]; policyMode?: boolean }) {
  const initial = useMemo<ToolRow[]>(() => servers.flatMap((server) => (server.tools_json ?? []).map((tool) => ({
    serverId: server.id,
    serverName: server.name,
    sourceType: server.source_type ?? "integration",
    tool,
  }))), [servers]);
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [policy, setPolicy] = useState<"all" | McpToolPolicy>("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const filtered = rows.filter((row) => {
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || `${row.tool.name} ${row.tool.description} ${row.serverName} ${row.tool.method ?? ""} ${row.tool.path ?? ""}`.toLowerCase().includes(needle);
    return matchesQuery && (policy === "all" || (row.tool.policy ?? "allow") === policy);
  });

  async function changePolicy(row: ToolRow, nextPolicy: McpToolPolicy) {
    const key = `${row.serverId}:${row.tool.name}`;
    setSaving(key);
    setMessage("");
    const response = await fetch("/api/policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: row.serverId, tool_name: row.tool.name, policy: nextPolicy }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(typeof body.error === "string" ? body.error : "Could not update this policy.");
      setSaving(null);
      return;
    }
    setRows((current) => current.map((item) => item.serverId === row.serverId && item.tool.name === row.tool.name
      ? { ...item, tool: { ...item.tool, policy: nextPolicy } }
      : item));
    setMessage(`${row.tool.name} now uses ${nextPolicy === "approval" ? "human approval" : nextPolicy}.`);
    setSaving(null);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools, integrations, methods, or paths"
          aria-label="Search tools"
          className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none ring-orange-500 focus:ring-2 md:max-w-lg"
        />
        <div className="flex items-center gap-2">
          <label htmlFor="policy-filter" className="text-sm text-neutral-500">Policy</label>
          <select id="policy-filter" value={policy} onChange={(event) => setPolicy(event.target.value as typeof policy)} className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm">
            <option value="all">All policies</option>
            <option value="allow">Allow</option>
            <option value="approval">Approval</option>
            <option value="block">Block</option>
          </select>
        </div>
      </div>
      {message ? <p role="status" className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">{message}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm md:min-w-[920px]">
          <thead className="hidden bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 md:table-header-group">
            <tr>
              <th className="px-4 py-3 font-medium">Tool</th>
              <th className="px-4 py-3 font-medium">Integration</th>
              <th className="px-4 py-3 font-medium">Operation</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Policy</th>
            </tr>
          </thead>
          <tbody className="block divide-y divide-neutral-100 md:table-row-group">
            {filtered.map((row) => {
              const currentPolicy = row.tool.policy ?? "allow";
              const key = `${row.serverId}:${row.tool.name}`;
              return (
                <tr key={key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 p-4 align-top hover:bg-neutral-50/70 md:table-row md:p-0">
                  <td className="min-w-0 md:px-4 md:py-4">
                    <Link href={`/dashboard/servers/${row.serverId}`} className="font-mono text-sm font-semibold text-neutral-950 hover:text-orange-700">{row.tool.name}</Link>
                    <p className="mt-1 max-w-md line-clamp-2 text-xs leading-5 text-neutral-500">{row.tool.description}</p>
                  </td>
                  <td className="col-start-1 row-start-2 min-w-0 md:table-cell md:px-4 md:py-4">
                    <p className="font-medium text-neutral-900">{row.serverName}</p>
                    <p className="mt-1 text-xs text-neutral-500">{row.sourceType.replaceAll("_", " ")}</p>
                  </td>
                  <td className="hidden px-4 py-4 font-mono text-xs text-neutral-700 md:table-cell">
                    <span className="font-semibold">{row.tool.method ?? "MCP"}</span> {row.tool.path ?? "mapped tool"}
                  </td>
                  <td className="hidden px-4 py-4 text-xs text-neutral-600 md:table-cell">{row.tool.x_astrail?.risk ?? (row.tool.annotations?.destructiveHint ? "destructive" : row.tool.annotations?.readOnlyHint ? "read" : "write")}</td>
                  <td className="col-start-2 row-span-2 row-start-1 self-center md:table-cell md:px-4 md:py-4">
                    {policyMode ? (
                      <select
                        value={currentPolicy}
                        disabled={saving === key}
                        onChange={(event) => void changePolicy(row, event.target.value as McpToolPolicy)}
                        aria-label={`Policy for ${row.tool.name}`}
                        className={`h-9 rounded-md border px-2 text-xs font-semibold ${policyTone[currentPolicy]}`}
                      >
                        <option value="allow">Allow</option>
                        <option value="approval">Require approval</option>
                        <option value="block">Block</option>
                      </select>
                    ) : <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${policyTone[currentPolicy]}`}>{currentPolicy === "approval" ? "approval required" : currentPolicy}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filtered.length ? <p className="px-4 py-10 text-center text-sm text-neutral-500">No tools match this view.</p> : null}
    </div>
  );
}
