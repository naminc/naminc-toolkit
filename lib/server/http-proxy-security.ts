import { lookup } from "node:dns/promises";
import { validateHeaderName, validateHeaderValue } from "node:http";
import ipaddr from "ipaddr.js";
import type { ProxyErrorCode } from "@/lib/http-proxy-types";

export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
export const MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_HEADER_COUNT = 40;
export const MAX_HEADER_BYTES = 16 * 1024;
export const MAX_REDIRECTS = 3;
export const MAX_TIMEOUT_MS = 15_000;

const BLOCKED_REQUEST_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
]);

const BLOCKED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "set-cookie",
  "set-cookie2",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const INTERNAL_HOST_SUFFIXES = [
  ".home.arpa",
  ".internal",
  ".lan",
  ".local",
  ".localhost",
];

const INTERNAL_HOSTS = new Set([
  "instance-data",
  "kubernetes.default",
  "localhost",
  "metadata",
  "metadata.google.internal",
]);

const BLOCKED_PLATFORM_ADDRESSES = new Set(["168.63.129.16", "169.254.169.254"]);

export class HttpProxyError extends Error {
  constructor(
    public readonly code: ProxyErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpProxyError";
  }
}

export type ResolvedAddress = { address: string; family: 4 | 6 };

export interface DnsResolver {
  resolve(hostname: string): Promise<ResolvedAddress[]>;
}

export const systemDnsResolver: DnsResolver = {
  async resolve(hostname) {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.map(({ address, family }) => ({ address, family } as ResolvedAddress));
  },
};

export type ValidatedTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

function hostnameWithoutBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function rawHostname(input: string): string {
  const authority = input.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1] ?? "";
  const withoutCredentials = authority.slice(authority.lastIndexOf("@") + 1);
  if (withoutCredentials.startsWith("[")) return withoutCredentials.slice(1, withoutCredentials.indexOf("]"));
  return withoutCredentials.split(":")[0];
}

function assertCanonicalHostname(input: string, url: URL) {
  const hostname = hostnameWithoutBrackets(url.hostname).toLowerCase();
  const raw = rawHostname(input).toLowerCase();
  if (!hostname || input.includes("\\") || /[\u0000-\u0020\u007f]/.test(input)) {
    throw new HttpProxyError("BLOCKED_TARGET", 403, "The target URL is not allowed.");
  }
  if (raw.includes("%") || hostname.endsWith(".") || hostname.includes("%")) {
    throw new HttpProxyError("BLOCKED_TARGET", 403, "Obfuscated hostnames are not allowed.");
  }
  if (ipaddr.isValid(hostname) && ipaddr.parse(hostname).kind() === "ipv4" && raw !== hostname) {
    throw new HttpProxyError("BLOCKED_TARGET", 403, "Obfuscated IP addresses are not allowed.");
  }
  if (!ipaddr.isValid(hostname)) {
    if (hostname.length > 253 || hostname.split(".").some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) {
      throw new HttpProxyError("BLOCKED_TARGET", 403, "The target hostname is not allowed.");
    }
  }
}

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }
  return parsed.range() === "unicast" && !BLOCKED_PLATFORM_ADDRESSES.has(parsed.toString());
}

function assertPublicHostname(hostname: string) {
  const normalized = hostnameWithoutBrackets(hostname).toLowerCase();
  if (INTERNAL_HOSTS.has(normalized) || INTERNAL_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    throw new HttpProxyError("BLOCKED_TARGET", 403, "Local and private network targets are blocked.");
  }
}

export async function validateTargetUrl(input: string, resolver: DnsResolver = systemDnsResolver): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpProxyError("BAD_REQUEST", 400, "Enter a valid absolute target URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpProxyError("BLOCKED_TARGET", 403, "Only HTTP and HTTPS targets are allowed.");
  }
  if (url.username || url.password) {
    throw new HttpProxyError("BLOCKED_TARGET", 403, "Target URLs cannot contain credentials.");
  }
  const effectivePort = url.port || (url.protocol === "https:" ? "443" : "80");
  if (effectivePort !== "80" && effectivePort !== "443") {
    throw new HttpProxyError("BLOCKED_TARGET", 403, "Proxy mode only allows ports 80 and 443.");
  }
  assertCanonicalHostname(input, url);
  assertPublicHostname(url.hostname);

  const hostname = hostnameWithoutBrackets(url.hostname);
  let addresses: ResolvedAddress[];
  if (ipaddr.isValid(hostname)) {
    const parsed = ipaddr.parse(hostname);
    addresses = [{ address: parsed.toString(), family: parsed.kind() === "ipv4" ? 4 : 6 }];
  } else {
    try {
      addresses = await resolver.resolve(hostname);
    } catch {
      throw new HttpProxyError("DNS_FAILURE", 502, "The target hostname could not be resolved.");
    }
  }
  if (addresses.length === 0) {
    throw new HttpProxyError("DNS_FAILURE", 502, "The target hostname could not be resolved.");
  }
  if (addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new HttpProxyError("BLOCKED_TARGET", 403, "The target resolves to a blocked network address.");
  }
  const selected = addresses[0];
  return { url, address: selected.address, family: selected.family };
}

export function sanitizeRequestHeaders(input: Record<string, string>): Record<string, string> {
  const entries = Object.entries(input);
  if (entries.length > MAX_HEADER_COUNT) {
    throw new HttpProxyError("HEADER_LIMIT", 400, `Proxy mode allows at most ${MAX_HEADER_COUNT} request headers.`);
  }
  const output: Record<string, string> = Object.create(null) as Record<string, string>;
  let size = 0;
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim().toLowerCase();
    const value = String(rawValue);
    if (!name || BLOCKED_REQUEST_HEADERS.has(name)) continue;
    if (name === "__proto__" || name === "constructor" || name === "prototype") {
      throw new HttpProxyError("INVALID_HEADER", 400, "A request header name or value is invalid.");
    }
    try {
      validateHeaderName(name);
      validateHeaderValue(name, value);
    } catch {
      throw new HttpProxyError("INVALID_HEADER", 400, "A request header name or value is invalid.");
    }
    size += Buffer.byteLength(name) + Buffer.byteLength(value);
    if (size > MAX_HEADER_BYTES) {
      throw new HttpProxyError("HEADER_LIMIT", 400, "Request headers exceed the proxy size limit.");
    }
    output[name] = value;
  }
  output["accept-encoding"] = "identity";
  return output;
}

export function sanitizeResponseHeaders(input: Record<string, string | string[] | undefined>): Record<string, string> {
  const output: Record<string, string> = Object.create(null) as Record<string, string>;
  let count = 0;
  let size = 0;
  for (const [rawName, rawValue] of Object.entries(input)) {
    const name = rawName.toLowerCase();
    if (rawValue === undefined || BLOCKED_RESPONSE_HEADERS.has(name)) continue;
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    count += 1;
    size += Buffer.byteLength(name) + Buffer.byteLength(value);
    if (count > MAX_HEADER_COUNT || size > MAX_HEADER_BYTES) {
      throw new HttpProxyError("HEADER_LIMIT", 502, "The upstream response headers exceed the proxy limit.");
    }
    output[name] = value;
  }
  return output;
}
