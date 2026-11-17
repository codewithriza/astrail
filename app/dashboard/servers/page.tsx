import { Suspense } from "react";
import { ServerCard } from "@/components/ServerCard";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { localDemoServers } from "@/lib/local-demo";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";
import type { McpServer } from "@/lib/types";

export default async function ServersPage() {
  if (!hasServerNeonEnv()) {
    return <ServersContent items={localDemoServers()} />;
  }

  const user = await getDashboardSessionUser();

  return (
    <div className="space-y-4">
      <ServersHeader />
      <Suspense fallback={<ServersListFallback />}>
        <UserServersList userId={user.id} />
      </Suspense>
    </div>
  );
}

async function UserServersList({ userId }: { userId: string }) {
  const { data: servers, error } = await createUserDataClient()
    .from("mcp_servers")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const items = (servers ?? []) as McpServer[];
  return <ServersList items={items} />;
}

function ServersHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Your MCP servers</h1>
      <p className="text-muted-foreground">Open a server to copy, download, or publish it.</p>
    </div>
  );
}

function ServersListFallback() {
  return (
    <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
      Syncing hosted endpoints...
    </div>
  );
}

function ServersContent({ items }: { items: McpServer[] }) {
  return (
    <div className="space-y-4">
      <ServersHeader />
      <ServersList items={items} />
    </div>
  );
}

function ServersList({ items }: { items: McpServer[] }) {
  return items.length === 0 ? (
    <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">No servers generated yet.</p>
  ) : (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((server) => <ServerCard key={server.id} server={server} />)}
    </div>
  );
}
