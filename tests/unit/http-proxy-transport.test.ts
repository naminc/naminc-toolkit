import { createServer, type RequestListener } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { NodeHttpProxyTransport } from "@/lib/server/http-proxy-transport";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function localServer(handler: RequestListener): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
  return address.port;
}

describe("Node HTTP proxy transport", () => {
  it("rejects a streamed response over 2 MB", async () => {
    const port = await localServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(Buffer.alloc(2 * 1024 * 1024 + 1));
    });
    const transport = new NodeHttpProxyTransport();
    await expect(transport.request({
      target: { url: new URL(`http://test.invalid:${port}/large`), address: "127.0.0.1", family: 4 },
      method: "GET",
      headers: { "accept-encoding": "identity" },
      body: null,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });

  it("aborts the upstream socket when the client signal is canceled", async () => {
    const port = await localServer(() => undefined);
    const controller = new AbortController();
    const transport = new NodeHttpProxyTransport();
    const pending = transport.request({
      target: { url: new URL(`http://test.invalid:${port}/waiting`), address: "127.0.0.1", family: 4 },
      method: "GET",
      headers: {},
      body: null,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
