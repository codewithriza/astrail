export function hasBrowserNeonEnv() {
  return Boolean(process.env.NEXT_PUBLIC_NEON_AUTH_URL && process.env.NEXT_PUBLIC_NEON_DATA_API_URL);
}

export function hasServerNeonEnv() {
  if (process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES === "1") return false;
  return Boolean(
    (process.env.NEON_AUTH_BASE_URL ?? process.env.NEXT_PUBLIC_NEON_AUTH_URL)
      && (process.env.NEON_DATA_API_URL ?? process.env.NEXT_PUBLIC_NEON_DATA_API_URL),
  );
}

export function getBrowserNeonConfig() {
  const authUrl = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
  const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  return { authUrl, dataApiUrl, isConfigured: Boolean(authUrl && dataApiUrl) };
}

export function getServerNeonConfig() {
  return {
    authUrl: process.env.NEON_AUTH_BASE_URL ?? process.env.NEXT_PUBLIC_NEON_AUTH_URL,
    dataApiUrl: process.env.NEON_DATA_API_URL ?? process.env.NEXT_PUBLIC_NEON_DATA_API_URL,
    dataApiKey: process.env.NEON_DATA_API_KEY,
    serviceEmail: process.env.NEON_AUTH_SERVICE_EMAIL,
    servicePassword: process.env.NEON_AUTH_SERVICE_PASSWORD,
    cookieSecret: process.env.NEON_AUTH_COOKIE_SECRET,
  };
}
