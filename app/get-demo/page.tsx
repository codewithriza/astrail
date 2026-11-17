import Link from "next/link";
import { GetDemoForm } from "@/components/GetDemoForm";
import { AstrailLogo } from "@/components/AstrailLogo";

const stats = [
  ["Per-user", "OAuth grants"],
  ["Scoped", "permissions"],
  ["Trace ID", "every call"],
  ["No eval", "Code Mode"],
];

export default function GetDemoPage() {
  return (
    <main
      className="min-h-screen bg-[#f4f4f4] text-black"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <div className="mx-auto min-h-screen max-w-[1510px] border-x border-neutral-200 bg-white">
        <header className="flex h-20 items-center justify-between border-y border-neutral-200 bg-white px-4 sm:px-10">
          <AstrailLogo markClassName="h-10 w-10" labelClassName="text-3xl" />
          <nav className="hidden items-center gap-10 pixel-text text-sm text-black md:flex">
            <Link href="/marketplace" className="hover:text-neutral-500">Catalog</Link>
            <Link href="/payment" className="hover:text-neutral-500">Payment</Link>
            <Link href="/login" className="hover:text-neutral-500">Login</Link>
            <Link href="/get-started" className="bg-black px-5 py-4 text-white hover:bg-neutral-800">Get started</Link>
          </nav>
          <Link href="/get-started" className="bg-black px-4 py-3 pixel-text text-xs text-white md:hidden">Start</Link>
        </header>

        <div className="flex h-20 items-end justify-end border-b border-neutral-100 bg-[#f5f5f5] px-6 py-4 sm:px-12">
          <div className="pixel-text text-xs uppercase tracking-[0.18em] text-neutral-300">api docs -&gt; mcp endpoint</div>
        </div>

        <section className="grid min-h-[980px] bg-white lg:grid-cols-[1fr_1fr]">
          <div className="border-b border-neutral-200 px-6 py-16 lg:border-b-0 lg:border-r lg:px-20 lg:py-20">
            <p className="pixel-text text-sm uppercase tracking-[0.18em] text-neutral-400">Route request</p>
            <h1
              className="mt-8 text-5xl font-normal leading-tight tracking-normal text-black sm:text-6xl"
              style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
            >
              Talk to Astrail
            </h1>
            <p className="mt-7 max-w-xl text-xl leading-8 text-neutral-500">
              Tell us what your agent needs to call and we&apos;ll route your request to the right workflow.
            </p>

            <div className="mt-14 grid border-y border-neutral-200 sm:grid-cols-4">
              {stats.map(([value, label]) => (
                <div key={label} className="border-b border-neutral-200 py-6 sm:border-b-0 sm:border-r sm:px-5 sm:last:border-r-0">
                  <div className="mb-5 h-5 w-5 border border-neutral-300" />
                  <p className="text-2xl font-semibold tracking-tight text-black">{value}</p>
                  <p className="pixel-text mt-2 text-[11px] uppercase tracking-[0.18em] text-neutral-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-16 lg:px-12 lg:py-20">
            <div className="mx-auto max-w-2xl">
              <GetDemoForm />
              <p className="mt-5 text-center text-sm text-neutral-400">
                We use this to route your request to the right team.
              </p>
            </div>
          </div>
        </section>
        <div className="h-28 border-t border-neutral-100 bg-[#f5f5f5]" />
      </div>
    </main>
  );
}
