import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";
import { formatDate } from "@/lib/utils";

type DesignPartnerRequest = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string | null;
  persona: "buyer" | "developer" | "workflow_owner" | string | null;
  agent_kind: string;
  workflow_goal: string | null;
  needed_api: string;
  systems_involved: string | null;
  has_api_docs: "yes" | "no" | string;
  api_docs_url_or_notes: string | null;
  approval_steps: string | null;
  auth_constraints: string | null;
  runtime_preference: "hosted" | "exported_code" | "self_hosted" | string;
  urgency: "today" | "this_week" | "exploring" | string;
  status: "new" | "contacted" | "mapped" | "generated" | "tested" | "onboarded" | "success" | string;
  created_at: string;
};

const statuses = ["new", "contacted", "mapped", "generated", "tested", "onboarded", "success"];
const urgencies = ["today", "this_week", "exploring"];
const preferences = ["hosted", "exported_code", "self_hosted"];
const personas = ["buyer", "developer", "workflow_owner"];

export default async function DesignPartnersDashboardPage() {
  if (!hasServerNeonEnv()) {
    return <DesignPartnersContent requests={localDesignPartnerRequests()} />;
  }

  await getDashboardSessionUser();

  if (!hasServiceRoleKey()) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card>
          <CardHeader><CardTitle>Requests unavailable</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Admin access is not enabled for this workspace yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("design_partner_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    const missingTable = error.code === "42P01" || /does not exist|schema cache/i.test(error.message);
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card>
          <CardHeader><CardTitle>{missingTable ? "Migration required" : "Could not load requests"}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              {missingTable
                ? "Request storage is not enabled yet. Apply the design partner request migration before launch."
                : error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const requests = (rows ?? []) as DesignPartnerRequest[];
  return <DesignPartnersContent requests={requests} />;
}

function localDesignPartnerRequests(): DesignPartnerRequest[] {
  return [
    {
      id: "local-request-1",
      name: "Anthropic eval team",
      email: "demo@anthropic.com",
      company: "Anthropic",
      role: "Technical evaluator",
      persona: "developer",
      agent_kind: "Hosted MCP gateway for agent tools",
      workflow_goal: "Evaluate API-to-MCP, website-to-MCP, bundling, runtime logs, and auth boundaries.",
      needed_api: "OpenAPI specs, internal APIs, public websites, and endpoint docs",
      systems_involved: "Claude, GitHub, Slack, Notion, Linear, internal REST APIs",
      has_api_docs: "yes",
      api_docs_url_or_notes: "OpenAPI specs plus website-to-MCP alpha targets",
      approval_steps: "Safe public reads execute immediately; private actions require auth and review.",
      auth_constraints: "API keys and OAuth metadata are separated from generated tool descriptions.",
      runtime_preference: "hosted",
      urgency: "today",
      status: "mapped",
      created_at: new Date().toISOString(),
    },
  ];
}

function DesignPartnersContent({ requests }: { requests: DesignPartnerRequest[] }) {
  const todayCount = requests.filter((request) => request.urgency === "today").length;
  const docsCount = requests.filter((request) => request.has_api_docs === "yes").length;
  const workflowOwnerCount = requests.filter((request) => request.persona === "workflow_owner").length;
  const latest = requests.slice(0, 25);

  return (
    <div className="space-y-6">
      <PageHeader />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total requests" value={requests.length} detail={`${latest.length} shown below`} />
        <MetricCard label="Urgent" value={todayCount} detail="Need it today" />
        <MetricCard label="Has docs" value={docsCount} detail="API docs or OpenAPI available" />
        <MetricCard label="Workflow owners" value={workflowOwnerCount} detail="Business process owners" />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <CountCard title="Persona" labels={personas} requests={requests} field="persona" />
        <CountCard title="Urgency" labels={urgencies} requests={requests} field="urgency" />
        <CountCard title="Runtime preference" labels={preferences} requests={requests} field="runtime_preference" />
        <CountCard title="Status" labels={statuses} requests={requests} field="status" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest requests</CardTitle>
        </CardHeader>
        <CardContent>
          {latest.length === 0 ? (
            <p className="text-sm text-muted-foreground">No design partner requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Created</th>
                    <th className="py-2 pr-3 font-medium">Person</th>
                    <th className="py-2 pr-3 font-medium">Company</th>
                    <th className="py-2 pr-3 font-medium">Workflow</th>
                    <th className="py-2 pr-3 font-medium">Systems / API</th>
                    <th className="py-2 pr-3 font-medium">Approvals / auth</th>
                    <th className="py-2 pr-3 font-medium">Urgency</th>
                    <th className="py-2 pr-3 font-medium">Runtime</th>
                    <th className="py-2 pr-3 font-medium">Docs</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {latest.map((request) => (
                    <tr key={request.id} className="align-top">
                      <td className="py-2 pr-3 text-muted-foreground">{formatDate(request.created_at)}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{request.name}</div>
                        <a className="text-xs text-primary" href={`mailto:${request.email}`}>{request.email}</a>
                        {request.role ? <div className="text-xs text-muted-foreground">{request.role}</div> : null}
                        {request.persona ? <div className="mt-1"><Badge>{request.persona}</Badge></div> : null}
                      </td>
                      <td className="py-2 pr-3">{request.company}</td>
                      <td className="max-w-[280px] py-2 pr-3">
                        <div className="line-clamp-3">{request.workflow_goal ?? request.agent_kind}</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{request.agent_kind}</div>
                      </td>
                      <td className="max-w-[260px] py-2 pr-3">
                        <div className="line-clamp-2">{request.systems_involved ?? "Not specified"}</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{request.needed_api}</div>
                      </td>
                      <td className="max-w-[260px] py-2 pr-3">
                        <div className="line-clamp-2">{request.approval_steps ?? "No approval notes"}</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{request.auth_constraints ?? "No auth notes"}</div>
                      </td>
                      <td className="py-2 pr-3"><Badge>{request.urgency}</Badge></td>
                      <td className="py-2 pr-3"><code>{request.runtime_preference}</code></td>
                      <td className="py-2 pr-3">
                        <Badge>{request.has_api_docs}</Badge>
                        {request.api_docs_url_or_notes ? (
                          <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                            {request.api_docs_url_or_notes}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3"><Badge>{request.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-xl font-semibold">Design partners</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real workflow and API demand from teams that need safe hosted agent actions.
        </p>
      </div>
      <Badge>private admin</Badge>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function CountCard({
  title,
  labels,
  requests,
  field,
}: {
  title: string;
  labels: string[];
  requests: DesignPartnerRequest[];
  field: "persona" | "urgency" | "runtime_preference" | "status";
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {labels.map((label) => (
            <div key={label} className="flex items-center justify-between border-b py-2 text-sm last:border-b-0">
              <code>{label}</code>
              <span className="font-medium">{requests.filter((request) => request[field] === label).length}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
