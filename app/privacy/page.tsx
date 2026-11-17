import type { Metadata } from "next";
import Link from "next/link";
import { AstrailLogo } from "@/components/AstrailLogo";

export const metadata: Metadata = {
  title: "Privacy Policy | Astrail",
  description: "How Astrail handles account, API, credential, and runtime data.",
};

const sections = [
  ["Data we collect", "We collect account identifiers, contact details, billing state, imported API contracts, configuration metadata, usage records, audit events, error traces, and support messages. When you connect a provider, Astrail stores the authorization data needed to operate that connection."],
  ["Credentials and provider grants", "Provider secrets and OAuth tokens are encrypted before storage and are not returned in plaintext after creation. Runtime logs are designed to redact authorization headers, cookies, tokens, client secrets, and sensitive credential query parameters."],
  ["How we use data", "We use data to authenticate users, generate and run MCP endpoints, enforce permissions and plan limits, refresh or revoke provider grants, investigate failures, prevent abuse, provide support, and improve reliability."],
  ["Service providers", "Astrail relies on infrastructure, database, authentication, payment, email, monitoring, and API providers to operate the service. Those processors receive only the data needed for their role and are governed by their own terms and privacy commitments."],
  ["Retention", "We retain account and operational data while your account is active and as reasonably needed for security, dispute resolution, legal compliance, backups, and service integrity. Retention controls may vary by plan and data type."],
  ["Your choices", "You can revoke connected provider grants, delete stored connections, and request account data access, correction, export, or deletion. Some records may be retained where required for security, billing, fraud prevention, or law."],
  ["International processing", "Astrail and its service providers may process data outside your country. By using the service, you understand that privacy protections may differ across jurisdictions."],
  ["Changes", "We may update this policy as the product and providers change. Material updates will be posted here with a revised effective date."],
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f5] text-neutral-950">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="flex items-center justify-between border-b border-neutral-200 pb-6">
          <AstrailLogo markClassName="h-9 w-9" labelClassName="text-2xl" />
          <Link href="/terms" className="text-sm font-medium text-neutral-600 hover:text-black">Terms</Link>
        </header>
        <article className="mt-10 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm text-neutral-500">Effective July 16, 2026</p>
          <p className="mt-7 text-base leading-7 text-neutral-600">This policy explains how this Astrail deployment handles information when you use the website, dashboard, hosted MCP runtime, and related services.</p>
          <div className="mt-9 space-y-8">
            {sections.map(([title, body]) => (
              <section key={title}>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-base leading-7 text-neutral-600">{body}</p>
              </section>
            ))}
            <section>
              <h2 className="text-lg font-semibold">Privacy requests</h2>
              <p className="mt-2 text-base leading-7 text-neutral-600">Contact the operator of this Astrail deployment for privacy or deletion requests. The operator may need to verify account ownership before acting.</p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
