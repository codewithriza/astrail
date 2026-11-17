"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Copy,
  KeyRound,
  Search,
  Workflow,
} from "lucide-react";
import { AstrailLogo } from "@/components/AstrailLogo";
import { docsGuides } from "@/lib/docs-guides";
import { mcpReferenceEntries } from "@/lib/mcp-reference";
import { troubleshootingDocs } from "@/lib/troubleshooting-docs";
import { useCasePages } from "@/lib/use-cases";

const navGroups = [
  {
    title: "Get Started",
    items: [
      ["Welcome", "#welcome"],
      ["Quickstart", "#quickstart"],
      ["Guides", "#docs-guides"],
      ["Choose a generator", "#generators"],
      ["Connect MCP clients", "#mcp-clients"],
    ],
  },
  {
    title: "Guides",
    items: docsGuides.map((guide) => [guide.title, `/docs/${guide.slug}`]),
  },
  {
    title: "Use cases",
    items: useCasePages.map((page) => [page.shortTitle, `/use-cases/${page.slug}`]),
  },
  {
    title: "Generate MCP",
    items: [
      ["OpenAPI to MCP", "#openapi"],
      ["Website to MCP", "#website"],
      ["Code Mode", "#code-mode"],
      ["Runtime proof", "#runtime"],
    ],
  },
  {
    title: "SDK Factory",
    items: [
      ["SDK bundle", "#sdk"],
      ["Generated files", "#generated-files"],
      ["Automated PRs", "#automation"],
      ["Publishing", "#publishing"],
    ],
  },
  {
    title: "Reference",
    items: [
      ["MCP glossary", "/docs/reference"],
      ["HTTP API", "#reference"],
      ["Auth", "#auth"],
      ["Limits", "#limits"],
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      ["All runbooks", "/docs/troubleshooting"],
      ["401 unauthorized", "/docs/troubleshooting/mcp-endpoint-401-unauthorized"],
      ["Empty tools/list", "/docs/troubleshooting/tools-list-empty"],
      ["Validation errors", "/docs/troubleshooting/tools-call-validation-error"],
    ],
  },
];

const toc = [
  ["Next steps", "#next-steps"],
  ["Guides", "#docs-guides"],
  ["Use cases", "#use-cases"],
  ["Install", "#install"],
  ["Generate endpoint", "#generate"],
  ["Connect MCP", "#connect"],
  ["Generate SDKs", "#sdk"],
  ["MCP glossary", "#glossary"],
  ["Reference", "#reference"],
];

const generatorCards = [
  {
    label: "OpenAPI to MCP",
    icon: Braces,
    body: "Paste OpenAPI, Swagger UI, Redoc, YAML, JSON, or docs pages that link to a real spec.",
    href: "/dashboard/generate",
  },
  {
    label: "Website to MCP",
    icon: Workflow,
    body: "Turn public pages, same-origin links, and safe GET forms into hosted website-read tools.",
    href: "/dashboard/website-to-mcp",
  },
  {
    label: "SDK Factory",
    icon: Code2,
    body: "Generate TypeScript, Python, Go, Java, Kotlin, Ruby, C#, PHP, CLI, docs, tests, and CI.",
    href: "/dashboard/sdk",
  },
];

const frameworkCards = [
  {
    label: "OpenAI Agents",
    body: "Use Astrail-hosted MCP or generated native tool adapters from the same endpoint.",
    active: true,
  },
  {
    label: "Claude Desktop",
    body: "Connect the hosted HTTP endpoint through your MCP client config.",
    active: false,
  },
  {
    label: "Cursor",
    body: "Use tools/list, tools/call, search_docs, and execute from your editor agent.",
    active: false,
  },
  {
    label: "Owned SDK",
    body: "Export package-ready clients, docs, tests, CLI, and update workflow.",
    active: false,
  },
];

const installCode = `npm install @modelcontextprotocol/sdk zod

# Optional: download an owned SDK bundle from Astrail
curl --fail --location \\
  -H "Authorization: Bearer $ASTRAIL_API_KEY" \\
  "https://your-domain.com/api/servers/SERVER_ID/sdk?format=tgz" \\
  --output generated-sdk.tar.gz`;

const generateCode = `{
  "sourceType": "openapi_url",
  "sourceUrl": "https://petstore.swagger.io/v2/swagger.json",
  "generationMode": "code"
}`;

const mcpCode = `curl -sS -X POST https://your-domain.com/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ASTRAIL_API_KEY" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;

const codeModeCode = `curl -sS -X POST https://your-domain.com/api/mcp/SERVER_ID \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "execute",
      "arguments": {
        "code": "async function run(client) { return await client.pets.list({ limit: 10 }); }",
        "result_mode": "compact"
      }
    }
  }'`;

const sdkCode = `curl --fail --location \\
  -H "Authorization: Bearer $ASTRAIL_API_KEY" \\
  "https://your-domain.com/api/servers/SERVER_ID/sdk?format=tgz" \\
  --output petstore-sdk.tar.gz
mkdir -p petstore-sdk
tar -xzf petstore-sdk.tar.gz -C petstore-sdk
cd petstore-sdk
node scripts/verify-generated-sdk.mjs

cd typescript
npm install
ASTRAIL_MCP_ENDPOINT=https://your-domain.com/api/mcp/SERVER_ID npm test`;

const tsSdkCode = `import { AstrailClient } from "@astrail/petstore";

const client = new AstrailClient({
  endpoint: process.env.ASTRAIL_MCP_ENDPOINT!,
  apiKey: process.env.ASTRAIL_API_KEY,
});

await client.initialize();
const docs = await client.searchDocs("list available pets");
const result = await client.execute({
  code: "async function run(client) { return await client.pets.list({ limit: 10 }); }",
});`;

const pySdkCode = `from astrail_petstore import AstrailClient

client = AstrailClient(
    endpoint="https://your-domain.com/api/mcp/SERVER_ID",
    api_key="ASTRAIL_API_KEY",
)

client.initialize()
docs = client.search_docs("list available pets")
result = client.execute(
    "async function run(client) { return await client.pets.list({ limit: 10 }); }"
)`;

const generatedFiles = [
  ["astrail.yaml", "Generation config for targets, package names, auth, method hooks, and update automation."],
  ["typescript/", "Typed package scaffold with MCP JSON-RPC client, endpoint helpers, tests, and examples."],
  ["python/", "Python package scaffold with pyproject, endpoint helpers, examples, and smoke tests."],
  ["go/, java/, kotlin/", "Compiled client targets for backend teams and JVM/Go deploy surfaces."],
  ["ruby/, csharp/, php/", "Additional package targets for existing customer ecosystems."],
  ["cli/bin/astrail.mjs", "Command wrapper for initialize, tools/list, tools/call, search-docs, and execute."],
  ["docs/REFERENCE.md", "Endpoint reference with SDK method, route, auth, parameters, and runtime behavior."],
  ["docs/MCP.md", "MCP client setup for Claude, Cursor, local scripts, and hosted HTTP JSON-RPC."],
  ["docs/STAINLESS_PARITY.md", "Evidence report mapping generated files to production SDK expectations."],
  ["mcp/manifest.json", "Machine-readable agent metadata for transport, tools, auth, capabilities, and endpoint map."],
  ["openapi/endpoint-catalog.json", "Normalized endpoint catalog for review, diffing, docs, and custom tooling."],
  [".github/workflows/astrail-regenerate.yml", "CI workflow that pulls, verifies, tests, and opens SDK update PRs."],
];

const apiReference = [
  ["POST", "/api/spec-preview", "Inspect a docs URL or spec before generation."],
  ["POST", "/api/generate", "Create a hosted MCP server from OpenAPI, Swagger, Redoc, or raw JSON/YAML."],
  ["POST", "/api/website-to-mcp", "Create public website-read MCP tools from a URL."],
  ["POST", "/api/mcp/:serverId", "Call initialize, tools/list, tools/call, search_docs, and execute."],
  ["GET", "/api/servers/:id/sdk", "Export owned SDK bundle, docs, CLI, tests, manifests, and workflows."],
  ["GET", "/api/servers/:id/worker", "Export a Worker-ready MCP runtime bundle."],
  ["POST", "/api/oauth/connect", "Start per-user provider consent with PKCE and encrypted token storage."],
  ["POST", "/api/x402/domains", "Create an HTTPS ownership challenge for a paid upstream domain."],
  ["POST", "/api/x402/domains/:id/verify", "Verify the upstream domain before payment proofs can be forwarded."],
  ["GET", "/api/x402/receipts", "List non-custodial payment reservations and settlement receipts."],
  ["POST", "/api/credentials", "Attach provider credentials for auth-required upstream APIs."],
  ["DELETE", "/api/credentials/:id", "Remove a stored provider connection so it can no longer be injected."],
];

const runtimeProof = [
  "No eval for Code Mode execute. Astrail parses supported SDK-shaped calls and routes them through endpoint maps.",
  "Caller bearer tokens are never passed through to upstream providers; Astrail selects the matching encrypted end-user grant.",
  "Operation scopes fail closed with oauth_insufficient_scope before a provider request executes.",
  "Every call can record trace id, latency, upstream status, execution mode, and structured errors.",
  "Public/private endpoint policy is enforced at the HTTP MCP boundary.",
];

export default function DocsPage() {
  const [docsSearchQuery, setDocsSearchQuery] = useState("");

  return (
    <main className="min-h-screen overflow-x-clip bg-[#090909] text-white">
      <DocsTopbar query={docsSearchQuery} onQueryChange={setDocsSearchQuery} />
      <DocsMobileNav />

      <div className="grid lg:grid-cols-[minmax(0,1fr)] lg:pl-[300px] xl:grid-cols-[minmax(0,1fr)_260px]">
        <DocsSidebar />

        <article className="min-w-0 border-white/10 px-4 py-8 sm:px-6 sm:py-10 lg:border-l lg:px-8 xl:border-r">
          <div className="mx-auto max-w-4xl">
            <section id="welcome" className="scroll-mt-24">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 sm:text-sm">Astrail docs</p>
              <h1 className="mt-4 text-3xl font-black tracking-normal text-white sm:text-4xl">Quickstart</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-white/68">
                Give an agent secure access to third-party SaaS with per-user consent, encrypted grants, scope enforcement, permissions, and audit logs. Bring your own tool contract, import MCP, or generate from OpenAPI and GraphQL.
              </p>
            </section>

            <section id="docs-guides" className="mt-10 scroll-mt-24">
              <SectionHeading eyebrow="Guides" title="Production docs for agent tools." />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {docsGuides.map((guide) => (
                  <Link
                    key={guide.slug}
                    href={`/docs/${guide.slug}`}
                    className="border border-white/10 bg-[#151515] p-4 transition hover:border-blue-500 hover:bg-white/[0.035]"
                  >
                    <span className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-white">{guide.title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/34" />
                    </span>
                    <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.12em] text-blue-300">{guide.category}</span>
                    <span className="mt-3 block text-sm leading-6 text-white/58">{guide.description}</span>
                  </Link>
                ))}
              </div>
            </section>

            <section id="use-cases" className="mt-10 scroll-mt-24">
              <SectionHeading eyebrow="Use cases" title="Where teams apply MCP." />
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {useCasePages.map((page) => (
                  <Link
                    key={page.slug}
                    href={`/use-cases/${page.slug}`}
                    className="border border-white/10 bg-[#151515] p-4 transition hover:border-blue-500 hover:bg-white/[0.035]"
                  >
                    <span className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-white">{page.shortTitle}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/34" />
                    </span>
                    <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.12em] text-blue-300">{page.category}</span>
                    <span className="mt-3 block text-sm leading-6 text-white/58">{page.promise}</span>
                  </Link>
                ))}
              </div>
            </section>

            <section id="quickstart" className="mt-10 scroll-mt-24 border border-white/10 bg-[#151515]">
              <div id="generators" className="scroll-mt-24 border-b border-white/10 p-5">
                <p className="text-sm font-semibold text-white/72">Choose your generator</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {generatorCards.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={`border p-4 transition hover:border-blue-500 hover:bg-white/[0.035] ${index === 0 ? "border-blue-500 bg-blue-500/[0.035]" : "border-white/10"}`}
                      >
                        <span className="flex items-center gap-3 font-semibold">
                          <Icon className="h-5 w-5" />
                          {item.label}
                        </span>
                        <span className="mt-3 block text-sm leading-6 text-white/55">{item.body}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
              <div id="mcp-clients" className="scroll-mt-24 border-b border-white/10 p-5">
                <p className="text-sm font-semibold text-white/72">Choose how your agent connects</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {frameworkCards.map((item) => (
                    <div
                      key={item.label}
                      className={`border p-4 ${item.active ? "border-blue-500 bg-blue-500/[0.04]" : "border-white/10 bg-white/[0.02]"}`}
                    >
                      <span className="font-semibold text-white">{item.label}</span>
                      <span className="mt-2 block text-sm leading-6 text-white/55">{item.body}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5">
                <p className="text-base leading-7 text-white/62">
                  If your agent supports hosted MCP, connect directly to the generated HTTP endpoint. If your team needs owned client code, export the SDK bundle from the same server.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white/72">Hosted MCP</span>
                  <span className="border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white/72">SDK Factory</span>
                  <span className="border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white/72">No-eval Code Mode</span>
                </div>
              </div>
            </section>

            <StepSection id="install" number="1" title="Install">
              <CodeBlock label="Terminal" code={installCode} />
            </StepSection>

            <StepSection id="generate" number="2" title="Generate endpoint">
              <p className="mb-4 text-base leading-7 text-white/62">
                Open the authenticated generator, paste a real OpenAPI URL, and review the discovered tools before saving. The generation API requires your signed-in workspace session and abuse challenge; it is not an unauthenticated public cURL endpoint.
              </p>
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <MiniCard
                  id="openapi"
                  title="OpenAPI to MCP"
                  body="Swagger UI pages, Redoc pages, YAML, JSON, and docs URLs are normalized into hosted tool metadata."
                />
                <MiniCard
                  id="website"
                  title="Website to MCP"
                  body="Public pages become safe read/search tools with blocked private-network targets and bounded crawl limits."
                />
              </div>
              <CodeBlock label="Authenticated request shape" code={generateCode} />
            </StepSection>

            <StepSection id="connect" number="3" title="Connect an MCP client">
              <p className="mb-4 text-base leading-7 text-white/62">
                Hosted endpoints expose HTTP JSON-RPC. Start with <code className="text-blue-300">initialize</code> and <code className="text-blue-300">tools/list</code>, then call tools through <code className="text-blue-300">tools/call</code>.
              </p>
              <CodeBlock label="cURL tools/list" code={mcpCode} />
            </StepSection>

            <section id="code-mode" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Code Mode" title="Two tools for large APIs: search_docs and execute." />
              <p className="mt-4 text-base leading-7 text-white/62">
                Large APIs should not flood agent context with hundreds of tools. Code Mode exposes docs search plus no-eval execution. Agents search for the SDK-shaped method, then submit a constrained TypeScript snippet that Astrail compiles to endpoint-map execution.
              </p>
              <CodeBlock className="mt-5" label="cURL execute" code={codeModeCode} />
            </section>

            <section id="sdk" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="SDK Factory" title="Export owned SDKs and docs from the same endpoint." />
              <p className="mt-4 text-base leading-7 text-white/62">
                The hosted MCP endpoint stays the source of truth. SDK exports wrap it with typed clients, docs, manifests, CLI commands, package scaffolds, smoke tests, and GitHub workflows.
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <CodeBlock label="Pull SDK bundle" code={sdkCode} />
                <CodeBlock label="TypeScript client" code={tsSdkCode} />
              </div>
              <CodeBlock className="mt-4" label="Python client" code={pySdkCode} />
            </section>

            <section id="generated-files" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Generated files" title="What every SDK bundle contains." />
              <div className="mt-5 overflow-hidden border border-white/10">
                {generatedFiles.map(([file, body]) => (
                  <div key={file} className="grid gap-3 border-b border-white/10 bg-white/[0.025] p-4 last:border-b-0 md:grid-cols-[240px_1fr]">
                    <code className="break-all text-sm text-cyan-300">{file}</code>
                    <p className="text-sm leading-6 text-white/58">{body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="runtime" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Runtime proof" title="Production behavior is visible, not implied." />
              <div className="mt-5 grid gap-3">
                {runtimeProof.map((item) => (
                  <div key={item} className="border border-white/10 bg-[#151515] p-4 text-sm leading-6 text-white/62">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section id="automation" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Automate updates" title="Regenerate SDKs through pull requests." />
              <div className="mt-5 border border-white/10 bg-[#151515] p-5">
                <p className="text-base leading-7 text-white/62">
                  The generated GitHub workflow pulls the latest Astrail bundle, verifies required docs and manifests, runs smoke tests against the hosted MCP endpoint, compiles SDK targets, and opens a review PR.
                </p>
              </div>
            </section>

            <section id="publishing" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Publish" title="Package-manager release stays opt-in." />
              <p className="mt-4 text-base leading-7 text-white/62">
                Review <code className="text-blue-300">astrail.yaml</code>, connect registry credentials in CI, then publish to npm, PyPI, Maven, RubyGems, NuGet, Packagist, Go modules, or internal registries.
              </p>
            </section>

            <section id="glossary" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Glossary" title="MCP reference terms and FAQs." />
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {mcpReferenceEntries.map((entry) => (
                  <Link
                    key={entry.slug}
                    href={`/docs/reference/${entry.slug}`}
                    className="border border-white/10 bg-[#151515] p-4 hover:border-blue-400 hover:bg-white/[0.04]"
                  >
                    <span className="font-mono text-xs uppercase tracking-[0.14em] text-white/38">{entry.category}</span>
                    <span className="mt-2 block font-semibold text-white">{entry.term}</span>
                    <span className="mt-2 block text-sm leading-6 text-white/55">{entry.metaDescription}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-4">
                <Link href="/docs/reference" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200">
                  Open full MCP glossary
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </section>

            <section id="reference" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Reference" title="HTTP API surface." />
              <div className="mt-5 overflow-hidden border border-white/10">
                {apiReference.map(([method, route, body]) => (
                  <div key={route} className="grid min-w-0 gap-3 border-b border-white/10 bg-white/[0.025] p-4 last:border-b-0 lg:grid-cols-[80px_minmax(0,260px)_1fr]">
                    <span className="font-mono text-sm text-lime-300">{method}</span>
                    <code className="break-all text-sm text-cyan-300">{route}</code>
                    <p className="text-sm leading-6 text-white/58">{body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="auth" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Auth" title="Separate caller identity from provider identity." />
              <div className="mt-5 border border-white/10 bg-[#151515] p-5">
                <p className="text-base leading-7 text-white/62">
                  Private servers require <code className="text-blue-300">Authorization: Bearer ASTRAIL_API_KEY</code>. Bind that key to an end user and actor role, then connect a separate provider grant through hosted OAuth. Astrail never relays the caller bearer token upstream and withholds provider tokens when required scopes are missing. Read the <Link href="/docs/third-party-saas-oauth" className="text-blue-300 hover:text-white">OAuth security model</Link>.
                </p>
              </div>
            </section>

            <section id="limits" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Limits" title="Default safety boundaries." />
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <MiniCard title="Payloads" body="Bounded request and response sizes for hosted tools/call." />
                <MiniCard title="Execution" body="No arbitrary eval for Code Mode execute." />
                <MiniCard title="Network" body="Website-to-MCP blocks local/private network targets." />
              </div>
            </section>

            <section id="troubleshooting" className="mt-12 scroll-mt-24">
              <SectionHeading eyebrow="Troubleshooting" title="Fix common MCP and SDK errors." />
              <p className="mt-4 text-base leading-7 text-white/62">
                Use these runbooks when an endpoint reaches the client but auth, schemas, tool discovery, CORS, limits, or generated SDK builds fail.
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {troubleshootingDocs.slice(0, 6).map((doc) => (
                  <Link
                    key={doc.slug}
                    href={`/docs/troubleshooting/${doc.slug}`}
                    className="border border-white/10 bg-[#151515] p-4 transition hover:border-blue-400 hover:bg-white/[0.04]"
                  >
                    <span className="font-semibold text-white">{doc.title}</span>
                    <span className="mt-2 block text-sm leading-6 text-white/55">{doc.primaryCheck}</span>
                  </Link>
                ))}
              </div>
              <Link href="/docs/troubleshooting" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-300 hover:text-blue-200">
                View all troubleshooting guides
                <ChevronRight className="h-4 w-4" />
              </Link>
            </section>

            <section id="next-steps" className="mt-12 scroll-mt-24 border border-blue-500/40 bg-blue-500/[0.06] p-6">
              <h2 className="text-2xl font-black">Next steps</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <Link href="/dashboard/generate" className="border border-white/10 bg-black/30 p-4 hover:border-blue-400">
                  <span className="font-semibold">Generate MCP</span>
                  <span className="mt-2 block text-sm leading-6 text-white/55">Start from OpenAPI or API docs.</span>
                </Link>
                <Link href="/dashboard/sdk" className="border border-white/10 bg-black/30 p-4 hover:border-blue-400">
                  <span className="font-semibold">Export SDKs</span>
                  <span className="mt-2 block text-sm leading-6 text-white/55">Generate clients, docs, tests, and CI.</span>
                </Link>
                <Link href="/dashboard/website-to-mcp" className="border border-white/10 bg-black/30 p-4 hover:border-blue-400">
                  <span className="font-semibold">Website to MCP</span>
                  <span className="mt-2 block text-sm leading-6 text-white/55">Turn public websites into safe read tools.</span>
                </Link>
              </div>
            </section>
          </div>
        </article>

        <DocsToc />
      </div>
    </main>
  );
}

type DocsSearchItem = {
  label: string;
  href: string;
  group: string;
  body?: string;
};

const docsSearchItems: DocsSearchItem[] = [
  ...navGroups.flatMap((group) => group.items.map(([label, href]) => ({ label, href, group: group.title }))),
  ...toc.map(([label, href]) => ({ label, href, group: "On this page" })),
  ...docsGuides.map((guide) => ({ label: guide.title, href: `/docs/${guide.slug}`, group: "Guides", body: guide.description })),
  ...useCasePages.map((page) => ({ label: page.title, href: `/use-cases/${page.slug}`, group: "Use cases", body: page.description })),
  ...generatorCards.map((card) => ({ label: card.label, href: card.href, group: "Tools", body: card.body })),
  ...apiReference.map(([method, route, body]) => ({ label: `${method} ${route}`, href: "#reference", group: "API", body })),
  ...mcpReferenceEntries.map((entry) => ({
    label: entry.term,
    href: `/docs/reference/${entry.slug}`,
    group: "MCP glossary",
    body: entry.metaDescription,
  })),
  ...troubleshootingDocs.map((doc) => ({
    label: doc.title,
    href: `/docs/troubleshooting/${doc.slug}`,
    group: "Troubleshooting",
    body: `${doc.description} ${doc.keywords.join(" ")}`,
  })),
];

function DocsTopbar({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalizedQuery) return [];

    const seen = new Set<string>();
    return docsSearchItems
      .filter((item) => {
        const haystack = `${item.label} ${item.group} ${item.body ?? ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .filter((item) => {
        const key = `${item.label}-${item.href}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }, [normalizedQuery]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const first = results[0] ?? docsSearchItems.find((item) => item.label.toLowerCase().includes(normalizedQuery));
    if (!first) return;

    if (first.href.startsWith("#")) {
      window.location.hash = first.href;
    } else {
      window.location.href = first.href;
    }
    onQueryChange("");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090909]">
      <div className="flex h-16 min-w-0 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <AstrailLogo href="/docs" inverse markClassName="h-8 w-8" labelClassName="text-2xl text-white" />
        <nav className="hidden items-center gap-6 text-sm font-semibold text-white/56 md:flex">
          <Link href="/docs" className="text-blue-400">Docs</Link>
          <Link href="/marketplace" className="hover:text-white">Catalog</Link>
          <Link href="/dashboard/sdk" className="hover:text-white">SDKs</Link>
          <Link href="/dashboard/generate" className="hover:text-white">MCP</Link>
        </nav>
        <div className="ml-auto hidden min-w-0 flex-1 justify-end gap-2 lg:flex">
          <form onSubmit={submitSearch} className="relative w-full max-w-[360px]">
            <div className="flex h-10 items-center gap-3 border border-white/10 bg-white/[0.035] px-3 text-sm text-white/72 focus-within:border-blue-400">
            <Search className="h-4 w-4" />
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search docs"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/42"
                aria-label="Search docs"
              />
              <button type="submit" className="border border-white/10 px-2 py-0.5 font-mono text-xs text-white/48 hover:border-blue-400 hover:text-white">
                /
              </button>
            </div>
            {query.trim() ? (
              <div className="absolute right-0 top-12 z-50 w-full overflow-hidden border border-white/10 bg-[#111] shadow-lg">
                {results.length > 0 ? (
                  results.map((item) => (
                    <Link
                      key={`${item.label}-${item.href}`}
                      href={item.href}
                      onClick={() => onQueryChange("")}
                      className="block border-b border-white/10 px-3 py-3 text-sm text-white/72 last:border-b-0 hover:bg-white/[0.06] hover:text-white"
                    >
                      <span className="block font-semibold text-white">{item.label}</span>
                      <span className="mt-1 block text-xs text-white/42">{item.group}</span>
                    </Link>
                  ))
                ) : (
                  <p className="px-3 py-3 text-sm text-white/42">No docs matches.</p>
                )}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </header>
  );
}

function DocsMobileNav() {
  const links = navGroups.flatMap((group) => group.items);

  return (
    <nav className="sticky top-16 z-30 border-b border-white/10 bg-[#090909] px-4 py-3 lg:hidden" aria-label="Docs sections">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {links.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-medium text-white/72 hover:border-blue-400 hover:text-white"
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function DocsSidebar() {
  return (
    <aside className="hidden lg:fixed lg:bottom-0 lg:left-0 lg:top-16 lg:z-30 lg:block lg:w-[300px] lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-white/10 lg:bg-[#090909] lg:px-4 lg:py-6">
      <nav className="space-y-8">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h2 className="px-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-white/38">{group.title}</h2>
            <div className="mt-3 grid gap-1">
              {group.items.map(([label, href]) => (
                <Link key={href} href={href} className="flex items-center justify-between rounded-md px-2 py-2 text-sm font-medium text-white/72 hover:bg-white/[0.04] hover:text-white">
                  <span>{label}</span>
                  {label === "Quickstart" || label === "Providers" ? <ChevronRight className="h-4 w-4 text-white/30" /> : null}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function DocsToc() {
  return (
    <aside className="hidden px-6 py-10 xl:sticky xl:top-16 xl:block xl:max-h-[calc(100vh-4rem)]">
      <div className="text-sm">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-white/68">
          <BookOpen className="h-4 w-4" />
          On this page
        </h2>
        <nav className="grid gap-3 border-l border-white/10 pl-4">
          {toc.map(([label, href], index) => (
            <Link key={href} href={href} className={`${index === 0 ? "text-blue-400" : "text-white/48"} hover:text-white`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-blue-400 sm:text-sm">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-black tracking-normal text-white sm:text-3xl">{title}</h2>
    </div>
  );
}

function StepSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="relative mt-10 scroll-mt-32 pl-0 sm:scroll-mt-24 sm:pl-14">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-md bg-white/[0.06] font-mono text-sm text-white sm:absolute sm:left-0 sm:top-0 sm:mb-0 sm:h-10 sm:w-10">{number}</div>
      <h2 className="pt-0 text-2xl font-black text-white sm:pt-1">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CodeBlock({ label, code, className = "" }: { label: string; code: string; className?: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyCode() {
    let copied = false;

    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        textarea.remove();
      }
    }

    setCopyState(copied ? "copied" : "error");
    window.setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div className={`min-w-0 max-w-full overflow-hidden border border-white/10 bg-[#191919] ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <span className="min-w-0 truncate font-mono text-sm font-semibold text-white/72">{label}</span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex h-8 shrink-0 items-center gap-2 border border-white/10 px-3 text-xs font-semibold text-white/62 transition hover:border-blue-400 hover:text-white"
        >
          {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[520px] overflow-auto p-4 text-xs leading-6 text-white/75 sm:text-sm sm:leading-7">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MiniCard({ title, body, id }: { title: string; body: string; id?: string }) {
  return (
    <div id={id} className="scroll-mt-24 border border-white/10 bg-[#151515] p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-blue-400" />
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/55">{body}</p>
    </div>
  );
}
