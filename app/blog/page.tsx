import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { blogPosts } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Astrail Blog | MCP servers, MCP SDKs, and AI agent tools",
  description:
    "Human guides for MCP servers, OpenAPI to MCP generation, hosted MCP endpoints, SDK exports, and website-to-MCP workflows for AI agents.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Astrail Blog | MCP servers and AI agent tools",
    description: "Guides for turning APIs, websites, and workflows into hosted MCP servers and SDKs.",
    url: "/blog",
    siteName: "Astrail",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Astrail" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Astrail Blog | MCP servers and AI agent tools",
    description: "Practical guides for MCP servers, SDKs, OpenAPI, and website-to-MCP.",
    images: ["/og-image.jpg"],
  },
};

const featuredPost = blogPosts[0];
const articlePosts = blogPosts.slice(1);

export default function BlogPage() {
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
            <Link href="/marketplace" className="hidden rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex">Marketplace</Link>
            <Link href="/docs" className="hidden rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex">Docs</Link>
            <Link href="/tutorials" className="hidden rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex">Tutorials</Link>
            <Link href="/dashboard" className="rounded-md bg-neutral-950 px-4 py-2 text-white hover:bg-neutral-800">Dashboard</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:pt-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Astrail Library</p>
            <h1 className="mt-4 max-w-3xl font-sans text-4xl font-semibold leading-tight tracking-normal text-neutral-950 sm:text-5xl">
              Practical guides for building agent tools.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg">
              Clear, production-minded notes on MCP servers, OpenAPI generation, hosted endpoints, SDK exports, and website-to-MCP workflows.
            </p>
          </div>

          <aside className="border border-neutral-200 bg-white p-5">
            <p className="text-sm font-semibold text-neutral-950">Start here</p>
            <div className="mt-4 grid gap-3 text-sm text-neutral-600">
              <div className="border-t border-neutral-200 pt-3">Learn what MCP changes for agents.</div>
              <div className="border-t border-neutral-200 pt-3">Turn API docs into reviewed tools.</div>
              <div className="border-t border-neutral-200 pt-3">Decide when to export an owned SDK.</div>
              <Link href="/tutorials" className="border-t border-neutral-200 pt-3 font-medium text-neutral-950 hover:text-orange-700">
                Open implementation tutorials
              </Link>
            </div>
          </aside>
        </div>

        <Link
          href={`/blog/${featuredPost.slug}`}
          className="group mt-10 grid overflow-hidden border border-neutral-200 bg-white transition hover:border-orange-300 lg:grid-cols-[0.95fr_1.05fr]"
        >
          <div className="relative min-h-[250px] border-b border-neutral-200 bg-neutral-100 lg:border-b-0 lg:border-r">
            <Image src={featuredPost.cover} alt="" fill priority sizes="(min-width: 1024px) 520px, 100vw" className="object-cover" />
          </div>
          <div className="flex min-h-[250px] flex-col p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">{featuredPost.category}</span>
              <ArrowUpRight className="h-5 w-5 text-neutral-400 transition group-hover:text-orange-600" />
            </div>
            <h2 className="mt-6 max-w-2xl font-sans text-3xl font-semibold leading-tight tracking-normal text-neutral-950 sm:text-4xl">
              {featuredPost.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600">{featuredPost.description}</p>
            <div className="mt-auto flex items-center gap-2 pt-8 text-sm text-neutral-500">
              <BookOpen className="h-4 w-4" />
              <span>{featuredPost.readingTime}</span>
            </div>
          </div>
        </Link>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {articlePosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex min-h-[310px] flex-col border border-neutral-200 bg-white p-5 transition hover:border-orange-300"
            >
              <div className="flex items-start justify-between gap-4">
                <Image src={post.icon} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
                <ArrowUpRight className="h-4 w-4 text-neutral-400 transition group-hover:text-orange-600" />
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">{post.category}</p>
              <h2 className="mt-3 font-sans text-xl font-semibold leading-7 tracking-normal text-neutral-950">{post.title}</h2>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-neutral-600">{post.description}</p>
              <div className="mt-auto flex items-center gap-2 pt-8 text-sm text-neutral-500">
                <BookOpen className="h-4 w-4" />
                <span>{post.readingTime}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
