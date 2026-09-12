import { NextResponse } from "next/server";
import {
  LOCAL_AUTH_COOKIE,
  LOCAL_AUTH_VALUE,
  LOCAL_PROFILE_AVATAR_COOKIE,
  LOCAL_PROFILE_EMAIL_COOKIE,
  LOCAL_PROFILE_NAME_COOKIE,
  LOCAL_PROFILE_PROVIDER_COOKIE,
} from "@/lib/local-auth-shared";
import { isDemoAuthAllowed } from "@/lib/auth-mode";

type DemoProfile = {
  avatarUrl?: string;
  email: string;
  name: string;
  provider: string;
};

function cleanValue(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function nameFromEmail(email: string) {
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!local) return "";
  return local
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function profileFromParams(params: URLSearchParams): DemoProfile {
  const provider = cleanValue(params.get("provider")) || "email";
  const firstName = cleanValue(params.get("firstName"));
  const lastName = cleanValue(params.get("lastName"));
  const email = cleanValue(params.get("email"));
  const avatarUrl = cleanValue(params.get("avatarUrl"));
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  if (fullName) return { avatarUrl, email, name: fullName, provider };
  if (provider === "google") return { avatarUrl, email: email || "google@astrail.local", name: "Google workspace", provider };
  if (provider === "github") return { avatarUrl, email: email || "github@astrail.local", name: "GitHub workspace", provider };

  return {
    avatarUrl,
    email: email || "demo@astrail.dev",
    name: nameFromEmail(email) || "Demo workspace",
    provider,
  };
}

function profileFromBody(body: Record<string, unknown>): DemoProfile {
  const params = new URLSearchParams();
  for (const key of ["provider", "firstName", "lastName", "email", "avatarUrl"]) {
    const value = cleanValue(body[key]);
    if (value) params.set(key, value);
  }
  return profileFromParams(params);
}

function setDemoCookies(response: NextResponse, profile: DemoProfile) {
  const options = {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };

  response.cookies.set(LOCAL_AUTH_COOKIE, LOCAL_AUTH_VALUE, {
    ...options,
    httpOnly: true,
  });
  response.cookies.set(LOCAL_PROFILE_NAME_COOKIE, profile.name, options);
  response.cookies.set(LOCAL_PROFILE_EMAIL_COOKIE, profile.email, options);
  response.cookies.set(LOCAL_PROFILE_PROVIDER_COOKIE, profile.provider, options);
  response.cookies.set(LOCAL_PROFILE_AVATAR_COOKIE, profile.avatarUrl ?? "", options);
}

function setDemoSession(redirectTo: string, profile: DemoProfile) {
  const response = NextResponse.json({ ok: true, redirectTo });
  setDemoCookies(response, profile);
  return response;
}

export async function POST(request: Request) {
  if (!isDemoAuthAllowed()) {
    return NextResponse.json({ error: "Demo auth is disabled in production." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const redirectTo = typeof body.redirectTo === "string" && body.redirectTo.startsWith("/") ? body.redirectTo : "/dashboard";
  return setDemoSession(redirectTo, profileFromBody(body));
}

export async function GET(request: Request) {
  if (!isDemoAuthAllowed()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "Demo auth is disabled. Use Google or email sign-in.");
    return NextResponse.redirect(loginUrl);
  }

  const url = new URL(request.url);
  const rawRedirect = url.searchParams.get("redirectTo");
  const redirectTo = rawRedirect && rawRedirect.startsWith("/") ? rawRedirect : "/dashboard";
  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  setDemoCookies(response, profileFromParams(url.searchParams));
  return response;
}
