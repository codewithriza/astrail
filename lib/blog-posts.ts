export type BlogSection = {
  heading: string;
  body: string[];
};

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: string;
  category: string;
  searchIntent: string[];
  cover: string;
  icon: string;
  intro: string;
  sections: BlogSection[];
  faq: { question: string; answer: string }[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "what-is-an-mcp-server",
    title: "What is an MCP server?",
    description: "A plain English guide to MCP servers, why agents use them, and how Astrail turns APIs into hosted tools.",
    date: "2026-06-13",
    readingTime: "5 min read",
    category: "MCP",
    cover: "/blog/mcp-server-guide.svg",
    icon: "/brand/astrail-prism-icon.svg",
    searchIntent: ["what is an MCP server", "MCP server for AI agents", "hosted MCP server"],
    intro:
      "An MCP server is a small interface that lets an AI agent discover tools and call them in a predictable way. Instead of pasting API docs into a prompt and hoping the model gets it right, the agent asks the MCP server what tools exist, what inputs they need, and what happened when a call ran.",
    sections: [
      {
        heading: "The simple version",
        body: [
          "MCP means Model Context Protocol. It gives agents a standard way to connect to tools, data, and actions. A good MCP server does not just expose raw API routes. It gives the agent names, schemas, auth boundaries, and runtime feedback.",
          "That matters because agents are not humans reading docs. They need tight instructions, stable inputs, and clear errors. If a tool is ambiguous, the agent wastes tokens, retries the wrong thing, or asks the user for information it could have discovered.",
        ],
      },
      {
        heading: "What Astrail adds",
        body: [
          "Astrail generates hosted MCP servers from OpenAPI specs, public websites, and workflow descriptions. The output is an endpoint your agent can call, plus metadata for tools, credentials, runtime mode, logs, and SDK exports.",
          "The point is to make MCP feel less like infrastructure work and more like installing a package. Pick a server, bring credentials when needed, and connect it to Claude, Cursor, ChatGPT, or your own agent runtime.",
        ],
      },
      {
        heading: "When you need one",
        body: [
          "Use an MCP server when an agent needs to do real work: search tickets, create invoices, update CRM records, inspect files, run browser workflows, or call internal APIs. The server becomes the narrow bridge between the agent and the system.",
          "If the work is high risk, you want an MCP layer even more. It lets you define what tools exist, which calls require auth, what is public, and what should stay private.",
        ],
      },
    ],
    faq: [
      {
        question: "Is an MCP server the same as an API?",
        answer: "No. An API is usually built for developers. An MCP server wraps tools for agents with schemas, names, and runtime behavior that models can use.",
      },
      {
        question: "Can Astrail host the MCP server?",
        answer: "Yes. Astrail is built around hosted MCP endpoints, generated tool metadata, logs, auth boundaries, and SDK exports.",
      },
    ],
  },
  {
    slug: "openapi-to-mcp-server",
    title: "OpenAPI to MCP server: the fast path from docs to agent tools",
    description: "How to convert an OpenAPI or Swagger spec into MCP tools without rewriting your whole API.",
    date: "2026-06-13",
    readingTime: "6 min read",
    category: "OpenAPI",
    cover: "/blog/openapi-to-mcp.svg",
    icon: "/app-icons/openapi.svg",
    searchIntent: ["OpenAPI to MCP", "Swagger to MCP server", "generate MCP from OpenAPI"],
    intro:
      "Most companies already have APIs. The hard part is making those APIs usable by agents without letting the model freestyle requests. OpenAPI gives you paths and schemas. MCP gives the agent a tool interface. Astrail connects the two.",
    sections: [
      {
        heading: "Why OpenAPI is a strong starting point",
        body: [
          "OpenAPI already describes methods, paths, parameters, request bodies, and responses. That is exactly the raw material an MCP generator needs. The missing layer is judgment: which endpoints are safe, how names should read, what credentials are required, and how errors should return to the agent.",
          "A naive conversion dumps every endpoint into context. That feels impressive for five minutes, then it becomes slow and confusing. Astrail favors endpoint maps, search tools, and runtime schemas so the agent can find the right action when it needs it.",
        ],
      },
      {
        heading: "A better generated MCP shape",
        body: [
          "For small APIs, a direct tool list can work. For larger APIs, Astrail can expose a catalog pattern: search endpoints, inspect one schema, then call the selected endpoint. That keeps the agent from loading hundreds of tools into one conversation.",
          "This also gives teams a sane review path. You can inspect discovered endpoints, approve what should be callable, and keep risky routes behind credentials or manual review.",
        ],
      },
      {
        heading: "What to check before shipping",
        body: [
          "Do not ship a generated server just because it compiled. Check auth injection, destructive methods, rate limits, response size, and logs. Agents need boring reliability more than they need a flashy demo.",
          "Astrail includes generation diagnostics, runtime labels, and billing gates so generated endpoints behave like product surfaces, not loose scripts.",
        ],
      },
    ],
    faq: [
      {
        question: "Can I convert Swagger to MCP?",
        answer: "Yes. Swagger and OpenAPI specs are common inputs for MCP generation. Astrail can discover specs from direct URLs and Swagger UI pages.",
      },
      {
        question: "Should every API route become an MCP tool?",
        answer: "Usually no. Large APIs work better with a searchable catalog and explicit schema lookup before the agent calls a route.",
      },
    ],
  },
  {
    slug: "mcp-sdk-vs-hosted-endpoint",
    title: "MCP SDK vs hosted MCP endpoint",
    description: "When to use an MCP SDK, when to use a hosted endpoint, and why teams often need both.",
    date: "2026-06-13",
    readingTime: "5 min read",
    category: "SDK",
    cover: "/blog/mcp-sdk-vs-endpoint.svg",
    icon: "/app-icons/github.svg",
    searchIntent: ["MCP SDK", "hosted MCP endpoint", "MCP SDK generator"],
    intro:
      "People search for MCP SDK when they usually mean one of two things: code they can run themselves, or an endpoint their agent can call right now. Those are different jobs. Astrail tries to make both paths feel connected.",
    sections: [
      {
        heading: "Hosted endpoint first",
        body: [
          "A hosted MCP endpoint is the fastest way to test whether an agent can use a tool. You generate or install the server, connect the endpoint, and watch calls, errors, and auth behavior from one console.",
          "This is useful for teams that want less deployment work. The endpoint gives product people, engineers, and operators one shared surface for what the agent can do.",
        ],
      },
      {
        heading: "SDK when you need ownership",
        body: [
          "An SDK is better when your team wants code in its own repo, CI, tests, docs, and a deployment target it controls. SDKs are also helpful when you need to integrate generated tools into a larger internal platform.",
          "Astrail treats SDK export as a companion to the hosted endpoint. The same server can produce docs, client snippets, eval tasks, and package-ready code.",
        ],
      },
      {
        heading: "The practical answer",
        body: [
          "Start hosted when you are proving the workflow. Export an SDK when the tool becomes part of your product or internal platform. Keep the endpoint map and evals connected so the agent behavior does not drift away from the API.",
          "That is the cleanest path from prototype to production: test fast, then own the code when the shape is clear.",
        ],
      },
    ],
    faq: [
      {
        question: "Does an MCP SDK replace a hosted endpoint?",
        answer: "Not always. A hosted endpoint is faster to use. An SDK is better when your team needs code ownership, custom deployment, and CI.",
      },
      {
        question: "Can Astrail export SDKs?",
        answer: "Yes. Astrail can export SDK-style bundles, docs, tests, manifests, and runtime snippets from hosted MCP servers.",
      },
    ],
  },
  {
    slug: "website-to-mcp-for-ai-agents",
    title: "Website to MCP: turning public pages into agent tools",
    description: "How website-to-MCP works, what it is good for, and where browser-backed agent tools need guardrails.",
    date: "2026-06-13",
    readingTime: "6 min read",
    category: "Website to MCP",
    cover: "/blog/website-to-mcp.svg",
    icon: "/app-icons/vercel.svg",
    searchIntent: ["website to MCP", "turn website into MCP server", "browser MCP tools"],
    intro:
      "Not every useful tool starts with an API spec. Some workflows live behind public pages, dashboards, docs, forms, or browser flows. Website-to-MCP turns those surfaces into agent-ready tools when an API is missing or incomplete.",
    sections: [
      {
        heading: "What website-to-MCP is good for",
        body: [
          "Website-to-MCP is useful for discovery, search, lightweight browser automation, documentation retrieval, and early workflow mapping. It helps teams learn what an agent should do before a clean API contract exists.",
          "It is especially helpful for tools where the real user journey is visual: open a page, inspect content, fill a form, confirm a result, and report what happened.",
        ],
      },
      {
        heading: "Where teams need caution",
        body: [
          "Browser tools can be powerful, but they should not become a blank check. Production agents need limits around credentials, allowed domains, actions that change state, and evidence returned to the user.",
          "Astrail labels browser-backed runtime behavior separately from mapped API execution so teams can see what kind of tool they are installing.",
        ],
      },
      {
        heading: "The path to production",
        body: [
          "Use website-to-MCP to explore the workflow, then graduate stable actions into mapped endpoints or reviewed skills. That gives you the speed of browser discovery without pretending every browser step is ready for production.",
          "The best agent tools are boring in the right way: explicit inputs, clear auth, observable calls, and no mystery side effects.",
        ],
      },
    ],
    faq: [
      {
        question: "Can a website become an MCP server?",
        answer: "Yes. Astrail can turn public websites and browser-backed workflows into MCP candidates, then separate those from direct API-backed tools.",
      },
      {
        question: "Is website-to-MCP safe for production?",
        answer: "It can be, but only with clear boundaries. Use reviewed domains, credentials, runtime logs, and approval gates for state-changing actions.",
      },
    ],
  },
  {
    slug: "how-to-generate-mcp-server-from-openapi-docs",
    title: "How to generate an MCP server from OpenAPI docs",
    description:
      "A practical workflow for turning OpenAPI docs into an MCP server an AI agent can discover, call, and debug.",
    date: "2026-06-25",
    readingTime: "7 min read",
    category: "OpenAPI",
    cover: "/blog/openapi-to-mcp.svg",
    icon: "/app-icons/openapi.svg",
    searchIntent: [
      "how to generate MCP server from OpenAPI docs",
      "generate MCP from API docs",
      "OpenAPI docs to MCP",
    ],
    intro:
      "If you are asking an AI coding agent how to generate MCP from OpenAPI docs, the shortest useful answer is: use the spec as source material, generate a narrow MCP surface, review the risky operations, then host the endpoint where your agent can call it.",
    sections: [
      {
        heading: "Start with the best source",
        body: [
          "A direct OpenAPI JSON or YAML file is better than prose docs because it includes routes, methods, parameters, request bodies, response shapes, and auth schemes. Swagger UI and Redoc pages are also good if the underlying spec is reachable.",
          "Astrail can start from those sources and produce a hosted MCP endpoint instead of asking the model to invent HTTP calls from copied documentation.",
        ],
      },
      {
        heading: "Generate, then reduce",
        body: [
          "The first generated pass should be treated as a candidate surface. Remove duplicate names, hide private or destructive operations, and make sure required parameters are obvious to the agent.",
          "For very large APIs, avoid flooding the client with hundreds of tools. Use docs search plus constrained execution so the agent can find the method it needs without loading the entire API into context.",
        ],
      },
      {
        heading: "Verify before connecting real agents",
        body: [
          "Test initialize, tools/list, one safe read call, one validation failure, and one missing-auth path. The server should return structured evidence rather than vague upstream errors.",
          "Astrail keeps trace ids, runtime mode, auth-required states, permission denials, and logs visible so a failed agent answer can be traced back to the exact call.",
        ],
      },
    ],
    faq: [
      {
        question: "What is the fastest way to generate MCP from OpenAPI docs?",
        answer:
          "Use Astrail to paste an OpenAPI, Swagger, Redoc, YAML, or JSON docs URL, review the generated tools, and host the resulting MCP endpoint.",
      },
      {
        question: "Can I ask Codex or ChatGPT to build this by hand?",
        answer:
          "You can, but a generator is faster when you need schemas, auth states, logs, hosted endpoints, and SDK exports instead of one-off scaffold code.",
      },
    ],
  },
  {
    slug: "best-mcp-generator-for-api-docs",
    title: "Best MCP generator for API docs: what to look for",
    description:
      "A checklist for choosing an MCP generator that turns API docs into reliable agent tools instead of brittle demos.",
    date: "2026-06-25",
    readingTime: "6 min read",
    category: "MCP",
    cover: "/blog/mcp-server-guide.svg",
    icon: "/brand/astrail-prism-icon.svg",
    searchIntent: [
      "best MCP generator for API docs",
      "MCP server generator",
      "API docs to MCP generator",
    ],
    intro:
      "The best MCP generator is not the one that produces the biggest tool list. It is the one that turns messy API reality into a small, reviewable, observable surface an agent can use without guessing.",
    sections: [
      {
        heading: "Look for source flexibility",
        body: [
          "Most teams have a mix of OpenAPI specs, Swagger pages, public docs, internal endpoint maps, and workflows that live outside formal docs. A useful generator should handle more than one perfect input.",
          "Astrail supports OpenAPI, Swagger, Redoc, YAML, JSON, public websites, presets, and workflow descriptions so teams can start from the best available source.",
        ],
      },
      {
        heading: "Look for review controls",
        body: [
          "Generated tools need human review before they become production agent actions. Check whether you can inspect tool names, schemas, auth requirements, destructive methods, and visibility.",
          "Astrail separates public and private surfaces, returns auth-required and permission-denied states, and keeps runtime evidence attached to calls.",
        ],
      },
      {
        heading: "Look for an ownership path",
        body: [
          "A hosted endpoint is fastest for testing, but durable integrations often need code, docs, tests, manifests, and CI workflows in the team repo.",
          "That is why Astrail pairs hosted MCP with SDK Factory exports. Teams can prove behavior first, then own the generated assets when the integration matters.",
        ],
      },
    ],
    faq: [
      {
        question: "What should an MCP generator produce?",
        answer:
          "It should produce hosted endpoints, tool schemas, docs, client setup, auth states, logs, and ideally SDK exports, not just function stubs.",
      },
      {
        question: "Is Astrail an MCP generator for API docs?",
        answer:
          "Yes. Astrail turns API docs, OpenAPI specs, Swagger pages, websites, presets, and workflows into hosted MCP servers and SDK bundles.",
      },
    ],
  },
  {
    slug: "swagger-to-mcp-checklist",
    title: "Swagger to MCP checklist before agents call your API",
    description:
      "What to verify when converting Swagger or OpenAPI docs into MCP tools for Claude, ChatGPT, Cursor, or internal agents.",
    date: "2026-06-25",
    readingTime: "6 min read",
    category: "Swagger",
    cover: "/blog/openapi-to-mcp.svg",
    icon: "/app-icons/swagger.svg",
    searchIntent: ["Swagger to MCP", "Swagger MCP generator", "convert Swagger to MCP server"],
    intro:
      "Swagger docs can become MCP tools quickly, but speed is only useful if the generated server is understandable and safe for agents. Use this checklist before exposing the endpoint.",
    sections: [
      {
        heading: "Spec quality",
        body: [
          "Check operation ids, summaries, required parameters, examples, response schemas, auth schemes, pagination, and error responses. These fields become the language the agent uses to choose and call tools.",
          "If the Swagger page is only partial or stale, generate a candidate server but keep it in review until the missing behavior is documented.",
        ],
      },
      {
        heading: "Runtime safety",
        body: [
          "Mark write and destructive actions clearly, keep private routes behind bearer auth, and require provider credentials at runtime rather than in prompts.",
          "Astrail should return structured states for auth_required, permission_denied, validation_failed, and mapping_required so clients can recover cleanly.",
        ],
      },
      {
        heading: "Client fit",
        body: [
          "Test the endpoint with the client or bridge you intend to use. Confirm it can call hosted HTTP JSON-RPC, send auth headers if needed, and display structured errors.",
          "For large Swagger specs, prefer Code Mode or docs search rather than exposing every operation as an always-active tool.",
        ],
      },
    ],
    faq: [
      {
        question: "Can Swagger docs become an MCP server?",
        answer:
          "Yes. Astrail can generate MCP servers from Swagger UI pages and the OpenAPI specs behind them.",
      },
      {
        question: "What is the biggest Swagger-to-MCP mistake?",
        answer:
          "Exposing every operation without review. Large or risky APIs need filtering, auth, policy, and observability before agents use them.",
      },
    ],
  },
];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}
