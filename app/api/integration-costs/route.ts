import { NextResponse } from "next/server";
import { z } from "zod";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";

const CostEventSchema = z.object({
  server_id: z.string().uuid(),
  category: z.enum(["setup", "maintenance", "support", "custom_exception"]),
  minutes: z.number().int().min(0).max(1_000_000).default(0),
  amount: z.number().min(0).max(999_999_999).default(0),
  note: z.string().max(2000).optional(),
}).strict();

const CostQuerySchema = z.object({
  server_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  before: z.string().datetime().optional(),
  before_id: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (Boolean(value.before) !== Boolean(value.before_id)) {
    context.addIssue({ code: "custom", path: ["before"], message: "before and before_id must be provided together." });
  }
});

async function userId() {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return null;
  const { data } = await (await createServerNeonClient()).auth.getUser();
  return data.user?.id ?? null;
}

export async function GET(request: Request) {
  const user = await userId();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const parsed = CostQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid integration cost query.", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const admin = createAdminClient();
  let eventsQuery = admin.from("integration_cost_events")
    .select("id,server_id,category,minutes,amount,note,created_at")
    .eq("user_id", user).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(input.limit + 1);
  let totalsQuery = admin.from("integration_cost_totals")
    .select("server_id,category,minutes,amount,events").eq("user_id", user);
  if (input.server_id) {
    eventsQuery = eventsQuery.eq("server_id", input.server_id);
    totalsQuery = totalsQuery.eq("server_id", input.server_id);
  }
  if (input.before && input.before_id) {
    eventsQuery = eventsQuery.or(`created_at.lt.${input.before},and(created_at.eq.${input.before},id.lt.${input.before_id})`);
  }
  const [{ data, error }, { data: aggregateRows, error: totalsError }] = await Promise.all([eventsQuery, totalsQuery]);
  if (error || totalsError) return NextResponse.json({ error: error?.message ?? totalsError?.message }, { status: 500 });
  const events = (data ?? []).slice(0, input.limit);
  const totals = (aggregateRows ?? []).reduce((result, event) => {
    result.minutes += Number(event.minutes) || 0;
    result.amount += Number(event.amount) || 0;
    result.by_category[event.category] ??= { minutes: 0, amount: 0, events: 0 };
    result.by_category[event.category].minutes += Number(event.minutes) || 0;
    result.by_category[event.category].amount += Number(event.amount) || 0;
    result.by_category[event.category].events += Number(event.events) || 0;
    return result;
  }, { minutes: 0, amount: 0, by_category: {} as Record<string, { minutes: number; amount: number; events: number }> });
  totals.amount = Math.round(totals.amount * 100) / 100;
  const hasMore = (data ?? []).length > input.limit;
  const nextRow = hasMore ? events.at(-1) : null;
  return NextResponse.json({
    events,
    totals,
    has_more_events: hasMore,
    next_before: nextRow?.created_at ?? null,
    next_before_id: nextRow?.id ?? null,
  });
}

export async function POST(request: Request) {
  const user = await userId();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = CostEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid integration cost event.", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const admin = createAdminClient();
  const { data: server } = await admin.from("mcp_servers").select("id")
    .eq("id", body.server_id).eq("user_id", user).maybeSingle();
  if (!server) return NextResponse.json({ error: "Integration not found." }, { status: 404 });
  const { data, error } = await admin.from("integration_cost_events")
    .insert({ ...body, user_id: user, note: body.note?.trim() || null })
    .select("id,server_id,category,minutes,amount,note,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
