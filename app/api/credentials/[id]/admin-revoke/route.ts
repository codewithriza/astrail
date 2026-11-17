import { NextResponse } from "next/server";
import { createServerNeonClient } from "@/lib/neon/server";
import { DELETE as revokeCredential } from "../route";

export async function POST(request:Request,props:{params:Promise<{id:string}>}){
 const session=await createServerNeonClient();const {data}=await session.auth.getUser();
 if(!data.user)return NextResponse.json({error:"Authentication required."},{status:401});
 const role=String(data.user.app_metadata?.role??data.user.user_metadata?.role??"").toLowerCase();
 if(!["admin","owner"].includes(role))return NextResponse.json({error:"Workspace administrator role required."},{status:403});
 const url=new URL(request.url);url.pathname=url.pathname.replace(/\/admin-revoke$/,"");
 return revokeCredential(new Request(url,{method:"DELETE",headers:request.headers}),props);
}
