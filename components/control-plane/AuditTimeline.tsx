"use client";

import { useEffect, useState } from "react";
import type { RuntimeLog } from "@/lib/types";

function value(value: string | null | undefined, fallback = "—") {
  return value?.trim() || fallback;
}

function statusTone(status: string | null) {
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status?.includes("approval") || status?.includes("auth")) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-800";
}

type AuditPage = {
  rows: RuntimeLog[];
  has_more: boolean;
  next_before: string | null;
  next_before_id: string | null;
};

export function AuditTimeline({ logs: initialLogs, serverNames }: { logs: RuntimeLog[]; serverNames: Record<string, string> }) {
  const [logs, setLogs] = useState(initialLogs);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [hasMore, setHasMore] = useState(initialLogs.length >= 100);
  const [searchResults, setSearchResults] = useState<RuntimeLog[] | null>(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState("");
  const normalizedQuery = query.trim();
  const searchActive = normalizedQuery.length > 0 || status !== "all";
  const displayedLogs = searchActive ? searchResults ?? [] : logs;
  const displayedHasMore = searchActive ? searchHasMore : hasMore;

  useEffect(() => {
    if (!searchActive) {
      setSearchResults(null);
      setSearchHasMore(false);
      setSearching(false);
      setLoadError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setLoadError("");
      const params = new URLSearchParams({ format: "json", limit: "100" });
      if (normalizedQuery) params.set("q", normalizedQuery);
      if (status !== "all") params.set("status", status);
      try {
        const response = await fetch(`/api/audit/export?${params}`, {
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const page = await response.json() as AuditPage & { error?: string };
        if (!response.ok) throw new Error(page.error || "Could not search audit events.");
        setSearchResults(page.rows);
        setSearchHasMore(page.has_more);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchHasMore(false);
        setLoadError(error instanceof Error ? error.message : "Could not search audit events.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, searchActive, status]);

  const exportQuery = new URLSearchParams({ format: "csv", limit: "5000" });
  if (normalizedQuery) exportQuery.set("q", normalizedQuery);
  if (status !== "all") exportQuery.set("status", status);

  async function loadOlder() {
    const cursor = displayedLogs.at(-1);
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setLoadError("");
    const params = new URLSearchParams({
      format: "json",
      limit: "100",
      before: cursor.created_at,
      before_id: cursor.id,
    });
    if (normalizedQuery) params.set("q", normalizedQuery);
    if (status !== "all") params.set("status", status);
    try {
      const response = await fetch(`/api/audit/export?${params}`, { headers: { accept: "application/json" } });
      const page = await response.json() as AuditPage & { error?: string };
      if (!response.ok) throw new Error(page.error || "Could not load older audit events.");
      if (searchActive) {
        setSearchResults((current) => {
          const existing = current ?? [];
          const known = new Set(existing.map((item) => item.id));
          return [...existing, ...page.rows.filter((item) => !known.has(item.id))];
        });
        setSearchHasMore(page.has_more);
      } else {
        setLogs((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...page.rows.filter((item) => !known.has(item.id))];
        });
        setHasMore(page.has_more);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load older audit events.");
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, agent, key, tool, trace, or credential ID" className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 text-sm outline-none ring-orange-500 focus:ring-2" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm">
            <option value="all">All outcomes</option><option value="success">Success</option><option value="error">Error</option><option value="permission_denied">Denied</option><option value="approval_required">Approval</option><option value="payment_required">x402 payment required</option><option value="oauth_required">OAuth required</option>
          </select>
        </div>
        <div className="flex gap-2">
          <a href={`/api/audit/export?${exportQuery}`} className="inline-flex h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm font-semibold text-neutral-800">Export 5k CSV</a>
          <a href={`/api/audit/export?${exportQuery.toString().replace("format=csv", "format=json")}`} className="inline-flex h-10 items-center rounded-lg bg-neutral-950 px-3 text-sm font-semibold text-white">Export 5k JSON</a>
        </div>
      </div>
      <div className="divide-y divide-neutral-100">
        {displayedLogs.map((log) => (
          <article key={log.id} className="p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(log.status)}`}>{value(log.status, "unknown")}</span>
                  <span className="font-mono text-xs text-neutral-500">{new Date(log.created_at).toLocaleString()}</span>
                  <span className="font-mono text-xs text-neutral-500">trace {value(log.trace_id)}</span>
                </div>
                <p className="mt-3 font-semibold text-neutral-950">{log.summary || `${value(log.end_user_id, "Workspace agent")} called ${value(log.tool_name, "unknown tool")}`}</p>
                <p className="mt-1 text-sm text-neutral-500">{log.server_id ? serverNames[log.server_id] ?? "Unknown integration" : "Deleted integration"} · <span className="font-mono">{value(log.method)} {value(log.path)}</span></p>
                <p className="mt-1 text-xs text-neutral-500">Agent <span className="font-mono">{value(log.agent_id, "unbound")}</span> · task <span className="font-mono">{value(log.task_id ?? log.task_authorization_id, "none")}</span> · purpose {value(log.purpose, "not declared")}</p>
                {log.event_hash ? <p className="mt-1 font-mono text-[11px] text-neutral-400">evidence #{log.evidence_sequence} {log.event_hash.slice(0, 16)}…</p> : <p className="mt-1 text-xs font-medium text-amber-700">Integrity gap: this event predates evidence hashing or storage migration.</p>}
              </div>
              <div className="grid shrink-0 gap-2 text-xs text-neutral-600 sm:grid-cols-3 lg:min-w-[480px]">
                <div className="rounded-lg bg-neutral-50 p-3"><p className="text-neutral-400">User and role</p><p className="mt-1 font-mono text-neutral-800">{value(log.end_user_id, "workspace")}</p><p>{value(log.actor_role, "default role")}</p></div>
                <div className="rounded-lg bg-neutral-50 p-3"><p className="text-neutral-400">Reported client and verified key</p><p className="mt-1 font-mono text-neutral-800">{value(log.client_name, "unreported client")}</p><p>{value(log.api_key_name, "anonymous/public")} {log.api_key_preview ? `(${log.api_key_preview})` : ""}</p></div>
                <div className="rounded-lg bg-neutral-50 p-3"><p className="text-neutral-400">Provider grants</p>{(log.credential_refs ?? []).length ? log.credential_refs?.map((ref) => <p key={ref.id} className="mt-1"><span className="font-medium text-neutral-800">{ref.name}</span><br /><span className="font-mono">{ref.provider ?? ref.auth_scheme} · {ref.id.slice(0, 8)}</span></p>) : <p className="mt-1">No provider credential used</p>}</div>
              </div>
            </div>
            {(log.arguments_redacted || log.error || log.policy_result) ? <details className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs"><summary className="cursor-pointer font-semibold text-neutral-700">Intent, policy, approval, redacted request and provider result</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-neutral-600">{JSON.stringify({ purpose: log.purpose ?? null, arguments: log.arguments_redacted ?? null, affected_resources: log.affected_resources ?? [], effective_scopes: log.effective_scopes ?? [], policy_result: log.policy_result ?? null, approval: { id: log.approval_id ?? null, actor: log.approval_actor_id ?? null, decision: log.approval_decision ?? null, decided_at: log.approval_decided_at ?? null, reason: log.approval_reason ?? null, execution_claim_id: log.execution_claim_id ?? null }, provider_result: log.provider_result ?? { error_code: log.error_code ?? null, error: log.error ?? null, upstream_status: log.upstream_status ?? null }, latency_ms: log.latency_ms ?? null, attempts: log.attempt_count ?? null }, null, 2)}</pre></details> : null}
          </article>
        ))}
        {!displayedLogs.length ? <p className="p-10 text-center text-sm text-neutral-500">{searching ? "Searching audit history…" : "No audit events match this view."}</p> : null}
      </div>
      {displayedHasMore || loadError ? <div className="border-t border-neutral-200 p-4 text-center">
        {loadError ? <p className="mb-2 text-sm text-red-700">{loadError}</p> : null}
        {displayedHasMore ? <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 disabled:opacity-50">{loadingOlder ? "Loading older events…" : "Load older events"}</button> : null}
      </div> : null}
    </section>
  );
}
