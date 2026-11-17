import { redirect } from "next/navigation";
import { createServerNeonClient } from "@/lib/neon/server";

type ClaimValue = string | number | boolean | null | undefined;

export type DashboardSessionUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, ClaimValue> | null;
  app_metadata?: Record<string, ClaimValue> | null;
};

function claimRecord(value: unknown): Record<string, ClaimValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, ClaimValue>;
}

export async function getDashboardSessionUser(): Promise<DashboardSessionUser> {
  const neon = await createServerNeonClient();
  const { data, error } = await neon.auth.getUser();
  const user = error ? null : data.user;
  const id = user?.id;

  if (!id) redirect("/login");

  return {
    id,
    email: user.email,
    user_metadata: claimRecord(user.user_metadata),
    app_metadata: claimRecord(user.app_metadata),
  };
}
