// All brand-icon slugs rendered in the orbit, used to emit
// <link rel="preload"> tags from the root layout so icons start
// downloading in parallel with the HTML. Skips slugs that have
// inline SVGs (openai, slack, zed) — those don't hit the CDN.
export const ICON_CDN_ORIGIN = "https://cdn.simpleicons.org";

export const ICON_SLUGS: string[] = [
  // inner ring (8) — openai + slack are inline
  "swagger", "stripe", "github", "anthropic", "cursor", "notion",
  // middle ring (14) — zed is inline
  "linear", "figma", "supabase", "discord", "shopify", "vercel",
  "githubcopilot", "raycast", "airtable", "hubspot", "sentry",
  "postgresql", "gitlab",
  // outer ring (18)
  "intercom", "mailchimp", "mongodb", "cloudflare", "dropbox",
  "redis", "snowflake", "mixpanel", "replit", "elasticsearch",
  "digitalocean", "firebase", "netlify", "docker", "kubernetes",
  "circleci", "asana", "heroku",
];
