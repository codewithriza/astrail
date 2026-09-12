const ORIGIN_ENV_NAMES = [
  "ASTRAIL_CORS_ORIGINS",
  "ALLOWED_ORIGIN",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
] as const;

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "*") return trimmed;

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

function addAstrailCanonicalPair(origins: Set<string>, origin: string) {
  try {
    const url = new URL(origin);
    if (url.hostname === "astrail.dev") {
      url.hostname = "www.astrail.dev";
      origins.add(url.origin);
    } else if (url.hostname === "www.astrail.dev") {
      url.hostname = "astrail.dev";
      origins.add(url.origin);
    }
  } catch {
    // Non-URL entries are kept verbatim and receive no inferred alias.
  }
}

export function configuredCorsOrigins() {
  const origins = new Set<string>();

  for (const name of ORIGIN_ENV_NAMES) {
    const value = process.env[name];
    if (!value) continue;

    for (const entry of value.split(",")) {
      const origin = normalizeOrigin(entry);
      if (!origin) continue;
      origins.add(origin);
      if (origin !== "*") addAstrailCanonicalPair(origins, origin);
    }
  }

  return Array.from(origins);
}
