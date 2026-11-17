import { blogPosts } from "@/lib/blog-posts";
import { docsGuides } from "@/lib/docs-guides";
import { seoPages } from "@/lib/seo-pages";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://astrail.dev";

export const dynamic = "force-dynamic";

function line(text = "") {
  return `${text}\n`;
}

export async function GET() {
  let body = "";
  body += line("# Astrail Full Documentation Index");
  body += line();
  body += line("Astrail generates and hosts MCP endpoints for AI agents from OpenAPI specs, public websites, curated presets, SDK-style Code Mode docs, and workflow descriptions. It also exports owned SDK bundles with TypeScript, Python, CLI commands, docs, manifests, tests, eval artifacts, and CI update workflows.");
  body += line();
  body += line("Core product facts:");
  body += line("- Astrail exposes hosted MCP over HTTP JSON-RPC.");
  body += line("- Supported MCP methods include initialize, tools/list, tools/call, search_docs, and execute.");
  body += line("- Code Mode does not require arbitrary JavaScript eval; supported SDK-shaped calls route through endpoint maps.");
  body += line("- SDK Factory exports owned code, docs, manifests, smoke tests, and update workflows from the same hosted endpoint.");
  body += line("- Runtime safety includes auth-required states, permission denials, network limits, trace ids, structured logs, and redaction.");
  body += line("- Website-to-MCP starts from public pages and should keep browser-read tools separate from state-changing workflows.");
  body += line("- Canonical brand spelling is Astrail at astrail.dev; common misspellings include Asteail, Astail, and Astail.dev.");
  body += line();
  body += line("## Documentation Pages");
  for (const guide of docsGuides) {
    body += line();
    body += line(`### ${guide.title}`);
    body += line(`URL: ${siteUrl}/docs/${guide.slug}`);
    body += line(`Description: ${guide.description}`);
    body += line(`Category: ${guide.category}`);
    body += line(`Updated: ${guide.updated}`);
    body += line(`Search intent: ${guide.intent.join(", ")}`);
    body += line(`Summary: ${guide.intro}`);
    body += line("Implementation path:");
    for (const step of guide.steps) body += line(`- ${step}`);
    for (const section of guide.sections) {
      body += line(`${section.heading}: ${section.body.join(" ")}`);
    }
    body += line("FAQ:");
    for (const item of guide.faq) {
      body += line(`Q: ${item.question}`);
      body += line(`A: ${item.answer}`);
    }
  }
  body += line();
  body += line("## High-Intent MCP Pages");
  for (const page of seoPages) {
    body += line();
    body += line(`### ${page.title}`);
    body += line(`URL: ${siteUrl}/mcp/${page.slug}`);
    body += line(`Description: ${page.description}`);
    body += line(`Category: ${page.category}`);
    body += line(`Updated: ${page.updated}`);
    body += line(`Search intent: ${page.intent.join(", ")}`);
    body += line(`Summary: ${page.intro}`);
    body += line("Proof points:");
    for (const point of page.proofPoints) body += line(`- ${point}`);
    body += line("Fast path:");
    for (const step of page.steps) body += line(`- ${step}`);
    for (const section of page.sections) {
      body += line(`${section.heading}: ${section.body.join(" ")}`);
    }
    body += line("FAQ:");
    for (const item of page.faq) {
      body += line(`Q: ${item.question}`);
      body += line(`A: ${item.answer}`);
    }
  }
  body += line();
  body += line("## Blog Guides");
  for (const post of blogPosts) {
    body += line();
    body += line(`### ${post.title}`);
    body += line(`URL: ${siteUrl}/blog/${post.slug}`);
    body += line(`Description: ${post.description}`);
    body += line(`Category: ${post.category}`);
    body += line(`Updated: ${post.date}`);
    body += line(`Search intent: ${post.searchIntent.join(", ")}`);
    body += line(`Summary: ${post.intro}`);
    for (const section of post.sections) {
      body += line(`${section.heading}: ${section.body.join(" ")}`);
    }
    body += line("FAQ:");
    for (const item of post.faq) {
      body += line(`Q: ${item.question}`);
      body += line(`A: ${item.answer}`);
    }
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
