"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  CreditCard,
  KeyRound,
  Pencil,
  ShieldCheck,
  Trash2,
  type LucideIcon,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { billingLaunchFreeMode, billingPlans, type BillingPlanId } from "@/lib/billing/plans";
import { readJsonResponse } from "@/lib/client-json";
import {
  LOCAL_PROFILE_AVATAR_COOKIE,
  LOCAL_PROFILE_EMAIL_COOKIE,
  LOCAL_PROFILE_NAME_COOKIE,
  LOCAL_PROFILE_PROVIDER_COOKIE,
} from "@/lib/local-auth-shared";
import { accountAvatarUrl, accountDisplayName } from "@/lib/account-display";
import { createClient } from "@/lib/neon/client";
import { formatDate } from "@/lib/utils";
import type { ApiKey } from "@/lib/types";

type BillingUsage = {
  plan: BillingPlanId;
  planName: string;
  status: string;
  creditLimit: number | null;
  creditsUsed: number;
  creditsRemaining: number | null;
  creditsPercentUsed: number | null;
  used: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  currentPeriodEnd: string;
  storage: string;
  enforcement: string;
  generationLimit: number | null;
  generationsUsed: number;
  generationPercentUsed: number | null;
  endpointLimit: number | null;
  endpointsUsed: number;
  endpointPercentUsed: number | null;
};

type AccountSnapshot = {
  avatarUrl?: string;
  name: string;
  email: string;
  provider: string;
};

const fallbackUsage: BillingUsage = {
  plan: "free",
  planName: "Free",
  status: "active",
  creditLimit: billingPlans.free.monthlyCredits,
  creditsUsed: 0,
  creditsRemaining: billingPlans.free.monthlyCredits,
  creditsPercentUsed: 0,
  used: 0,
  limit: billingPlans.free.monthlyToolCalls,
  remaining: billingPlans.free.monthlyToolCalls,
  percentUsed: 0,
  currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18).toISOString(),
  storage: "local-demo",
  enforcement: "preview",
  generationLimit: billingPlans.free.monthlyGenerations,
  generationsUsed: 0,
  generationPercentUsed: 0,
  endpointLimit: billingPlans.free.hostedEndpoints,
  endpointsUsed: 0,
  endpointPercentUsed: 0,
};

const hasNeonAuth = Boolean(process.env.NEXT_PUBLIC_NEON_AUTH_URL && process.env.NEXT_PUBLIC_NEON_DATA_API_URL);
const PROFILE_SETTINGS_KEY = "astrail_profile_settings";

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 14}; samesite=lax`;
}

function safeUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function getProfileSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_SETTINGS_KEY) ?? "{}");
    return {
      name: typeof parsed.name === "string" ? parsed.name.trim() : "",
    };
  } catch {
    return { name: "" };
  }
}

function saveProfileSettings(settings: { name: string }) {
  localStorage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify(settings));
  writeCookie(LOCAL_PROFILE_NAME_COOKIE, settings.name);
}

function getCookieAccount(): AccountSnapshot {
  return {
    avatarUrl: safeUrl(readCookie(LOCAL_PROFILE_AVATAR_COOKIE)),
    name: readCookie(LOCAL_PROFILE_NAME_COOKIE) || "Demo workspace",
    email: readCookie(LOCAL_PROFILE_EMAIL_COOKIE) || "demo@astrail.dev",
    provider: readCookie(LOCAL_PROFILE_PROVIDER_COOKIE) || "email",
  };
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("Default key");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountSnapshot>({
    avatarUrl: "",
    name: "Demo workspace",
    email: "demo@astrail.dev",
    provider: "email",
  });
  const [usage, setUsage] = useState<BillingUsage>(fallbackUsage);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Astrail workspace");
  const [defaultVisibility, setDefaultVisibility] = useState("private");
  const [runtimeGuardrails, setRuntimeGuardrails] = useState(true);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [profileName, setProfileName] = useState("Demo workspace");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const currentPlan = billingPlans[usage.plan] ?? billingPlans.free;
  const accountInitial = useMemo(() => account.name.trim().charAt(0).toUpperCase() || "A", [account.name]);
  const providerLabel = account.provider === "google"
    ? "Google"
    : account.provider === "github"
      ? "GitHub"
      : hasNeonAuth
        ? "Email"
        : "Local demo";

  async function loadKeys() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/apikeys");
      const result = await readJsonResponse<{ keys?: ApiKey[]; error?: string }>(response);
      if (!response.ok) throw new Error(result.error ?? "Could not load API keys.");
      setKeys(result.keys ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load API keys.");
    } finally {
      setLoading(false);
    }
  }

  async function loadBilling() {
    setBillingLoading(true);
    setBillingMessage(null);
    try {
      const response = await fetch("/api/billing/status");
      const result = await readJsonResponse<{ usage?: BillingUsage; error?: string }>(response);
      if (!response.ok || !result.usage) throw new Error(result.error ?? "Could not load billing status.");
      setUsage(result.usage);
    } catch (loadError) {
      setBillingMessage(loadError instanceof Error ? loadError.message : "Could not load billing status.");
      setUsage(fallbackUsage);
    } finally {
      setBillingLoading(false);
    }
  }

  async function loadAccount() {
    let nextAccount = getCookieAccount();
    const storedProfile = getProfileSettings();

    if (hasNeonAuth) {
      try {
        const neon = createClient();
        const { data } = await neon.auth.getUser();
        const user = data.user;
        if (user?.email) {
          nextAccount = {
            avatarUrl: accountAvatarUrl(user),
            name: accountDisplayName(user),
            email: user.email,
            provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "email",
          };
        }
      } catch {
        nextAccount = getCookieAccount();
      }
    }

    nextAccount = {
      ...nextAccount,
      name: storedProfile.name || nextAccount.name,
    };
    saveProfileSettings({ name: nextAccount.name });
    writeCookie(LOCAL_PROFILE_AVATAR_COOKIE, nextAccount.avatarUrl ?? "");
    setAccount(nextAccount);
    setProfileName(nextAccount.name);
    setWorkspaceName((current) => current === "Astrail workspace" ? `${nextAccount.name} workspace` : current);
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("astrail_workspace_settings") ?? "{}");
      if (typeof saved.workspaceName === "string") setWorkspaceName(saved.workspaceName);
      if (typeof saved.defaultVisibility === "string") setDefaultVisibility(saved.defaultVisibility);
      if (typeof saved.runtimeGuardrails === "boolean") setRuntimeGuardrails(saved.runtimeGuardrails);
    } catch {
      // Ignore malformed local settings.
    }

    void loadAccount();
    void loadBilling();
    void loadKeys();
  }, []);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setRawKey(null);
    setCopied(false);
    setError(null);

    try {
      const response = await fetch("/api/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await readJsonResponse<{ key?: ApiKey; rawKey?: string; error?: string }>(response);
      if (!response.ok || !result.key || !result.rawKey) throw new Error(result.error ?? "Could not create key.");
      setRawKey(result.rawKey);
      setKeys((current) => [result.key as ApiKey, ...current]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create key.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/apikeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deleteTarget.id,
          confirmation: deleteConfirmation,
        }),
      });
      const result = await readJsonResponse<{ deleted?: boolean; error?: string }>(response);
      if (!response.ok || !result.deleted) throw new Error(result.error ?? "Could not delete key.");
      setKeys((current) => current.filter((key) => key.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirmation("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete key.");
    } finally {
      setDeleting(false);
    }
  }

  async function copyRawKey() {
    if (!rawKey) return;
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function saveWorkspaceSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    localStorage.setItem(
      "astrail_workspace_settings",
      JSON.stringify({ workspaceName, defaultVisibility, runtimeGuardrails }),
    );
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 1800);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = profileName.trim() || account.name;

    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);

    try {
      if (hasNeonAuth) {
        const response = await fetch("/api/auth/update-user", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: nextName }),
        });
        if (!response.ok) throw new Error("Neon Auth could not update the profile.");
      }

      saveProfileSettings({ name: nextName });
      writeCookie(LOCAL_PROFILE_AVATAR_COOKIE, account.avatarUrl ?? "");
      writeCookie(LOCAL_PROFILE_EMAIL_COOKIE, account.email);
      writeCookie(LOCAL_PROFILE_PROVIDER_COOKIE, account.provider);
      setAccount((current) => ({ ...current, name: nextName }));
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 1800);
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : "Could not save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Workspace settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
            Manage account identity, workspace defaults, billing, and private MCP access.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/docs">Docs</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/billing">Billing</Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryTile icon={UserRound} label="Account" value={account.name} meta={providerLabel} avatarUrl={account.avatarUrl} />
        <SummaryTile
          icon={CreditCard}
          label="Plan"
          value={currentPlan.name}
          meta={billingLoading ? "Loading" : formatBillingStatus(usage.status)}
        />
        <SummaryTile
          icon={ShieldCheck}
          label="Runtime"
          value={usage.enforcement}
          meta={runtimeGuardrails ? "Guardrails on" : "Guardrails optional"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-6">
          <section className="console-card p-5 sm:p-6">
            <PanelHeader icon={Pencil} title="Account" description="Your connected identity. The avatar comes from your sign-in provider." />
            <form onSubmit={saveProfile} className="mt-6 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
              <AvatarPreview avatarUrl={account.avatarUrl} fallback={accountInitial} size="xl" />
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Display name</Label>
                  <Input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                </div>
                <div className="grid gap-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase text-neutral-400">Email</p>
                    <p className="mt-1 truncate text-neutral-950">{account.email}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase text-neutral-400">Provider</p>
                    <p className="mt-1 truncate text-neutral-950">{providerLabel}</p>
                  </div>
                </div>
                {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save account"}</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setProfileName(account.name);
                      setProfileError(null);
                    }}
                  >
                    Reset
                  </Button>
                  {profileSaved ? <StatusPill tone="success">Saved</StatusPill> : null}
                </div>
              </div>
            </form>
          </section>

          <section className="console-card p-5 sm:p-6">
            <PanelHeader title="Workspace" description="Defaults used when new hosted MCP endpoints are created." />
            <form onSubmit={saveWorkspaceSettings} className="mt-6 grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace name</Label>
                  <Input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-visibility">Default visibility</Label>
                  <select
                    id="default-visibility"
                    value={defaultVisibility}
                    onChange={(event) => setDefaultVisibility(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="private">Private hosted endpoints</option>
                    <option value="public">Public preview endpoints</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRuntimeGuardrails((value) => !value)}
                className="flex w-full items-center gap-3 rounded-md border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-neutral-300"
              >
                <span
                  className={[
                    "grid h-5 w-5 shrink-0 place-items-center rounded border text-white",
                    runtimeGuardrails ? "border-neutral-950 bg-neutral-950" : "border-neutral-300 bg-white",
                  ].join(" ")}
                >
                  {runtimeGuardrails ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="font-medium text-neutral-950">Require runtime guardrails</span>
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit">Save workspace</Button>
                {settingsSaved ? <StatusPill tone="success">Saved</StatusPill> : null}
              </div>
            </form>
          </section>

          <section id="api-keys" className="console-card scroll-mt-6 p-5 sm:p-6">
            <div className="flex flex-col items-start justify-between gap-4 border-b border-neutral-200 pb-5 sm:flex-row">
              <PanelHeader icon={KeyRound} title="API keys" description="Use keys for private MCP endpoints and server-side calls." />
              <StatusPill tone={keys.length > 0 ? "success" : "neutral"}>
                {keys.length > 0 ? `${keys.length} active` : "No keys"}
              </StatusPill>
            </div>

            <form onSubmit={createKey} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="keyName">Key name</Label>
                <Input id="keyName" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <Button disabled={creating}>
                <KeyRound className="h-4 w-4" />
                {creating ? "Creating..." : "Create key"}
              </Button>
            </form>

            {rawKey ? (
              <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <p className="text-sm font-medium text-neutral-950">Copy this key now. It will not be shown again.</p>
                    <p className="mt-1 text-xs text-neutral-500">Use it as Authorization: Bearer for private MCP endpoints.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={copyRawKey}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy key"}
                  </Button>
                </div>
                <code className="mt-3 block break-all rounded-md border border-neutral-200 bg-white p-3 text-sm">{rawKey}</code>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200">
              {loading ? (
                <p className="p-4 text-sm text-neutral-500">Loading keys...</p>
              ) : keys.length === 0 ? (
                <p className="p-4 text-sm text-neutral-500">No API keys yet.</p>
              ) : (
                <div className="divide-y divide-neutral-200">
                  {keys.map((key) => (
                    <div key={key.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-950">{key.name}</p>
                        <p className="mt-1 truncate font-mono text-sm text-neutral-500">{key.key_preview}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <p className="text-sm text-neutral-500">{formatDate(key.created_at)}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDeleteTarget(key);
                            setDeleteConfirmation("");
                            setError(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-6">
          <section className="console-card p-5 sm:p-6">
            <PanelHeader icon={CreditCard} title="Usage" />
            <div className="mt-5">
              <p className="text-4xl font-semibold tracking-tight text-neutral-950">
                {billingLaunchFreeMode ? "$0" : currentPlan.priceLabel.replace("/mo", "")}
                <span className="text-base font-normal text-neutral-400">/mo</span>
              </p>
              <p className="mt-2 text-sm text-neutral-500">{currentPlan.name} plan</p>
            </div>
            <div className="mt-6 space-y-5">
              <UsageBar label="Credits" used={usage.creditsUsed} limit={usage.creditLimit} percent={usage.creditsPercentUsed} />
              <UsageBar label="Hosted endpoints" used={usage.endpointsUsed} limit={usage.endpointLimit} percent={usage.endpointPercentUsed} />
            </div>
            {billingMessage ? (
              <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">{billingMessage}</p>
            ) : null}
            <Button asChild variant="outline" className="mt-5 w-full">
              <Link href="/dashboard/billing">Manage billing</Link>
            </Button>
          </section>

          <section className="console-card bg-neutral-950 p-5 text-white sm:p-6">
            <PanelHeader icon={ShieldCheck} title="Auth" dark />
            <div className="mt-5 space-y-4">
              <DarkStatusLine label="Sign-in" value={hasNeonAuth ? "Production" : "Local demo"} active={hasNeonAuth} />
              <DarkStatusLine label="Billing" value={billingMessage ? "Needs provider" : "Connected"} active={!billingMessage} />
              <DarkStatusLine
                label="API keys"
                value={keys.length > 0 ? `${keys.length} active` : "Ready"}
                active
              />
            </div>
          </section>
        </aside>
      </section>

      {deleteTarget && (
        <section className="console-card border-destructive/40 p-5 sm:p-6">
          <PanelHeader
            icon={AlertCircle}
            title="Delete API key"
            description="This cannot be undone. Type the key name to confirm deletion."
            danger
          />
          <div className="mt-5">
            <form onSubmit={deleteKey} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="delete-confirmation">
                  Type <code>{deleteTarget.name}</code> to delete this key
                </Label>
                <Input
                  id="delete-confirmation"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deleting || deleteConfirmation !== deleteTarget.name}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "Deleting..." : "Delete API key"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteConfirmation("");
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  description,
  danger = false,
  dark = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  danger?: boolean;
  dark?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      {Icon ? (
        <span
          className={[
            "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border",
            dark
              ? "border-white/10 bg-white/10 text-white"
              : danger
              ? "border-destructive/20 bg-destructive/10 text-destructive"
              : "border-neutral-200 bg-neutral-50 text-neutral-700",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <h2 className={dark ? "text-lg font-semibold tracking-tight text-white" : "text-lg font-semibold tracking-tight text-neutral-950"}>{title}</h2>
        {description ? <p className={dark ? "mt-1 text-sm leading-6 text-white/50" : "mt-1 text-sm leading-6 text-neutral-500"}>{description}</p> : null}
      </div>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  meta,
  avatarUrl,
}: {
  avatarUrl?: string;
  icon: LucideIcon;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3">
      {avatarUrl ? <AvatarPreview avatarUrl={avatarUrl} fallback={value.charAt(0)} size="sm" /> : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-neutral-600 shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase text-neutral-400">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-neutral-950">{value}</p>
        <p className="truncate text-xs text-neutral-500">{meta}</p>
      </div>
    </div>
  );
}

function AvatarPreview({
  avatarUrl,
  dark = false,
  fallback,
  size,
}: {
  avatarUrl?: string;
  dark?: boolean;
  fallback: string;
  size: "sm" | "lg" | "xl";
}) {
  const sizeClass = size === "xl" ? "h-20 w-20 text-2xl" : size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-sm";

  return (
    <span
      className={[
        "grid shrink-0 overflow-hidden rounded-md border font-semibold shadow-sm",
        sizeClass,
        dark ? "border-white/10 bg-white/[0.08] text-white" : "border-neutral-200 bg-white text-neutral-700",
      ].join(" ")}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid h-full w-full place-items-center">{fallback.trim().charAt(0).toUpperCase() || "A"}</span>
      )}
    </span>
  );
}

function DarkStatusLine({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-white/45">{label}</span>
      <span
        className={[
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          active
            ? "bg-emerald-400/10 text-emerald-200"
            : "bg-amber-400/10 text-amber-200",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: "success" | "neutral" }) {
  return (
    <span
      className={[
        "inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-medium",
        tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function UsageBar({ label, used, limit, percent }: { label: string; used: number; limit: number | null; percent: number | null }) {
  const width = percent === null ? 100 : Math.min(100, Math.max(0, percent));
  const overLimit = limit !== null && used > limit ? used - limit : 0;
  const displayUsage = limit === null
    ? `${used.toLocaleString()} used`
    : overLimit > 0
      ? `${limit.toLocaleString()} included - ${overLimit.toLocaleString()} over`
      : `${used.toLocaleString()} / ${limit.toLocaleString()}`;
  const barColor = overLimit > 0 ? "bg-orange-600" : "bg-neutral-950";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className={overLimit > 0 ? "font-medium text-orange-700" : "text-muted-foreground"}>{displayUsage}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-neutral-200">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${width}%` }} />
      </div>
      {overLimit > 0 ? (
        <p className="mt-1 text-xs text-orange-700">Upgrade or remove usage before creating more.</p>
      ) : null}
    </div>
  );
}

function formatBillingStatus(status: string) {
  const normalized = status.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized || normalized === "free" || normalized === "active") return "Active";
  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
