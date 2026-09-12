export function hasPublicNeonAuthConfig() {
  return Boolean(process.env.NEXT_PUBLIC_NEON_AUTH_URL && process.env.NEXT_PUBLIC_NEON_DATA_API_URL);
}

export type OAuthProviderId = "google" | "github";

type OAuthProviderConfig = Record<OAuthProviderId, boolean>;

function envFlag(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function envExplicitlyFalse(value: string | undefined) {
  return value === "0" || value === "false" || value === "no" || value === "off";
}

function providerEnabled(publicValue: string | undefined, serverValue: string | undefined) {
  if (envExplicitlyFalse(publicValue) || envExplicitlyFalse(serverValue)) return false;
  if (envFlag(publicValue) || envFlag(serverValue)) return true;
  return hasPublicNeonAuthConfig();
}

export function enabledOAuthProviders(): OAuthProviderConfig {
  return {
    google: providerEnabled(process.env.NEXT_PUBLIC_ASTRAIL_GOOGLE_OAUTH_ENABLED, process.env.ASTRAIL_GOOGLE_OAUTH_ENABLED),
    github: providerEnabled(process.env.NEXT_PUBLIC_ASTRAIL_GITHUB_OAUTH_ENABLED, process.env.ASTRAIL_GITHUB_OAUTH_ENABLED),
  };
}

export function isOAuthProviderEnabled(provider: OAuthProviderId) {
  return enabledOAuthProviders()[provider];
}

export function oauthProviderDisabledMessage(provider: OAuthProviderId) {
  const name = provider === "google" ? "Google" : "GitHub";
  return `${name} sign-in is not enabled yet. Use email sign-in or finish ${name} OAuth setup for this workspace.`;
}

export function isDemoAuthAllowed() {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NEXT_PUBLIC_ASTRAIL_ALLOW_DEMO_AUTH !== "false";
}

export function missingProductionAuthMessage() {
  return "Production sign-in is not configured yet. Contact support or finish workspace auth setup before signing in.";
}
