import { blogPosts } from "@/lib/blog-posts";
import { docsGuides } from "@/lib/docs-guides";
import { seoPages } from "@/lib/seo-pages";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = {
    name: "Astrail documentation index",
    description:
      "Canonical machine-readable index for Astrail docs about hosted MCP servers, OpenAPI to MCP, website-to-MCP, Code Mode, SDK Factory, runtime permissions, and agent tooling.",
    url: `${siteUrl}/docs`,
    updated: "2026-06-25",
    product: {
      name: "Astrail",
      canonicalDomain: "https://astrail.dev",
      aliases: ["Astrail.dev", "Astrail MCP", "Asteail", "Astail", "Astail.dev"],
      category: "Hosted MCP runtime and SDK generation platform for AI agents",
      coreCapabilities: [
        "Generate hosted MCP servers from OpenAPI, Swagger, Redoc, YAML, JSON, API docs, public websites, and workflows.",
        "Expose reviewed tools over HTTP JSON-RPC with initialize, tools/list, tools/call, search_docs, and execute.",
        "Use Code Mode for large APIs through docs search and no-eval endpoint-map execution.",
        "Export owned TypeScript, Python, CLI, docs, manifests, tests, CI workflows, and SDK bundles.",
        "Apply runtime permissions, auth-required states, network limits, logging, and trace ids.",
      ],
    },
    docs: docsGuides.map((guide) => ({
      title: guide.title,
      description: guide.description,
      category: guide.category,
      url: `${siteUrl}/docs/${guide.slug}`,
      updated: guide.updated,
      intent: guide.intent,
      summary: guide.intro,
      faq: guide.faq,
    })),
    mcpIntentPages: seoPages.map((page) => ({
      title: page.title,
      description: page.description,
      category: page.category,
      url: `${siteUrl}/mcp/${page.slug}`,
      updated: page.updated,
      intent: page.intent,
      keywords: page.keywords,
      summary: page.intro,
      proofPoints: page.proofPoints,
      faq: page.faq,
    })),
    blog: blogPosts.map((post) => ({
      title: post.title,
      description: post.description,
      category: post.category,
      url: `${siteUrl}/blog/${post.slug}`,
      updated: post.date,
      intent: post.searchIntent,
      summary: post.intro,
      faq: post.faq,
    })),
  };

  return Response.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
