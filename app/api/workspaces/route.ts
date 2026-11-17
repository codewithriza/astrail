import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";

const WorkspaceSchema = z.object({ name: z.string().trim().min(1).max(80), environment: z.string().trim().regex(/^[a-z0-9_-]+$/i).max(32).default("personal") });

export async function GET() {
  if (!hasServerNeonEnv()) return NextResponse.json({ workspaces: [] });
  const user = await getDashboardSessionUser();
  const { data, error } = await createUserDataClient().from("workspaces").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workspaces: data ?? [] });
}

export async function POST(request: Request) {
  const parsed = WorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Workspace name and environment are required." }, { status: 400 });
  if (!hasServerNeonEnv()) return NextResponse.json({ workspace: { id: "local-workspace", name: parsed.data.name, environment: parsed.data.environment, status: "active" }, preview: true });
  const user = await getDashboardSessionUser();
  const db = createUserDataClient();
  const { data: workspace, error } = await db.from("workspaces").insert({ user_id: user.id, ...parsed.data }).select("*").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A workspace with this name already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ workspace }, { status: 201 });
}
