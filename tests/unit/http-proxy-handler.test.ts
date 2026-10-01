import { describe, expect, it } from "vitest";
import { handleHttpProxyRequest } from "@/lib/server/http-proxy-handler";
import type { DnsResolver } from "@/lib/server/http-proxy-security";
import type { HttpProxyTransport } from "@/lib/server/http-proxy-transport";
import { MemoryProxyRateLimiter, hashClientIp, type ProxyRateLimiter } from "@/lib/server/proxy-rate-limit";

const resolver: DnsResolver = { async resolve() { return [{ address: "93.184.216.34", family: 4 }]; } };
const transport: HttpProxyTransport = {
  async request() {
    return { status: 200, statusText: "OK", headers: { "content-type": "application/json", "set-cookie": ["secret=value"] }, body: Buffer.from('{"value":47}') };
  },
};
const allow: ProxyRateLimiter = { async limit() { return { allowed: true, limit: 20, remaining: 19, resetAt: Date.now() + 60_000 }; } };

function proxyRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/http-proxy", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers },
    body: JSON.stringify(body),
  });
}

const payload = { url: "https://public.example/data", method: "GET", headers: {}, body: null, timeoutMs: 15_000 };

describe("HTTP proxy route handler", () => {
  it("returns a filtered proxy response with no-store security headers", async () => {
    const response = await handleHttpProxyRequest(proxyRequest(payload), { resolver, transport, rateLimiter: allow });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const result = await response.json();
    expect(result).toMatchObject({ ok: true, status: 200, body: '{"value":47}' });
    expect(result.headers["set-cookie"]).toBeUndefined();
  });

  it("returns 429 with Retry-After", async () => {
    const deny: ProxyRateLimiter = { async limit() { return { allowed: false, limit: 20, remaining: 0, resetAt: Date.now() + 5_000 }; } };
    const response = await handleHttpProxyRequest(proxyRequest(payload), { resolver, transport, rateLimiter: deny });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });

  it("blocks private DNS and does not include request secrets in the error", async () => {
    const privateResolver: DnsResolver = { async resolve() { return [{ address: "10.0.0.5", family: 4 }]; } };
    const secretPayload = { ...payload, url: "https://secret-token.example/private", headers: { Authorization: "Bearer private-value" } };
    const response = await handleHttpProxyRequest(proxyRequest(secretPayload), { resolver: privateResolver, transport, rateLimiter: allow });
    const text = await response.text();
    expect(response.status).toBe(403);
    expect(text).not.toMatch(/secret-token|private-value/);
    expect(JSON.parse(text)).toMatchObject({ error: { code: "BLOCKED_TARGET" } });
  });

  it("does not write request secrets to console output", async () => {
    const calls: unknown[][] = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    console.log = (...args: unknown[]) => { calls.push(args); };
    console.warn = (...args: unknown[]) => { calls.push(args); };
    console.error = (...args: unknown[]) => { calls.push(args); };
    try {
      await handleHttpProxyRequest(proxyRequest({ ...payload, headers: { Authorization: "Bearer never-log-this" } }), { resolver, transport, rateLimiter: allow });
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
    expect(JSON.stringify(calls)).not.toContain("never-log-this");
    expect(calls).toHaveLength(0);
  });

  it("rejects an oversized incoming envelope", async () => {
    const response = await handleHttpProxyRequest(proxyRequest({ ...payload, method: "POST", body: "x".repeat(1024 * 1024 + 70 * 1024) }), { resolver, transport, rateLimiter: allow });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "REQUEST_TOO_LARGE" } });
  });
});

describe("proxy rate limiting", () => {
  it("hashes client IPs without retaining the raw value", () => {
    const hash = hashClientIp("198.51.100.7", "test-salt");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("198.51.100.7");
  });

  it("limits local development requests with the memory adapter", async () => {
    const limiter = new MemoryProxyRateLimiter(() => 1_000);
    for (let index = 0; index < 20; index += 1) {
      await expect(limiter.limit("hashed-ip")).resolves.toMatchObject({ allowed: true });
    }
    await expect(limiter.limit("hashed-ip")).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });
});
