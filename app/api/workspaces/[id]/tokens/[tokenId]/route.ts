import { NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { createAdminClient } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";

export async function DELETE(_: Request, props: { params: Promise<{ id: string; tokenId: string }> }) {
  if (!hasServerNeonEnv()) return NextResponse.json({ deleted: true, preview: true }); const user = await getDashboardSessionUser(); const { id, tokenId } = await props.params;
  const { error } = await createAdminClient().from("api_keys").delete().eq("id", tokenId).eq("workspace_id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ deleted: true });
}
