/* All landing page copy lives here. */

export const links = {
  github: "https://github.com/codewithriza/astrail",
  docs: "/docs",
  example: "https://github.com/codewithriza/astrail/tree/main/examples/openapi-to-tools",
  limitations: "https://github.com/codewithriza/astrail#current-boundaries",
  discord: "https://discord.com/invite/2ThMPM2UWm",
  x: "https://x.com/getastrail",
  email: "hi@astrail.dev",
};

export const nav = [
  { label: "how it works", href: "#how-it-works", section: "how-it-works" },
  { label: "contact", href: "#contact", section: "contact" },
  { label: "docs", href: "/docs" },
  { label: "github", href: links.github, external: true },
];

export const hero = {
  eyebrow: "Open source. MIT licensed.",
  line1: "Your APIs.",
  line2: "Ready for",
  line2Accent: "agents.",
  intro:
    "Turn API definitions into MCP tools. Generate typed tools, define execution policies, and trace calls, all in one codebase you can run and change.",
  primary: "Get the code",
  secondary: "Read the docs",
  noteLeft: "Built by Riza and Aditya. Now yours to build on.",
  noteRight: "OpenAPI, Google Discovery, GraphQL and MCP in. Typed, governed agent tools out.",
  mascotLine: "beep! tap me",
};

export const mascotLines = ["kickflip!", "tools generated!", "one more?", "your api next?", "stay typed"];

export const marquee = {
  top: ["openapi", "graphql", "google discovery", "mcp", "typescript", "python", "cli"],
  bottom: ["mit licensed", "typed tools", "explicit policies", "traced calls", "self-hostable", "zero lock-in"],
};

export const howItWorks = {
  eyebrow: "start small",
  title: "One spec. Three tools.",
  accentFrom: 10,
  text: "The offline example generates tools from a Notes API definition and validates their policies. No account, database, or API key needed.",
  exampleLink: "Explore the example",
  terminal: {
    title: "quick_start.sh",
    label: "QUICK START",
    runtime: "Node.js 22.18+",
    code: `git clone https://github.com/codewithriza/astrail.git
cd astrail
npm ci
npm run demo:offline`,
    results: [
      { tool: "notes_list_notes", policy: "allow" },
      { tool: "notes_create_note", policy: "approval" },
      { tool: "notes_delete_note", policy: "block" },
    ],
    caption: "No upstream calls executed.",
  },
  levels: [
    {
      level: "01",
      stage: "generate",
      title: "Start with your API.",
      text: "Import OpenAPI, Google Discovery, GraphQL, or an existing HTTP MCP server.",
      icon: "spec",
    },
    {
      level: "02",
      stage: "control",
      title: "Make calls explicit.",
      text: "Endpoint maps, authentication, approvals, and network policies govern execution.",
      icon: "shield",
    },
    {
      level: "03",
      stage: "build",
      title: "Take it from here.",
      text: "A dashboard, CLI, TypeScript and Python clients, and the source to extend them.",
      icon: "blocks",
    },
  ],
  xpStart: "start your level 01",
  xpDone: "level complete! clone the repo",
};

export const contact = {
  eyebrow: "ready to ship?",
  title: "let's talk!",
  text: "Questions about the code, an API you want to turn into tools, or a deployment you are planning? Send us a note and a real human reads it.",
  docs: {
    window: "readme.md",
    title: "The code is open. The docs are here.",
    text: "Start with the offline example, then configure your own deployment. Persistent operation needs backend and authentication setup.",
    browse: "Browse documentation",
    limits: "Read current limitations",
  },
  mascotLine: "psst! fill the form",
  form: {
    window: "new_message.exe",
    roles: [
      { value: "developer", label: "developer" },
      { value: "buyer", label: "team lead / buyer" },
      { value: "workflow_owner", label: "workflow owner" },
    ],
    interests: ["openapi import", "graphql", "mcp proxy", "policies & approvals", "self-hosting", "sdks & cli"],
    note: "We only use your details to reply to you. No newsletters, no spam.",
    errors: {
      name: "Please tell us your name.",
      email: "Please enter a valid email address.",
      message: "Tell us a little more, at least 10 characters.",
      network: "We could not reach the server. Check your connection and try again.",
      fallback: "Something went wrong. Please try again in a moment.",
    },
    success: {
      title: "message received!",
      text: "Thanks for reaching out. We read every message and will get back to you soon.",
      again: "send another",
    },
  },
};

export const footer = {
  blurb: "Open-source tools that turn your APIs into typed, governed tools for AI agents.",
  explore: [
    { label: "how it works", href: "#how-it-works" },
    { label: "contact", href: "#contact" },
    { label: "documentation", href: "/docs" },
  ],
  community: [
    { label: "GitHub", href: links.github },
    { label: "Discord", href: "https://discord.com/invite/2ThMPM2UWm" },
    { label: "X", href: "https://x.com/getastrail" },
  ],
  sayHi: "Got a question or an API you want to try? The quickest way to reach the crew is the contact form.",
  license: "Astrail · MIT license",
  tagline: "Made with pixels, coffee and a lot of beeps.",
};
