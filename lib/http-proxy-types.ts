import type { HttpMethod } from "@/lib/api-client";

export type ProxyRequestPayload = {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | null;
  timeoutMs: number;
};

export type ProxyRedirect = {
  status: number;
  url: string;
};

export type ProxySuccessResponse = {
  ok: true;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string;
  body: string;
  bodyEncoding: "text" | "base64";
  responseTimeMs: number;
  responseSize: number;
  redirects: ProxyRedirect[];
};

export type ProxyErrorCode =
  | "BAD_REQUEST"
  | "BLOCKED_TARGET"
  | "CLIENT_ABORTED"
  | "DNS_FAILURE"
  | "HEADER_LIMIT"
  | "INVALID_HEADER"
  | "METHOD_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "RATE_LIMIT_UNAVAILABLE"
  | "REDIRECT_LIMIT"
  | "REQUEST_TOO_LARGE"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT"
  | "UPSTREAM_FAILURE";

export type ProxyErrorResponse = {
  ok: false;
  error: {
    code: ProxyErrorCode;
    message: string;
  };
};

export type ProxyApiResponse = ProxySuccessResponse | ProxyErrorResponse;
