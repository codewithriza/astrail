import Link from "next/link";
import { AstrailLogo } from "@/components/AstrailLogo";
import { billingLaunchFreeMode, billingMeters, billingPlanOrder, billingPlans } from "@/lib/billing/plans";

export default function PaymentPage() {
  return (
    <main className="min-h-screen bg-[#f4f4f4] text-black">
      <div className="mx-auto min-h-screen max-w-[1510px] border-x border-neutral-200 bg-white">
        <header className="flex h-20 items-center justify-between border-y border-neutral-200 px-4 sm:px-10">
          <AstrailLogo markClassName="h-10 w-10" labelClassName="text-3xl" />
          <nav className="hidden items-center gap-10 pixel-text text-sm text-black md:flex">
            <Link href="/get-started" className="hover:text-neutral-500">Get started</Link>
            <Link href="/get-demo" className="hover:text-neutral-500">Get demo</Link>
          </nav>
        </header>

        <div className="flex h-20 items-end justify-end border-b border-neutral-100 bg-[#f5f5f5] px-6 py-4 sm:px-12">
          <div className="pixel-text text-xs uppercase tracking-[0.18em] text-neutral-300">usage metering</div>
        </div>

        <section className="px-6 py-10 lg:px-20 lg:py-12">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="pixel-text text-sm uppercase tracking-[0.18em] text-neutral-400">Pricing</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black">Choose a plan</h1>
            </div>
            <p className="max-w-xl text-sm leading-6 text-neutral-500">
              Credits are spent on successful endpoint generation, SDK exports, and accepted runtime calls.
            </p>
          </div>

          <div className="grid border border-neutral-200 lg:grid-cols-3">
            {billingPlanOrder.map((planId) => {
              const plan = billingPlans[planId];
              const href = billingLaunchFreeMode || plan.id === "free" ? "/signup" : `/signup?plan=${plan.id}`;
              return (
              <article key={plan.name} className="flex min-h-[470px] flex-col border-b border-neutral-200 p-7 lg:border-b-0 lg:border-r lg:last:border-r-0">
                <p className="pixel-text text-sm uppercase tracking-[0.12em] text-neutral-400">{plan.name}</p>
                <p className="mt-8 text-5xl font-semibold tracking-tight">{billingLaunchFreeMode ? "$0" : plan.priceLabel.replace("/mo", "")}</p>
                <p className="mt-4 min-h-[72px] text-base leading-7 text-neutral-500">{plan.description}</p>
                <div className="mt-6 border border-neutral-200 bg-[#fafafa] p-4">
                  <p className="pixel-text text-xs uppercase tracking-[0.12em] text-neutral-400">Monthly credits</p>
                  <p className="mt-2 font-mono text-2xl font-semibold">{plan.monthlyCredits === null ? "Fair use" : plan.monthlyCredits.toLocaleString()}</p>
                </div>
                <ul className="mt-6 space-y-2 text-sm leading-6 text-neutral-600">
                  <li>{plan.hostedEndpoints === null ? "Fair-use hosted endpoints" : `${plan.hostedEndpoints} hosted endpoint${plan.hostedEndpoints === 1 ? "" : "s"}`}</li>
                  <li>{plan.monthlyToolCalls === null ? "Fair-use runtime tool calls" : `${plan.monthlyToolCalls.toLocaleString()} runtime tool calls/month`}</li>
                  <li>{plan.monthlyGenerations === null ? "Fair-use MCP generations" : `${plan.monthlyGenerations} MCP generations/month`}</li>
                  {billingLaunchFreeMode ? <li>Paid checkout paused during launch</li> : plan.id !== "free" ? <li>Secure Dodo hosted checkout</li> : null}
                </ul>
                <Link
                  href={href}
                  className="mt-auto flex h-14 items-center justify-center bg-black pixel-text text-sm uppercase tracking-[0.08em] text-white transition hover:bg-neutral-800"
                >
                  {plan.ctaLabel}
                </Link>
              </article>
              );
            })}
          </div>

          <section className="mt-12 border border-neutral-200 bg-white p-7">
            <p className="pixel-text text-sm uppercase tracking-[0.12em] text-neutral-400">Credit costs</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Object.values(billingMeters).map((meter) => (
                <div key={meter.id} className="border border-neutral-200 bg-[#fafafa] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-semibold">{meter.label}</h2>
                    <code className="text-sm">{meter.creditCost === 0 ? "0" : meter.creditCost} credits</code>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-500">{meter.chargedWhen}</p>
                </div>
              ))}
            </div>
          </section>
        </section>

        <div className="h-28 border-t border-neutral-100 bg-[#f5f5f5]" />
      </div>
    </main>
  );
}
