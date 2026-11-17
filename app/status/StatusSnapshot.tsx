"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

type HealthPayload = {
  status?: "ready" | "preview" | "degraded";
  timestamp?: string;
  mcp_edge_rate_limit?: { status?: string; distributed?: boolean };
  edge_protection?: { status?: string; provider_name?: string };
  config?: { status?: string };
  schema?: { status?: string; storage?: string; missing_count?: number };
};

type Snapshot = {
  payload: HealthPayload | null;
  checkedAt: string | null;
  reachable: boolean;
};

const initialSnapshot: Snapshot = { payload: null, checkedAt: null, reachable: true };

function readinessLabel(snapshot: Snapshot) {
  if (!snapshot.payload && snapshot.reachable) return "Checking";
  if (!snapshot.reachable) return "Unavailable";
  return snapshot.payload?.status === "ready" ? "Operational" : "Degraded";
}

function statusTone(status: string) {
  if (status === "ready" || status === "distributed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "checking") return "border-neutral-200 bg-neutral-50 text-neutral-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function StatusSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = await response.json() as HealthPayload;
      setSnapshot({ payload, checkedAt: new Date().toISOString(), reachable: true });
    } catch {
      setSnapshot({ payload: null, checkedAt: new Date().toISOString(), reachable: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const label = readinessLabel(snapshot);
  const ready = snapshot.payload?.status === "ready";
  const badgeTone = ready
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : label === "Checking"
      ? "border-neutral-200 bg-neutral-50 text-neutral-600"
      : "border-amber-200 bg-amber-50 text-amber-800";
  const checks = [
    ["Runtime configuration", snapshot.payload?.config?.status ?? "checking", "Required secrets and deployment settings"],
    ["Persistent operations", snapshot.payload?.schema?.status ?? "checking", snapshot.payload?.schema?.missing_count ? `${snapshot.payload.schema.missing_count} required tables unavailable` : "Runtime logs, idempotency, webhooks, and schema history"],
    ["Distributed rate limits", snapshot.payload?.mcp_edge_rate_limit?.status ?? "checking", "Shared abuse limits across deployment instances"],
    ["Edge protection", snapshot.payload?.edge_protection?.status ?? "checking", "Provider DDoS, WAF, bot, and body-size controls"],
  ] as const;

  return (
    <>
      <section className="mt-8 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm" aria-live="polite">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeTone}`}>
              <span className={`h-2 w-2 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} />
              {label}
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Live readiness</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              This is the same fail-closed health check used by the deployment. A degraded result means Astrail should not be represented as fully production ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <div className="mt-5 grid gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Probe</p>
            <p className="mt-1 text-sm font-semibold text-neutral-950">/api/health</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Last checked</p>
            <p className="mt-1 text-sm font-semibold text-neutral-950">{snapshot.checkedAt ? new Date(snapshot.checkedAt).toLocaleString() : "In progress"}</p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-4">
          <Activity className="h-4 w-4 text-orange-600" />
          <h2 className="text-xl font-semibold">Readiness checks</h2>
        </div>
        <div className="divide-y divide-neutral-100">
          {checks.map(([name, status, detail]) => (
            <div key={name} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-neutral-950">{name}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">{detail}</p>
              </div>
              <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}>
                {status.replaceAll("_", " ")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
