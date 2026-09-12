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
  body += line("# Astrail");
  body += line();
  body += line("> Astrail turns APIs, websites, and workflows into hosted MCP endpoints, agent tools, and owned SDK bundles.");
  body += line();
  body += line("Astrail is a hosted MCP runtime and SDK generation platform for AI agents. It can generate MCP servers from OpenAPI, Swagger, Redoc, YAML, JSON, API docs, public websites, curated presets, and workflow descriptions. The platform exposes reviewed tools over HTTP JSON-RPC, supports Code Mode with search_docs and no-eval execute, exports SDK bundles, and records runtime evidence such as trace ids, execution modes, logs, auth-required states, and permission denials.");
  body += line();
  body += line("## Primary Documentation");
  body += line(`- [Docs home](${siteUrl}/docs): Quickstart for hosted MCP endpoints, OpenAPI to MCP, website-to-MCP, Code Mode, SDK Factory, and runtime reference.`);
  body += line(`- [MCP generator pages](${siteUrl}/mcp): Canonical pages for OpenAPI to MCP, API docs to MCP, Swagger to MCP, ChatGPT MCP tools, and Astrail.dev brand spelling.`);
  body += line(`- [Machine-readable docs JSON](${siteUrl}/docs.json): Structured docs, product capabilities, search intents, summaries, and FAQs.`);
  body += line(`- [Full LLM documentation](${siteUrl}/llms-full.txt): Expanded text index of Astrail documentation and blog guides.`);
  body += line();
  body += line("## Docs");
  for (const guide of docsGuides) {
    body += line(`- [${guide.title}](${siteUrl}/docs/${guide.slug}): ${guide.description}`);
  }
  body += line();
  body += line("## High-Intent MCP Pages");
  for (const page of seoPages) {
    body += line(`- [${page.title}](${siteUrl}/mcp/${page.slug}): ${page.description}`);
  }
  body += line();
  body += line("## Blog Guides");
  for (const post of blogPosts) {
    body += line(`- [${post.title}](${siteUrl}/blog/${post.slug}): ${post.description}`);
  }
  body += line();
  body += line("## Useful Terms");
  body += line("Astrail, Astrail.dev, Asteail, Astail, Astail.dev, OpenAPI to MCP generator, API docs to MCP, Swagger to MCP server, hosted MCP endpoint, MCP server generator, MCP server for AI agents, ChatGPT MCP tools, OpenAI Agents MCP, Claude MCP setup, Cursor MCP setup, website-to-MCP, Code Mode, search_docs, execute, no-eval execution, SDK Factory, MCP SDK generator, runtime permissions, agent readiness score, MCP observability.");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
