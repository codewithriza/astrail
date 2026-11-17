import { NextResponse } from "next/server";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient } from "@/lib/neon/server";
import { z } from "zod";
export async function GET(_:Request,props:{params:Promise<{id:string}>}){
 const {id}=await props.params;if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:"Valid connection ID required."},{status:400});
 if(!hasServerNeonEnv())return NextResponse.json({events:[],alerts:[],preview:true});
 const session=await createServerNeonClient();const {data:userData}=await session.auth.getUser();if(!userData.user)return NextResponse.json({error:"Authentication required."},{status:401});
 const admin=createAdminClient();const owned=await admin.from("api_credentials").select("id").eq("id",id).eq("user_id",userData.user.id).maybeSingle();if(owned.error||!owned.data)return NextResponse.json({error:"Connection not found."},{status:404});
 const [events,alerts]=await Promise.all([admin.from("oauth_lifecycle_events").select("id,event_type,generation,outcome,peer_reused,detail,created_at").eq("credential_id",id).eq("user_id",userData.user.id).order("created_at",{ascending:false}).limit(50),admin.from("provider_alerts").select("id,severity,code,message,resolved_at,created_at").eq("credential_id",id).eq("user_id",userData.user.id).order("created_at",{ascending:false}).limit(50)]);
 return NextResponse.json({events:events.data??[],alerts:alerts.data??[],warnings:[events.error?.message,alerts.error?.message].filter(Boolean)});
}
