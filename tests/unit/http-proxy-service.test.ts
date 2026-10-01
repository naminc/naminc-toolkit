import { describe, expect, it, vi } from "vitest";
import { executeHttpProxy } from "@/lib/server/http-proxy-service";
import { HttpProxyError, type DnsResolver } from "@/lib/server/http-proxy-security";
import type { HttpProxyTransport, TransportRequest, TransportResponse } from "@/lib/server/http-proxy-transport";

const publicResolver: DnsResolver = { async resolve() { return [{ address: "93.184.216.34", family: 4 }]; } };
const payload = {
  url: "https://public.example/api",
  method: "GET" as const,
  headers: { Accept: "application/json" },
  body: null,
  timeoutMs: 15_000,
};

function response(status = 200, headers: Record<string, string | string[]> = { "content-type": "application/json" }, body = Buffer.from('{"ok":true}')): TransportResponse {
  return { status, statusText: status === 200 ? "OK" : "Redirect", headers, body };
}

describe("HTTP proxy service", () => {
  it("pins the validated DNS address into the transport", async () => {
    let calls = 0;
    const rebindingResolver: DnsResolver = {
      async resolve() {
        calls += 1;
        return calls === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }];
      },
    };
    const transport: HttpProxyTransport = {
      async request(input) {
        expect(input.target.address).toBe("93.184.216.34");
        return response();
      },
    };
    await expect(executeHttpProxy(payload, new AbortController().signal, { resolver: rebindingResolver, transport })).resolves.toMatchObject({ ok: true, status: 200 });
    expect(calls).toBe(1);
  });

  it("rejects a redirect from a public target to a private target", async () => {
    const transport: HttpProxyTransport = { async request() { return response(302, { location: "http://127.0.0.1/admin" }, Buffer.alloc(0)); } };
    await expect(executeHttpProxy(payload, new AbortController().signal, { resolver: publicResolver, transport })).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
  });

  it("limits redirects to three hops", async () => {
    let calls = 0;
    const transport: HttpProxyTransport = {
      async request() {
        calls += 1;
        return response(302, { location: `https://public.example/hop-${calls}` }, Buffer.alloc(0));
      },
    };
    await expect(executeHttpProxy(payload, new AbortController().signal, { resolver: publicResolver, transport })).rejects.toMatchObject({ code: "REDIRECT_LIMIT" });
    expect(calls).toBe(4);
  });

  it("removes authorization when a redirect changes origin", async () => {
    const requests: TransportRequest[] = [];
    const transport: HttpProxyTransport = {
      async request(input) {
        requests.push(input);
        return requests.length === 1
          ? response(302, { location: "https://other.example/result" }, Buffer.alloc(0))
          : response();
      },
    };
    await executeHttpProxy({ ...payload, headers: { Authorization: "Bearer secret" } }, new AbortController().signal, { resolver: publicResolver, transport });
    expect(requests[0].headers.authorization).toBe("Bearer secret");
    expect(requests[1].headers.authorization).toBeUndefined();
  });

  it("enforces the request body limit and strips bodies from GET", async () => {
    const transport: HttpProxyTransport = { async request(input) { expect(input.body).toBeNull(); return response(); } };
    await executeHttpProxy({ ...payload, body: "ignored" }, new AbortController().signal, { resolver: publicResolver, transport });
    await expect(executeHttpProxy({ ...payload, method: "POST", body: "a".repeat(1024 * 1024 + 1) }, new AbortController().signal, { resolver: publicResolver, transport })).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
  });

  it("classifies timeout and client abort separately", async () => {
    const waitingTransport: HttpProxyTransport = {
      request(input) {
        return new Promise((_resolve, reject) => {
          if (input.signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          input.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      },
    };
    await expect(executeHttpProxy({ ...payload, timeoutMs: 5 }, new AbortController().signal, { resolver: publicResolver, transport: waitingTransport })).rejects.toMatchObject({ code: "TIMEOUT" });
    const controller = new AbortController();
    const pending = executeHttpProxy(payload, controller.signal, { resolver: publicResolver, transport: waitingTransport });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CLIENT_ABORTED" });
  });

  it("applies timeout and client abort while DNS resolution is pending", async () => {
    const waitingResolver: DnsResolver = { resolve: () => new Promise(() => undefined) };
    await expect(executeHttpProxy({ ...payload, timeoutMs: 5 }, new AbortController().signal, { resolver: waitingResolver, transport: { request: async () => response() } })).rejects.toMatchObject({ code: "TIMEOUT" });
    const controller = new AbortController();
    const pending = executeHttpProxy(payload, controller.signal, { resolver: waitingResolver, transport: { request: async () => response() } });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CLIENT_ABORTED" });
  });

  it("returns binary data as Base64 and filters response cookies", async () => {
    const transport: HttpProxyTransport = { async request() { return response(200, { "content-type": "application/octet-stream", "set-cookie": "secret=value" }, Buffer.from([0, 255, 1])); } };
    const result = await executeHttpProxy(payload, new AbortController().signal, { resolver: publicResolver, transport, now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125) });
    expect(result).toMatchObject({ bodyEncoding: "base64", body: "AP8B", responseSize: 3, responseTimeMs: 25 });
    expect(result.headers["set-cookie"]).toBeUndefined();
  });

  it("never exposes an upstream error message", async () => {
    const transport: HttpProxyTransport = { async request() { throw new Error("Bearer super-secret-token at private-host"); } };
    const error = await executeHttpProxy(payload, new AbortController().signal, { resolver: publicResolver, transport }).catch((caught) => caught);
    expect(error).toBeInstanceOf(HttpProxyError);
    expect((error as HttpProxyError).code).toBe("UPSTREAM_FAILURE");
    expect((error as Error).message).not.toMatch(/super-secret|private-host/);
  });
});
