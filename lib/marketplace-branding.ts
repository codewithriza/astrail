import type { McpServer } from "@/lib/types";

type Brand = {
  icon: string;
  accent: string;
  tagline: string;
};

const brandBySlug: Record<string, Brand> = {
  airtable: { icon: "/app-icons/airtable.svg", accent: "from-yellow-50 to-red-50", tagline: "Bases, records, and internal tools" },
  anthropic: { icon: "/app-icons/anthropic.svg", accent: "from-stone-50 to-zinc-100", tagline: "Models, evals, and prompt workflows" },
  asana: { icon: "/app-icons/asana.svg", accent: "from-rose-50 to-orange-50", tagline: "Tasks, projects, and team planning" },
  bitbucket: { icon: "/app-icons/bitbucket.svg", accent: "from-sky-50 to-blue-50", tagline: "Repositories, pull requests, and CI" },
  cloudflare: { icon: "/app-icons/cloudflare.svg", accent: "from-orange-50 to-amber-50", tagline: "DNS, workers, cache, and edge ops" },
  discord: { icon: "/app-icons/discord.svg", accent: "from-indigo-50 to-violet-50", tagline: "Channels, messages, and communities" },
  docker: { icon: "/app-icons/docker.svg", accent: "from-sky-50 to-cyan-50", tagline: "Containers, images, and runtime logs" },
  dropbox: { icon: "/app-icons/dropbox.svg", accent: "from-blue-50 to-sky-50", tagline: "Files, folders, and sharing" },
  figma: { icon: "/app-icons/figma.svg", accent: "from-pink-50 to-orange-50", tagline: "Files, nodes, comments, and assets" },
  github: { icon: "/app-icons/github.svg", accent: "from-neutral-50 to-zinc-100", tagline: "Repos, issues, PRs, and code search" },
  gitlab: { icon: "/app-icons/gitlab.svg", accent: "from-orange-50 to-amber-50", tagline: "Projects, merge requests, and pipelines" },
  gmail: { icon: "/app-icons/gmail.svg", accent: "from-red-50 to-sky-50", tagline: "Inbox search, threads, and drafts" },
  "google-calendar": { icon: "/app-icons/googlecalendar.svg", accent: "from-blue-50 to-emerald-50", tagline: "Availability, events, and scheduling" },
  "google-docs": { icon: "/app-icons/googledocs.svg", accent: "from-blue-50 to-sky-50", tagline: "Docs, edits, and document retrieval" },
  "google-drive": { icon: "/app-icons/googledrive.svg", accent: "from-emerald-50 to-yellow-50", tagline: "Files, permissions, and retrieval" },
  "google-sheets": { icon: "/app-icons/googlesheets.svg", accent: "from-emerald-50 to-green-50", tagline: "Sheets, reporting, and updates" },
  hubspot: { icon: "/app-icons/hubspot.svg", accent: "from-orange-50 to-red-50", tagline: "Contacts, companies, deals, and CRM" },
  intercom: { icon: "/app-icons/intercom.svg", accent: "from-blue-50 to-cyan-50", tagline: "Conversations, contacts, and support" },
  jira: { icon: "/app-icons/jira.svg", accent: "from-blue-50 to-indigo-50", tagline: "Issues, sprints, and engineering work" },
  kubernetes: { icon: "/app-icons/kubernetes.svg", accent: "from-blue-50 to-sky-50", tagline: "Pods, deployments, and rollout checks" },
  linear: { icon: "/app-icons/linear.svg", accent: "from-neutral-50 to-stone-100", tagline: "Issues, cycles, teams, and status" },
  mistral: { icon: "/app-icons/mistralai.svg", accent: "from-orange-50 to-yellow-50", tagline: "Models, embeddings, and classifiers" },
  mongodb: { icon: "/app-icons/mongodb.svg", accent: "from-green-50 to-emerald-50", tagline: "Collections, documents, and pipelines" },
  notion: { icon: "/app-icons/notion.svg", accent: "from-neutral-50 to-zinc-100", tagline: "Pages, databases, and knowledge flows" },
  openai: { icon: "/app-icons/openai.svg", accent: "from-neutral-50 to-zinc-100", tagline: "Models, chat completions, and embeddings" },
  perplexity: { icon: "/app-icons/perplexity.svg", accent: "from-cyan-50 to-teal-50", tagline: "Research, answers, and citations" },
  postgres: { icon: "/app-icons/postgresql.svg", accent: "from-blue-50 to-indigo-50", tagline: "SQL, schemas, and database operations" },
  postgresql: { icon: "/app-icons/postgresql.svg", accent: "from-blue-50 to-indigo-50", tagline: "SQL, schemas, and database operations" },
  sentry: { icon: "/app-icons/sentry.svg", accent: "from-purple-50 to-violet-50", tagline: "Issues, traces, releases, and alerts" },
  shopify: { icon: "/app-icons/shopify.svg", accent: "from-green-50 to-lime-50", tagline: "Products, orders, and commerce ops" },
  slack: { icon: "/app-icons/slack.svg", accent: "from-fuchsia-50 to-cyan-50", tagline: "Channels, messages, and team context" },
  stripe: { icon: "/app-icons/stripe.svg", accent: "from-indigo-50 to-violet-50", tagline: "Checkout, invoices, customers, and billing" },
  supabase: { icon: "/app-icons/supabase.svg", accent: "from-emerald-50 to-teal-50", tagline: "Projects, SQL, auth, and edge functions" },
  trello: { icon: "/app-icons/trello.svg", accent: "from-blue-50 to-sky-50", tagline: "Boards, cards, lists, and checklists" },
  vercel: { icon: "/app-icons/vercel.svg", accent: "from-neutral-50 to-zinc-100", tagline: "Deployments, domains, and env vars" },
  zendesk: { icon: "/app-icons/zendesk.svg", accent: "from-emerald-50 to-teal-50", tagline: "Tickets, macros, users, and support" },
  zoom: { icon: "/app-icons/zoom.svg", accent: "from-blue-50 to-sky-50", tagline: "Meetings, recordings, and scheduling" },
};

export function marketplaceBrand(server: McpServer): Brand {
  const slug = server.id
    .replace(/^preset-/, "")
    .replace(/-mcp-template$/, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

  return brandBySlug[slug] ?? {
    icon: server.source_type === "website" ? "/app-icons/swagger.svg" : "/app-icons/openapi.svg",
    accent: "from-orange-50 to-zinc-50",
    tagline: server.source_type === "preset" ? "Curated agent tool template" : "Generated agent endpoint",
  };
}
