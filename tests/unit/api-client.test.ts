import { describe, expect, it } from "vitest";
import {
  ResponseTooLargeError,
  buildRequestBody,
  buildRequestHeaders,
  buildRequestUrl,
  classifyRequestError,
  formatResponseBody,
  generateCode,
  parseCurlCommand,
  prepareRequest,
  readResponseBody,
  type RequestDraft,
} from "@/lib/api-client";

function draft(overrides: Partial<RequestDraft> = {}): RequestDraft {
  return {
    method: "GET",
    url: "https://api.example.test/items",
    params: [],
    headers: [],
    auth: { mode: "none" },
    bodyMode: "none",
    body: "",
    form: [],
    timeoutSeconds: 15,
    ...overrides,
  };
}

describe("API request preparation", () => {
  it("builds HTTP URLs and preserves duplicate query keys", () => {
    expect(buildRequestUrl("https://api.example.test/items?existing=yes#result", [
      { key: "tag", value: "first" },
      { key: "tag", value: "second" },
      { key: "ignored", value: "no", enabled: false },
    ])).toBe("https://api.example.test/items?existing=yes&tag=first&tag=second#result");
  });

  it("rejects invalid protocols and URL credentials", () => {
    expect(() => buildRequestUrl("file:///secret", [])).toThrow(/HTTP and HTTPS/);
    expect(() => buildRequestUrl("https://user:pass@example.test", [])).toThrow(/Credentials/);
  });

  it("validates headers and does not silently replace authorization", () => {
    expect(buildRequestHeaders([{ key: "X-Trace", value: "one" }], { mode: "bearer", token: "secret-token" })).toMatchObject({ authorization: "Bearer secret-token", "x-trace": "one" });
    expect(() => buildRequestHeaders([{ key: "Authorization", value: "Custom value" }], { mode: "bearer", token: "secret-token" })).toThrow(/both Headers and Auth/);
    expect(() => buildRequestHeaders([{ key: "Bad Header", value: "value" }], { mode: "none" })).toThrow(/Invalid request header/);
  });

  it("supports UTF-8 Basic Auth", () => {
    const headers = buildRequestHeaders([], { mode: "basic", username: "naminc", password: "mật-khẩu" });
    expect(headers.authorization).toMatch(/^Basic /);
    expect(headers.authorization).not.toContain("mật-khẩu");
  });

  it("builds JSON, text, XML, and duplicate form fields", () => {
    expect(buildRequestBody("POST", "json", '{"ok":true}', [])).toEqual({ body: '{"ok":true}', contentType: "application/json" });
    expect(buildRequestBody("POST", "text", "Naminc", [])).toMatchObject({ body: "Naminc", contentType: expect.stringContaining("text/plain") });
    expect(buildRequestBody("POST", "xml", "<ok/>", [])).toEqual({ body: "<ok/>", contentType: "application/xml" });
    expect(buildRequestBody("POST", "form", "", [{ key: "tag", value: "a" }, { key: "tag", value: "b" }])).toMatchObject({ body: "tag=a&tag=b" });
    expect(() => buildRequestBody("POST", "json", "{broken", [])).toThrow(/valid JSON/);
  });

  it("never creates a body for GET or HEAD", () => {
    expect(buildRequestBody("GET", "json", '{"ignored":true}', [])).toEqual({});
    expect(buildRequestBody("HEAD", "text", "ignored", [])).toEqual({});
  });

  it("adds content type only when the user did not provide one", () => {
    expect(prepareRequest(draft({ method: "POST", bodyMode: "json", body: "{}" })).headers["content-type"]).toBe("application/json");
    expect(prepareRequest(draft({ method: "POST", bodyMode: "json", body: "{}", headers: [{ key: "Content-Type", value: "application/problem+json" }] })).headers["content-type"]).toBe("application/problem+json");
  });
});

describe("response handling", () => {
  it("reads UTF-8 streams and formats JSON", async () => {
    const response = new Response('{"name":"Naminc"}', { headers: { "Content-Type": "application/json" } });
    const result = await readResponseBody(response, 1024);
    expect(result.bytes).toBe(17);
    expect(formatResponseBody(result.text)).toBe('{\n  "name": "Naminc"\n}');
  });

  it("rejects declared and streamed responses over the limit", async () => {
    await expect(readResponseBody(new Response("small", { headers: { "Content-Length": "100" } }), 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
    await expect(readResponseBody(new Response("12345678901"), 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("classifies timeout, cancellation, and ambiguous browser failures", () => {
    expect(classifyRequestError(new DOMException("Aborted", "AbortError"), true)).toMatch(/timed out/);
    expect(classifyRequestError(new DOMException("Aborted", "AbortError"), false)).toBe("Request canceled.");
    expect(classifyRequestError(new TypeError("Failed to fetch"), false)).toMatch(/CORS, DNS, TLS/);
  });
});

describe("cURL import", () => {
  it("imports method, headers, JSON body, and bearer auth", () => {
    const imported = parseCurlCommand("curl 'https://api.example.test/items' -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer token-value' --data-raw '{\"name\":\"Naminc\"}'");
    expect(imported).toMatchObject({ method: "POST", url: "https://api.example.test/items", bodyMode: "json", body: '{"name":"Naminc"}', auth: { mode: "bearer", token: "token-value" } });
    expect(imported.headers.some((header) => header.key.toLowerCase() === "authorization")).toBe(false);
  });

  it("imports Basic Auth and URL-encoded form fields", () => {
    const imported = parseCurlCommand("curl -u 'naminc:secret' -H 'Content-Type: application/x-www-form-urlencoded' -d 'tag=one&tag=two' https://api.example.test/form");
    expect(imported.auth).toEqual({ mode: "basic", username: "naminc", password: "secret" });
    expect(imported.bodyMode).toBe("form");
    expect(imported.form).toEqual([{ key: "tag", value: "one" }, { key: "tag", value: "two" }]);
  });

  it("rejects unsupported flags and never executes shell syntax", () => {
    expect(() => parseCurlCommand("curl --remote-name https://api.example.test/file")).toThrow(/Unsupported cURL option/);
    expect(() => parseCurlCommand("echo unsafe")).toThrow(/start with curl/);
  });
});

describe("code generation", () => {
  const request = draft({
    method: "POST",
    url: "https://api.example.test/items",
    params: [{ key: "lang", value: "vi" }],
    headers: [{ key: "X-Name", value: "Naminc" }],
    auth: { mode: "bearer", token: "private-token" },
    bodyMode: "json",
    body: JSON.stringify({ message: "Xin chào\nO'Reilly" }),
  });

  it.each(["curl", "javascript", "node", "python"] as const)("generates runnable-shaped %s code", (language) => {
    const output = generateCode(request, language);
    expect(output).toContain("https://api.example.test/items?lang=vi");
    expect(output).toContain("private-token");
    expect(output).toContain("Xin chào");
  });

  it("escapes shell quotes, newlines, and Unicode", () => {
    const output = generateCode(request, "curl");
    expect(output).toContain("O'\\''Reilly");
    expect(output).toContain("Xin chào");
  });

  it("keeps authorization out of the URL unless it was entered there", () => {
    const output = generateCode(request, "javascript");
    const generatedUrl = output.match(/fetch\("([^"]+)/)?.[1] ?? "";
    expect(generatedUrl).not.toContain("private-token");
    expect(output).toContain('"authorization": "Bearer private-token"');
  });
});
