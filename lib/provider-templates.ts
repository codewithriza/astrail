export type ProviderTemplate = {
  id: "github" | "slack" | "google" | "stripe" | "xero"; name: string; verifiedAt: string;
  authorizationUrl: string; tokenUrl: string; revocationUrl: string; healthUrl: string;
  defaultScopes: string[]; reconnectHelp: string; publicClientPkce: "S256";
};

export const providerTemplates: ProviderTemplate[] = [
  { id:"github",name:"GitHub",verifiedAt:"2026-07-18",authorizationUrl:"https://github.com/login/oauth/authorize",tokenUrl:"https://github.com/login/oauth/access_token",revocationUrl:"https://api.github.com/applications/{client_id}/grant",healthUrl:"https://api.github.com/user",defaultScopes:["read:user","repo"],reconnectHelp:"Reconnect and approve the repository access required by the selected tools.",publicClientPkce:"S256" },
  { id:"slack",name:"Slack",verifiedAt:"2026-07-18",authorizationUrl:"https://slack.com/oauth/v2/authorize",tokenUrl:"https://slack.com/api/oauth.v2.access",revocationUrl:"https://slack.com/api/auth.revoke",healthUrl:"https://slack.com/api/auth.test",defaultScopes:["channels:read","users:read"],reconnectHelp:"Reconnect the Slack workspace and ask an administrator to approve any newly required bot scopes.",publicClientPkce:"S256" },
  { id:"google",name:"Google",verifiedAt:"2026-07-18",authorizationUrl:"https://accounts.google.com/o/oauth2/v2/auth",tokenUrl:"https://oauth2.googleapis.com/token",revocationUrl:"https://oauth2.googleapis.com/revoke",healthUrl:"https://www.googleapis.com/oauth2/v3/tokeninfo",defaultScopes:["openid","email","profile"],reconnectHelp:"Reconnect the Google account and approve only the scopes needed by this integration.",publicClientPkce:"S256" },
  { id:"stripe",name:"Stripe",verifiedAt:"2026-07-18",authorizationUrl:"https://connect.stripe.com/oauth/authorize",tokenUrl:"https://connect.stripe.com/oauth/token",revocationUrl:"https://connect.stripe.com/oauth/deauthorize",healthUrl:"https://api.stripe.com/v1/account",defaultScopes:["read_only"],reconnectHelp:"Reconnect the Stripe account; use read-only unless write tools are explicitly required.",publicClientPkce:"S256" },
  { id:"xero",name:"Xero",verifiedAt:"2026-07-24",authorizationUrl:"https://login.xero.com/identity/connect/authorize",tokenUrl:"https://identity.xero.com/connect/token",revocationUrl:"https://identity.xero.com/connect/revocation",healthUrl:"https://api.xero.com/connections",defaultScopes:["offline_access"],reconnectHelp:"Reconnect the Xero organisation and approve offline access plus only the accounting scopes required by the selected tools.",publicClientPkce:"S256" },
];
export function providerTemplate(id: string | null | undefined) { return providerTemplates.find((item)=>item.id===id?.trim().toLowerCase()) ?? null; }
