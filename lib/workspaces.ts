import { createUserDataClient } from "@/lib/neon/server";

export type WorkspaceRow = {
  id: string;
  user_id: string;
  name: string;
  environment: string;
  bundle_id: string | null;
  status: string;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

export function workspaceSlug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

export async function loadWorkspace(id: string, userId?: string) {
  let query = createUserDataClient().from("workspaces").select("*").eq("id", id);
  if (userId) query = query.eq("user_id", userId);
  const result = await query.maybeSingle();
  return result.data as WorkspaceRow | null;
}

export async function loadWorkspaceByName(name: string, userId: string) {
  const result = await createUserDataClient().from("workspaces").select("*").eq("user_id", userId).eq("name", name).maybeSingle();
  return result.data as WorkspaceRow | null;
}
