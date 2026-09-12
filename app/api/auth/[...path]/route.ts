import { getNeonAuth } from "@/lib/neon/server";

export const dynamic = "force-dynamic";

type AuthRouteContext = {
  params?: Promise<{ path?: string[] }> | { path?: string[] };
};

type AuthRouteHandler = (request: Request, context: AuthRouteContext) => Response | Promise<Response>;

function routeHandler(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"): AuthRouteHandler {
  return async (request, context) => {
    const handlers = getNeonAuth().handler() as Partial<Record<typeof method, AuthRouteHandler>>;
    const handler = handlers[method];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler(request, context);
  };
}

export const GET = routeHandler("GET");
export const POST = routeHandler("POST");
export const PUT = routeHandler("PUT");
export const DELETE = routeHandler("DELETE");
export const PATCH = routeHandler("PATCH");
