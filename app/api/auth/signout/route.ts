import { NextResponse } from "next/server";
import {
  LOCAL_AUTH_COOKIE,
  LOCAL_PROFILE_AVATAR_COOKIE,
  LOCAL_PROFILE_EMAIL_COOKIE,
  LOCAL_PROFILE_NAME_COOKIE,
  LOCAL_PROFILE_PROVIDER_COOKIE,
} from "@/lib/local-auth-shared";
import { createServerNeonClient } from "@/lib/neon/server";

export async function POST() {
  try {
    const neon = await createServerNeonClient();
    await neon.auth.signOut();
  } catch {
    // Production auth is not configured in local demo mode.
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(LOCAL_AUTH_COOKIE);
  response.cookies.delete(LOCAL_PROFILE_NAME_COOKIE);
  response.cookies.delete(LOCAL_PROFILE_EMAIL_COOKIE);
  response.cookies.delete(LOCAL_PROFILE_PROVIDER_COOKIE);
  response.cookies.delete(LOCAL_PROFILE_AVATAR_COOKIE);
  return response;
}
