import { createNeonAuth } from "@neondatabase/auth/next/server";
import { NeonPostgrestClient, fetchWithToken } from "@neondatabase/postgrest-js";
import { getServerNeonConfig } from "@/lib/neon/env";
import { createNeonSql } from "@/lib/db/neon";

let authInstance: ReturnType<typeof createNeonAuth> | undefined;
let serviceSignIn: Promise<string | null> | undefined;
let cachedServiceToken: { token: string; expiresAt: number } | undefined;

export function getNeonAuth() {
  if (authInstance) return authInstance;
  const { authUrl, cookieSecret } = getServerNeonConfig();
  if (!authUrl || !cookieSecret) throw new Error("Neon Auth is not configured.");
  authInstance = createNeonAuth({
    baseUrl: authUrl,
    cookies: { secret: cookieSecret, sessionDataTtl: 300, sameSite: "lax" },
    logLevel: process.env.NODE_ENV === "production" ? "error" : "warn",
  });
  return authInstance;
}

function dataApiUrl() {
  const { dataApiUrl } = getServerNeonConfig();
  if (!dataApiUrl) throw new Error("Neon Data API is not configured.");
  return dataApiUrl;
}

function sessionUser(user: Record<string, unknown> | null | undefined) {
  if (!user || typeof user.id !== "string") return null;
  const role = typeof user.role === "string" ? user.role : undefined;
  return {
    ...user,
    id: user.id,
    email: typeof user.email === "string" ? user.email : null,
    user_metadata: {
      full_name: typeof user.name === "string" ? user.name : undefined,
      avatar_url: typeof user.image === "string" ? user.image : undefined,
      role,
    },
    app_metadata: { role },
  };
}

async function ensureProfile(user: ReturnType<typeof sessionUser>) {
  if (!user?.id || !user.email) return;
  const sql = createNeonSql();
  try {
    await sql`select public.link_neon_identity(${user.id}::uuid, ${user.email}::text)`;
  } catch (error) {
    console.warn("Neon identity relink skipped", {
      code: error && typeof error === "object" && "code" in error ? error.code : undefined,
      name: error instanceof Error ? error.name : "unknown",
    });
  }
}

async function currentAccessToken() {
  const auth = getNeonAuth() as ReturnType<typeof getNeonAuth> & {
    token(): Promise<{ data: unknown; error: unknown }>;
  };
  const result = await auth.token();
  const data = result.data as Record<string, unknown> | null | undefined;
  return typeof data?.token === "string"
    ? data.token
    : typeof data?.accessToken === "string"
      ? data.accessToken
      : null;
}

async function serviceAccessToken() {
  const config = getServerNeonConfig();
  if (config.dataApiKey?.trim()) return config.dataApiKey.trim();
  if (!config.authUrl || !config.serviceEmail || !config.servicePassword) return null;

  const serviceOrigin = process.env.ASTRAIL_APP_URL ?? "https://astrail.dev";
  if (cachedServiceToken && cachedServiceToken.expiresAt > Date.now() + 30_000) return cachedServiceToken.token;

  if (!serviceSignIn) {
    serviceSignIn = (async () => {
      const signIn = await fetch(`${config.authUrl}/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", Origin: serviceOrigin },
        body: JSON.stringify({ email: config.serviceEmail, password: config.servicePassword, callbackURL: serviceOrigin }),
      });
      if (!signIn.ok) {
        const failure = await signIn.json().catch(() => null) as { code?: string } | null;
        throw new Error(`Neon runtime identity sign-in failed (${signIn.status}, ${failure?.code ?? "unknown"}).`);
      }
      const cookie = signIn.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
      if (!cookie) throw new Error("Neon runtime identity returned no session cookie.");
      const tokenResponse = await fetch(`${config.authUrl}/token`, {
        headers: { cookie, Origin: serviceOrigin },
      });
      if (!tokenResponse.ok) throw new Error(`Neon runtime identity token failed (${tokenResponse.status}).`);
      const payload = await tokenResponse.json() as { token?: string | null };
      if (!payload.token) throw new Error("Neon runtime identity returned no Data API token.");
      const jwtPayload = JSON.parse(Buffer.from(payload.token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
      cachedServiceToken = { token: payload.token, expiresAt: typeof jwtPayload.exp === "number" ? jwtPayload.exp * 1000 : Date.now() + 4 * 60_000 };
      return payload.token;
    })().finally(() => {
      serviceSignIn = undefined;
    });
  }
  return serviceSignIn;
}

export async function createServerNeonClient() {
  const auth = getNeonAuth();
  const data = createUserDataClient();
  return Object.assign(data, {
    auth: {
      async getUser() {
        const result = await auth.getSession();
        const payload = result.data as { user?: Record<string, unknown> } | null;
        const user = sessionUser(payload?.user);
        if (user && !result.error) await ensureProfile(user);
        return { data: { user }, error: result.error };
      },
      async getSession() {
        const result = await auth.getSession();
        return { data: { session: result.data }, error: result.error };
      },
      async signOut() {
        return auth.signOut();
      },
    },
  });
}

export function createUserDataClient() {
  return new NeonPostgrestClient({
    dataApiUrl: dataApiUrl(),
    options: { global: { fetch: fetchWithToken(currentAccessToken) } },
  });
}

export function createPublicClient() {
  return new NeonPostgrestClient({ dataApiUrl: dataApiUrl() });
}

export function createAdminClient() {
  return new NeonPostgrestClient({
    dataApiUrl: dataApiUrl(),
    options: { global: { fetch: fetchWithToken(serviceAccessToken) } },
  });
}

export async function createDataClient() {
  return process.env.NEON_DATA_API_KEY ? createAdminClient() : createUserDataClient();
}

export function hasServiceRoleKey() {
  return Boolean(
    process.env.NEON_DATA_API_KEY
      || (process.env.NEON_AUTH_SERVICE_EMAIL && process.env.NEON_AUTH_SERVICE_PASSWORD),
  );
}
