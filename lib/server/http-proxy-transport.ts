import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import type { HttpMethod } from "@/lib/api-client";
import { HttpProxyError, MAX_HEADER_BYTES, MAX_RESPONSE_BODY_BYTES, type ValidatedTarget } from "@/lib/server/http-proxy-security";

export type TransportRequest = {
  target: ValidatedTarget;
  method: HttpMethod;
  headers: Record<string, string>;
  body: Buffer | null;
  signal: AbortSignal;
};

export type TransportResponse = {
  status: number;
  statusText: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
};

export interface HttpProxyTransport {
  request(input: TransportRequest): Promise<TransportResponse>;
}

export class NodeHttpProxyTransport implements HttpProxyTransport {
  request(input: TransportRequest): Promise<TransportResponse> {
    return new Promise((resolve, reject) => {
      const { target } = input;
      const client = target.url.protocol === "https:" ? https : http;
      const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
        if (options.all) {
          callback(null, [{ address: target.address, family: target.family }]);
          return;
        }
        callback(null, target.address, target.family);
      };
      const request = client.request({
        protocol: target.url.protocol,
        hostname: target.url.hostname,
        port: target.url.port || undefined,
        method: input.method,
        path: `${target.url.pathname}${target.url.search}`,
        headers: input.headers,
        agent: false,
        maxHeaderSize: MAX_HEADER_BYTES,
        signal: input.signal,
        servername: target.url.hostname,
        lookup: pinnedLookup,
      }, (response) => {
        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BODY_BYTES) {
          response.destroy();
          reject(new HttpProxyError("RESPONSE_TOO_LARGE", 413, "The upstream response exceeds the 2 MB limit."));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BODY_BYTES) {
            response.destroy(new HttpProxyError("RESPONSE_TOO_LARGE", 413, "The upstream response exceeds the 2 MB limit."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({
          status: response.statusCode ?? 502,
          statusText: response.statusMessage ?? "",
          headers: response.headers,
          body: Buffer.concat(chunks, bytes),
        }));
        response.on("error", reject);
      });
      request.on("error", reject);
      if (input.body) request.write(input.body);
      request.end();
    });
  }
}
