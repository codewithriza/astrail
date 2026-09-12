"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  Cable,
  Check,
  ChevronDown,
  Code2,
  Compass,
  CreditCard,
  Download,
  FileText,
  GitBranch,
  Home,
  KeyRound,
  LayoutGrid,
  Link2,
  Package,
  Settings,
  Shield,
  ShieldCheck,
  Store,
  Terminal,
  Wrench,
  Wand2,
  X,
} from "lucide-react";
import Image from "next/image";
import { SignOutButton } from "@/components/SignOutButton";
import {
  LOCAL_PROFILE_AVATAR_COOKIE,
  LOCAL_PROFILE_EMAIL_COOKIE,
  LOCAL_PROFILE_NAME_COOKIE,
  LOCAL_PROFILE_PROVIDER_COOKIE,
} from "@/lib/local-auth-shared";
import { accountAvatarUrl, accountDisplayName } from "@/lib/account-display";
import { createClient } from "@/lib/neon/client";

const mcpLinks = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/integrations", label: "Integrations", icon: Cable },
  { href: "/dashboard/connections", label: "Connections", icon: Link2 },
  { href: "/dashboard/tools", label: "Tools", icon: Wrench },
  { href: "/dashboard/policies", label: "Policies", icon: Shield },
  { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/dashboard/analytics", label: "Activity & logs", mobileLabel: "Activity", icon: BarChart3 },
  { href: "/dashboard/audit", label: "Agent audit", mobileLabel: "Audit", icon: FileText },
  { href: "/dashboard/usage", label: "Usage", icon: Activity },
  { href: "/dashboard/bundles", label: "Bundles", icon: Boxes },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: Terminal },
  { href: "/dashboard/setup", label: "Agent setup", icon: Terminal },
  { href: "/dashboard/capabilities", label: "Capabilities", icon: LayoutGrid },
  { href: "/dashboard/generate", label: "Add integration", mobileLabel: "Add", icon: Wand2 },
  { href: "/dashboard/website-to-mcp", label: "Website to MCP", icon: Compass },
  { href: "/marketplace", label: "Catalog", icon: Store },
];

const sdkLinks = [
  { href: "/dashboard/sdk", label: "SDK Home", mobileLabel: "Home", icon: Download, activeMatch: "/dashboard/sdk", exact: true },
  { href: "/dashboard/sdk#generator", label: "Generate SDK", mobileLabel: "Generate", icon: Code2, activeMatch: null },
  { href: "/dashboard/sdk#targets", label: "Language targets", mobileLabel: "Languages", icon: Package, activeMatch: null },
  { href: "/dashboard/sdk#docs", label: "Docs + examples", mobileLabel: "Docs", icon: FileText, activeMatch: null },
  { href: "/dashboard/sdk#cli", label: "CLI + manifests", mobileLabel: "CLI", icon: Terminal, activeMatch: null },
  { href: "/dashboard/sdk#ci", label: "Tests + CI", mobileLabel: "Tests", icon: ShieldCheck, activeMatch: null },
  { href: "/dashboard/sdk#publish", label: "Publish workflow", mobileLabel: "Publish", icon: GitBranch, activeMatch: null },
  { href: "/dashboard/sdk#versioning", label: "Versioning", icon: Activity, activeMatch: null },
];

const mcpMobileLinkGroups = [
  { label: "Control plane", items: mcpLinks.slice(0, 6) },
  { label: "Operate", items: mcpLinks.slice(6, 12) },
  { label: "Build", items: mcpLinks.slice(12) },
];

const sdkMobileLinkGroups = [
  { label: "Build SDKs", items: sdkLinks.slice(0, 4) },
  { label: "Ship", items: sdkLinks.slice(4) },
];

const productModes = [
  {
    href: "/dashboard",
    label: "Console",
    description: "Generate and host endpoints for agents, tools, and bundles.",
    icon: Code2,
  },
  {
    href: "/dashboard/sdk",
    label: "SDK Generator",
    description: "Generate typed SDKs, docs, CLIs, manifests, tests, and CI from hosted endpoints.",
    icon: Download,
  },
];

function isActiveNavItem(
  item: { href: string; activeMatch?: string | null; exact?: boolean },
  pathname: string,
) {
  if (item.activeMatch === null) return false;
  const hrefPath = item.activeMatch ?? item.href.split("#")[0].split("?")[0];
  if (item.exact || hrefPath === "/dashboard") return pathname === hrefPath;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

type DemoAccount = {
  avatarUrl?: string;
  email: string;
  name: string;
  provider: string;
};

const ACCOUNTS_KEY = "astrail_demo_accounts";
const PROFILE_SETTINGS_KEY = "astrail_profile_settings";
const hasNeonAuth = Boolean(process.env.NEXT_PUBLIC_NEON_AUTH_URL && process.env.NEXT_PUBLIC_NEON_DATA_API_URL);

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

function loadProfileSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_SETTINGS_KEY) ?? "{}");
    return {
      avatarUrl: safeUrl(typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : ""),
      name: typeof parsed.name === "string" ? parsed.name.trim() : "",
    };
  } catch {
    return { avatarUrl: "", name: "" };
  }
}

function loadAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is DemoAccount =>
      typeof item?.name === "string" && typeof item?.email === "string" && typeof item?.provider === "string",
    ) : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: DemoAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 5)));
}

function currentCookieAccount(): DemoAccount {
  return {
    avatarUrl: safeUrl(readCookie(LOCAL_PROFILE_AVATAR_COOKIE)),
    name: readCookie(LOCAL_PROFILE_NAME_COOKIE) || "Demo workspace",
    email: readCookie(LOCAL_PROFILE_EMAIL_COOKIE) || "demo@astrail.dev",
    provider: readCookie(LOCAL_PROFILE_PROVIDER_COOKIE) || "email",
  };
}

function AccountSwitcher() {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<DemoAccount>({ name: "Demo workspace", email: "demo@astrail.dev", provider: "email" });
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [addingAccount, setAddingAccount] = useState(false);

  useEffect(() => {
    async function loadCurrentAccount() {
      let current = currentCookieAccount();
      const profileSettings = loadProfileSettings();

      if (hasNeonAuth) {
        try {
          const neon = createClient();
          const { data } = await neon.auth.getUser();
          const user = data.user;
          if (user?.email) {
            current = {
              avatarUrl: accountAvatarUrl(user),
              name: accountDisplayName(user),
              email: user.email,
              provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "email",
            };
          }
        } catch {
          current = currentCookieAccount();
        }
      }

      current = {
        ...current,
        avatarUrl: profileSettings.avatarUrl || current.avatarUrl,
        name: profileSettings.name || current.name,
      };
      const saved = hasNeonAuth ? [] : loadAccounts();
      const merged = [current, ...saved.filter((item) => item.email !== current.email || item.provider !== current.provider)];
      setAccount(current);
      setAccounts(merged.slice(0, 5));
      if (!hasNeonAuth) saveAccounts(merged);
    }

    void loadCurrentAccount();
  }, []);

  const initial = useMemo(() => account.name.trim().charAt(0).toUpperCase() || "A", [account.name]);
  const providerLabel = account.provider === "google" ? "Google account" : account.provider === "github" ? "GitHub account" : "Demo account";

  function switchAccount(next: DemoAccount) {
    writeCookie(LOCAL_PROFILE_NAME_COOKIE, next.name);
    writeCookie(LOCAL_PROFILE_EMAIL_COOKIE, next.email);
    writeCookie(LOCAL_PROFILE_PROVIDER_COOKIE, next.provider);
    writeCookie(LOCAL_PROFILE_AVATAR_COOKIE, next.avatarUrl ?? "");
    setAccount(next);
    setOpen(false);
  }

  async function addAccount() {
    setAddingAccount(true);

    if (hasNeonAuth) {
      try {
        const neon = createClient();
        await neon.auth.signOut();
      } catch {
        // Continue to the server sign-out route so stale cookies are still cleared.
      }

      await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
      // Reset the document after an identity change so cached user state cannot survive.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/signup?account=add");
      return;
    }

    // Reset the document after an identity change so cached user state cannot survive.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/signup");
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.04]"
      >
        <span className="grid h-8 w-8 overflow-hidden rounded-md border border-white/10 bg-white/[0.08] font-mono text-sm font-bold text-white">
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid h-full w-full place-items-center">{initial}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{account.name}</span>
          <span className="block truncate text-xs text-white/45">{providerLabel}</span>
        </span>
        <span className="font-mono text-xs text-white/35">{open ? "-" : "+"}</span>
      </button>

      {open ? (
        <div className="border-t border-white/10 p-2">
          <div className="grid gap-1">
            {accounts.map((item) => (
              <button
                key={`${item.provider}-${item.email}-${item.name}`}
                type="button"
                onClick={() => switchAccount(item)}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-white/55 transition hover:bg-white/[0.06] hover:text-white"
              >
                <span className="grid h-6 w-6 overflow-hidden rounded-md bg-white/10 font-mono text-[10px] text-white">
                  {item.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="grid h-full w-full place-items-center">{item.name.charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{item.name}</span>
                  <span className="block truncate text-white/35">{item.provider}</span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={addAccount}
            disabled={addingAccount}
            className="mt-2 flex w-full items-center justify-center rounded-md border border-white/10 px-2 py-2 text-xs text-white/55 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            {addingAccount ? "Opening signup..." : "Add account"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProductSwitcher({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const activeMode = pathname.startsWith("/dashboard/sdk") ? productModes[1] : productModes[0];

  return (
    <div className="relative w-full">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-16 w-full min-w-0 items-center gap-3 px-4 text-left transition hover:bg-white/[0.04]"
      >
        <Image src="/brand/astrail-mark-inverse.svg" alt="" width={512} height={512} className="h-9 w-9 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-normal text-white">Astrail</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-white transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="menu"
          className="fixed left-4 top-[76px] z-50 w-[calc(100vw-2rem)] max-w-[520px] border border-white/10 bg-[#151515] p-2 shadow-sm"
        >
          {productModes.map((mode) => {
            const Icon = mode.icon;
            const active = activeMode.href === mode.href;

            return (
              <Link
                key={mode.href}
                href={mode.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`block border px-4 py-4 transition hover:bg-white/[0.06] ${
                  active ? "border-white/10 bg-white/[0.065]" : "border-transparent"
                }`}
              >
                <span className="flex items-center justify-between gap-4">
                  <span className="inline-flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-orange-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-white">{mode.label}</span>
                  </span>
                  {active ? <Check className="h-4 w-4 shrink-0 text-orange-400" /> : null}
                </span>
                <span className="mt-3 block text-base leading-6 text-white/60">{mode.description}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const isSdkMode = pathname.startsWith("/dashboard/sdk");
  const activeMode = isSdkMode ? productModes[1] : productModes[0];
  const mobileLinkGroups = isSdkMode ? sdkMobileLinkGroups : mcpMobileLinkGroups;
  const primaryAction = isSdkMode
    ? { href: "/dashboard/sdk#generator", label: "Generate SDK bundle" }
    : { href: "/dashboard/generate", label: "Generate endpoint" };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <aside className="sticky top-0 z-50 border-b border-white/10 bg-[#111113] text-white shadow-sm md:hidden">
        <div className="flex h-[68px] items-center gap-3 px-4">
          <Image src="/brand/astrail-mark-inverse.svg" alt="" width={512} height={512} className="h-9 w-9 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-xl font-semibold tracking-normal">Astrail</span>
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-expanded={mobileOpen}
            className="inline-flex h-11 items-center gap-3 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 text-orange-300"
          >
            <ChevronDown className={`h-4 w-4 transition ${mobileOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="Close dashboard menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/55"
          />
          <aside className="absolute left-0 top-0 flex h-dvh w-[86vw] max-w-[380px] flex-col border-r border-white/10 bg-[#101012] text-white shadow-sm">
            <div className="flex h-[68px] items-center gap-3 border-b border-white/10 px-4">
              <Image src="/brand/astrail-mark-inverse.svg" alt="" width={512} height={512} className="h-9 w-9 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xl font-semibold tracking-normal">Astrail</span>
              <button
                type="button"
                aria-label="Close dashboard menu"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-white/60 transition hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-white/10 p-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-orange-300">{activeMode.label}</p>
                <p className="mt-2 text-sm leading-5 text-white/60">{activeMode.description}</p>
                <Link
                  href={primaryAction.href}
                  className="mt-4 flex h-11 items-center justify-center rounded-md bg-white text-sm font-semibold text-neutral-950 transition hover:bg-orange-50"
                >
                  {primaryAction.label}
                </Link>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6">
              <nav className="grid gap-5">
                {mobileLinkGroups.map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30">{group.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const active = isActiveNavItem(item, pathname);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex min-h-[84px] min-w-0 flex-col justify-between rounded-lg px-3 py-3 text-sm transition-colors hover:bg-white/[0.07] hover:text-white ${
                              active ? "bg-white/[0.12] text-white shadow-sm" : "text-white/66"
                            }`}
                          >
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? "bg-orange-500/10 text-orange-300" : "bg-white/[0.04] text-white/55"}`}>
                              <item.icon className="h-4 w-4" />
                            </span>
                            <span className="line-clamp-2 leading-5">{item.mobileLabel ?? item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="mt-5 grid gap-1.5 border-t border-white/10 pt-5">
                <Link
                  href="/dashboard/api-keys"
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition hover:bg-white/[0.07] hover:text-white ${pathname.startsWith("/dashboard/api-keys") ? "bg-white/[0.09] text-white" : "text-white/60"}`}
                >
                  <KeyRound className="h-4 w-4" />
                  Astrail API keys
                </Link>
                <Link
                  href="/dashboard/billing"
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition hover:bg-white/[0.07] hover:text-white ${pathname.startsWith("/dashboard/billing") ? "bg-white/[0.09] text-white" : "text-white/60"}`}
                >
                  <CreditCard className="h-4 w-4" />
                  Billing
                </Link>
                <Link
                  href="/docs"
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition hover:bg-white/[0.07] hover:text-white ${
                    pathname === "/docs" ? "bg-white/[0.09] text-white" : "text-white/60"
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  Docs
                </Link>
                <Link
                  href="/dashboard/settings"
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition hover:bg-white/[0.07] hover:text-white ${
                    pathname.startsWith("/dashboard/settings") ? "bg-white/[0.09] text-white" : "text-white/60"
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </div>
            </div>

            <div className="shrink-0 space-y-3 border-t border-white/10 p-4">
              <AccountSwitcher />
              <SignOutButton />
            </div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden overflow-hidden border-b border-white/10 bg-[#111113] text-white md:sticky md:top-0 md:block md:h-screen md:min-h-0 md:w-[260px] md:shrink-0 md:self-start md:border-b-0 md:border-r md:border-r-white/10">
        <div className="border-b border-white/10">
          <ProductSwitcher pathname={pathname} />
        </div>
        <div className="flex flex-col md:h-[calc(100vh-4rem)]">
          <div className="min-w-0 p-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
            <nav className="space-y-5">
              {mobileLinkGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">{group.label}</p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = isActiveNavItem(item, pathname);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/[0.07] hover:text-white ${active ? "bg-white/[0.09] text-white shadow-sm" : "text-white/52"}`}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
          <div className="hidden shrink-0 space-y-3 border-t border-white/10 p-3 md:block">
            <div className="grid grid-cols-2 gap-1">
              <Link href="/dashboard/api-keys" className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs transition hover:bg-white/[0.07] hover:text-white ${pathname.startsWith("/dashboard/api-keys") ? "bg-white/[0.09] text-white" : "text-white/52"}`}><KeyRound className="h-3.5 w-3.5" />API keys</Link>
              <Link href="/dashboard/billing" className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs transition hover:bg-white/[0.07] hover:text-white ${pathname.startsWith("/dashboard/billing") ? "bg-white/[0.09] text-white" : "text-white/52"}`}><CreditCard className="h-3.5 w-3.5" />Billing</Link>
            </div>
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-white/[0.07] hover:text-white ${
                pathname.startsWith("/dashboard/settings") ? "bg-white/[0.09] text-white" : "text-white/52"
              }`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <Link
              href="/docs"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-white/[0.07] hover:text-white ${
                pathname === "/docs" ? "bg-white/[0.09] text-white" : "text-white/52"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Docs
            </Link>
            <AccountSwitcher />
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
