export type UseCaseSection = {
  heading: string;
  body: string[];
};

export type UseCasePage = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  category: string;
  audience: string;
  promise: string;
  heroPoints: string[];
  workflow: string[];
  sections: UseCaseSection[];
  proofPoints: string[];
  faq: { question: string; answer: string }[];
  related: string[];
};

export const useCasePages: UseCasePage[] = [
  {
    slug: "mcp-for-saas-apis",
    title: "MCP for SaaS APIs",
    shortTitle: "SaaS APIs",
    description:
      "Turn SaaS APIs into hosted MCP tools with reviewed endpoint maps, auth boundaries, SDK exports, and runtime logs for AI agents.",
    category: "SaaS",
    audience: "Product and platform teams exposing customer-facing APIs to agents.",
    promise: "Give agents a narrow, observable path into your SaaS API without asking every customer to build custom glue.",
    heroPoints: [
      "Convert OpenAPI or docs-backed SaaS endpoints into agent-ready tools.",
      "Keep destructive or tenant-scoped actions behind explicit credentials and review.",
      "Export owned SDK bundles when customers need code, CI, and package ownership.",
    ],
    workflow: [
      "Import the OpenAPI spec or docs URL.",
      "Review generated tool names, scopes, auth requirements, and response shapes.",
      "Connect Claude, Cursor, ChatGPT, or a custom agent to the hosted MCP endpoint.",
      "Watch tool calls, errors, latency, and credential states before expanding access.",
    ],
    sections: [
      {
        heading: "Why SaaS APIs need an MCP layer",
        body: [
          "SaaS APIs are usually built for developers reading reference docs, not for agents deciding which action to call in the middle of a task. MCP gives the agent a concise catalog of tools, schemas, and runtime feedback.",
          "The important work is not dumping every endpoint into a prompt. It is choosing stable names, hiding unsafe routes, representing auth clearly, and giving the agent enough context to recover from normal API errors.",
        ],
      },
      {
        heading: "What Astrail generates",
        body: [
          "Astrail can turn SaaS API contracts into hosted MCP endpoints with tool metadata, endpoint maps, credential requirements, docs search, and execution paths. Teams can start hosted, then export SDK bundles when they want generated clients and tests in their own repo.",
          "This keeps the agent surface close to the API source of truth. When the API changes, the MCP server and SDK bundle can be regenerated and reviewed instead of drifting through handwritten adapters.",
        ],
      },
      {
        heading: "Operational guardrails",
        body: [
          "For multi-tenant SaaS products, the agent boundary has to be boring on purpose: tenant credentials, scoped API keys, clear rate limits, and logs that show which upstream call ran.",
          "Astrail is designed around that review path. The useful default is a small approved tool set, observable calls, and expansion only when the workflow proves it needs more API surface.",
        ],
      },
    ],
    proofPoints: ["OpenAPI import", "Hosted MCP endpoint", "Credential-aware tools", "SDK export"],
    faq: [
      {
        question: "Should every SaaS API endpoint become an MCP tool?",
        answer:
          "Usually no. Start with the workflows agents actually need, then add searchable endpoint discovery or reviewed tools for the rest.",
      },
      {
        question: "Can customers use the generated tools in their own agent stack?",
        answer:
          "Yes. They can connect to the hosted MCP endpoint, and teams can export SDK-style bundles when customers need code ownership.",
      },
    ],
    related: ["enterprise-api-catalogs", "mcp-for-devtools-apis", "mcp-for-workflow-automation"],
  },
  {
    slug: "mcp-for-internal-tools",
    title: "MCP for internal tools",
    shortTitle: "Internal tools",
    description:
      "Use MCP to give internal AI agents controlled access to admin APIs, dashboards, and operational workflows without broad application access.",
    category: "Operations",
    audience: "Internal platform, IT, RevOps, and engineering teams.",
    promise: "Let agents complete repetitive internal work while preserving review, auth, and audit boundaries.",
    heroPoints: [
      "Expose only the admin actions an internal agent needs.",
      "Separate read-only lookup tools from state-changing operations.",
      "Keep every tool call inspectable through logs and structured errors.",
    ],
    workflow: [
      "Map the internal workflow and identify the minimum API surface.",
      "Generate read tools first, then add gated write tools.",
      "Attach service credentials or user-scoped credentials where required.",
      "Review call logs before widening the tool catalog.",
    ],
    sections: [
      {
        heading: "Internal tools are a natural agent surface",
        body: [
          "Many internal workflows are structured but annoying: look up an account, check usage, update a status, open a ticket, notify a channel, and write a note. Agents can help, but only if the tool boundary is narrower than the internal app itself.",
          "MCP is useful because it turns those operations into named tools with explicit inputs. The agent no longer needs broad dashboard access or improvised browser steps for every task.",
        ],
      },
      {
        heading: "Design the catalog around risk",
        body: [
          "Read-only tools should be easy to call and easy to verify. Write tools should be named clearly, require the right credentials, and return evidence of what changed.",
          "Astrail supports this pattern by representing auth states, runtime behavior, and endpoint metadata alongside the generated tools, so reviewers can tell what an agent is actually allowed to do.",
        ],
      },
      {
        heading: "From dashboard task to API-backed tool",
        body: [
          "If an internal workflow already has an API, start from that contract. If it only exists as pages and forms, use website-to-MCP style discovery to learn the flow, then graduate stable actions into reviewed API-backed tools.",
          "That path keeps early experiments fast without treating fragile browser automation as the final production surface.",
        ],
      },
    ],
    proofPoints: ["Read/write separation", "Runtime logs", "Scoped credentials", "Website-to-MCP discovery"],
    faq: [
      {
        question: "Can MCP replace an internal admin dashboard?",
        answer:
          "Not completely. MCP is best for repeatable workflows where an agent needs a constrained action surface, while the dashboard remains the human review surface.",
      },
      {
        question: "How should teams start?",
        answer:
          "Start with read-only lookup tools and one high-volume workflow. Add write actions after logs and review show the agent is choosing tools reliably.",
      },
    ],
    related: ["mcp-for-workflow-automation", "mcp-for-support-helpdesk-apis", "enterprise-api-catalogs"],
  },
  {
    slug: "mcp-for-fintech-apis",
    title: "MCP for fintech APIs",
    shortTitle: "Fintech APIs",
    description:
      "Wrap fintech APIs for AI agents with tight auth boundaries, explicit schemas, audit-friendly logs, and careful separation of read and write tools.",
    category: "Fintech",
    audience: "Fintech platform, risk, operations, and developer-experience teams.",
    promise: "Make financial workflows agent-accessible without turning sensitive API access into a free-form prompt problem.",
    heroPoints: [
      "Model balances, transactions, customers, disputes, and payouts as explicit tools.",
      "Keep money movement and sensitive mutations behind credentials and approval flows.",
      "Return structured evidence that risk and operations teams can audit.",
    ],
    workflow: [
      "Import the fintech API contract and classify sensitive endpoints.",
      "Generate read tools for lookup, reconciliation, and support workflows.",
      "Gate write tools by credential state, role, and review policy.",
      "Use logs and trace IDs to reconcile agent actions with upstream API calls.",
    ],
    sections: [
      {
        heading: "Fintech agents need precision more than breadth",
        body: [
          "A fintech API can contain harmless lookup endpoints next to actions that move money, change customer state, or expose sensitive records. Agents should not see that entire surface as one flat tool list.",
          "A useful MCP layer classifies endpoints by workflow and risk. Balance lookup, transaction search, dispute inspection, payout review, and customer updates should each have explicit schemas and clear runtime states.",
        ],
      },
      {
        heading: "Auditability is part of the product",
        body: [
          "Financial operations teams need to know which upstream API call ran, what inputs were supplied, what credentials were used, and what result came back. A generic tool wrapper is not enough.",
          "Astrail-generated MCP endpoints are built to expose structured errors, auth-required states, and runtime details so agent behavior can be reviewed after the fact.",
        ],
      },
      {
        heading: "Keep write actions deliberate",
        body: [
          "The safest first fintech use cases are read-heavy: support lookup, reconciliation, risk review, and documentation search. Mutations should be added only when the action is narrow, reversible or reviewable, and backed by the right credentials.",
          "That lets teams prove value quickly while avoiding the obvious mistake: giving an agent broad financial API power before the workflow is mature.",
        ],
      },
    ],
    proofPoints: ["Sensitive endpoint review", "Auth-required states", "Traceable calls", "Read-heavy launch path"],
    faq: [
      {
        question: "Is MCP safe for fintech workflows?",
        answer:
          "It can be, when the MCP layer is scoped, credential-aware, observable, and designed around explicit review of sensitive actions.",
      },
      {
        question: "What fintech workflows should use MCP first?",
        answer:
          "Start with account lookup, transaction search, dispute triage, reconciliation, and docs search before adding money movement or irreversible writes.",
      },
    ],
    related: ["mcp-for-support-helpdesk-apis", "mcp-for-data-apis", "enterprise-api-catalogs"],
  },
  {
    slug: "mcp-for-ecommerce-apis",
    title: "MCP for ecommerce APIs",
    shortTitle: "Ecommerce APIs",
    description:
      "Generate MCP tools for ecommerce APIs so agents can search products, inspect orders, handle returns, and support customers through controlled API calls.",
    category: "Ecommerce",
    audience: "Commerce engineering, support operations, and marketplace teams.",
    promise: "Give agents reliable tools for product, order, fulfillment, and returns workflows without broad store-admin access.",
    heroPoints: [
      "Expose catalog, order, customer, fulfillment, and return actions as typed tools.",
      "Separate safe lookup from refunds, cancellations, inventory changes, and write actions.",
      "Connect helpdesk and commerce data through one agent-facing workflow.",
    ],
    workflow: [
      "Generate tools from commerce API docs or an OpenAPI spec.",
      "Approve catalog and order lookup tools first.",
      "Add return, refund, and fulfillment actions with credential checks.",
      "Use call logs to verify what the agent changed for each customer request.",
    ],
    sections: [
      {
        heading: "Commerce support is a tool-selection problem",
        body: [
          "A customer asks where an order is, whether an item can be returned, or why a refund has not arrived. The agent needs to call the right commerce APIs, not browse admin pages or guess from stale docs.",
          "MCP turns product search, order lookup, shipment inspection, customer search, and return-policy actions into explicit tools the agent can choose from.",
        ],
      },
      {
        heading: "Keep risky actions separate",
        body: [
          "Refunds, cancellations, price changes, inventory edits, and fulfillment overrides should not sit beside read-only lookup tools with the same level of friction.",
          "Astrail helps teams represent those differences through tool metadata, auth requirements, and runtime behavior, so the agent can support customers without receiving unlimited admin power.",
        ],
      },
      {
        heading: "Join ecommerce and support context",
        body: [
          "The strongest ecommerce workflows combine helpdesk context with commerce data: ticket summary, customer history, order state, shipment evidence, and a suggested next action.",
          "An MCP layer can expose each system as a tool while keeping the agent orchestration in one place.",
        ],
      },
    ],
    proofPoints: ["Order lookup tools", "Return workflows", "Credential gating", "Helpdesk integration"],
    faq: [
      {
        question: "Can MCP connect to Shopify-style commerce APIs?",
        answer:
          "Yes. Commerce APIs with documented endpoints or specs are strong candidates for generated MCP tools.",
      },
      {
        question: "Should agents issue refunds directly?",
        answer:
          "Only after the refund action is narrowly scoped, credential-gated, logged, and aligned with the team's approval policy.",
      },
    ],
    related: ["mcp-for-support-helpdesk-apis", "mcp-for-workflow-automation", "mcp-for-saas-apis"],
  },
  {
    slug: "mcp-for-support-helpdesk-apis",
    title: "MCP for support and helpdesk APIs",
    shortTitle: "Support APIs",
    description:
      "Use MCP to let AI agents search tickets, summarize customer history, draft replies, and update support systems through reviewed helpdesk API tools.",
    category: "Support",
    audience: "Support engineering, CX operations, and AI support teams.",
    promise: "Move agents from passive answer generation to controlled support operations with ticket, customer, and escalation tools.",
    heroPoints: [
      "Expose ticket search, customer lookup, macro retrieval, and status updates.",
      "Return evidence from source systems instead of ungrounded support answers.",
      "Use logs to review which customer records and tickets the agent touched.",
    ],
    workflow: [
      "Import the helpdesk API and map common support intents.",
      "Generate tools for search, read, summarize, and draft workflows.",
      "Add update actions for tags, priority, assignment, and internal notes.",
      "Gate external replies and sensitive customer changes behind review.",
    ],
    sections: [
      {
        heading: "Support agents need source-backed actions",
        body: [
          "Answering a customer from memory is rarely enough. A useful support agent needs to inspect tickets, customer records, orders, incidents, policies, and prior conversations.",
          "MCP gives those actions a stable shape. The agent can search, read, update, and draft through named tools instead of relying on brittle prompt instructions.",
        ],
      },
      {
        heading: "Design for escalation and review",
        body: [
          "The right support MCP catalog separates internal actions from customer-visible actions. Searching tickets and adding internal notes can be low risk; sending replies, issuing credits, or changing account status needs stronger policy.",
          "Astrail-generated metadata gives teams a place to encode those boundaries and inspect actual runtime behavior before expanding automation.",
        ],
      },
      {
        heading: "Connect support to the rest of the stack",
        body: [
          "Most support workflows cross systems. The helpdesk has the ticket, the billing system has subscription state, the commerce platform has order state, and the incident tool has reliability context.",
          "MCP lets each API become an agent-facing tool while keeping the workflow coherent for the user.",
        ],
      },
    ],
    proofPoints: ["Ticket search", "Customer history", "Reply review", "Cross-system tools"],
    faq: [
      {
        question: "Can MCP help support agents take action, not just answer questions?",
        answer:
          "Yes. MCP tools can search tickets, retrieve customer data, update fields, add notes, and call other support-adjacent APIs through controlled actions.",
      },
      {
        question: "What should stay human-reviewed?",
        answer:
          "Customer-visible replies, credits, refunds, account changes, and sensitive escalations should usually remain reviewed until the workflow is proven.",
      },
    ],
    related: ["mcp-for-ecommerce-apis", "mcp-for-fintech-apis", "mcp-for-workflow-automation"],
  },
  {
    slug: "mcp-for-devtools-apis",
    title: "MCP for devtools APIs",
    shortTitle: "Devtools APIs",
    description:
      "Give coding agents controlled access to devtools APIs for issues, repos, builds, deployments, observability, incidents, and engineering workflows.",
    category: "Devtools",
    audience: "Developer tools, platform engineering, and AI coding assistant teams.",
    promise: "Let coding agents inspect and operate engineering systems through typed, reviewable API tools.",
    heroPoints: [
      "Wrap GitHub, CI, deployment, observability, and incident APIs as agent tools.",
      "Keep destructive engineering actions explicit and logged.",
      "Export SDK bundles for teams that want generated clients in their own infrastructure.",
    ],
    workflow: [
      "Generate tools from devtools API specs or docs.",
      "Prioritize read tools for repositories, issues, logs, deploys, and incidents.",
      "Add write tools for comments, tickets, rollbacks, and workflow triggers with clear scopes.",
      "Connect the hosted endpoint to coding agents and internal automation.",
    ],
    sections: [
      {
        heading: "Coding agents need better tools than shell access",
        body: [
          "Engineering work often spans issue trackers, repositories, CI, deployment platforms, logs, feature flags, and incidents. A coding agent can help more when it has structured tools for those systems.",
          "MCP gives the agent stable API-backed actions instead of broad shell permissions or copy-pasted docs.",
        ],
      },
      {
        heading: "Use read tools to improve context",
        body: [
          "The first win is context: find related issues, inspect failing checks, read deployment history, search logs, and summarize incident status. These tools make agents more accurate without giving them power to change production.",
          "Astrail can generate those tools from API contracts and expose docs search or endpoint lookup when the catalog is too large for a flat tool list.",
        ],
      },
      {
        heading: "Make write tools intentionally boring",
        body: [
          "Actions like rerun workflow, create issue, comment on pull request, trigger deploy, or rollback should be narrow and observable. The agent should know exactly what changed and return evidence.",
          "That is where MCP is stronger than one-off scripts: the tool definition, credentials, and runtime logs live together.",
        ],
      },
    ],
    proofPoints: ["CI and repo tools", "Observability APIs", "Incident workflows", "SDK exports"],
    faq: [
      {
        question: "Can MCP connect coding agents to engineering tools?",
        answer:
          "Yes. Devtools APIs are a strong fit for MCP because they have structured operations and clear read/write boundaries.",
      },
      {
        question: "Should coding agents get deployment tools?",
        answer:
          "Only through narrow, credential-scoped actions with logging and the team's normal approval or rollback policy.",
      },
    ],
    related: ["mcp-for-saas-apis", "mcp-for-data-apis", "enterprise-api-catalogs"],
  },
  {
    slug: "mcp-for-data-apis",
    title: "MCP for data APIs",
    shortTitle: "Data APIs",
    description:
      "Expose analytics, warehouse, BI, and product data APIs to AI agents through MCP tools with schema discovery, scoped reads, and audit-friendly runtime output.",
    category: "Data",
    audience: "Data platform, analytics engineering, and operations teams.",
    promise: "Help agents answer operational questions from governed data APIs without handing them unrestricted database access.",
    heroPoints: [
      "Model datasets, reports, metrics, and query endpoints as typed tools.",
      "Keep access scoped to approved APIs instead of raw production databases.",
      "Return source metadata and traceable results for review.",
    ],
    workflow: [
      "Import data API contracts, report endpoints, or internal metric APIs.",
      "Generate tools for schema lookup, metric retrieval, and filtered reads.",
      "Constrain parameters, result sizes, and credentials.",
      "Use logs and source links to review how the answer was produced.",
    ],
    sections: [
      {
        heading: "Agents need governed data access",
        body: [
          "Business users want agents to answer questions about customers, revenue, product usage, support load, and operations. Raw database access is rarely the right starting point.",
          "Data APIs give teams a governed interface. MCP turns those APIs into tools with explicit parameters, result shapes, and runtime feedback.",
        ],
      },
      {
        heading: "Prevent vague query behavior",
        body: [
          "The dangerous version of a data agent invents SQL, pulls too much data, or fails silently when a metric is unavailable. A better tool asks for a known metric, report, customer, date range, or dimension.",
          "Astrail-generated tools can represent those inputs directly, plus docs search for metric definitions when the agent needs context.",
        ],
      },
      {
        heading: "Make answers reviewable",
        body: [
          "Data answers are only useful when the user can see where they came from. Tool output should include enough source metadata, timestamps, filters, and trace IDs to verify the result.",
          "That makes MCP a useful boundary between conversational analysis and the governed data systems teams already trust.",
        ],
      },
    ],
    proofPoints: ["Metric tools", "Scoped reads", "Docs search", "Traceable outputs"],
    faq: [
      {
        question: "Is MCP a replacement for a BI tool?",
        answer:
          "No. MCP is a controlled agent interface to data APIs and reports. BI remains the human exploration and governance surface.",
      },
      {
        question: "Should agents query production databases directly?",
        answer:
          "Usually no. Start with governed APIs, read replicas, metric endpoints, or report exports with constrained parameters.",
      },
    ],
    related: ["mcp-for-fintech-apis", "mcp-for-devtools-apis", "enterprise-api-catalogs"],
  },
  {
    slug: "mcp-for-workflow-automation",
    title: "MCP for workflow automation",
    shortTitle: "Workflow automation",
    description:
      "Use MCP to turn multi-step business workflows into agent tools that can call APIs, inspect websites, update systems, and return evidence.",
    category: "Automation",
    audience: "Operations, platform, RevOps, and automation teams.",
    promise: "Move beyond brittle zaps by giving agents reviewed tools for the systems involved in a workflow.",
    heroPoints: [
      "Combine API-backed tools, website discovery, and generated SDKs.",
      "Represent each step with inputs, auth, and structured output.",
      "Keep state-changing actions visible through logs and review policy.",
    ],
    workflow: [
      "Describe the workflow and identify the systems involved.",
      "Generate MCP tools from APIs, docs, or public website surfaces.",
      "Test the agent on read-heavy and low-risk paths first.",
      "Add write actions only where evidence, permissions, and rollback are clear.",
    ],
    sections: [
      {
        heading: "Workflow automation needs context and judgment",
        body: [
          "Classic automation works well when every step is deterministic. Many business workflows are messier: inspect a record, decide which case applies, call two APIs, update a ticket, and explain what happened.",
          "MCP gives an agent the tools for those steps while preserving the structure automation teams need: schemas, auth, logs, and explicit runtime results.",
        ],
      },
      {
        heading: "API-first, browser-when-needed",
        body: [
          "The most reliable automations use APIs for stable actions. Browser-backed website tools are useful for discovery, public data, or workflows where an API is missing.",
          "Astrail supports both inputs, but the production path should graduate important state-changing work into reviewed API-backed tools whenever possible.",
        ],
      },
      {
        heading: "Build workflows as a catalog",
        body: [
          "A strong workflow automation system is not one giant tool. It is a catalog of small tools the agent can compose: lookup, validate, create, update, notify, and report.",
          "That makes failures easier to debug and lets teams expand capability without losing control of the overall system.",
        ],
      },
    ],
    proofPoints: ["Multi-system workflows", "API and website inputs", "Structured outputs", "Reviewable writes"],
    faq: [
      {
        question: "How is MCP different from traditional workflow automation?",
        answer:
          "MCP gives agents a structured tool catalog they can choose from dynamically, while traditional automation usually follows a fixed trigger-and-action path.",
      },
      {
        question: "Can MCP call multiple systems in one workflow?",
        answer:
          "Yes. Each system can be exposed as a tool surface, and the agent can compose those calls under the orchestration policy you define.",
      },
    ],
    related: ["mcp-for-internal-tools", "mcp-for-support-helpdesk-apis", "mcp-for-ecommerce-apis"],
  },
  {
    slug: "enterprise-api-catalogs",
    title: "MCP for enterprise API catalogs",
    shortTitle: "Enterprise catalogs",
    description:
      "Turn large enterprise API catalogs into searchable, reviewable MCP surfaces so agents can discover the right endpoint without loading every tool at once.",
    category: "Enterprise",
    audience: "Enterprise platform, API governance, and developer-experience teams.",
    promise: "Make sprawling API catalogs usable by agents through search, schema inspection, credentials, and reviewed execution.",
    heroPoints: [
      "Use catalog search and schema lookup instead of huge flat tool lists.",
      "Preserve ownership, auth, and review metadata for each endpoint group.",
      "Export SDK and manifest artifacts for teams that need internal ownership.",
    ],
    workflow: [
      "Import one or more API specs, docs sources, or generated endpoint catalogs.",
      "Normalize endpoints by product area, owner, auth mode, and risk level.",
      "Expose search and detail tools so agents can find the right action.",
      "Approve execution routes and export SDK bundles for owned deployment paths.",
    ],
    sections: [
      {
        heading: "Large catalogs break flat tool lists",
        body: [
          "Enterprise API catalogs can contain hundreds or thousands of endpoints across teams. Loading all of that into an agent as individual tools is slow, confusing, and difficult to govern.",
          "A better MCP design uses search, schema inspection, and reviewed execution. The agent asks what exists, narrows to the relevant endpoint, then calls an approved action.",
        ],
      },
      {
        heading: "Governance metadata matters",
        body: [
          "Enterprise APIs need owner, auth mode, environment, sensitivity, SLA, and deprecation context. Agents need some of that context too, or they will choose tools that technically exist but should not be used for the task.",
          "Astrail can keep endpoint maps, generated docs, manifests, and SDK exports connected so the agent surface remains tied to the catalog teams already maintain.",
        ],
      },
      {
        heading: "Roll out by workflow, not by catalog size",
        body: [
          "The safest launch path is not to expose the entire enterprise catalog at once. Pick a workflow, approve the endpoint subset, test it, then expand by adjacent workflows.",
          "That gives API governance teams a way to ship agent access without losing the review discipline they already need.",
        ],
      },
    ],
    proofPoints: ["Catalog search", "Schema inspection", "Endpoint ownership", "SDK and manifest exports"],
    faq: [
      {
        question: "Can MCP handle very large API catalogs?",
        answer:
          "Yes, but large catalogs should use search and schema lookup patterns instead of exposing every endpoint as a flat tool list.",
      },
      {
        question: "How should enterprises roll out MCP?",
        answer:
          "Roll out by reviewed workflow and endpoint group. Keep ownership, auth, and risk metadata visible before expanding the catalog.",
      },
    ],
    related: ["mcp-for-saas-apis", "mcp-for-devtools-apis", "mcp-for-data-apis"],
  },
];

export function getUseCasePage(slug: string) {
  return useCasePages.find((page) => page.slug === slug);
}

export function getRelatedUseCases(page: UseCasePage) {
  return page.related
    .map((slug) => getUseCasePage(slug))
    .filter((item): item is UseCasePage => Boolean(item));
}
