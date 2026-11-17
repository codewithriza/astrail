"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthPageRedirect } from "@/components/auth/auth-page-redirect";
import { AuthShell } from "@/components/auth/auth-shell";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";
import { NeonSessionCompleter } from "@/components/auth/neon-session-completer";
import { PasswordField } from "@/components/auth/password-field";
import { enabledOAuthProviders, hasPublicNeonAuthConfig, isDemoAuthAllowed, missingProductionAuthMessage } from "@/lib/auth-mode";
import { billingLaunchFreeMode, type BillingPlanId } from "@/lib/billing/plans";
import { readJsonResponse } from "@/lib/client-json";
import { createClient } from "@/lib/neon/client";

const hasNeonAuth = hasPublicNeonAuthConfig();
const demoAuthAllowed = isDemoAuthAllowed();
const oauthProviders = enabledOAuthProviders();

function planFromSearch(value: string | null): BillingPlanId {
  if (value === "starter" || value === "team") return value;
  return "free";
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(searchParams?.get("error") ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [authRecovering, setAuthRecovering] = useState(false);
  const [loading, setLoading] = useState(false);
  const selectedPlan = useMemo(() => planFromSearch(searchParams?.get("plan") ?? null), [searchParams]);
  const addingAccount = searchParams?.get("account") === "add";
  const redirectTo = addingAccount
    ? "/dashboard"
    : billingLaunchFreeMode || selectedPlan === "free"
      ? "/dashboard/onboarding"
      : `/dashboard/billing?plan=${selectedPlan}`;
  const directDemoAuth = !hasNeonAuth && demoAuthAllowed;
  const hasSocialAuth = directDemoAuth || (hasNeonAuth && (oauthProviders.google || oauthProviders.github));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (!hasNeonAuth && !demoAuthAllowed) {
        setError(missingProductionAuthMessage());
        return;
      }
      if (password.length < 8) {
        setError("Use at least 8 characters for your password.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }

      if (hasNeonAuth) {
        const neon = createClient();
        const fullName = `${firstName} ${lastName}`.trim();
        const confirmationUrl = new URL("/auth/complete", window.location.origin);
        confirmationUrl.searchParams.set("next", redirectTo);
        const { data, error: authError } = await neon.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: confirmationUrl.toString(),
            data: {
              displayName: fullName,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              full_name: fullName,
            },
          },
        });
        if (authError) {
          setError(authError.message.toLowerCase().includes("already registered")
            ? "An account already exists for this email. Sign in instead."
            : authError.message);
          return;
        }
        if (data.session) {
          router.replace(redirectTo);
          router.refresh();
        } else {
          setMessage("Account created. Confirm your email once, then sign in with your password.");
        }
      } else {
        const response = await fetch("/api/auth/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, firstName, lastName, mode: "signup", redirectTo }),
        });
        const payload = await readJsonResponse<{ error?: string; redirectTo?: string }>(response);
        if (!response.ok) {
          setError(payload.error ?? "Could not create your Astrail account. Please try again.");
          return;
        }
        router.push(payload.redirectTo ?? redirectTo);
      }
    } catch {
      setError("Could not create your Astrail account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title={addingAccount ? "Add account" : "Sign up"} variant="light">
      <AuthPageRedirect redirectTo={redirectTo} disabled={addingAccount} />
      <form onSubmit={onSubmit} className="space-y-4">
        <NeonSessionCompleter
          redirectTo={redirectTo}
          onStatusChange={(status) => {
            setAuthRecovering(status === "running");
            if (status === "running") setError(null);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="firstName" className="text-sm font-medium text-neutral-700">
              First name
            </label>
            <input
              id="firstName"
              type="text"
              autoComplete="given-name"
              placeholder="Your first name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-200/80 bg-white px-4 text-base text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="lastName" className="text-sm font-medium text-neutral-700">
              Last name
            </label>
            <input
              id="lastName"
              type="text"
              autoComplete="family-name"
              placeholder="Your last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-200/80 bg-white px-4 text-base text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-neutral-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Your email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 w-full rounded-xl border border-neutral-200/80 bg-white px-4 text-base text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            required
          />
        </div>
        <PasswordField id="password" label="Password" hint="8 characters minimum" value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordField id="confirmPassword" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        {!hasNeonAuth && !demoAuthAllowed ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">
            Production sign-up is required here. Finish workspace auth setup to enable this screen.
          </p>
        ) : null}
        {!authRecovering && error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-700">{error}</p>}
        {message && <p className="rounded-xl border border-neutral-200/80 bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-600">{message}</p>}
        <button
          type="submit"
          className="h-11 w-full rounded-xl bg-orange-600 px-4 text-sm font-medium text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      {hasSocialAuth ? (
        <>
          <div className="my-7 flex items-center gap-4">
            <div className="h-px flex-1 bg-neutral-200/80" />
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">or</span>
            <div className="h-px flex-1 bg-neutral-200/80" />
          </div>

          <SocialAuthButtons
            authConfigured={hasNeonAuth}
            directDemo={directDemoAuth}
            enabledProviders={oauthProviders}
            entry="signup"
            redirectTo={redirectTo}
            variant="light"
          />
        </>
      ) : null}

      <p className="mt-7 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-orange-600 transition hover:text-orange-700">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="dash-shell flex min-h-screen items-center justify-center bg-[#f8f6f1] text-sm text-neutral-500">Loading signup...</main>}>
      <SignupForm />
    </Suspense>
  );
}
