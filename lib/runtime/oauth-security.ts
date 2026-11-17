import type { OpenApiEndpoint } from "../types";

function securityRecords(security: unknown): Array<Record<string, unknown>> {
  if (!security) return [];
  if (Array.isArray(security)) {
    return security.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item))
    );
  }
  return security && typeof security === "object" && !Array.isArray(security)
    ? [security as Record<string, unknown>]
    : [];
}

function isOAuthSecurityEntry(endpoint: OpenApiEndpoint, name: string, value: unknown) {
  if (endpoint.oauth_security_schemes?.includes(name)) return true;
  return /oauth|openid|oidc/i.test(name)
    || (Array.isArray(value) && value.some((scope) =>
      typeof scope === "string" && /oauth|openid|profile|email|offline_access/i.test(scope)
    ));
}

function normalizedScopes(scopes: unknown) {
  if (!Array.isArray(scopes)) return [];
  return Array.from(new Set(scopes
    .filter((scope): scope is string => typeof scope === "string")
    .map((scope) => scope.trim())
    .filter(Boolean)));
}

export function oauthSecuritySchemeNames(endpoint: OpenApiEndpoint) {
  const security = endpoint.security_requirements ?? endpoint.security;
  return Array.from(new Set(securityRecords(security).flatMap((record) =>
    Object.entries(record)
      .filter(([name, value]) => isOAuthSecurityEntry(endpoint, name, value))
      .map(([name]) => name)
  )));
}

export function hasOAuthSecurityRequirement(endpoint: OpenApiEndpoint) {
  return oauthSecuritySchemeNames(endpoint).length > 0;
}

export function hasIncompleteSecuritySchemeMetadata(endpoint: OpenApiEndpoint) {
  const security = endpoint.security_requirements ?? endpoint.security;
  return securityRecords(security).length > 0 && endpoint.security_scheme_metadata_complete !== true;
}

export function hasAmbiguousScopedSecurityRequirement(endpoint: OpenApiEndpoint) {
  if (hasOAuthSecurityRequirement(endpoint)) return false;
  const security = endpoint.security_requirements ?? endpoint.security;
  return hasIncompleteSecuritySchemeMetadata(endpoint) && securityRecords(security).some((record) =>
    Object.values(record).some((value) => !Array.isArray(value) || value.some((scope) => typeof scope !== "string" || scope.trim().length > 0))
  );
}

export function oauthSecurityMetadata(endpoint: OpenApiEndpoint, securityScheme: string) {
  return endpoint.oauth_security_metadata?.[securityScheme] ?? null;
}

export function oauthSecurityBinding(endpoint: OpenApiEndpoint, securityScheme: string) {
  return endpoint.oauth_security_bindings?.[securityScheme] ?? null;
}

export function oauthRequiredScopes(endpoint: OpenApiEndpoint, securityScheme?: string | null) {
  return oauthScopeRecommendation(endpoint, securityScheme).scopes;
}

export type OAuthScopePlan = {
  status: "ready" | "ambiguous" | "unsupported";
  scopes: string[];
};

export function oauthScopeRecommendation(endpoint: OpenApiEndpoint, securityScheme?: string | null): OAuthScopePlan {
  const alternatives = oauthScopeAlternatives(endpoint)
    .filter((alternative) => !securityScheme || alternative.securitySchemes.includes(securityScheme));
  if (alternatives.some((alternative) => !alternative.valid || alternative.securitySchemes.length !== 1)) {
    return { status: "unsupported", scopes: [] };
  }
  if (alternatives.length > 1) return { status: "ambiguous", scopes: [] };
  if (alternatives.length === 0) return { status: "ready", scopes: [] };
  return {
    status: "ready",
    scopes: securityScheme
      ? alternatives[0].requiredScopesByScheme[securityScheme] ?? []
      : alternatives[0].requiredScopes,
  };
}

export function oauthScopePlansBySecurityScheme(endpoints: OpenApiEndpoint[], securitySchemes: string[]) {
  return Object.fromEntries(securitySchemes.map((scheme) => {
    const plans = endpoints
      .filter((endpoint) => oauthSecuritySchemeNames(endpoint).includes(scheme))
      .map((endpoint) => oauthScopeRecommendation(endpoint, scheme));
    const status = plans.some((plan) => plan.status === "unsupported")
      ? "unsupported"
      : plans.some((plan) => plan.status === "ambiguous")
        ? "ambiguous"
        : "ready";
    return [scheme, {
      status,
      scopes: status === "ready" ? Array.from(new Set(plans.flatMap((plan) => plan.scopes))) : [],
    } satisfies OAuthScopePlan];
  }));
}

export function oauthScopesBySecurityScheme(endpoints: OpenApiEndpoint[], securitySchemes: string[]) {
  return Object.fromEntries(Object.entries(oauthScopePlansBySecurityScheme(endpoints, securitySchemes))
    .map(([scheme, plan]) => [scheme, plan.scopes]));
}

function oauthScopeAlternatives(endpoint: OpenApiEndpoint) {
  const security = endpoint.security_requirements ?? endpoint.security;
  return securityRecords(security).flatMap((record) => {
    const allEntries = Object.entries(record);
    const oauthEntries = allEntries.filter(([name, value]) => isOAuthSecurityEntry(endpoint, name, value));
    if (oauthEntries.length === 0) return [];
    return [{
      securitySchemes: allEntries.map(([name]) => name),
      valid: allEntries.every(([, value]) => Array.isArray(value) && value.every((scope) => typeof scope === "string")),
      requiredScopes: normalizedScopes(oauthEntries.flatMap(([, value]) => Array.isArray(value) ? value : [])),
      requiredScopesByScheme: Object.fromEntries(oauthEntries.map(([name, value]) => [
        name,
        normalizedScopes(value),
      ])),
    }];
  });
}

export function evaluateOAuthScopeGrant(endpoint: OpenApiEndpoint, grantedScopes: unknown, securityScheme?: string | null) {
  const allAlternatives = oauthScopeAlternatives(endpoint);
  const alternatives = securityScheme
    ? allAlternatives.filter((alternative) =>
        alternative.securitySchemes.length === 1 && alternative.securitySchemes[0] === securityScheme
      )
    : allAlternatives;
  const validAlternatives = alternatives.filter((alternative) => alternative.valid);
  const granted = new Set(normalizedScopes(grantedScopes));

  if (allAlternatives.length === 0) {
    return { allowed: true, requiredScopes: [] as string[], missingScopes: [] as string[] };
  }
  if (validAlternatives.length === 0) {
    return { allowed: false, requiredScopes: [] as string[], missingScopes: [] as string[] };
  }
  if (validAlternatives.some((alternative) => alternative.requiredScopes.length === 0)) {
    return { allowed: true, requiredScopes: [] as string[], missingScopes: [] as string[] };
  }

  const candidates = validAlternatives.map(({ requiredScopes }) => ({
    requiredScopes,
    missingScopes: requiredScopes.filter((scope) => !granted.has(scope)),
  })).sort((left, right) => left.missingScopes.length - right.missingScopes.length);
  const closest = candidates[0];

  return {
    allowed: closest.missingScopes.length === 0,
    requiredScopes: closest.requiredScopes,
    missingScopes: closest.missingScopes,
  };
}
