import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen, CheckCircle2 } from "lucide-react";
import { tutorials } from "@/lib/tutorials";

export const metadata: Metadata = {
  title: "Astrail Tutorials | OpenAPI to MCP, auth, testing, and SDK publishing",
  description:
    "Practical implementation tutorials for generating MCP servers from OpenAPI, adding auth, testing endpoints, publishing SDKs, and shipping API-specific MCP tools.",
  alternates: { canonical: "/tutorials" },
  openGraph: {
    title: "Astrail Tutorials | OpenAPI to MCP implementation guides",
    description: "Step-by-step MCP tutorials for OpenAPI, auth, endpoint testing, SDK publishing, and production API examples.",
    url: "/tutorials",
    siteName: "Astrail",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Astrail tutorials" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Astrail Tutorials | OpenAPI to MCP implementation guides",
    description: "Practical tutorials for building and testing generated MCP servers.",
    images: ["/og-image.jpg"],
  },
};

const featured = tutorials[0];
const remaining = tutorials.slice(1);

export default function TutorialsPage() {
  return (
    <main
      className="min-h-screen bg-[#f7f7f5] text-neutral-950"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3 text-xl font-semibold tracking-normal">
            <Image src="/brand/astrail-mark.svg" alt="" width={32} height={32} />
            Astrail
          </Link>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <Link href="/docs" className="hidden rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex">Docs</Link>
            <Link href="/blog" className="hidden rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex">Blog</Link>
            <Link href="/dashboard/generate" className="rounded-md bg-neutral-950 px-4 py-2 text-white hover:bg-neutral-800">Generate MCP</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:pt-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Implementation tutorials</p>
            <h1 className="mt-4 max-w-3xl font-sans text-4xl font-semibold leading-tight tracking-normal text-neutral-950 sm:text-5xl">
              Build production MCP endpoints from real API contracts.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg">
              Practical, copyable guides for generating MCP from OpenAPI, adding auth, testing endpoint behavior, exporting SDKs, and adapting common API shapes.
            </p>
          </div>

          <aside className="border border-neutral-200 bg-white p-5">
            <p className="text-sm font-semibold text-neutral-950">Tutorial path</p>
            <div className="mt-4 grid gap-3 text-sm text-neutral-600">
              {["Generate from OpenAPI", "Add runtime auth", "Test before production", "Publish owned SDKs"].map((item) => (
                <div key={item} className="flex gap-3 border-t border-neutral-200 pt-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <Link
          href={`/tutorials/${featured.slug}`}
          className="group mt-10 grid overflow-hidden border border-neutral-200 bg-white transition hover:border-blue-300 lg:grid-cols-[0.95fr_1.05fr]"
        >
          <div className="flex min-h-[250px] flex-col justify-between border-b border-neutral-200 bg-neutral-950 p-6 text-white lg:border-b-0 lg:border-r sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">{featured.category}</span>
              <ArrowUpRight className="h-5 w-5 text-white/48 transition group-hover:text-white" />
            </div>
            <div>
              <h2 className="max-w-2xl font-sans text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">{featured.title}</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">{featured.description}</p>
            </div>
          </div>
          <div className="flex min-h-[250px] flex-col p-6 sm:p-8">
            <p className="text-sm font-semibold text-neutral-950">What you will ship</p>
            <p className="mt-4 text-base leading-7 text-neutral-600">{featured.outcome}</p>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-8 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-2"><BookOpen className="h-4 w-4" />{featured.readingTime}</span>
              <span>{featured.difficulty}</span>
            </div>
          </div>
        </Link>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {remaining.map((tutorial) => (
            <Link
              key={tutorial.slug}
              href={`/tutorials/${tutorial.slug}`}
              className="group flex min-h-[300px] flex-col border border-neutral-200 bg-white p-5 transition hover:border-blue-300"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">{tutorial.category}</span>
                <ArrowUpRight className="h-4 w-4 text-neutral-400 transition group-hover:text-blue-700" />
              </div>
              <h2 className="mt-5 font-sans text-xl font-semibold leading-7 tracking-normal text-neutral-950">{tutorial.title}</h2>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-neutral-600">{tutorial.description}</p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-8 text-sm text-neutral-500">
                <span>{tutorial.readingTime}</span>
                <span>{tutorial.difficulty}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
