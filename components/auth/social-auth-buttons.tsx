type SocialAuthButtonsProps = {
  authConfigured?: boolean;
  directDemo?: boolean;
  enabledProviders?: {
    google?: boolean;
    github?: boolean;
  };
  entry?: "login" | "signup";
  redirectTo?: string;
  variant?: "dark" | "light";
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.23c0-.77-.07-1.5-.19-2.23H12v4.22h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.31 2.98-7.52Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.62-2.25l-3.23-2.51c-.9.6-2.04.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 14.07A6.01 6.01 0 0 1 6.09 12c0-.72.11-1.42.31-2.07V7.34H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.66l3.34-2.59Z" />
      <path fill="#EA4335" d="M12 5.81c1.47 0 2.78.5 3.82 1.49l2.87-2.87C16.96 2.82 14.7 2 12 2a10 10 0 0 0-8.94 5.34L6.4 9.93C7.19 7.57 9.4 5.81 12 5.81Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.11.79-.25.79-.56v-2.02c-3.22.7-3.9-1.39-3.9-1.39-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.04 1.77 2.72 1.26 3.38.96.11-.75.41-1.26.74-1.55-2.57-.29-5.28-1.29-5.28-5.73 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.07 0 0 .98-.31 3.18 1.19A10.9 10.9 0 0 1 12 6.03c.98 0 1.97.13 2.89.39 2.2-1.5 3.17-1.19 3.17-1.19.64 1.6.24 2.78.12 3.07.74.81 1.19 1.84 1.19 3.11 0 4.46-2.72 5.43-5.31 5.72.42.36.79 1.07.79 2.16v3.2c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function providerHref(provider: "google" | "github", redirectTo = "/dashboard", directDemo = false, entry: "login" | "signup" = "login") {
  if (directDemo) return `/api/auth/demo?provider=${provider}&redirectTo=${encodeURIComponent(redirectTo)}`;
  return `/api/auth/oauth?provider=${provider}&entry=${entry}&redirectTo=${encodeURIComponent(redirectTo)}`;
}

export function SocialAuthButtons({
  authConfigured = true,
  directDemo = false,
  enabledProviders = { google: true, github: true },
  entry = "login",
  redirectTo = "/dashboard",
  variant = "dark",
}: SocialAuthButtonsProps) {
  const unavailableTitle = "Finish workspace auth and provider setup before using this sign-in method.";
  const providers = [
    { id: "google" as const, label: "Continue with Google", mark: <GoogleMark />, enabled: directDemo || Boolean(enabledProviders.google) },
    { id: "github" as const, label: "Continue with GitHub", mark: <GitHubMark />, enabled: directDemo || Boolean(enabledProviders.github) },
  ].filter((provider) => provider.enabled);

  if (providers.length === 0) return null;

  return (
    <div className="grid gap-3">
      {providers.map((provider) => (
        <a
          key={provider.id}
          href={providerHref(provider.id, redirectTo, directDemo, entry)}
          aria-disabled={!authConfigured && !directDemo}
          title={!authConfigured && !directDemo ? unavailableTitle : undefined}
          className={variant === "light"
            ? "flex h-11 items-center justify-center gap-3 rounded-xl border border-neutral-200/80 bg-white px-4 text-sm font-medium text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50"
            : "flex h-12 items-center justify-center gap-3 border border-white/15 bg-transparent px-4 text-xl font-normal text-white transition hover:border-white/35 hover:bg-white/[0.03]"}
        >
          {provider.mark}
          {provider.label}
        </a>
      ))}
    </div>
  );
}
