import { describe, expect, it } from "vitest";
import {
  HttpProxyError,
  isPublicAddress,
  sanitizeRequestHeaders,
  sanitizeResponseHeaders,
  validateTargetUrl,
  type DnsResolver,
} from "@/lib/server/http-proxy-security";

const resolver = (addresses: Array<{ address: string; family: 4 | 6 }>): DnsResolver => ({
  async resolve() { return addresses; },
});

describe("HTTP proxy target validation", () => {
  it("accepts public IPv4 and IPv6 addresses", async () => {
    await expect(validateTargetUrl("https://8.8.8.8/path")).resolves.toMatchObject({ address: "8.8.8.8", family: 4 });
    await expect(validateTargetUrl("https://[2606:4700:4700::1111]/path")).resolves.toMatchObject({ family: 6 });
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.4.2",
    "192.168.1.4",
    "169.254.169.254",
    "168.63.129.16",
    "224.0.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
  ])("blocks non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "http://134744072/",
  ])("rejects obfuscated IP URL %s", async (url) => {
    await expect(validateTargetUrl(url)).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
  });

  it.each([
    "http://localhost/",
    "http://service.internal/",
    "http://metadata.google.internal/",
    "http://169.254.169.254/latest/meta-data/",
  ])("blocks internal and metadata target %s", async (url) => {
    await expect(validateTargetUrl(url, resolver([{ address: "8.8.8.8", family: 4 }]))).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
  });

  it("blocks URL credentials, unsupported ports, and protocols", async () => {
    await expect(validateTargetUrl("https://user:pass@example.com", resolver([{ address: "8.8.8.8", family: 4 }]))).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
    await expect(validateTargetUrl("https://example.com:8443", resolver([{ address: "8.8.8.8", family: 4 }]))).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
    await expect(validateTargetUrl("file:///etc/passwd")).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
  });

  it("blocks DNS answers containing private or mixed addresses", async () => {
    await expect(validateTargetUrl("https://example.com", resolver([{ address: "10.0.0.2", family: 4 }]))).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
    await expect(validateTargetUrl("https://example.com", resolver([{ address: "8.8.8.8", family: 4 }, { address: "192.168.1.2", family: 4 }]))).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
  });

  it("returns a generic DNS error without the hostname", async () => {
    const failing: DnsResolver = { async resolve() { throw new Error("secret.example.test"); } };
    const error = await validateTargetUrl("https://secret.example.test", failing).catch((caught) => caught);
    expect(error).toBeInstanceOf(HttpProxyError);
    expect(String((error as Error).message)).not.toContain("secret.example.test");
  });
});

describe("HTTP proxy header filtering", () => {
  it("strips connection-specific, forwarding, cookie, and host headers", () => {
    expect(sanitizeRequestHeaders({
      Authorization: "Bearer allowed",
      Cookie: "secret=blocked",
      Host: "internal.test",
      Connection: "keep-alive",
      "Transfer-Encoding": "chunked",
      "Content-Length": "99",
      Upgrade: "websocket",
      "Proxy-Authorization": "blocked",
      "Proxy-Connection": "blocked",
      "X-Forwarded-For": "127.0.0.1",
      "X-Forwarded-Host": "internal.test",
      "X-Real-IP": "127.0.0.1",
      Accept: "application/json",
    })).toEqual({ authorization: "Bearer allowed", accept: "application/json", "accept-encoding": "identity" });
  });

  it("strips Set-Cookie and hop-by-hop response headers", () => {
    expect(sanitizeResponseHeaders({
      "content-type": "application/json",
      "set-cookie": ["session=secret"],
      connection: "keep-alive",
      "transfer-encoding": "chunked",
      "x-trace": "visible",
    })).toEqual({ "content-type": "application/json", "x-trace": "visible" });
  });

  it("rejects invalid and oversized headers", () => {
    expect(() => sanitizeRequestHeaders({ "bad header": "value" })).toThrowError(/invalid/i);
    expect(() => sanitizeRequestHeaders({ "x-large": "a".repeat(17 * 1024) })).toThrowError(/size limit/i);
  });
});
