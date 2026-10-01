import type { ProxyErrorResponse } from "@/lib/http-proxy-types";
import { executeHttpProxy, type ProxyServiceDependencies } from "@/lib/server/http-proxy-service";
import { HttpProxyError, MAX_REQUEST_BODY_BYTES } from "@/lib/server/http-proxy-security";
import { createDefaultProxyRateLimiter, getClientIp, hashClientIp, type ProxyRateLimiter } from "@/lib/server/proxy-rate-limit";

const MAX_ENVELOPE_BYTES = MAX_REQUEST_BODY_BYTES + 64 * 1024;
const SECURITY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

type HandlerDependencies = ProxyServiceDependencies & {
  rateLimiter?: ProxyRateLimiter;
};

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

async function readJsonWithLimit(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_ENVELOPE_BYTES) {
    throw new HttpProxyError("REQUEST_TOO_LARGE", 413, "The proxy request exceeds the size limit.");
  }
  if (!request.body) throw new HttpProxyError("BAD_REQUEST", 400, "The proxy request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_ENVELOPE_BYTES) {
      await reader.cancel();
      throw new HttpProxyError("REQUEST_TOO_LARGE", 413, "The proxy request exceeds the size limit.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(combined));
  } catch {
    throw new HttpProxyError("BAD_REQUEST", 400, "The proxy request body must be valid JSON.");
  }
}

export async function handleHttpProxyRequest(request: Request, dependencies: HandlerDependencies = {}): Promise<Response> {
  try {
    const limiter = dependencies.rateLimiter ?? createDefaultProxyRateLimiter();
    const identifier = hashClientIp(getClientIp(request));
    const rate = await limiter.limit(identifier);
    const rateHeaders = {
      "X-RateLimit-Limit": String(rate.limit),
      "X-RateLimit-Remaining": String(rate.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000)),
    };
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      const body: ProxyErrorResponse = { ok: false, error: { code: "RATE_LIMITED", message: "Proxy rate limit exceeded. Try again later." } };
      return jsonResponse(body, 429, { ...rateHeaders, "Retry-After": String(retryAfter) });
    }
    const payload = await readJsonWithLimit(request);
    const result = await executeHttpProxy(payload, request.signal, dependencies);
    return jsonResponse(result, 200, rateHeaders);
  } catch (error) {
    const safe = error instanceof HttpProxyError
      ? error
      : new HttpProxyError("UPSTREAM_FAILURE", 502, "The proxy request could not be completed.");
    const body: ProxyErrorResponse = { ok: false, error: { code: safe.code, message: safe.message } };
    return jsonResponse(body, safe.status);
  }
}
