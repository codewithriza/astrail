import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Code2,
  FileText,
  GitBranch,
  Package,
  Rocket,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { SdkExportPanel } from "@/components/SdkExportPanel";
import { SdkGeneratorActions } from "@/components/SdkGeneratorActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { localDemoServers } from "@/lib/local-demo";
import { visibleEndpointsForRequest } from "@/lib/runtime/permissions";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";
import type { McpServer } from "@/lib/types";

const sdkCapabilities = [
  {
    id: "targets",
    icon: Package,
    title: "Language targets",
    description: "Typed clients for TypeScript, Python, Go, Java, Kotlin, Ruby, C#, PHP, and CLI.",
    points: ["request helpers", "auth env wiring", "examples per operation"],
  },
  {
    id: "docs",
    icon: FileText,
    title: "Docs + examples",
    description: "Reference pages, quickstarts, copyable snippets, and an llms.txt export.",
    points: ["search-ready docs", "usage examples", "install instructions"],
  },
  {
    id: "cli",
    icon: Terminal,
    title: "CLI + manifests",
    description: "Command wrappers, MCP manifests, install files, and endpoint catalogs.",
    points: ["mcp.json", "tool catalog", "local smoke command"],
  },
  {
    id: "ci",
    icon: ShieldCheck,
    title: "Tests + CI",
    description: "Generated smoke tests plus GitHub Actions to verify every shipped client.",
    points: ["schema checks", "sample calls", "publish guards"],
  },
  {
    id: "publish",
    icon: GitBranch,
    title: "Publish workflow",
    description: "Pull, verify, open PR, and release SDK packages from the same bundle.",
    points: ["release scripts", "package metadata", "reviewable diffs"],
  },
  {
    id: "versioning",
    icon: Rocket,
    title: "Versioning",
    description: "Semver notes, endpoint diff summaries, and changelog-ready output.",
    points: ["breaking changes", "new endpoints", "migration notes"],
  },
] as const;

const sdkFlow = [
  ["1", "Choose what to connect", "Pick one of your Astrail servers below."],
  ["2", "Click Download", "You get one ready-to-use file."],
  ["3", "Copy and paste", "Put the setup prompt into Codex, Claude, or Cursor. It handles the rest."],
];

export default async function SdkGeneratorPage() {
  if (!hasServerNeonEnv()) {
    return <SdkGeneratorContent items={localDemoServers()} />;
  }

  const user = await getDashboardSessionUser();

  return (
    <SdkGeneratorContent
      items={[]}
      endpointList={
        <Suspense fallback={<SdkEndpointListFallback />}>
          <UserSdkEndpointList userId={user.id} />
        </Suspense>
      }
    />
  );
}

async function UserSdkEndpointList({ userId }: { userId: string }) {
  const { data: servers, error } = await createUserDataClient()
    .from("mcp_servers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return <SdkEndpointList items={(servers ?? []) as McpServer[]} />;
}

function SdkGeneratorContent({
  items,
  endpointList,
}: {
  items: McpServer[];
  endpointList?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-muted-foreground">SDK Factory</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Connect your app</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose a server, download one file, and paste the setup prompt into your coding agent. No terminal or SDK knowledge required.
          </p>
        </div>
        <SdkGeneratorActions />
      </div>

      <section id="generator" className="scroll-mt-6">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">The whole setup</p>
            <h2 className="mt-2 text-xl font-semibold">Download, copy, paste. That is the whole setup.</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {sdkFlow.map(([step, title, description]) => (
                <div key={step} className="flex gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-50 text-sm font-semibold text-orange-700">
                    {step}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <details className="rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">See everything included in the download</summary>
        <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sdkCapabilities.map((feature) => {
          const Icon = feature.icon;

          return (
            <Card key={feature.id} id={feature.id} className="scroll-mt-6">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-orange-200 bg-orange-50 text-orange-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold">{feature.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {feature.points.map((point) => (
                    <div key={point} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-orange-600" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
        </section>
      </details>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Available endpoints</p>
          <h2 className="mt-1 text-xl font-semibold">Generate from your hosted endpoints</h2>
        </div>

        {endpointList ?? <SdkEndpointList items={items} />}
      </section>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-900">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Docs-first output</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Every SDK bundle includes reference docs, copyable examples, and install notes for the selected endpoint.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/docs" className="inline-flex items-center gap-2">
              Open docs <Code2 className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SdkEndpointList({ items }: { items: McpServer[] }) {
  return items.length === 0 ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              No servers yet. Generate one first, then come back for SDKs.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard/generate">Generate from OpenAPI</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/website-to-mcp">Generate from website</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {items.map((server) => (
            <section key={server.id} className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div>
                    <h2 className="text-lg font-semibold">{server.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {visibleEndpointsForRequest(server).length.toLocaleString()} endpoints ready for export.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{server.source_type ?? "mcp"}</Badge>
                    <Badge>{server.status ?? "live"}</Badge>
                  </div>
                  <Link
                    href={`/dashboard/servers/${server.id}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    Open server detail <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
              <div className="min-w-0">
                <SdkExportPanel serverId={server.id} serverName={server.name} isPublic={server.is_public === true} />
              </div>
            </section>
          ))}
        </div>
  );
}

function SdkEndpointListFallback() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Loading hosted endpoints</p>
        <div className="h-3 w-2/3 rounded-full bg-muted" />
        <div className="h-3 w-1/2 rounded-full bg-muted" />
      </CardContent>
    </Card>
  );
}
