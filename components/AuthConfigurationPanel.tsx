"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readJsonResponse } from "@/lib/client-json";
import { OAUTH_SCOPE_PRESETS, recommendedOAuthScopeValue } from "@/lib/oauth-scope-recommendation";
import type { OAuthScopePlan } from "@/lib/runtime/oauth-security";

export function AuthConfigurationPanel({
  serverId,
  hasAuthRequiredEndpoints,
  oauthSecuritySchemes,
  oauthProviderMetadata,
  oauthScopePlansByScheme = {},
  oauthCallbackUrl = "/api/oauth/callback",
  recommendedAuthScheme = "api_key_header",
  recommendedProvider,
  recommendedInjectionName = "api_key",
}: {
  serverId: string;
  hasAuthRequiredEndpoints: boolean;
  oauthSecuritySchemes: string[];
  oauthProviderMetadata: Record<string, { authorization_url?: string | null; token_url?: string | null; revocation_url?: string | null; resource_origin?: string | null; security_binding?: string | null } | null>;
  oauthScopePlansByScheme?: Record<string, OAuthScopePlan>;
  oauthCallbackUrl?: string;
  recommendedAuthScheme?: "bearer" | "api_key_header" | "api_key_query" | "oauth2";
  recommendedProvider?: string;
  recommendedInjectionName?: string;
}) {
  type CredentialSummary = { id: string; name: string; auth_scheme: string; provider: string | null; security_scheme?: string | null; end_user_id?: string | null; key_preview: string; created_at: string };
  const [name, setName] = useState(recommendedProvider ? `${recommendedProvider} connection` : "Default API credential");
  const [authScheme, setAuthScheme] = useState<"bearer" | "api_key_header" | "api_key_query" | "oauth2">(recommendedAuthScheme);
  const [provider, setProvider] = useState(recommendedAuthScheme === "oauth2" ? recommendedProvider ?? "" : "");
  const [customProvider, setCustomProvider] = useState("");
  const [securityScheme, setSecurityScheme] = useState("");
  const [trustProviderOrigins, setTrustProviderOrigins] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tokenAuthMethod, setTokenAuthMethod] = useState<"client_secret_post" | "client_secret_basic">("client_secret_post");
  const [scopes, setScopes] = useState("");
  const [endUserId, setEndUserId] = useState("");
  const [injectionName, setInjectionName] = useState(recommendedInjectionName);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);

  const loadConnections = useCallback(async () => {
    const response = await fetch(`/api/credentials?server_id=${encodeURIComponent(serverId)}`, { cache: "no-store" });
    const result = await readJsonResponse<{ credentials?: CredentialSummary[] }>(response);
    if (response.ok) setCredentials(result.credentials ?? []);
  }, [serverId]);

  useEffect(() => { void loadConnections(); }, [loadConnections]);

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_id: serverId,
          name,
          provider: authScheme === "oauth2" ? (provider === "custom" ? customProvider : provider) : recommendedProvider,
          security_scheme: authScheme === "oauth2" && securityScheme.trim() ? securityScheme.trim() : undefined,
          auth_scheme: authScheme,
          end_user_id: authScheme === "oauth2" && endUserId.trim() ? endUserId.trim() : undefined,
          client_id: authScheme === "oauth2" ? clientId : undefined,
          client_secret: authScheme === "oauth2" ? clientSecret : undefined,
          token_auth_method: authScheme === "oauth2" ? tokenAuthMethod : undefined,
          scopes: authScheme === "oauth2" ? scopes : undefined,
          injection_name: authScheme === "bearer" || authScheme === "oauth2" ? undefined : injectionName,
          secret: authScheme === "oauth2" ? undefined : secret,
          access_token: authScheme === "oauth2" ? secret : undefined,
        }),
      });
      const result = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error ?? "Could not save credential.");
      setSecret("");
      setClientSecret("");
      setMessage("Credential saved. Future runtime calls can inject it server-side.");
      await loadConnections();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save credential.");
    } finally {
      setSaving(false);
    }
  }

  async function connectOAuth() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/oauth/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_id: serverId,
          name,
          provider: provider === "custom" ? customProvider : provider,
          security_scheme: securityScheme.trim() || undefined,
          client_id: clientId,
          client_secret: clientSecret || undefined,
          scopes,
          end_user_id: endUserId.trim() || undefined,
          token_auth_method: tokenAuthMethod,
          trust_provider_origins: provider === "custom" ? trustProviderOrigins : undefined,
          confirmed_security_binding: provider === "custom" && trustProviderOrigins ? selectedOAuthMetadata?.security_binding : undefined,
          confirmed_revocation_url: provider === "custom" && trustProviderOrigins ? selectedOAuthMetadata?.revocation_url : undefined,
        }),
      });
      const result = await readJsonResponse<{ error?: string; authorize_url?: string }>(response);
      if (!response.ok || !result.authorize_url) throw new Error(result.error ?? "Could not start OAuth connection.");
      window.location.assign(result.authorize_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start OAuth connection.");
      setSaving(false);
    }
  }

  function applyOAuthPreset(value: string) {
    setProvider(value);
    setTrustProviderOrigins(false);
    const recommendation = selectedOAuthScopePlan?.status === "ready"
      ? selectedRequiredOAuthScopes.join(" ")
      : selectedOAuthScopePlan ? "" : recommendedOAuthScopeValue(value, []);
    if (recommendation) setScopes(recommendation);
  }

  const selectedOAuthScheme = oauthSecuritySchemes.length === 1 ? oauthSecuritySchemes[0] : securityScheme;
  const selectedOAuthMetadata = selectedOAuthScheme ? oauthProviderMetadata[selectedOAuthScheme] : null;
  const selectedOAuthScopePlan = selectedOAuthScheme ? oauthScopePlansByScheme[selectedOAuthScheme] ?? null : null;
  const selectedOAuthScopeStatus = selectedOAuthScopePlan?.status ?? null;
  const selectedRequiredOAuthScopes = selectedOAuthScopePlan?.scopes ?? [];
  const selectedRequiredOAuthScopeKey = selectedRequiredOAuthScopes.join(" ");

  useEffect(() => { setTrustProviderOrigins(false); }, [selectedOAuthMetadata?.security_binding, selectedOAuthMetadata?.revocation_url]);
  useEffect(() => {
    if (authScheme !== "oauth2" || !provider) return;
    setScopes(selectedOAuthScopeStatus === "ready"
      ? selectedRequiredOAuthScopeKey
      : selectedOAuthScopeStatus ? "" : recommendedOAuthScopeValue(provider, []));
  }, [authScheme, provider, selectedOAuthScopeStatus, selectedRequiredOAuthScopeKey]);

  async function removeCredential(id: string, providerConfirmed = false) {
    const credential = credentials.find((item) => item.id === id);
    const oauth = credential?.auth_scheme === "oauth2";
    if (!providerConfirmed && !window.confirm(oauth
      ? "Revoke this grant at the provider and permanently remove its encrypted tokens from Astrail?"
      : "Permanently remove this credential from Astrail?")) return;
    const suffix = providerConfirmed ? "?confirm_provider_revoked=true" : "";
    const response = await fetch(`/api/credentials/${id}${suffix}`, { method: "DELETE" });
    const result = await readJsonResponse<{ error?: string; requires_provider_confirmation?: boolean }>(response);
    if (!response.ok) {
      if (result.requires_provider_confirmation && window.confirm("Astrail cannot revoke this legacy or interrupted grant automatically. Confirm only after you have revoked Astrail in the provider's security settings. Remove the local encrypted credential now?")) {
        await removeCredential(id, true);
        return;
      }
      setMessage(result.error ?? "Could not remove connection.");
      return;
    }
    setMessage(oauth ? "Provider access revoked and local encrypted tokens removed." : "Connection removed.");
    await loadConnections();
  }

  return (
    <div className="space-y-4 text-sm">
      {hasAuthRequiredEndpoints ? (
        <p className="border border-amber-700/40 bg-amber-950/20 p-3 text-amber-200">
          Auth configuration required for one or more mapped endpoints. Without a credential, runtime calls return
          <code className="font-mono">auth_required</code>.
        </p>
      ) : (
        <p className="text-muted-foreground">No auth-required endpoints were detected for this server.</p>
      )}

      {credentials.length > 0 && (
        <div className="space-y-2 rounded-md border border-neutral-200 p-3">
          <p className="font-medium">Attached connections</p>
          <p className="text-xs text-muted-foreground">The newest compatible connection is used. Secrets remain encrypted and are never returned.</p>
          {credentials.map((credential, index) => (
            <div key={credential.id} className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{credential.name} {index === 0 ? <span className="text-xs text-emerald-700">newest</span> : null}</p>
                <p className="text-xs text-muted-foreground">{credential.auth_scheme} · {credential.end_user_id ? `user ${credential.end_user_id}` : "workspace"} · {credential.key_preview}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void removeCredential(credential.id)}>{credential.auth_scheme === "oauth2" ? "Revoke" : "Remove"}</Button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={saveCredential} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="credential-name">Credential name</Label>
          <Input id="credential-name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="credential-scheme">Auth scheme</Label>
            <select
              id="credential-scheme"
              value={authScheme}
              onChange={(event) => setAuthScheme(event.target.value as typeof authScheme)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="bearer">Bearer token</option>
              <option value="api_key_header">API key header</option>
              <option value="api_key_query">API key query param</option>
              <option value="oauth2">OAuth 2.0 token</option>
            </select>
          </div>
          <div className={authScheme === "oauth2" ? "hidden" : "space-y-2"}>
            <Label htmlFor="credential-injection">Header/query name</Label>
            <Input
              id="credential-injection"
              value={injectionName}
              onChange={(event) => setInjectionName(event.target.value)}
              disabled={authScheme === "bearer"}
              placeholder="api_key"
            />
          </div>
        </div>
        {authScheme === "oauth2" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 sm:col-span-2">
              <Label htmlFor="credential-callback-url">OAuth callback URL</Label>
              <Input id="credential-callback-url" value={oauthCallbackUrl} readOnly className="bg-white font-mono text-xs" />
              <p className="text-xs text-muted-foreground">Register this exact URL in the provider&apos;s OAuth app before connecting.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credential-provider">Provider</Label>
              <select id="credential-provider" value={provider} onChange={(event) => applyOAuthPreset(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                <option value="">Choose provider</option>
                {Object.keys(OAUTH_SCOPE_PRESETS).map((item) => <option key={item} value={item}>{item}</option>)}
                <option value="custom">Custom OAuth 2.0</option>
              </select>
              {provider === "custom" && <Input value={customProvider} onChange={(event) => setCustomProvider(event.target.value)} placeholder="Provider name" required />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="credential-client-id">Client ID</Label>
              <Input id="credential-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="OAuth client ID" />
            </div>
            {oauthSecuritySchemes.length > 1 ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="credential-security-scheme">Provider connection</Label>
                <select id="credential-security-scheme" value={securityScheme} onChange={(event) => { setSecurityScheme(event.target.value); setTrustProviderOrigins(false); }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                  <option value="">Choose the API connection this token belongs to</option>
                  {oauthSecuritySchemes.map((scheme) => <option key={scheme} value={scheme}>{scheme}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Astrail binds the token to this exact provider connection so it cannot cross into another OAuth integration.</p>
              </div>
            ) : null}
            {provider === "custom" && selectedOAuthMetadata ? (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950 sm:col-span-2">
                <p className="font-medium">Confirm this custom provider boundary</p>
                <dl className="space-y-1 break-all font-mono text-xs">
                  <div><dt className="inline font-semibold">authorize: </dt><dd className="inline">{selectedOAuthMetadata.authorization_url}</dd></div>
                  <div><dt className="inline font-semibold">token: </dt><dd className="inline">{selectedOAuthMetadata.token_url}</dd></div>
                  <div><dt className="inline font-semibold">revoke: </dt><dd className="inline">{selectedOAuthMetadata.revocation_url || "required in x-astrail-revocation-url"}</dd></div>
                  <div><dt className="inline font-semibold">api: </dt><dd className="inline">{selectedOAuthMetadata.resource_origin}</dd></div>
                </dl>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={trustProviderOrigins} onChange={(event) => setTrustProviderOrigins(event.target.checked)} className="mt-1" />
                  <span>I trust these exact origins to receive the OAuth code, client credentials, and provider token.</span>
                </label>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="credential-client-secret">Client secret</Label>
              <Input id="credential-client-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="Optional for public clients" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credential-token-auth">Token authentication</Label>
              <select id="credential-token-auth" value={tokenAuthMethod} onChange={(event) => setTokenAuthMethod(event.target.value as typeof tokenAuthMethod)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="client_secret_post">Client secret in form</option>
                <option value="client_secret_basic">HTTP Basic</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credential-scopes">Requested provider scopes</Label>
              <Input id="credential-scopes" value={scopes} onChange={(event) => setScopes(event.target.value)} placeholder="repo read:user offline_access" />
              {selectedRequiredOAuthScopes.length > 0 ? (
                <p className="text-xs text-emerald-700">Contract recommendation: {selectedRequiredOAuthScopeKey}</p>
              ) : null}
              {selectedOAuthScopePlan?.status === "ambiguous" ? (
                <p className="text-xs text-amber-700">This contract declares multiple OAuth scope alternatives. Choose one explicitly in the API contract, then re-import before connecting.</p>
              ) : null}
              {selectedOAuthScopePlan?.status === "unsupported" ? (
                <p className="text-xs text-red-700">This contract requires an unsupported multi-provider or malformed OAuth combination. Astrail will not start consent for it.</p>
              ) : null}
              <p className="text-xs text-muted-foreground">Use the smallest scope set your tools need. Calls fail closed with <code className="font-mono">oauth_insufficient_scope</code> when the connected grant is narrower than an operation.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credential-end-user">End-user ID</Label>
              <Input id="credential-end-user" value={endUserId} onChange={(event) => setEndUserId(event.target.value)} maxLength={256} placeholder="customer_user_123" />
              <p className="text-xs text-muted-foreground">Use the stable ID bound to the caller&apos;s Astrail API key. Leave blank only for a workspace service connection.</p>
            </div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                onClick={() => void connectOAuth()}
                disabled={saving || !provider || selectedOAuthScopePlan?.status === "ambiguous" || selectedOAuthScopePlan?.status === "unsupported" || (provider === "custom" && (!customProvider || !trustProviderOrigins || !selectedOAuthMetadata?.revocation_url)) || !clientId || (oauthSecuritySchemes.length > 1 && !securityScheme)}
              >
                <KeyRound className="h-4 w-4" />
                {saving ? "Connecting..." : "Connect with OAuth"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">Astrail uses OAuth state and PKCE, stores a separate encrypted grant per user, refreshes rotating tokens automatically, and never passes the caller&apos;s bearer token through to the provider.</p>
            </div>
          </div>
        )}
        {authScheme !== "oauth2" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="credential-secret">Secret</Label>
              <Input id="credential-secret" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} required minLength={8} />
            </div>
            <Button type="submit" variant="outline" disabled={saving}>
              <KeyRound className="h-4 w-4" />
              {saving ? "Saving..." : "Attach credential"}
            </Button>
          </>
        ) : null}
      </form>
      {message && <p className="text-muted-foreground">{message}</p>}
      <p className="text-xs text-muted-foreground">
        Secrets and OAuth tokens are sent only to the server API, encrypted before storage, and never returned to the browser. Runtime
        method permissions are guardrails before Astrail execution, not a security boundary; keep provider credentials
        scoped to the least privilege needed upstream.
      </p>
    </div>
  );
}
