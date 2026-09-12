import { NextResponse } from "next/server";
import { providerTemplates } from "@/lib/provider-templates";
export async function GET() { return NextResponse.json({ templates: providerTemplates, policy: { client_registration:"pre_registered", public_client_flow:"authorization_code", pkce:"S256", dcr:false, cimd:false } }, { headers:{"cache-control":"public, max-age=300"} }); }
