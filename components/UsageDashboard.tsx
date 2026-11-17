"use client";

import { type ReactNode, useMemo, useState } from "react";
import { CalendarDays, ChartNoAxesColumn, ChevronDown } from "lucide-react";
import type { BillingUsageSummary } from "@/lib/billing/usage";

type UsageLog = {
  id: string;
  server_id: string | null;
  tool_name: string | null;
  status: string | null;
  trace_id?: string | null;
  created_at: string;
};

type ServerRow = {
  id: string;
  name: string;
  call_count: number | null;
};

type UsageDashboardProps = {
  usage: BillingUsageSummary;
  logs: UsageLog[];
  servers: ServerRow[];
};

type RangeDays = 7 | 14 | 30;
type MetricKey = "calls" | "errors" | "sessions" | "active";
type RangeSelection =
  | { type: "preset"; days: RangeDays }
  | { type: "custom"; from: string; to: string };

type ActiveRange = {
  start: Date;
  end: Date;
  days: number;
  label: string;
};

type UsageBucket = {
  key: string;
  label: string;
  fullLabel: string;
  calls: number;
  errors: number;
  sessions: number;
  active: number;
};

const RANGE_OPTIONS: Array<{ days: RangeDays; label: string }> = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
];

const MAX_CUSTOM_RANGE_DAYS = 365;

const METRICS: Record<MetricKey, {
  label: string;
  shortLabel: string;
  color: string;
  getValue: (bucket: UsageBucket) => number;
}> = {
  calls: {
    label: "Tool calls",
    shortLabel: "Calls",
    color: "#3b82f6",
    getValue: (bucket) => bucket.calls,
  },
  errors: {
    label: "Errors",
    shortLabel: "Errors",
    color: "#ef4444",
    getValue: (bucket) => bucket.errors,
  },
  sessions: {
    label: "Sessions",
    shortLabel: "Sessions",
    color: "#a855f7",
    getValue: (bucket) => bucket.sessions,
  },
  active: {
    label: "Active users",
    shortLabel: "Active",
    color: "#22c55e",
    getValue: (bucket) => bucket.active,
  },
};

const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export function UsageDashboard({ usage, logs, servers }: UsageDashboardProps) {
  const defaultCustomFrom = useMemo(() => dateInputValue(offsetDate(new Date(), -6)), []);
  const defaultCustomTo = useMemo(() => dateInputValue(new Date()), []);
  const todayInput = useMemo(() => dateInputValue(new Date()), []);
  const [rangeSelection, setRangeSelection] = useState<RangeSelection>({ type: "preset", days: 7 });
  const [customFrom, setCustomFrom] = useState(defaultCustomFrom);
  const [customTo, setCustomTo] = useState(defaultCustomTo);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(["calls", "errors"]);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const activeRange = useMemo(() => buildActiveRange(rangeSelection), [rangeSelection]);
  const customRangeState = useMemo(() => validateCustomRange(customFrom, customTo), [customFrom, customTo]);

  const buckets = useMemo(
    () => buildDailyBuckets(logs, activeRange),
    [activeRange, logs]
  );
  const filteredLogs = useMemo(() => filterLogsForRange(logs, activeRange), [activeRange, logs]);
  const totals = useMemo(() => summarizeBuckets(buckets, filteredLogs), [buckets, filteredLogs]);
  const topTools = useMemo(
    () => topCounts(filteredLogs.map((log) => log.tool_name).filter(Boolean), 5),
    [filteredLogs]
  );
  const topServers = useMemo(
    () => buildTopServers(servers, filteredLogs, totals.calls),
    [servers, filteredLogs, totals.calls]
  );
  const visibleMetrics: MetricKey[] = selectedMetrics.length > 0 ? selectedMetrics : ["calls"];

  function setRange(days: RangeDays) {
    setRangeSelection({ type: "preset", days });
    setRangeOpen(false);
  }

  function applyCustomRange() {
    if (!customRangeState.valid) return;
    setCustomFrom(customRangeState.from);
    setCustomTo(customRangeState.to);
    setRangeSelection({ type: "custom", from: customRangeState.from, to: customRangeState.to });
    setRangeOpen(false);
  }

  function toggleMetric(metric: MetricKey) {
    setSelectedMetrics((current) => {
      if (current.includes(metric)) {
        return current.length === 1 ? current : current.filter((item) => item !== metric);
      }
      return [...current, metric];
    });
  }

  function selectAllMetrics() {
    setSelectedMetrics(METRIC_KEYS);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="border-b pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Usage</h1>
        <p className="mt-2 text-sm text-neutral-500">
            Astrail usage across your hosted MCP runtime workspace.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <ControlMenu
            icon={<CalendarDays className="h-4 w-4" />}
            label="Date range"
            value={activeRange.label}
            open={rangeOpen}
            menuClassName="w-80 sm:w-[360px]"
            onToggle={() => {
              setRangeOpen((value) => !value);
              setMetricsOpen(false);
            }}
          >
            <div className="grid gap-1 p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setRange(option.days)}
                  className={`flex items-center justify-between gap-4 rounded-md px-3 py-2 text-left text-sm transition hover:bg-neutral-100 ${
                    rangeSelection.type === "preset" && rangeSelection.days === option.days ? "text-neutral-950" : "text-neutral-500"
                  }`}
                >
                  <span>{option.label}</span>
                  <span className="font-mono text-xs text-neutral-400">{option.days}d</span>
                </button>
              ))}
              <div className="mt-1 border-t border-neutral-100 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-neutral-950">Custom range</p>
                  <span className="font-mono text-xs text-neutral-400">from / to</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid min-w-0 gap-1 text-xs font-medium text-neutral-500">
                    From
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || todayInput}
                      onChange={(event) => setCustomFrom(event.target.value)}
                      className="h-10 min-w-0 rounded-lg border border-neutral-200 bg-white px-3 font-mono text-sm text-neutral-950 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-xs font-medium text-neutral-500">
                    To
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      max={todayInput}
                      onChange={(event) => setCustomTo(event.target.value)}
                      className="h-10 min-w-0 rounded-lg border border-neutral-200 bg-white px-3 font-mono text-sm text-neutral-950 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className={`text-xs ${customRangeState.valid ? "text-neutral-400" : "text-red-500"}`}>
                    {customRangeState.message}
                  </p>
                  <button
                    type="button"
                    onClick={applyCustomRange}
                    disabled={!customRangeState.valid}
                    className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </ControlMenu>

          <ControlMenu
            icon={<ChartNoAxesColumn className="h-4 w-4" />}
            label="Metrics"
            value={`${visibleMetrics.length} ${visibleMetrics.length === 1 ? "metric" : "metrics"}`}
            open={metricsOpen}
            onToggle={() => {
              setMetricsOpen((value) => !value);
              setRangeOpen(false);
            }}
          >
            <div className="grid gap-1 p-1">
              <button
                type="button"
                onClick={selectAllMetrics}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-neutral-100 ${
                  visibleMetrics.length === METRIC_KEYS.length ? "text-neutral-950" : "text-neutral-500"
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-sm border ${visibleMetrics.length === METRIC_KEYS.length ? "border-orange-500 bg-orange-50" : "border-neutral-300 bg-white"}`}
                  aria-hidden="true"
                >
                  {visibleMetrics.length === METRIC_KEYS.length ? <span className="h-1.5 w-1.5 rounded-sm bg-orange-500" /> : null}
                </span>
                <span className="flex -space-x-1">
                  {METRIC_KEYS.map((metric) => (
                    <span key={metric} className="h-2 w-2 rounded-full ring-1 ring-white" style={{ backgroundColor: METRICS[metric].color }} />
                  ))}
                </span>
                <span>All</span>
              </button>
              <div className="my-1 h-px bg-neutral-100" />
              {METRIC_KEYS.map((metric) => {
                const selected = visibleMetrics.includes(metric);
                return (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => toggleMetric(metric)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-neutral-100 ${
                      selected ? "text-neutral-950" : "text-neutral-500"
                    }`}
                  >
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-sm border ${selected ? "border-orange-500 bg-orange-50" : "border-neutral-300 bg-white"}`}
                      aria-hidden="true"
                    >
                      {selected ? <span className="h-1.5 w-1.5 rounded-sm bg-orange-500" /> : null}
                    </span>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METRICS[metric].color }} />
                    <span>{METRICS[metric].label}</span>
                  </button>
                );
              })}
            </div>
          </ControlMenu>
        </div>
      </header>

      <PlatformUsagePanel usage={usage} buckets={buckets} totals={totals} activeRange={activeRange} />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          metric="calls"
          label="Tool calls"
          value={totals.calls.toLocaleString()}
          selected={visibleMetrics.includes("calls")}
          onToggle={toggleMetric}
        />
        <MetricCard
          metric="errors"
          label="Error rate"
          value={`${totals.errorRate}%`}
          selected={visibleMetrics.includes("errors")}
          onToggle={toggleMetric}
        />
        <MetricCard
          metric="sessions"
          label="Sessions"
          value={String(Math.max(totals.sessions, totals.calls > 0 ? 1 : 0))}
          selected={visibleMetrics.includes("sessions")}
          onToggle={toggleMetric}
        />
        <MetricCard
          metric="active"
          label="Active users"
          value={String(totals.activeUsers)}
          selected={visibleMetrics.includes("active")}
          onToggle={toggleMetric}
        />
      </div>

      <section className="console-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">{chartTitle(visibleMetrics)}</h2>
            <p className="mt-2 text-sm text-neutral-500">{formatRange(buckets)}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {METRIC_KEYS.map((metric) => (
              <LegendButton
                key={metric}
                metric={metric}
                selected={visibleMetrics.includes(metric)}
                onToggle={toggleMetric}
              />
            ))}
          </div>
        </div>
        <UsageChart buckets={buckets} metrics={visibleMetrics} />
      </section>

      <section className="console-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-neutral-950">Premium tool calls</h2>
        <p className="mt-2 text-sm text-neutral-500">0 premium calls</p>
        <div className="mt-7 space-y-5">
          {["Search", "Browser", "AI / ML", "Data extraction", "Document processing", "Sandbox"].map((label) => (
            <BarRow key={label} label={label} value={0} max={1} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="console-card p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-neutral-950">Top apps</h2>
          <div className="mt-5 space-y-4">
            {topServers.length > 0 ? (
              topServers.map((item) => <BarRow key={item.label} label={item.label} value={item.count} max={topServers[0]?.count ?? 1} />)
            ) : (
              <EmptyLine>No runtime apps recorded yet.</EmptyLine>
            )}
          </div>
        </section>

        <section className="console-card p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-neutral-950">Top tools</h2>
          <div className="mt-5 space-y-4">
            {topTools.length > 0 ? (
              topTools.map((item) => <BarRow key={item.label} label={item.label} value={item.count} max={topTools[0]?.count ?? 1} />)
            ) : (
              <EmptyLine>No tools called yet.</EmptyLine>
            )}
          </div>
        </section>
      </div>

      <section className="console-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-neutral-950">Billing meters</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Meter label="Tool calls" used={usage.used} limit={usage.limit} percent={usage.percentUsed} />
          <Meter label="MCP generations" used={usage.generationsUsed} limit={usage.generationLimit} percent={usage.generationPercentUsed} />
          <Meter label="Hosted endpoints" used={usage.endpointsUsed} limit={usage.endpointLimit} percent={usage.endpointPercentUsed} />
        </div>
      </section>
    </div>
  );
}

function PlatformUsagePanel({
  usage,
  buckets,
  totals,
  activeRange,
}: {
  usage: BillingUsageSummary;
  buckets: UsageBucket[];
  totals: ReturnType<typeof summarizeBuckets>;
  activeRange: ActiveRange;
}) {
  const toolCallCreditCost = usage.meterCosts.tool_call ?? 1;
  const rangeCredits = totals.calls * toolCallCreditCost;
  const remainingCredits = usage.creditsRemaining === null ? "Fair use" : usage.creditsRemaining.toLocaleString();
  const periodPercent = Math.min(Math.max(usage.creditsPercentUsed ?? 0, 0), 100);
  const budgetWidth = usage.creditLimit === null ? 100 : Math.max(2, periodPercent);
  const creditOverage = usage.creditLimit !== null && usage.creditsUsed > usage.creditLimit ? usage.creditsUsed - usage.creditLimit : 0;
  const displayedCreditsUsed = usage.creditLimit === null ? usage.creditsUsed : Math.min(usage.creditsUsed, usage.creditLimit);
  const creditUsageLabel = usage.creditLimit === null
    ? `${usage.creditsUsed.toLocaleString()} used · fair use`
    : creditOverage > 0
      ? `${usage.creditLimit.toLocaleString()} used · limit reached`
      : `${displayedCreditsUsed.toLocaleString()} used · ${usage.creditLimit.toLocaleString()} included`;
  const nextReset = new Date(usage.currentPeriodEnd);
  const resetLabel = Number.isNaN(nextReset.getTime()) ? "Current period" : nextReset.toLocaleDateString();

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="console-card overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 px-5 py-5">
          <div>
            <p className="text-sm text-neutral-500">Range credit spend</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <h2 className="text-4xl font-semibold tracking-tight text-neutral-950">{rangeCredits.toLocaleString()}</h2>
              <span className="pb-1 text-sm text-neutral-500">credits from accepted tool calls</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="rounded-md border border-neutral-200 bg-white px-3 py-1">Group by 1d</span>
            <span className="rounded-md border border-neutral-200 bg-white px-3 py-1">{activeRange.label}</span>
          </div>
        </div>
        <CreditSpendBars buckets={buckets} costPerCall={toolCallCreditCost} />
      </div>

      <aside className="console-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Monthly credit cap</p>
            <h2 className="mt-2 text-2xl font-semibold text-neutral-950">{usage.planName}</h2>
          </div>
          <span className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500">{formatBillingStatus(usage.status)}</span>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-neutral-500">Used this period</span>
            <span className={`font-mono ${creditOverage > 0 ? "text-orange-700" : "text-neutral-950"}`}>{creditUsageLabel}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-sm bg-neutral-100">
            <div className="h-full rounded-sm bg-neutral-950" style={{ width: `${budgetWidth}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-neutral-500">
            <span>{remainingCredits} credits left</span>
            <span>Resets {resetLabel}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 border-t border-neutral-200 pt-5">
          <UsageBreakdownRow label="Total requests" value={usage.used.toLocaleString()} sub={usage.remaining === null ? "fair use" : `${usage.remaining.toLocaleString()} left`} />
          <UsageBreakdownRow label="Generated endpoints" value={usage.endpointsUsed.toLocaleString()} sub={usage.endpointLimit === null ? "fair use" : `${Math.max(0, usage.endpointLimit - usage.endpointsUsed).toLocaleString()} slots left`} />
          <UsageBreakdownRow label="Generations" value={usage.generationsUsed.toLocaleString()} sub={usage.generationLimit === null ? "fair use" : `${Math.max(0, usage.generationLimit - usage.generationsUsed).toLocaleString()} left`} />
        </div>
      </aside>
    </section>
  );
}

function CreditSpendBars({ buckets, costPerCall }: { buckets: UsageBucket[]; costPerCall: number }) {
  const values = buckets.map((bucket) => bucket.calls * costPerCall);
  const maxValue = Math.max(1, ...values);
  const hasData = values.some((value) => value > 0);
  const labelStep = buckets.length <= 14 ? Math.max(1, Math.ceil(buckets.length / 4)) : Math.ceil(buckets.length / 6);

  return (
    <div className="px-5 pb-5 pt-6">
      <div className="relative flex h-56 items-end gap-1 border-b border-neutral-200">
        {[0, 1, 2].map((line) => (
          <div
            key={line}
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-neutral-200"
            style={{ bottom: `${(line / 2) * 100}%` }}
          />
        ))}
        {values.map((value, index) => {
          const height = value === 0 ? 2 : Math.max(8, Math.round((value / maxValue) * 100));
          return (
            <div key={buckets[index].key} className="group relative flex min-w-0 flex-1 items-end">
              <div
                className={`w-full rounded-t-sm transition ${value > 0 ? "bg-orange-600 group-hover:bg-orange-500" : "bg-neutral-200"}`}
                style={{ height: `${height}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs shadow-lg group-hover:block">
                <span className="font-medium text-neutral-950">{buckets[index].fullLabel}</span>
                <span className="ml-2 text-neutral-500">{value.toLocaleString()} credits</span>
              </div>
            </div>
          );
        })}
        {!hasData ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-neutral-400">
            No dated tool-call events in this range.
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid text-xs text-neutral-400" style={{ gridTemplateColumns: `repeat(${Math.max(1, buckets.length)}, minmax(0, 1fr))` }}>
        {buckets.map((bucket, index) => (
          <span key={bucket.key} className="truncate text-center">
            {index === 0 || index === buckets.length - 1 || index % labelStep === 0 ? bucket.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function UsageBreakdownRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white/70 px-3 py-3">
      <div>
        <div className="text-sm text-neutral-500">{label}</div>
        <div className="mt-1 text-xs text-neutral-400">{sub}</div>
      </div>
      <div className="font-mono text-lg font-semibold text-neutral-950">{value}</div>
    </div>
  );
}

function ControlMenu({
  icon,
  label,
  value,
  open,
  menuClassName = "min-w-52",
  onToggle,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  open: boolean;
  menuClassName?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
        aria-expanded={open}
      >
        <span className="text-neutral-400">{icon}</span>
        <span className="text-neutral-500">{label}</span>
        <span className="font-medium text-neutral-950">{value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-neutral-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className={`absolute left-0 z-20 mt-2 rounded-lg border border-neutral-200 bg-white shadow-sm ${menuClassName}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  metric,
  label,
  value,
  selected,
  onToggle,
}: {
  metric: MetricKey;
  label: string;
  value: string;
  selected: boolean;
  onToggle: (metric: MetricKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(metric)}
      className={`console-card min-h-28 p-5 text-left transition-colors hover:border-orange-300 ${
        selected ? "ring-2 ring-orange-200" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-neutral-500">{label}</span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: METRICS[metric].color }} />
      </div>
      <div className="mt-4 text-3xl font-semibold text-neutral-950">{value}</div>
    </button>
  );
}

function LegendButton({
  metric,
  selected,
  onToggle,
}: {
  metric: MetricKey;
  selected: boolean;
  onToggle: (metric: MetricKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(metric)}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition ${
        selected ? "border-neutral-200 bg-white text-neutral-700" : "border-transparent bg-neutral-100 text-neutral-400"
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METRICS[metric].color }} />
      {METRICS[metric].label}
    </button>
  );
}

function UsageChart({ buckets, metrics }: { buckets: UsageBucket[]; metrics: MetricKey[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const width = 900;
  const height = 260;
  const padding = { left: 42, right: 34, top: 18, bottom: 36 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const activeIndex = selectedIndex ?? hoveredIndex ?? buckets.length - 1;
  const maxValue = Math.max(
    1,
    ...buckets.flatMap((bucket) => metrics.map((metric) => METRICS[metric].getValue(bucket)))
  );
  const pointsByMetric = Object.fromEntries(metrics.map((metric) => {
    const points = buckets.map((bucket, index) => {
      const x = padding.left + (plotWidth / Math.max(1, buckets.length - 1)) * index;
      const y = padding.top + plotHeight - (METRICS[metric].getValue(bucket) / maxValue) * plotHeight;
      return { ...bucket, x, y, value: METRICS[metric].getValue(bucket) };
    });
    return [metric, points];
  })) as Record<MetricKey, Array<UsageBucket & { x: number; y: number; value: number }>>;
  const activeBucket = buckets[activeIndex];
  const activeX = activeBucket
    ? padding.left + (plotWidth / Math.max(1, buckets.length - 1)) * activeIndex
    : padding.left;
  const labelStep = buckets.length <= 14 ? 1 : Math.ceil(buckets.length / 8);

  function nearestPoint(clientX: number, element: SVGSVGElement) {
    const rect = element.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
    const relative = Math.min(Math.max(svgX - padding.left, 0), plotWidth);
    const ratio = relative / Math.max(1, plotWidth);
    return Math.min(buckets.length - 1, Math.max(0, Math.round(ratio * (buckets.length - 1))));
  }

  return (
    <div className="relative mt-6 overflow-hidden">
      <svg
        className="h-[280px] w-full cursor-crosshair touch-pan-y"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Interactive usage chart"
        onMouseMove={(event) => setHoveredIndex(nearestPoint(event.clientX, event.currentTarget))}
        onMouseLeave={() => setHoveredIndex(null)}
        onClick={(event) => setSelectedIndex(nearestPoint(event.clientX, event.currentTarget))}
      >
        {[0, 1, 2, 3].map((line) => {
          const y = padding.top + plotHeight - (line / 3) * plotHeight;
          return (
            <line
              key={line}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(15,23,42,0.08)"
            />
          );
        })}
        {buckets.map((bucket, index) => {
          const x = padding.left + (plotWidth / Math.max(1, buckets.length - 1)) * index;
          if (index !== 0 && index !== buckets.length - 1 && index % labelStep !== 0) return null;
          return (
            <text key={bucket.key} x={x} y={height - 9} textAnchor="middle" fill="rgba(82,82,91,0.72)" fontSize="11">
              {bucket.label}
            </text>
          );
        })}
        {metrics.map((metric) => {
          const points = pointsByMetric[metric];
          const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
          return (
            <g key={metric}>
              <path d={path} fill="none" stroke={METRICS[metric].color} strokeWidth={metric === "calls" ? "2.6" : "2"} />
              {points.map((point, index) => (
                <circle
                  key={`${metric}-${point.key}`}
                  cx={point.x}
                  cy={point.y}
                  r={index === activeIndex ? 4.5 : 3}
                  fill={METRICS[metric].color}
                  tabIndex={0}
                  role="button"
                  aria-label={`${METRICS[metric].label} on ${point.fullLabel}: ${point.value}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedIndex(index);
                  }}
                  onFocus={() => setSelectedIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedIndex(index);
                  }}
                />
              ))}
            </g>
          );
        })}
        {activeBucket ? (
          <line
            x1={activeX}
            x2={activeX}
            y1={padding.top}
            y2={height - padding.bottom}
            stroke="rgba(15,23,42,0.16)"
            strokeDasharray="4 5"
          />
        ) : null}
      </svg>
      {activeBucket ? (
        <div
          className="pointer-events-none absolute top-4 min-w-44 rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-sm"
          style={{ left: `min(calc(${(activeX / width) * 100}% + 10px), calc(100% - 12rem))` }}
        >
          <div className="font-medium text-neutral-950">{activeBucket.fullLabel}</div>
          <div className="mt-2 grid gap-1">
            {metrics.map((metric) => (
              <div key={metric} className="flex items-center justify-between gap-4 text-neutral-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METRICS[metric].color }} />
                  {METRICS[metric].shortLabel}
                </span>
                <span className="font-mono text-neutral-950">{METRICS[metric].getValue(activeBucket)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildDailyBuckets(logs: UsageLog[], range: ActiveRange): UsageBucket[] {
  const todayKey = localDateKey(new Date());
  const days = Array.from({ length: range.days }, (_, index) => {
    const date = new Date(range.start);
    date.setDate(range.start.getDate() + index);
    const key = localDateKey(date);
    return {
      key,
      label: key === todayKey ? "Today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      fullLabel: key === todayKey ? "Today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      calls: 0,
      errors: 0,
      sessions: 0,
      active: 0,
      traces: new Set<string>(),
    };
  });

  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const log of logs) {
    const key = localDateKey(new Date(log.created_at));
    const bucket = byKey.get(key);
    if (!bucket) continue;
    bucket.calls += 1;
    if (log.status === "error") bucket.errors += 1;
    if (log.trace_id) bucket.traces.add(log.trace_id);
  }

  return days.map(({ traces, ...day }) => ({
    ...day,
    sessions: traces.size || (day.calls > 0 ? 1 : 0),
    active: day.calls > 0 ? 1 : 0,
  }));
}

function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function filterLogsForRange(logs: UsageLog[], range: ActiveRange) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);
  return logs.filter((log) => {
    const createdAt = new Date(log.created_at);
    return createdAt >= start && createdAt <= end;
  });
}

function buildActiveRange(selection: RangeSelection): ActiveRange {
  if (selection.type === "preset") {
    const end = startOfLocalDay(new Date());
    const start = offsetDate(end, -(selection.days - 1));
    const label = RANGE_OPTIONS.find((option) => option.days === selection.days)?.label ?? "Last 7 days";
    return { start, end, days: selection.days, label };
  }

  const validation = validateCustomRange(selection.from, selection.to);
  if (!validation.valid) return buildActiveRange({ type: "preset", days: 7 });

  const start = parseInputDate(validation.from) ?? startOfLocalDay(new Date());
  const end = parseInputDate(validation.to) ?? startOfLocalDay(new Date());
  const days = countInclusiveDays(start, end);
  return {
    start,
    end,
    days,
    label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
  };
}

function validateCustomRange(from: string, to: string) {
  const start = parseInputDate(from);
  const end = parseInputDate(to);
  const today = startOfLocalDay(new Date());

  if (!start || !end) {
    return { valid: false, from, to, message: "Select both dates." };
  }
  if (start > end) {
    return { valid: false, from, to, message: "From must be before To." };
  }
  if (end > today) {
    return { valid: false, from, to, message: "To cannot be in the future." };
  }

  const days = countInclusiveDays(start, end);
  if (days > MAX_CUSTOM_RANGE_DAYS) {
    return { valid: false, from, to, message: `Choose ${MAX_CUSTOM_RANGE_DAYS} days or less.` };
  }

  return {
    valid: true,
    from: dateInputValue(start),
    to: dateInputValue(end),
    message: `${days} ${days === 1 ? "day" : "days"}`,
  };
}

function parseInputDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return startOfLocalDay(date);
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function offsetDate(date: Date, days: number) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

function countInclusiveDays(start: Date, end: Date) {
  return Math.floor((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / 86_400_000) + 1;
}

function dateInputValue(date: Date) {
  const local = startOfLocalDay(date);
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${local.getFullYear()}-${month}-${day}`;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function summarizeBuckets(buckets: UsageBucket[], logs: UsageLog[]) {
  const calls = buckets.reduce((sum, bucket) => sum + bucket.calls, 0);
  const errors = buckets.reduce((sum, bucket) => sum + bucket.errors, 0);
  const sessions = countUnique(logs.map((log) => log.trace_id).filter(Boolean));
  const activeUsers = calls > 0 ? 1 : 0;
  const errorRate = calls > 0 ? Math.round((errors / calls) * 100) : 0;
  return { calls, errors, sessions, activeUsers, errorRate };
}

function buildTopServers(servers: ServerRow[], logs: UsageLog[], fallbackCalls: number) {
  const serverNames = new Map(servers.map((server) => [server.id, server.name]));
  const logCounts = topCounts(logs.map((log) => log.server_id).filter(Boolean), 5)
    .map((item) => ({
      label: serverNames.get(item.label) ?? item.label.slice(0, 22),
      count: item.count,
    }));
  if (logCounts.length > 0) return logCounts;

  const serverCounts = servers
    .map((server) => ({ label: server.name, count: server.call_count ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  if (serverCounts.length > 0) return serverCounts;
  if (fallbackCalls > 0) return [{ label: "Hosted MCP runtime", count: fallbackCalls }];
  return [];
}

function topCounts(values: Array<string | null | undefined>, limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function countUnique(values: Array<string | null | undefined>) {
  return new Set(values.filter(Boolean)).size;
}

function formatRange(buckets: UsageBucket[]) {
  const start = buckets[0]?.fullLabel ?? "";
  const end = buckets[buckets.length - 1]?.fullLabel ?? "";
  return `Daily · ${start} — ${end}`;
}

function formatBillingStatus(status: string) {
  const normalized = status.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized || normalized === "free" || normalized === "active") return "Active";
  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function chartTitle(metrics: MetricKey[]) {
  if (metrics.length === 1) return METRICS[metrics[0]].label;
  if (metrics.includes("calls") && metrics.includes("errors") && metrics.length === 2) return "Tool calls";
  return "Usage metrics";
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = value === 0 ? 0 : Math.max(6, Math.round((value / Math.max(1, max)) * 100));

  return (
    <div className="grid grid-cols-[minmax(0,160px)_1fr_40px] items-center gap-4 text-sm">
      <span className="truncate text-neutral-500">{label}</span>
      <div className="h-2 rounded-sm bg-neutral-100">
        <div className="h-full rounded-sm bg-orange-300" style={{ width: `${width}%` }} />
      </div>
      <span className="text-right text-neutral-700">{value}</span>
    </div>
  );
}

function Meter({ label, used, limit, percent }: { label: string; used: number; limit: number | null; percent: number | null }) {
  const width = Math.min(Math.max(percent ?? 0, 3), 100);
  const overLimit = limit !== null && used > limit ? used - limit : 0;
  const displayUsage = limit === null
    ? `${used.toLocaleString()} used · fair use`
    : `${used.toLocaleString()} used · ${limit.toLocaleString()} included`;
  const barColor = overLimit > 0 ? "bg-orange-500" : width >= 100 ? "bg-neutral-950" : "bg-emerald-400";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
        <span className="text-neutral-500">{label}</span>
        <span className="flex flex-wrap items-center justify-end gap-2 text-right">
          <span className={overLimit > 0 ? "text-orange-700" : "text-neutral-700"}>{displayUsage}</span>
          {overLimit > 0 ? (
            <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
              Upgrade needed
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-3 h-2 rounded-sm bg-neutral-100">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}
