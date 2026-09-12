"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  KeyRound,
  LayoutGrid,
  Link2,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Terminal,
  Wand2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  LOCAL_PROFILE_AVATAR_COOKIE,
  LOCAL_PROFILE_EMAIL_COOKIE,
  LOCAL_PROFILE_NAME_COOKIE,
  LOCAL_PROFILE_PROVIDER_COOKIE,
} from "@/lib/local-auth-shared";
import { accountAvatarUrl, accountDisplayName } from "@/lib/account-display";
import { createClient } from "@/lib/neon/client";

type NavChild = { href: string; label: string; icon: LucideIcon; description?: string };

type NavTab = {
  label: string;
  href?: string;
  exact?: boolean;
  children?: NavChild[];
};

const navTabs: NavTab[] = [
  { label: "Home", href: "/dashboard", exact: true },
  {
    label: "Build",
    children: [
      { href: "/dashboard/workspaces", label: "Workspaces", icon: Boxes, description: "One secure connection for all your apps" },
      { href: "/dashboard/generate", label: "Add integration", icon: Wand2, description: "OpenAPI or spec to hosted MCP" },
      { href: "/dashboard/servers", label: "Servers", icon: Code2, description: "Your hosted MCP endpoints" },
      { href: "/dashboard/integrations", label: "Integrations", icon: Cable, description: "Connected APIs and services" },
      { href: "/dashboard/connections", label: "Connections", icon: Link2, description: "Provider credentials and access" },
      { href: "/dashboard/tools", label: "Tools", icon: Wrench, description: "Actions exposed to agents" },
      { href: "/dashboard/bundles", label: "Bundles", icon: Boxes, description: "Group endpoints into one URL" },
      { href: "/dashboard/website-to-mcp", label: "Website to MCP", icon: Compass, description: "Turn public pages into tools" },
      { href: "/dashboard/sdk", label: "SDK Generator", icon: Download, description: "Typed SDKs, docs, CLI, and CI" },
    ],
  },
  {
    label: "Operate",
    children: [
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, description: "Runtime calls, traces, latency" },
      { href: "/dashboard/usage", label: "Usage", icon: Activity, description: "Metering across your workspace" },
      { href: "/dashboard/policies", label: "Policies", icon: Shield, description: "Runtime access and safety rules" },
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck, description: "Review sensitive agent actions" },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard, description: "Plans, meters, and invoices" },
      { href: "/dashboard/api-keys", label: "API keys", icon: KeyRound, description: "Credentials for private servers" },
      { href: "/dashboard/setup", label: "Agent setup", icon: Terminal, description: "Connect MCP clients and agents" },
      { href: "/dashboard/capabilities", label: "Capabilities", icon: LayoutGrid, description: "What your workspace can do" },
    ],
  },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Learn", href: "/docs" },
];

function tabIsActive(tab: NavTab, pathname: string) {
  if (tab.href) {
    if (tab.exact) return pathname === tab.href;
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }
  return (tab.children ?? []).some(
    (child) => pathname === child.href || pathname.startsWith(`${child.href}/`),
  );
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

function loadAccounts(): DemoAccount[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is DemoAccount =>
            typeof item?.name === "string" && typeof item?.email === "string" && typeof item?.provider === "string",
        )
      : [];
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

function useAccount() {
  const [account, setAccount] = useState<DemoAccount>({ name: "Demo workspace", email: "demo@astrail.dev", provider: "email" });
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);

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

  return { account, accounts, setAccount };
}

function Avatar({ account, className = "h-9 w-9 text-sm" }: { account: DemoAccount; className?: string }) {
  const initials = useMemo(() => {
    const parts = account.name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
    return letters || "A";
  }, [account.name]);

  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-950 font-semibold text-white ${className}`}>
      {account.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials
      )}
    </span>
  );
}

export function DashboardTopbar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { account, accounts, setAccount } = useAccount();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navCloseTimer = useRef<number | null>(null);

  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => () => {
    if (navCloseTimer.current !== null) window.clearTimeout(navCloseTimer.current);
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function switchAccount(next: DemoAccount) {
    writeCookie(LOCAL_PROFILE_NAME_COOKIE, next.name);
    writeCookie(LOCAL_PROFILE_EMAIL_COOKIE, next.email);
    writeCookie(LOCAL_PROFILE_PROVIDER_COOKIE, next.provider);
    writeCookie(LOCAL_PROFILE_AVATAR_COOKIE, next.avatarUrl ?? "");
    setAccount(next);
    setOpenMenu(null);
    router.refresh();
  }

  async function addAccount() {
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

  async function signOut() {
    try {
      const neon = createClient();
      await neon.auth.signOut();
    } catch {
      // Local demo mode does not always have production auth configured.
    }
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function openNavMenu(label: string) {
    if (navCloseTimer.current !== null) window.clearTimeout(navCloseTimer.current);
    navCloseTimer.current = null;
    setOpenMenu(label);
  }

  function scheduleNavClose() {
    if (navCloseTimer.current !== null) window.clearTimeout(navCloseTimer.current);
    navCloseTimer.current = window.setTimeout(() => {
      setOpenMenu((current) => current === "Build" || current === "Operate" ? null : current);
      navCloseTimer.current = null;
    }, 140);
  }

  function closeNavMenu() {
    if (navCloseTimer.current !== null) window.clearTimeout(navCloseTimer.current);
    navCloseTimer.current = null;
    setOpenMenu(null);
  }

  if (pathname === "/dashboard/onboarding") return null;

  return (
    <header ref={rootRef} className="sticky top-0 z-50 border-b border-neutral-200/70 bg-white/90 backdrop-blur-md">
      <style>{`@keyframes astrail-menu-in { from { opacity: 0; transform: translate(-50%, -4px) scale(.985); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }`}</style>
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        {/* Left: logo + workspace switcher */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href="/dashboard" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-neutral-200/80 bg-white">
            <Image src="/brand/astrail-mark.svg" alt="Astrail" width={512} height={512} className="h-6 w-6" />
          </Link>
          <div className="relative hidden sm:block">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={openMenu === "workspace"}
              onClick={() => setOpenMenu(openMenu === "workspace" ? null : "workspace")}
              className="flex h-10 max-w-[220px] items-center gap-2 rounded-full border border-neutral-200/80 bg-white py-1 pl-1.5 pr-3 text-sm font-medium text-neutral-800 transition hover:border-neutral-300"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  account.name.trim().charAt(0).toUpperCase() || "A"
                )}
              </span>
              <span className="min-w-0 truncate">{account.name}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition ${openMenu === "workspace" ? "rotate-180" : ""}`} />
            </button>
            {openMenu === "workspace" ? (
              <div role="menu" className="absolute left-0 top-12 z-50 w-72 rounded-2xl border border-neutral-200/80 bg-white p-2 shadow-[0_18px_50px_rgba(70,45,0,0.12)]">
                {accounts.map((item) => {
                  const active = item.email === account.email && item.provider === account.provider;
                  return (
                    <button
                      key={`${item.provider}-${item.email}-${item.name}`}
                      type="button"
                      role="menuitem"
                      onClick={() => switchAccount(item)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-neutral-50"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                        {item.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          item.name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-neutral-900">{item.name}</span>
                        <span className="block truncate text-xs text-neutral-400">{item.email}</span>
                      </span>
                      {active ? <Check className="h-4 w-4 shrink-0 text-orange-500" /> : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={addAccount}
                  className="mt-1 flex w-full items-center justify-center rounded-xl border border-dashed border-neutral-200 px-3 py-2.5 text-sm text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-800"
                >
                  Add account
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Center: pill tabs */}
        <nav className="mx-auto hidden items-center gap-1 rounded-full border border-neutral-200/80 bg-white p-1 md:flex" onMouseLeave={scheduleNavClose}>
          {navTabs.map((tab) => {
            const active = tabIsActive(tab, pathname);
            const baseClass = `flex h-9 items-center gap-1 rounded-full px-4 text-sm font-medium transition ${
              active ? "bg-orange-100/70 text-orange-600" : "text-neutral-500 hover:text-neutral-900"
            }`;

            if (tab.href) {
              return (
                <Link key={tab.label} href={tab.href} className={baseClass} onMouseEnter={closeNavMenu}>
                  {tab.label}
                </Link>
              );
            }

            return (
              <div key={tab.label} className="relative" onMouseEnter={() => openNavMenu(tab.label)} onFocus={() => openNavMenu(tab.label)}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === tab.label}
                  onClick={() => setOpenMenu(openMenu === tab.label ? null : tab.label)}
                  className={baseClass}
                >
                  {tab.label}
                  <ChevronDown className={`h-3.5 w-3.5 transition ${openMenu === tab.label ? "rotate-180" : ""}`} />
                </button>
                {openMenu === tab.label ? (
                  <div role="menu" onMouseEnter={() => openNavMenu(tab.label)} className="absolute left-1/2 top-11 z-50 w-80 -translate-x-1/2 rounded-xl border border-neutral-200/80 bg-white p-2 shadow-[0_18px_50px_rgba(70,45,0,0.12)] motion-safe:animate-[astrail-menu-in_150ms_ease-out]">
                    {(tab.children ?? []).map((child) => {
                      const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          role="menuitem"
                          onClick={() => setOpenMenu(null)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition duration-150 hover:translate-x-0.5 hover:bg-orange-50 ${childActive ? "bg-orange-50" : ""}`}
                        >
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${childActive ? "bg-orange-100 text-orange-600" : "bg-neutral-100 text-neutral-500"}`}>
                            <child.icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className={`block text-sm font-medium ${childActive ? "text-orange-700" : "text-neutral-900"}`}>{child.label}</span>
                            {child.description ? <span className="block truncate text-xs text-neutral-400">{child.description}</span> : null}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/* Right: icon buttons + avatar */}
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link href="/marketplace" aria-label="Search the catalog" className="icon-btn hidden sm:grid">
            <Search className="h-4 w-4" />
          </Link>
          <Link href="/docs" aria-label="Documentation" className="icon-btn hidden sm:grid">
            <BookOpen className="h-4 w-4" />
          </Link>
          <Link href="/dashboard/settings" aria-label="Settings" className="icon-btn hidden sm:grid">
            <Settings className="h-4 w-4" />
          </Link>
          <div className="relative hidden md:block">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={openMenu === "account"}
              onClick={() => setOpenMenu(openMenu === "account" ? null : "account")}
              className="block rounded-full transition hover:opacity-85"
            >
              <Avatar account={account} />
            </button>
            {openMenu === "account" ? (
              <div role="menu" className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-neutral-200/80 bg-white p-2 shadow-[0_18px_50px_rgba(70,45,0,0.12)]">
                <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                  <Avatar account={account} className="h-9 w-9 text-sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">{account.name}</span>
                    <span className="block truncate text-xs text-neutral-400">{account.email}</span>
                  </span>
                </div>
                <div className="my-1 border-t border-neutral-100" />
                <Link
                  href="/dashboard/settings"
                  role="menuitem"
                  onClick={() => setOpenMenu(null)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((value) => !value)}
            className="icon-btn md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="border-t border-neutral-200/70 bg-white px-4 pb-6 pt-4 md:hidden">
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-neutral-200/80 p-3">
            <Avatar account={account} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-neutral-900">{account.name}</span>
              <span className="block truncate text-xs text-neutral-400">{account.email}</span>
            </span>
            <button type="button" onClick={signOut} aria-label="Log out" className="icon-btn">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <nav className="grid gap-4">
            {navTabs.map((tab) => {
              if (tab.href) {
                const active = tabIsActive(tab, pathname);
                return (
                  <Link
                    key={tab.label}
                    href={tab.href}
                    className={`flex h-11 items-center rounded-xl px-3 text-sm font-medium ${
                      active ? "bg-orange-100/70 text-orange-600" : "text-neutral-600"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              }
              return (
                <div key={tab.label}>
                  <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{tab.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(tab.children ?? []).map((child) => {
                      const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex min-h-[76px] flex-col justify-between rounded-xl border p-3 text-sm ${
                            childActive
                              ? "border-orange-200 bg-orange-50 text-orange-700"
                              : "border-neutral-200/80 bg-white text-neutral-700"
                          }`}
                        >
                          <child.icon className={`h-4 w-4 ${childActive ? "text-orange-500" : "text-neutral-400"}`} />
                          <span className="font-medium leading-5">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <Link href="/dashboard/settings" className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-neutral-600">
              <Settings className="h-4 w-4 text-neutral-400" />
              Settings
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
