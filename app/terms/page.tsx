import type { Metadata } from "next";
import Link from "next/link";
import { AstrailLogo } from "@/components/AstrailLogo";

export const metadata: Metadata = {
  title: "Terms of Service | Astrail",
  description: "Terms for using Astrail's hosted MCP platform.",
};

const sections = [
  ["Using Astrail", "You may use Astrail only for lawful purposes and only with APIs, accounts, data, and domains you are authorized to access. You are responsible for the tools you expose, the permissions you grant, and actions taken by agents using your keys or provider connections."],
  ["Accounts and security", "Keep account credentials and one-time API keys secure. Tell us promptly if you believe an account, provider grant, or endpoint has been compromised. We may suspend access that threatens users, providers, or the service."],
  ["Third-party services", "Astrail connects to third-party APIs and infrastructure. Their terms, availability, rate limits, and data practices also apply. Astrail does not control those services and cannot guarantee that an upstream API will remain compatible."],
  ["Paid plans", "Paid plans renew according to the checkout terms shown before purchase. Usage limits are enforced by the selected plan. You can manage or cancel a subscription from the billing portal; cancellation takes effect for future renewal periods unless applicable law requires otherwise."],
  ["Service changes", "We may change, limit, or discontinue features to protect the service or improve reliability. Material changes to these terms will be posted here with a new effective date."],
  ["Disclaimers and liability", "The service is provided on an as-available basis. To the maximum extent allowed by law, Astrail is not liable for indirect, incidental, special, or consequential losses, lost profits, or actions taken by autonomous agents or third-party APIs."],
  ["Termination", "You may stop using Astrail at any time. We may suspend or terminate access for abuse, security risk, non-payment, or a material breach of these terms."],
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f5] text-neutral-950">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="flex items-center justify-between border-b border-neutral-200 pb-6">
          <AstrailLogo markClassName="h-9 w-9" labelClassName="text-2xl" />
          <Link href="/privacy" className="text-sm font-medium text-neutral-600 hover:text-black">Privacy</Link>
        </header>
        <article className="mt-10 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm text-neutral-500">Effective July 16, 2026</p>
          <p className="mt-7 text-base leading-7 text-neutral-600">These terms govern your use of this Astrail deployment. By creating an account or using the service, you agree to them.</p>
          <div className="mt-9 space-y-8">
            {sections.map(([title, body]) => (
              <section key={title}>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-base leading-7 text-neutral-600">{body}</p>
              </section>
            ))}
            <section>
              <h2 className="text-lg font-semibold">Contact</h2>
              <p className="mt-2 text-base leading-7 text-neutral-600">Contact the operator of this Astrail deployment with questions about these terms.</p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
