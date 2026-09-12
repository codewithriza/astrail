import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { headers } from "next/headers";
import {
  ArrowRight,
  ArrowUpRight,
  BookUser,
  ChevronRight,
  Copy,
  Flag,
  KeyRound,
  Loader,
  OctagonAlert,
  Settings,
  Sparkles,
  Terminal,
  TrendingDown,
  TrendingUp,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { accountFirstName, timeGreeting, timezoneFromHeaders } from "@/lib/account-display";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { presetServers } from "@/lib/preset-servers";
import { getRuntimeAnalytics, type RuntimeAnalytics } from "@/lib/runtime/analytics";
import { createDataClient } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";
import type { McpServer } from "@/lib/types";

const catalogApps = [
  { name: "GitHub", detail: "Repos, issues, and pull requests", icon: "/app-icons/github.svg", href: "/marketplace/preset-github" },
  { name: "Linear", detail: "Issues and project tracking", icon: "/app-icons/linear.svg", href: "/marketplace/preset-linear" },
  { name: "Notion", detail: "Docs and knowledge bases", icon: "/app-icons/notion.svg", href: "/marketplace/preset-notion" },
  { name: "Slack", detail: "Messages and channels", icon: "/app-icons/slack.svg", href: "/marketplace/preset-slack" },
  { name: "Stripe", detail: "Payments and customers", icon: "/app-icons/stripe.svg", href: "/marketplace/preset-stripe" },
];

const ACTIVITY_YEAR = 2026;

type ServerActivityDay = {
  date: string;
  count: number;
};

type DashboardData = {
  items: McpServer[];
  liveCount: number;
  publicCount: number;
  successRate: number;
  totalLoggedCalls: number;
  name: string;
  firstServer?: McpServer;
  isPending?: boolean;
};

function Heatmap({ activityDays }: { activityDays: ServerActivityDay[] }) {
  const days = 7;
  const gapSize = "clamp(2px, 0.22vw, 4px)";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yearStart = new Date(ACTIVITY_YEAR, 0, 1);
  const yearEnd = new Date(ACTIVITY_YEAR, 11, 31);
  const visibleEnd = today.getFullYear() === ACTIVITY_YEAR
    ? today
    : today.getFullYear() > ACTIVITY_YEAR
      ? yearEnd
      : yearStart;
  const gridStart = new Date(yearStart);
  gridStart.setDate(yearStart.getDate() - yearStart.getDay());
  const gridEnd = new Date(yearEnd);
  gridEnd.setDate(yearEnd.getDate() + (days - 1 - yearEnd.getDay()));
  const cellCount = Math.floor((gridEnd.getTime() - gridStart.getTime()) / DAY_MS) + 1;
  const weeks = Math.max(1, Math.ceil(cellCount / days));

  const formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  const monthFormatter = new Intl.DateTimeFormat("en", { month: "short" });
  const currentYearActivity = activityDays.filter((item) => item.date.startsWith(`${ACTIVITY_YEAR}-`));
  const serversByDate = new Map(currentYearActivity.map((item) => [item.date, item.count]));
  const maxDaily = Math.max(1, ...currentYearActivity.map((item) => item.count));
  const hasActivity = currentYearActivity.some((item) => item.count > 0);
  const totalGenerated = currentYearActivity.reduce((sum, item) => sum + item.count, 0);
  const activeActivityDays = currentYearActivity.filter((item) => item.count > 0);
  const recentActivity = [...activeActivityDays].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  const cells = Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = localDateKey(date);
    const isCurrentYear = date.getFullYear() === ACTIVITY_YEAR;
    const isVisibleDay = isCurrentYear && date <= visibleEnd;
    const count = serversByDate.get(dateKey) ?? 0;
    const level = count === 0 ? 0 : count >= maxDaily ? 4 : Math.max(1, Math.ceil((count / maxDaily) * 4));

    return {
      count,
      date,
      dateKey,
      isCurrentYear,
      isVisibleDay,
      level,
      label: `${count} MCP ${count === 1 ? "server" : "servers"} generated on ${formatter.format(date)}`,
    };
  });

  const monthLabels = Array.from({ length: 12 }, (_, monthOffset) => {
    const date = new Date(ACTIVITY_YEAR, monthOffset, 1);
    return {
      label: monthFormatter.format(date),
      column: Math.floor((date.getTime() - gridStart.getTime()) / (DAY_MS * days)) + 1,
    };
  });

  const colorByLevel = [
    "bg-neutral-100",
    "bg-amber-200",
    "bg-amber-400",
    "bg-orange-400",
    "bg-orange-600",
  ];

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500">
          <span className="font-semibold tabular-nums text-neutral-950">{totalGenerated.toLocaleString()}</span> MCP {totalGenerated === 1 ? "server" : "servers"} generated in {ACTIVITY_YEAR}
        </p>
        <span className="pill pill-neutral w-fit">{activeActivityDays.length.toLocaleString()} active days</span>
      </div>
      {recentActivity.length > 0 ? (
        <div className="mb-4 grid gap-2 sm:hidden">
          {recentActivity.map((day) => (
            <Link
              key={day.date}
              href={`/dashboard?activityDate=${day.date}`}
              className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white px-3 py-3 text-sm"
            >
              <span className="font-medium text-neutral-950">{formatActivityDate(day.date)}</span>
              <span className="pill pill-brand">{day.count} generated</span>
            </Link>
          ))}
        </div>
      ) : null}
      <div className="overflow-hidden pb-1">
        <div className="w-full min-w-0">
          <div
            className="mb-2 grid pl-9 text-[11px] leading-none text-neutral-400"
            style={{
              gap: gapSize,
              gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
            }}
          >
            {monthLabels.map((month) => (
              <span key={month.label} className="truncate" style={{ gridColumn: `${month.column} / span 4` }}>
                {month.label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-[28px_1fr] gap-2">
            <div
              className="grid text-[11px] leading-none text-neutral-400"
              style={{ gap: gapSize, gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
            >
              <span />
              <span className="flex items-center">Mon</span>
              <span />
              <span className="flex items-center">Wed</span>
              <span />
              <span className="flex items-center">Fri</span>
              <span />
            </div>
            <div
              className="grid grid-flow-col grid-rows-7"
              style={{
                gap: gapSize,
                gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
                gridTemplateRows: "repeat(7, minmax(0, 1fr))",
              }}
            >
              {cells.map((cell) => {
                const className = cell.isVisibleDay
                  ? `rounded-[4px] ${colorByLevel[cell.level]} ${cell.count > 0 ? "transition hover:ring-2 hover:ring-orange-400" : ""}`
                  : cell.isCurrentYear
                    ? "rounded-[4px] bg-neutral-100/60"
                  : "rounded-[4px] bg-transparent";
                const style = { aspectRatio: "1 / 1", width: "100%" };

                return cell.count > 0 && cell.isVisibleDay ? (
                  <Link
                    key={cell.date.toISOString()}
                    href={`/dashboard?activityDate=${cell.dateKey}`}
                    title={cell.label}
                    aria-label={cell.label}
                    className={className}
                    style={style}
                  />
                ) : (
                  <span
                    key={cell.date.toISOString()}
                    title={cell.label}
                    aria-label={cell.label}
                    className={className}
                    style={style}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-neutral-100 pt-4 text-[11px] text-neutral-400">
        {!hasActivity ? <span className="mr-auto">No MCP servers generated yet</span> : null}
        <span>Less</span>
        {colorByLevel.map((color) => (
          <span key={color} className={`h-3 w-3 rounded-sm ${color}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeActivityDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return localDateKey(date) === value ? value : undefined;
}

function formatActivityDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function buildServerActivity(items: McpServer[]): ServerActivityDay[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const date = new Date(item.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = localDateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Section building blocks                                             */
/* ------------------------------------------------------------------ */

function SectionCard({
  title,
  subtitle,
  tools,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  tools?: Array<{ label: string; tone?: "success" | "brand" | "neutral" }>;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="section-card">
      <div className="section-card-header">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-neutral-950">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tools && tools.length > 0 ? (
            <>
              <span className="hidden text-xs text-neutral-400 sm:inline">Connected Tools:</span>
              {tools.map((tool) => (
                <span key={tool.label} className={`pill ${tool.tone === "brand" ? "pill-brand" : tool.tone === "neutral" ? "pill-neutral" : "pill-success"}`}>
                  {tool.label}
                </span>
              ))}
            </>
          ) : null}
          {action ? (
            <Link
              href={action.href}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white px-4 text-sm font-medium text-neutral-700 transition hover:border-neutral-300"
            >
              {action.label}
              <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
            </Link>
          ) : (
            <Link href="/dashboard/settings" aria-label={`${title} settings`} className="icon-btn">
              <Settings className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProgressBar({ value, tone }: { value: number; tone: "danger" | "info" | "success" }) {
  const color = tone === "danger" ? "bg-red-500" : tone === "info" ? "bg-sky-500" : "bg-emerald-500";

  return (
    <span className="block h-1.5 w-full max-w-[180px] rounded-full bg-neutral-100">
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(4, value))}%` }} />
    </span>
  );
}

const SPARK_UP = "0,34 12,30 24,32 36,26 48,28 60,22 72,24 84,16 96,20 108,10 120,12";
const SPARK_DOWN = "0,10 12,16 24,12 36,20 48,18 60,24 72,20 84,28 96,26 108,32 120,30";

function Sparkline({ trend }: { trend: "up" | "down" }) {
  const points = trend === "up" ? SPARK_UP : SPARK_DOWN;
  const stroke = trend === "up" ? "#10b981" : "#ef4444";
  const gradientId = `spark-${trend}`;

  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="h-14 w-full min-w-0" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${points} 120,40`} fill={`url(#${gradientId})`} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type ImportantAction = {
  href: string;
  title: string;
  meta: string;
  icon: LucideIcon;
  iconClass: string;
};

function buildImportantActions(data: DashboardData): ImportantAction[] {
  const actions: ImportantAction[] = [];
  const failed = data.items.filter((server) => server.status === "failed" || server.status === "error");

  if (failed.length > 0 && failed[0]) {
    actions.push({
      href: `/dashboard/servers/${failed[0].id}`,
      title: `Solve issue with: ${failed[0].name}`,
      meta: failed.length === 1 ? "Generation failed" : `${failed.length} failed generations`,
      icon: Flag,
      iconClass: "bg-red-50 text-red-500",
    });
  }

  if (!data.isPending && data.items.length === 0) {
    actions.push({
      href: "/dashboard/generate",
      title: "Generate your first endpoint",
      meta: "Takes about 2 minutes",
      icon: Wand2,
      iconClass: "bg-amber-100 text-amber-700",
    });
  }

  if (data.items.length > 0 && data.liveCount === 0 && failed.length === 0) {
    actions.push({
      href: "/dashboard/servers",
      title: "Bring an endpoint live",
      meta: `${data.items.length} generated, none live yet`,
      icon: Sparkles,
      iconClass: "bg-orange-100 text-orange-600",
    });
  }

  if (actions.length < 2) {
    actions.push({
      href: "/dashboard/api-keys",
      title: "Create an API key",
      meta: "Required for private servers",
      icon: KeyRound,
      iconClass: "bg-amber-100 text-amber-700",
    });
  }

  return actions.slice(0, 2);
}

function statusPill(server: McpServer) {
  if (server.status === "live") return <span className="pill pill-success">Live</span>;
  if (server.status === "failed" || server.status === "error") return <span className="pill pill-danger">Failed</span>;
  return <span className="pill pill-neutral">Draft</span>;
}

function generationStatus(server: McpServer): { label: string; tone: "danger" | "info" | "success"; icon: LucideIcon; progress: number } {
  if (server.status === "failed" || server.status === "error") {
    return { label: "Confirm required information", tone: "danger", icon: OctagonAlert, progress: 24 };
  }
  if (server.status === "live") {
    return { label: "Live", tone: "success", icon: TrendingUp, progress: 100 };
  }
  return { label: "Processing", tone: "info", icon: Loader, progress: 58 };
}

function InstallPanel({ firstServer }: { firstServer?: McpServer }) {
  const endpoint = firstServer?.hosted_endpoint ?? "/api/mcp/:serverId";

  return (
    <SectionCard
      title="Connect"
      subtitle="Use Astrail with any MCP client"
      tools={[{ label: "MCP Runtime" }]}
    >
      <div className="min-w-0 rounded-xl border border-amber-200/60 bg-brand-highlight p-4 font-mono text-sm font-medium text-neutral-800">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <pre className="min-w-0 whitespace-pre-wrap break-words">{`curl -X POST ${endpoint}
  -H "Content-Type: application/json"
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</pre>
          <Copy className="h-4 w-4 shrink-0 text-neutral-500" />
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-800 bg-[#161512] font-mono text-sm">
        <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs text-white/35">astrail — zsh</span>
        </div>
        <div className="space-y-3 p-4 text-white/55">
          <p><span className="text-amber-400">$</span> astrail generate https://petstore.swagger.io/v2/swagger.json</p>
          <p className="text-white/90">Found endpoint_map and tools_json</p>
          <p><span className="text-amber-400">$</span> astrail call {firstServer?.name ?? "petstore"} tools/list</p>
          <p className="text-emerald-400">safe_rest_execution ready</p>
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

async function loadUserServers(userId: string): Promise<McpServer[]> {
  try {
    const dataClient = await createDataClient();
    const { data: servers, error } = await dataClient
      .from("mcp_servers")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[dashboard] server list unavailable", {
        code: error.code,
        message: error.message,
      });
      return [];
    }

    return (servers ?? []) as McpServer[];
  } catch (error) {
    console.warn("[dashboard] server list unavailable", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return [];
  }
}

function localPreviewServers(): McpServer[] {
  return [
    {
      id: "local-website-mcp",
      user_id: "local-preview",
      name: "Hacker News browser server",
      description: "Local Website-to-MCP preview generated from a public page.",
      source_url: "https://news.ycombinator.com",
      source_type: "website",
      generated_code: null,
      tools_json: [
        { name: "browser_open_page", description: "Open the page and summarize visible content." },
        { name: "browser_follow_link_top_story", description: "Follow a public story link." },
      ],
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: true,
      hosted_endpoint: "/api/mcp/local-website-mcp",
      call_count: 128,
      created_at: new Date().toISOString(),
    },
    {
      id: "local-openapi",
      user_id: "local-preview",
      name: "Petstore OpenAPI server",
      description: "Demo endpoint map generated from the Swagger Petstore spec.",
      source_url: "https://petstore.swagger.io/v2/swagger.json",
      source_type: "openapi_url",
      generated_code: null,
      tools_json: presetServers[0]?.tools_json ?? [],
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: true,
      hosted_endpoint: "/api/mcp/local-openapi",
      call_count: 42,
      created_at: new Date().toISOString(),
    },
  ];
}

function dashboardData(items: McpServer[], analytics: Pick<RuntimeAnalytics, "successCount" | "totalLoggedCalls">, name: string, isPending = false): DashboardData {
  const liveCount = items.filter((server) => server.status === "live").length;
  const publicCount = items.filter((server) => server.is_public).length;
  const successRate = analytics.totalLoggedCalls > 0 ? Math.round((analytics.successCount / analytics.totalLoggedCalls) * 100) : 0;

  return {
    items,
    liveCount,
    publicCount,
    successRate,
    totalLoggedCalls: analytics.totalLoggedCalls,
    name,
    firstServer: items[0],
    isPending,
  };
}

function PendingDashboardContent({ greeting, selectedActivityDate }: { greeting: string; selectedActivityDate?: string }) {
  const data = dashboardData([], { successCount: 0, totalLoggedCalls: 0 }, "Builder", true);

  return <DashboardContent {...data} selectedActivityDate={selectedActivityDate} greeting={greeting} />;
}

async function AuthenticatedDashboardContent({ greeting, selectedActivityDate }: { greeting: string; selectedActivityDate?: string }) {
  const user = await getDashboardSessionUser();

  const [items, analytics] = await Promise.all([
    loadUserServers(user.id),
    getRuntimeAnalytics(user.id),
  ]);
  const dataForPage = dashboardData(items, analytics, accountFirstName(user));

  return (
    <DashboardContent
      {...dataForPage}
      selectedActivityDate={selectedActivityDate}
      greeting={greeting}
    />
  );
}

export default async function DashboardPage(props: { searchParams?: Promise<{ activityDate?: string }> }) {
  const searchParams = await props.searchParams;
  const selectedActivityDate = normalizeActivityDate(searchParams?.activityDate);
  const greeting = timeGreeting(new Date(), timezoneFromHeaders(await headers()));

  if (!hasServerNeonEnv()) {
    const data = dashboardData(localPreviewServers(), { successCount: 0, totalLoggedCalls: 0 }, "Riza");

    return (
      <DashboardContent
        {...data}
        selectedActivityDate={selectedActivityDate}
        greeting={greeting}
      />
    );
  }

  return (
    <Suspense fallback={<PendingDashboardContent selectedActivityDate={selectedActivityDate} greeting={greeting} />}>
      <AuthenticatedDashboardContent selectedActivityDate={selectedActivityDate} greeting={greeting} />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function DashboardContent({
  items,
  liveCount,
  publicCount,
  successRate,
  totalLoggedCalls,
  selectedActivityDate,
  greeting,
  name,
  firstServer,
  isPending = false,
}: {
  items: McpServer[];
  liveCount: number;
  publicCount: number;
  successRate: number;
  totalLoggedCalls: number;
  selectedActivityDate?: string;
  greeting: string;
  name: string;
  firstServer?: McpServer;
  isPending?: boolean;
}) {
  const activityDays = buildServerActivity(items);
  const selectedItems = selectedActivityDate
    ? items.filter((server) => localDateKey(new Date(server.created_at)) === selectedActivityDate)
    : [];
  const selectedDateLabel = selectedActivityDate ? formatActivityDate(selectedActivityDate) : null;

  const data: DashboardData = { items, liveCount, publicCount, successRate, totalLoggedCalls, name, firstServer, isPending };
  const importantActions = buildImportantActions(data);
  const trackerItems = items.slice(0, 3);
  const lastCreated = items[0]?.created_at ? formatActivityDate(localDateKey(new Date(items[0].created_at))) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Greeting hero with important actions */}
      <header className="console-hero px-5 pb-7 pt-9 sm:px-9 sm:pb-8 sm:pt-12">
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
              {greeting}, {name}! <span aria-hidden>👋</span>
            </h1>
            <p className="mt-2 text-sm text-neutral-600">Take a look into your workspace</p>
          </div>
          <Button asChild className="h-11 shrink-0 sm:h-10">
            <Link href="/dashboard/settings">
              <BookUser className="h-4 w-4" />
              Workspace Profile
            </Link>
          </Button>
        </div>

        <div className="relative z-10 mt-8">
          <p className="text-sm font-medium text-neutral-500">Important Actions ({importantActions.length})</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {importantActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="group flex items-center gap-3.5 rounded-2xl border border-white/60 bg-white/75 p-3.5 backdrop-blur transition hover:bg-white"
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${action.iconClass}`}>
                  <action.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-950">{action.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-400">{action.meta}</span>
                </span>
                <span className="icon-btn transition group-hover:border-neutral-950 group-hover:bg-neutral-950 group-hover:text-white">
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Endpoints (mailroom-style list) */}
      <SectionCard
        title="Endpoints"
        tools={[{ label: "OpenAPI" }, { label: "Website to MCP", tone: "neutral" }]}
      >
        <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-neutral-100 pb-2.5 text-xs font-medium text-neutral-400 sm:grid-cols-[110px_1fr_auto]">
          <span className="hidden sm:block">Status</span>
          <span>Endpoint</span>
          <span className="text-right">Calls</span>
        </div>
        {isPending ? (
          <p className="py-4 text-sm text-neutral-500">Syncing workspace endpoints...</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold text-neutral-900">Connect your first app</p><p className="mt-1 text-sm text-neutral-500">Astrail will create the secure workspace and CLI connection for you.</p></div>
            <Link href="/dashboard/onboarding" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">Start guided setup <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : (
          items.slice(0, 4).map((server) => (
            <Link
              key={server.id}
              href={`/dashboard/servers/${server.id}`}
              className="console-table-row group grid grid-cols-[1fr_auto] items-center gap-x-4 py-3.5 text-sm transition hover:bg-neutral-50/60 sm:grid-cols-[110px_1fr_auto]"
            >
              <span className="hidden sm:block">{statusPill(server)}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-neutral-950">{server.name}</span>
                <span className="block truncate font-mono text-xs text-neutral-400">{server.hosted_endpoint}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-neutral-500">{server.call_count ?? 0}</span>
                <ChevronRight className="h-4 w-4 text-neutral-300 transition group-hover:text-neutral-600" />
              </span>
            </Link>
          ))
        )}
        <div className="mt-3 flex justify-end">
          <Link href="/dashboard/servers" className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 transition hover:text-neutral-950">
            View all servers
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      {/* Build (state-filings-style tiles + tracker) */}
      <SectionCard
        title="Build"
        subtitle="Create a new MCP endpoint"
        tools={[{ label: "Generation Bundle", tone: "brand" }]}
        action={{ href: "/dashboard/generate", label: "Open Generator" }}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "OpenAPI / Swagger spec", href: "/dashboard/generate", tone: "tile-pastel-amber" },
            { label: "Website to MCP", href: "/dashboard/website-to-mcp", tone: "tile-pastel-orange" },
            { label: "SDK bundle export", href: "/dashboard/sdk", tone: "tile-pastel-rose" },
            { label: "See more in the Catalog", href: "/marketplace", tone: "tile-pastel-green" },
          ].map((tile) => (
            <Link key={tile.label} href={tile.href} className={`tile-pastel ${tile.tone}`}>
              <span className="max-w-[85%] text-sm font-semibold leading-5 text-neutral-900">{tile.label}</span>
              <span className="pill w-fit bg-white/70 text-neutral-600">Included</span>
            </Link>
          ))}
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-neutral-500">Generation Tracker</p>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 border-b border-neutral-100 pb-2.5 text-xs font-medium text-neutral-400 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_180px_auto]">
            <span>Endpoint</span>
            <span className="hidden md:block">Status</span>
            <span className="hidden md:block">Progress</span>
            <span className="text-right">Details</span>
          </div>
          {trackerItems.length === 0 ? (
            <p className="py-4 text-sm text-neutral-500">Nothing in progress. Generated endpoints will show up here.</p>
          ) : (
            trackerItems.map((server) => {
              const status = generationStatus(server);
              const StatusIcon = status.icon;
              const statusText = status.tone === "danger" ? "text-red-500" : status.tone === "info" ? "text-sky-600" : "text-emerald-600";

              return (
                <div key={server.id} className="console-table-row grid grid-cols-[1fr_auto] items-center gap-x-4 py-3.5 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_180px_auto]">
                  <span className="truncate font-medium text-neutral-950">{server.name}</span>
                  <span className={`hidden items-center gap-1.5 font-medium md:inline-flex ${statusText}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {status.label}
                  </span>
                  <span className="hidden md:block">
                    <ProgressBar value={status.progress} tone={status.tone} />
                  </span>
                  <Link
                    href={`/dashboard/servers/${server.id}`}
                    className="inline-flex items-center gap-1 justify-self-end text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
                  >
                    See Details
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </SectionCard>

      {/* Usage (bookkeeping-style stat cards) */}
      <SectionCard
        title="Usage &amp; Analytics"
        subtitle="Runtime performance"
        tools={[{ label: "Analytics" }]}
        action={{ href: "/dashboard/analytics", label: "Open Analytics" }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-5">
            <p className="text-xs text-neutral-400">Total Tool Calls</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-neutral-950">
                  {isPending ? "..." : totalLoggedCalls.toLocaleString()}
                </p>
                <span className="pill pill-success mt-2">
                  <TrendingUp className="h-3 w-3" />
                  {liveCount} live {liveCount === 1 ? "endpoint" : "endpoints"}
                </span>
              </div>
              <div className="w-1/2 min-w-0 max-w-[220px]">
                <Sparkline trend="up" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-5">
            <p className="text-xs text-neutral-400">Success Rate</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-neutral-950">
                  {isPending ? "..." : totalLoggedCalls > 0 ? `${successRate}%` : "n/a"}
                </p>
                <span className={`pill mt-2 ${totalLoggedCalls > 0 && successRate < 90 ? "pill-danger" : "pill-success"}`}>
                  {totalLoggedCalls > 0 && successRate < 90 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                  {totalLoggedCalls.toLocaleString()} logged calls
                </span>
              </div>
              <div className="w-1/2 min-w-0 max-w-[220px]">
                <Sparkline trend={totalLoggedCalls > 0 && successRate < 90 ? "down" : "up"} />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Catalog (business-listings-style rows) */}
      <SectionCard
        title="Catalog"
        tools={[{ label: "Presets", tone: "brand" }]}
        action={{ href: "/marketplace", label: "Open Marketplace" }}
      >
        <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-neutral-100 pb-2.5 text-xs font-medium text-neutral-400 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
          <span>Integration</span>
          <span className="hidden md:block">What it exposes</span>
          <span className="text-right">Details</span>
        </div>
        {catalogApps.map((app) => (
          <div key={app.name} className="console-table-row grid grid-cols-[1fr_auto] items-center gap-x-4 py-3.5 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-neutral-200/70 bg-white">
                <Image src={app.icon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
              </span>
              <span className="truncate font-medium text-neutral-950">{app.name}</span>
            </span>
            <span className="hidden truncate text-neutral-500 md:block">{app.detail}</span>
            <Link
              href={app.href}
              className="inline-flex items-center gap-1 justify-self-end text-sm font-medium text-neutral-500 transition hover:text-neutral-950"
            >
              See Details
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ))}
      </SectionCard>

      {/* Activity heatmap */}
      <SectionCard title="Activity" subtitle={`Generation activity in ${ACTIVITY_YEAR}`} tools={[{ label: "Workspace", tone: "neutral" }]}>
        <Heatmap activityDays={activityDays} />
        {selectedActivityDate && !isPending && (
          <div className="mt-5 rounded-2xl border border-amber-200/60 bg-brand-highlight p-4">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium text-neutral-400">Generated on {selectedDateLabel}</p>
                <h3 className="mt-1 text-lg font-semibold text-neutral-950">
                  {selectedItems.length} MCP {selectedItems.length === 1 ? "server" : "servers"}
                </h3>
              </div>
              <Link href="/dashboard" className="text-sm font-medium text-neutral-500 hover:text-neutral-950">
                Clear day
              </Link>
            </div>
            {selectedItems.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">No generated servers were found for this day.</p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {selectedItems.map((server) => (
                  <Link
                    key={server.id}
                    href={`/dashboard/servers/${server.id}`}
                    className="group flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-4 transition hover:border-amber-300"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-950">{server.name}</p>
                      <p className="mt-1 line-clamp-1 text-sm text-neutral-500">{server.description ?? "Generated MCP endpoint"}</p>
                    </div>
                    <ArrowUpRight className="ml-4 h-4 w-4 shrink-0 text-neutral-400 transition group-hover:text-orange-600" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Connect */}
      <InstallPanel firstServer={firstServer} />

      {/* Footer strip */}
      <footer className="flex flex-col items-center justify-between gap-2 px-2 pt-2 text-xs text-neutral-400 sm:flex-row">
        <span className="inline-flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5" />
          Runtime: static, no eval
        </span>
        <Link href="/terms" className="transition hover:text-neutral-700">Astrail Terms of Use</Link>
        <span>{lastCreated ? `Last generation: ${lastCreated}` : `${publicCount} published to catalog`}</span>
      </footer>
    </div>
  );
}
