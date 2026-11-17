import { NextResponse } from "next/server";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient } from "@/lib/neon/server";
export async function GET(){
 if(!hasServerNeonEnv())return NextResponse.json({metrics:[],totals:{retry:0,throttle:0,queue:0,circuit:0,provider_error:0},preview:true});
 const session=await createServerNeonClient();const {data}=await session.auth.getUser();if(!data.user)return NextResponse.json({error:"Authentication required."},{status:401});
 const result=await createAdminClient().from("reliability_metrics").select("provider,credential_id,metric,value,recorded_at").eq("tenant_id",data.user.id).gte("recorded_at",new Date(Date.now()-86_400_000).toISOString()).order("recorded_at",{ascending:false}).limit(1000);
 if(result.error)return NextResponse.json({error:result.error.message},{status:500});const totals={retry:0,throttle:0,queue:0,circuit:0,provider_error:0};for(const row of result.data??[])totals[row.metric as keyof typeof totals]+=row.value;
 return NextResponse.json({metrics:result.data??[],totals,window:"24h"});
}
