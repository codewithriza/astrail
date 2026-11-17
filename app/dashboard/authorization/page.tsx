import { createDataClient } from "@/lib/neon/server";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { hasServerNeonEnv } from "@/lib/neon/env";

export default async function AuthorizationDashboard() {
  let tasks: Array<{id:string;server_id:string;agent_id:string;purpose:string;issuer:string;allowed_actions:string[];approval_actions:string[];expires_at:string;revoked_at:string|null;created_at:string}>=[];
  let events: Array<{id:string;provider:string|null;event_type:string;generation:number;outcome:string;peer_reused:boolean;detail:unknown;created_at:string}>=[];
  if(hasServerNeonEnv()){const user = await getDashboardSessionUser();const db = await createDataClient();const results = await Promise.all([
    db.from("task_authorizations").select("id,server_id,agent_id,purpose,issuer,allowed_actions,approval_actions,expires_at,revoked_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    db.from("oauth_lifecycle_events").select("id,provider,event_type,generation,outcome,peer_reused,detail,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);tasks=(results[0].data??[]) as typeof tasks;events=(results[1].data??[]) as typeof events;}
  const refreshes = (events ?? []).filter((event) => event.event_type === "refresh" && event.outcome === "succeeded").length;
  const peerReuses = (events ?? []).filter((event) => event.peer_reused).length;
  return <main className="space-y-8 p-8">
    <div><p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Security</p><h1 className="text-3xl font-bold">Authorization & token lifecycle</h1><p className="mt-2 text-neutral-600">No token values are stored in these event records.</p></div>
    <section className="grid gap-4 md:grid-cols-3">
      <Stat label="Successful refreshes" value={refreshes} /><Stat label="Peer token reuses" value={peerReuses} /><Stat label="Active task grants" value={(tasks ?? []).filter((task) => !task.revoked_at && Date.parse(task.expires_at) > Date.now()).length} />
    </section>
    <section><h2 className="mb-3 text-xl font-semibold">Task authorizations</h2><div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-neutral-50"><Th>Agent</Th><Th>Purpose</Th><Th>Actions</Th><Th>Approval</Th><Th>Expires</Th></tr></thead><tbody>{(tasks ?? []).map((task) => <tr className="border-b" key={task.id}><Td>{task.agent_id}</Td><Td>{task.purpose}</Td><Td>{(task.allowed_actions ?? []).join(", ") || "all"}</Td><Td>{(task.approval_actions ?? []).join(", ") || "none"}</Td><Td>{new Date(task.expires_at).toLocaleString()}</Td></tr>)}</tbody></table></div></section>
    <section><h2 className="mb-3 text-xl font-semibold">Lifecycle demonstration</h2><div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-neutral-50"><Th>Time</Th><Th>Provider</Th><Th>Event</Th><Th>Outcome</Th><Th>Generation</Th><Th>Peer reused</Th></tr></thead><tbody>{(events ?? []).map((event) => <tr className="border-b" key={event.id}><Td>{new Date(event.created_at).toLocaleString()}</Td><Td>{event.provider ?? "OAuth"}</Td><Td>{event.event_type}</Td><Td>{event.outcome}</Td><Td>{event.generation}</Td><Td>{event.peer_reused ? "yes" : "no"}</Td></tr>)}</tbody></table></div></section>
  </main>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded border bg-white p-5"><div className="text-2xl font-bold">{value}</div><div className="text-sm text-neutral-600">{label}</div></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="p-3 font-semibold">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="p-3">{children}</td>; }
