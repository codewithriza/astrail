import { originAllowed } from "../lib/security";
import { browserMutationAllowed } from "../lib/origin-policy";
import { configuredCorsOrigins } from "../lib/cors-origins";

type EnvSnapshot = {
  allowedOrigin?: string;
  nodeEnv?: string;
  siteUrl?: string;
  vercelUrl?: string;
  corsOrigins?: string;
  appUrl?: string;
  runtimeBaseUrl?: string;
};

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function waitlistRequest(headers: Record<string, string>) {
  return new Request("https://astrail.dev/api/waitlist", { headers });
}

function snapshotEnv(): EnvSnapshot {
  return {
    allowedOrigin: process.env.ALLOWED_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    vercelUrl: process.env.VERCEL_URL,
    corsOrigins: process.env.ASTRAIL_CORS_ORIGINS,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    runtimeBaseUrl: process.env.NEXT_PUBLIC_RUNTIME_BASE_URL,
  };
}

function restoreEnv(snapshot: EnvSnapshot) {
  setEnv("ALLOWED_ORIGIN", snapshot.allowedOrigin);
  setEnv("NODE_ENV", snapshot.nodeEnv);
  setEnv("NEXT_PUBLIC_SITE_URL", snapshot.siteUrl);
  setEnv("VERCEL_URL", snapshot.vercelUrl);
  setEnv("ASTRAIL_CORS_ORIGINS", snapshot.corsOrigins);
  setEnv("NEXT_PUBLIC_APP_URL", snapshot.appUrl);
  setEnv("NEXT_PUBLIC_RUNTIME_BASE_URL", snapshot.runtimeBaseUrl);
}

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function clearOriginEnv() {
  delete process.env.ALLOWED_ORIGIN;
  delete process.env.ASTRAIL_CORS_ORIGINS;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_RUNTIME_BASE_URL;
  delete process.env.VERCEL_URL;
}

const env = snapshotEnv();

try {
  clearOriginEnv();
  setEnv("NODE_ENV", "production");

  assert(
    originAllowed(waitlistRequest({
      origin: "https://astrail.dev",
      host: "astrail.dev",
      "x-forwarded-proto": "https",
    })),
    "same-origin waitlist request should be allowed",
  );

  assert(
    originAllowed(waitlistRequest({
      origin: "https://astrail-git-preview-codewithriza.vercel.app",
      host: "astrail-git-preview-codewithriza.vercel.app",
      "x-forwarded-proto": "https",
    })),
    "matching Vercel preview origin should be allowed",
  );

  assert(
    !originAllowed(waitlistRequest({
      origin: "https://attacker.vercel.app",
      host: "astrail.dev",
      "x-forwarded-proto": "https",
    })),
    "third-party Vercel origin should be rejected",
  );

  assert(
    !originAllowed(waitlistRequest({
      origin: "not a url",
      host: "astrail.dev",
    })),
    "malformed Origin header should be rejected",
  );

  process.env.ALLOWED_ORIGIN = "https://partners.example";
  assert(
    originAllowed(waitlistRequest({
      origin: "https://partners.example",
      host: "astrail.dev",
      "x-forwarded-proto": "https",
    })),
    "configured waitlist origin should be allowed",
  );

  process.env.ASTRAIL_CORS_ORIGINS = "https://mcp-client.example";
  assert(
    originAllowed(waitlistRequest({
      origin: "https://mcp-client.example",
      host: "astrail.dev",
      "x-forwarded-proto": "https",
    })),
    "shared configured CORS origin should be allowed for public forms",
  );

  process.env.ASTRAIL_CORS_ORIGINS = "";
  process.env.NEXT_PUBLIC_APP_URL = "https://astrail.dev";
  assert(
    configuredCorsOrigins().includes("https://www.astrail.dev"),
    "the canonical www Astrail origin should be allowed when the apex production origin is configured",
  );

  assert(
    browserMutationAllowed(
      "POST",
      new Headers({
        origin: "https://astrail.dev",
        host: "astrail.dev",
        "x-forwarded-proto": "https",
      }),
      "https://astrail.dev/api/generate",
    ).allowed,
    "same-origin API mutation should be allowed",
  );

  const crossSite = browserMutationAllowed(
    "POST",
    new Headers({
      origin: "https://attacker.example",
      host: "astrail.dev",
      "x-forwarded-proto": "https",
      "sec-fetch-site": "cross-site",
    }),
    "https://astrail.dev/api/generate",
  );
  assert(
    !crossSite.allowed && crossSite.reason === "origin_not_allowed",
    "cross-site browser API mutation should be rejected",
  );

  const crossSiteNoOrigin = browserMutationAllowed(
    "POST",
    new Headers({
      host: "astrail.dev",
      "x-forwarded-proto": "https",
      "sec-fetch-site": "cross-site",
    }),
    "https://astrail.dev/api/billing/checkout",
  );
  assert(
    !crossSiteNoOrigin.allowed && crossSiteNoOrigin.reason === "cross_site_fetch",
    "cross-site browser API mutation without Origin should be rejected",
  );

  assert(
    browserMutationAllowed(
      "POST",
      new Headers({ host: "astrail.dev", "x-forwarded-proto": "https" }),
      "https://astrail.dev/api/generate",
    ).allowed,
    "server-to-server API mutation without browser origin headers should be allowed",
  );

  console.log("PASS: waitlist origin security checks passed.");
} finally {
  restoreEnv(env);
}
