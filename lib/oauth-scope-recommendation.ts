export const OAUTH_SCOPE_PRESETS = {
  github: "read:user",
  google: "openid email profile",
  slack: "openid profile email",
  hubspot: "oauth",
  salesforce: "api refresh_token",
} as const;

export function recommendedOAuthScopeValue(provider: string, contractScopes: string[]) {
  const required = Array.from(new Set(contractScopes.map((scope) => scope.trim()).filter(Boolean)));
  if (required.length > 0) return required.join(" ");
  return OAUTH_SCOPE_PRESETS[provider as keyof typeof OAUTH_SCOPE_PRESETS] ?? "";
}
