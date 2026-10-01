import { isUtf8 } from "node:buffer";
import type { HttpMethod } from "@/lib/api-client";
import type { ProxyRedirect, ProxyRequestPayload, ProxySuccessResponse } from "@/lib/http-proxy-types";
import {
  HttpProxyError,
  MAX_REDIRECTS,
  MAX_REQUEST_BODY_BYTES,
  MAX_TIMEOUT_MS,
  sanitizeRequestHeaders,
  sanitizeResponseHeaders,
  systemDnsResolver,
  validateTargetUrl,
  type DnsResolver,
} from "@/lib/server/http-proxy-security";
import { NodeHttpProxyTransport, type HttpProxyTransport, type TransportResponse } from "@/lib/server/http-proxy-transport";

const ALLOWED_METHODS = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TEXT_CONTENT_TYPES = ["text/", "application/json", "application/problem+json", "application/xml", "application/javascript", "application/x-www-form-urlencoded", "image/svg+xml"];

export type ProxyServiceDependencies = {
  resolver?: DnsResolver;
  transport?: HttpProxyTransport;
  now?: () => number;
};

function assertPayload(value: unknown): ProxyRequestPayload {
  if (!value || typeof value !== "object") throw new HttpProxyError("BAD_REQUEST", 400, "The proxy request is invalid.");
  const payload = value as Partial<ProxyRequestPayload>;
  if (typeof payload.url !== "string" || typeof payload.method !== "string" || !ALLOWED_METHODS.has(payload.method as HttpMethod)) {
    throw new HttpProxyError("METHOD_NOT_ALLOWED", 400, "The requested HTTP method is not supported.");
  }
  if (!payload.headers || typeof payload.headers !== "object" || Array.isArray(payload.headers)) {
    throw new HttpProxyError("BAD_REQUEST", 400, "Request headers must be a key-value object.");
  }
  if (payload.body !== null && typeof payload.body !== "string") {
    throw new HttpProxyError("BAD_REQUEST", 400, "The request body must be text or null.");
  }
  if (typeof payload.timeoutMs !== "number" || !Number.isFinite(payload.timeoutMs)) {
    throw new HttpProxyError("BAD_REQUEST", 400, "Enter a valid request timeout.");
  }
  return payload as ProxyRequestPayload;
}

function redirectMethod(status: number, method: HttpMethod): HttpMethod {
  if (status === 303 || ((status === 301 || status === 302) && method === "POST")) return "GET";
  return method;
}

function contentIsText(contentType: string, body: Buffer): boolean {
  return TEXT_CONTENT_TYPES.some((type) => contentType.toLowerCase().includes(type)) || isUtf8(body);
}

function publicRedirectUrl(url: URL): string {
  const clean = new URL(url);
  clean.username = "";
  clean.password = "";
  clean.search = "";
  clean.hash = "";
  return clean.toString();
}

function upstreamFailure(error: unknown): never {
  if (error instanceof HttpProxyError) throw error;
  if (error instanceof DOMException && error.name === "AbortError") {
    throw new HttpProxyError("CLIENT_ABORTED", 499, "The proxy request was canceled.");
  }
  throw new HttpProxyError("UPSTREAM_FAILURE", 502, "The upstream request failed before a response was received.");
}

function abortError(signal: AbortSignal): HttpProxyError {
  return signal.reason === "timeout"
    ? new HttpProxyError("TIMEOUT", 504, "The upstream request exceeded the timeout limit.")
    : new HttpProxyError("CLIENT_ABORTED", 499, "The proxy request was canceled.");
}

async function whileNotAborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

export async function executeHttpProxy(
  input: unknown,
  signal: AbortSignal,
  dependencies: ProxyServiceDependencies = {},
): Promise<ProxySuccessResponse> {
  const payload = assertPayload(input);
  const resolver = dependencies.resolver ?? systemDnsResolver;
  const transport = dependencies.transport ?? new NodeHttpProxyTransport();
  const now = dependencies.now ?? Date.now;
  const timeoutMs = Math.max(1, Math.min(MAX_TIMEOUT_MS, Math.round(payload.timeoutMs)));
  const body = payload.body === null ? null : Buffer.from(payload.body, "utf8");
  if (body && body.length > MAX_REQUEST_BODY_BYTES) {
    throw new HttpProxyError("REQUEST_TOO_LARGE", 413, "The request body exceeds the 1 MB limit.");
  }

  let method = payload.method;
  let headers = sanitizeRequestHeaders(payload.headers);
  let requestBody = method === "GET" || method === "HEAD" ? null : body;
  let currentUrl = payload.url;
  const redirects: ProxyRedirect[] = [];
  const controller = new AbortController();
  const abortFromClient = () => controller.abort("client");
  if (signal.aborted) abortFromClient();
  else signal.addEventListener("abort", abortFromClient, { once: true });
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const started = now();

  try {
    while (true) {
      const target = await whileNotAborted(validateTargetUrl(currentUrl, resolver), controller.signal);
      let response: TransportResponse;
      try {
        response = await transport.request({ target, method, headers, body: requestBody, signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) {
          if (controller.signal.reason === "timeout") throw new HttpProxyError("TIMEOUT", 504, "The upstream request exceeded the timeout limit.");
          throw new HttpProxyError("CLIENT_ABORTED", 499, "The proxy request was canceled.");
        }
        upstreamFailure(error);
      }

      const location = response.headers.location;
      if (REDIRECT_STATUSES.has(response.status) && location) {
        if (redirects.length >= MAX_REDIRECTS) {
          throw new HttpProxyError("REDIRECT_LIMIT", 508, `The upstream response exceeded the ${MAX_REDIRECTS}-redirect limit.`);
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(Array.isArray(location) ? location[0] : location, target.url);
        } catch {
          throw new HttpProxyError("UPSTREAM_FAILURE", 502, "The upstream server returned an invalid redirect.");
        }
        redirects.push({ status: response.status, url: publicRedirectUrl(nextUrl) });
        const sameOrigin = nextUrl.origin === target.url.origin;
        if (!sameOrigin) {
          headers = { ...headers };
          delete headers.authorization;
        }
        method = redirectMethod(response.status, method);
        if (method === "GET" || method === "HEAD") {
          requestBody = null;
          headers = { ...headers };
          delete headers["content-type"];
        }
        currentUrl = nextUrl.toString();
        continue;
      }

      const responseHeaders = sanitizeResponseHeaders(response.headers);
      const contentType = responseHeaders["content-type"] ?? "application/octet-stream";
      const text = contentIsText(contentType, response.body);
      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        contentType,
        body: response.body.toString(text ? "utf8" : "base64"),
        bodyEncoding: text ? "text" : "base64",
        responseTimeMs: Math.max(0, Math.round(now() - started)),
        responseSize: response.body.length,
        redirects,
      };
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abortFromClient);
  }
}
