import { handleHttpProxyRequest } from "@/lib/server/http-proxy-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleHttpProxyRequest(request);
}
