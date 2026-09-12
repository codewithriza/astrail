import Image from "next/image";
import { ReactNode } from "react";
import { ArrowRight, LockKeyhole, Terminal } from "lucide-react";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  variant?: "dark" | "light";
};

export function AuthLogo({ inverse = true, className = "h-12 w-12" }: { inverse?: boolean; className?: string }) {
  return (
    <Image
      src={inverse ? "/brand/astrail-mark-inverse.svg" : "/brand/astrail-mark.svg"}
      alt="Astrail"
      width={512}
      height={512}
      priority
      className={className}
    />
  );
}

export function AuthShell({ children, title, description, variant = "dark" }: AuthShellProps) {
  if (variant === "light") {
    return (
      <main className="dash-shell relative flex min-h-dvh items-start justify-center overflow-x-hidden bg-[#f8f0e6] px-4 pb-10 pt-12 text-neutral-950 sm:items-center sm:py-10 lg:justify-start lg:px-[10vw] 2xl:grid 2xl:grid-cols-[460px_610px] 2xl:items-center 2xl:justify-center 2xl:gap-24 2xl:px-8">
        <picture className="pointer-events-none absolute inset-0">
          <source media="(max-width: 639px)" srcSet="/onboarding/astrail-auth-mobile.png" />
          <img src="/onboarding/astrail-auth-desktop.png" alt="" className="h-full w-full object-cover object-bottom" />
        </picture>
        <section className="relative z-10 w-full max-w-[460px]">
          <div className="flex justify-center lg:justify-start">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-orange-200/80 bg-white/90 shadow-[0_8px_24px_rgba(135,78,29,0.08)] backdrop-blur-sm">
              <AuthLogo inverse={false} className="h-8 w-8" />
            </span>
          </div>
          <h1 className="mt-4 text-center text-3xl font-semibold tracking-tight text-neutral-950 lg:text-left">{title}</h1>
          {description ? <p className="mx-auto mt-2 max-w-md text-center text-sm leading-6 text-neutral-600 lg:mx-0 lg:text-left">{description}</p> : null}
          <div className="mt-6 rounded-xl border border-white/80 bg-white/[0.86] px-6 py-7 shadow-[0_18px_50px_rgba(118,72,31,0.10)] backdrop-blur-md sm:px-8 sm:py-8">
            {children}
          </div>
        </section>
        <aside className="absolute right-[5vw] top-1/2 z-10 hidden w-full max-w-[610px] -translate-y-1/2 rounded-2xl border border-white/90 bg-white/[0.74] p-8 shadow-[0_24px_70px_rgba(118,72,31,0.12)] backdrop-blur-xl lg:block 2xl:static 2xl:translate-y-0">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">How Astrail works</p>
            <h2 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight text-neutral-950">Your apps in. One secure endpoint out.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-600">Agents get the tools they need without receiving your provider credentials.</p>
          </div>

          <div className="mt-8 grid grid-cols-[150px_52px_120px_52px_150px] items-center justify-center">
            <div>
              <div className="grid grid-cols-2 gap-2">
                {["googledrive", "github", "notion", "slack"].map((icon) => (
                  <span key={icon} className="grid h-14 w-14 place-items-center rounded-xl border border-white bg-white/90 shadow-[0_9px_28px_rgba(118,72,31,0.10)] backdrop-blur-sm">
                    <Image src={`/app-icons/${icon}.svg`} alt="" width={25} height={25} />
                  </span>
                ))}
              </div>
              <p className="mt-3 text-center text-xs font-semibold text-neutral-600">Your apps</p>
            </div>

            <div className="flex items-center text-orange-600"><span className="h-px flex-1 bg-orange-300" /><ArrowRight className="h-4 w-4" /></div>

            <div className="text-center">
              <span className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-orange-600 shadow-[0_16px_38px_rgba(194,65,12,0.24)]"><AuthLogo inverse className="h-10 w-10" /></span>
              <p className="mt-3 text-xs font-semibold text-neutral-800">Astrail gateway</p>
            </div>

            <div className="flex items-center text-orange-600"><span className="h-px flex-1 bg-orange-300" /><ArrowRight className="h-4 w-4" /></div>

            <div>
              <div className="rounded-xl border border-white bg-white/90 p-3 shadow-[0_9px_28px_rgba(118,72,31,0.10)] backdrop-blur-sm">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2"><Terminal className="h-4 w-4 text-orange-700" /><span className="text-xs font-semibold">Agent CLI</span><span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" /></div>
                <code className="mt-2 block font-mono text-[10px] leading-5 text-neutral-600">$ astrail tools list<br /><span className="text-emerald-700">12 tools ready</span></code>
              </div>
              <p className="mt-3 text-center text-xs font-semibold text-neutral-600">One endpoint</p>
            </div>
          </div>

          <div className="mx-auto mt-8 flex w-fit items-center gap-5 rounded-full border border-orange-200 bg-[#fff8ed]/90 px-5 py-2.5 text-xs font-semibold text-neutral-700 shadow-[0_8px_24px_rgba(118,72,31,0.08)] backdrop-blur-sm">
            <span className="flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5 text-orange-700" /> Credentials stay encrypted</span>
            <span className="h-4 w-px bg-orange-200" />
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Access can be revoked instantly</span>
          </div>
        </aside>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-10 text-white">
      <section className="w-full max-w-[500px]">
        <div className="flex justify-center">
          <AuthLogo inverse />
        </div>
        <h1 className="mt-4 text-center text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mx-auto mt-3 max-w-md text-center text-sm leading-6 text-white/55">{description}</p>
        ) : null}
        <div className="mt-7 bg-[#191919] px-7 py-8 sm:px-12 sm:py-12">
          {children}
        </div>
      </section>
    </main>
  );
}
