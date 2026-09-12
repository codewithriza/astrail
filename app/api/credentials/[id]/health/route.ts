import { NextResponse } from "next/server";
import { decryptCredential, hasCredentialEncryptionKey } from "@/lib/credentials";
import { providerTemplate } from "@/lib/provider-templates";
import { readBoundedResponseText } from "@/lib/runtime/network-policy";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient } from "@/lib/neon/server";
import { z } from "zod";

export const runtime = "nodejs";
export async function POST(_: Request, props: { params: Promise<{ id:string }> }) {
  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({error:"Valid connection ID required."},{status:400});
  if (!hasServerNeonEnv() || !hasCredentialEncryptionKey()) return NextResponse.json({health:"preview",preview:true});
  const session = await createServerNeonClient(); const {data:userData}=await session.auth.getUser();
  if (!userData.user) return NextResponse.json({error:"Authentication required."},{status:401});
  const admin=createAdminClient(); const {data,error}=await admin.from("api_credentials")
    .select("id,user_id,provider,access_token_ciphertext,secret_ciphertext,scopes,expected_scopes,connect_status,consecutive_refresh_failures")
    .eq("id",id).eq("user_id",userData.user.id).maybeSingle();
  if (error || !data) return NextResponse.json({error:error?.message??"Connection not found."},{status:error?500:404});
  const template=providerTemplate(data.provider); if (!template) return NextResponse.json({error:"Health checks require a verified provider template."},{status:409});
  const token=decryptCredential(data.access_token_ciphertext??data.secret_ciphertext);
  const url=new URL(template.healthUrl); const headers:Record<string,string>={accept:"application/json",authorization:`Bearer ${token}`};
  let response:Response;
  try { response=await fetch(url,{headers,redirect:"error",signal:AbortSignal.timeout(10_000)}); await readBoundedResponseText(response,64_000,"Provider health response"); }
  catch { return NextResponse.json({error:"Provider health check failed transiently; the grant was not marked revoked."},{status:502}); }
  const granted=Array.isArray(data.scopes)?data.scopes.filter((x):x is string=>typeof x==="string"):[];
  const expected=Array.isArray(data.expected_scopes)?data.expected_scopes.filter((x):x is string=>typeof x==="string"):[];
  const missing=expected.filter((scope)=>!granted.includes(scope)); const revoked=response.status===401 || response.status===403;
  const health=revoked?"revoked":missing.length?"scope_drift":Number(data.consecutive_refresh_failures)>=3?"degraded":"healthy";
  await admin.from("api_credentials").update({health_status:health,health_checked_at:new Date().toISOString(),...(revoked?{connect_status:"reauth_required",provider_revoked_at:new Date().toISOString(),reconnect_reason:"Provider rejected the stored grant."}:{})}).eq("id",id).eq("user_id",userData.user.id);
  if (health!=="healthy") await admin.from("provider_alerts").insert({user_id:userData.user.id,credential_id:id,severity:revoked?"critical":"warning",code:health,message:revoked?`${template.name} rejected this grant. Reconnect it.`:`${template.name} connection needs attention (${health.replaceAll("_"," ")}).`});
  return NextResponse.json({health,provider:template.id,scope_drift:{expected,granted,missing},revoked,reconnect:health!=="healthy"?template.reconnectHelp:null});
}
