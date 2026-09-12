import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Home, LayoutDashboard, X } from "lucide-react";

const actions = [
  {
    href: "/",
    label: "Home",
    icon: Home,
  },
  {
    href: "/docs",
    label: "Docs",
    icon: BookOpen,
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
];

const windows = [
  { label: "astrail://route-check", offset: "-translate-x-28 -translate-y-24", opacity: "opacity-25" },
  { label: "astrail://runtime", offset: "-translate-x-20 -translate-y-16", opacity: "opacity-35" },
  { label: "astrail://resolver", offset: "-translate-x-12 -translate-y-8", opacity: "opacity-50" },
  { label: "astrail://endpoint", offset: "-translate-x-4 translate-y-0", opacity: "opacity-70" },
];

function GhostWindow({ label, offset, opacity }: (typeof windows)[number]) {
  return (
    <div
      className={`absolute left-1/2 top-1/2 hidden h-32 w-[18rem] -translate-x-1/2 -translate-y-1/2 border border-white/10 bg-[#101114] shadow-[0_24px_70px_rgba(0,0,0,0.38)] sm:block ${offset} ${opacity}`}
      aria-hidden="true"
    >
      <div className="flex h-8 items-center justify-between border-b border-white/10 bg-[#15161a] px-3">
        <span className="truncate font-mono text-[11px] text-white/45">{label}</span>
        <X className="h-3 w-3 text-white/30" />
      </div>
    </div>
  );
}

export function NotFoundScreen() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07080b] text-white">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center border border-white/10 bg-[#1b1d24]">
              <Image
                src="/brand/astrail-mark-inverse.svg"
                alt=""
                width={20}
                height={20}
                className="h-5 w-5"
                priority
              />
            </span>
            <span className="font-mono text-sm font-semibold tracking-normal">Astrail</span>
          </Link>
          <span className="hidden font-mono text-xs text-white/35 sm:block">route status: unresolved</span>
        </header>

        <section className="relative flex flex-1 items-center justify-center py-12">
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 select-none font-mono text-[32vw] font-black leading-none tracking-normal text-white/[0.035] sm:text-[22rem]">
            404
          </div>

          <div className="relative z-10 flex w-full max-w-[46rem] flex-col items-center">
            <div className="relative h-[23rem] w-full max-w-[34rem] sm:h-[25rem]">
              {windows.map((window) => (
                <GhostWindow key={window.label} {...window} />
              ))}

              <div className="absolute left-1/2 top-1/2 w-[min(92vw,23rem)] -translate-x-1/2 -translate-y-1/2 border border-[#1f37ff] bg-[#111214] shadow-[0_26px_90px_rgba(0,0,0,0.55)]">
                <div className="flex h-10 items-center justify-between bg-[#1d19d8] px-3">
                  <span className="inline-flex min-w-0 items-center gap-2 font-mono text-xs font-semibold">
                    <span className="grid h-4 w-4 shrink-0 place-items-center border border-white/60">
                      <Image
                        src="/brand/astrail-mark-inverse.svg"
                        alt=""
                        width={11}
                        height={11}
                        className="h-3 w-3"
                      />
                    </span>
                    <span className="truncate">astrail - route error</span>
                  </span>
                  <span className="grid h-4 w-4 place-items-center border border-white/35 text-white/75">
                    <X className="h-3 w-3" />
                  </span>
                </div>

                <div className="px-5 py-6 sm:px-6">
                  <div className="flex gap-4">
                    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#2438ff] text-[#3d4cff]">
                      <X className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-sm leading-6 text-white/88">
                        This endpoint is missing, moved, or not deployed.
                      </p>
                      <p className="mt-3 font-mono text-xs leading-5 text-white/42">
                        trace: 404.route_not_registered
                      </p>
                    </div>
                  </div>

                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link
                      href="/dashboard"
                      className="inline-flex h-11 items-center justify-center gap-2 bg-[#2017ff] px-5 font-mono text-xs font-semibold text-white transition hover:bg-[#352eff]"
                    >
                      Open dashboard
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href="/docs"
                      className="inline-flex h-11 items-center justify-center border border-white/12 px-5 font-mono text-xs font-semibold text-white/70 transition hover:border-white/25 hover:text-white"
                    >
                      Read docs
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <nav className="grid w-full max-w-xl gap-2 sm:grid-cols-3" aria-label="404 navigation">
              {actions.map((action) => {
                const Icon = action.icon;

                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group flex h-12 items-center justify-center gap-2 border border-white/10 bg-white/[0.035] px-4 font-mono text-xs font-semibold text-white/55 transition hover:border-[#2438ff]/70 hover:bg-[#141737] hover:text-white"
                  >
                    <Icon className="h-4 w-4 text-white/35 transition group-hover:text-[#6571ff]" />
                    {action.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </section>

        <footer className="flex h-11 items-center justify-between border-t border-white/10 font-mono text-[11px] text-white/35">
          <span>&lt;- astrail.dev</span>
          <span>404 / endpoint unavailable</span>
        </footer>
      </div>
    </main>
  );
}
