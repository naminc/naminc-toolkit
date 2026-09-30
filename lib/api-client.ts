export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type AuthMode = "none" | "bearer" | "basic";
export type BodyMode = "none" | "json" | "text" | "xml" | "form";
export type CodeLanguage = "curl" | "javascript" | "node" | "python";

export type KeyValueInput = { key: string; value: string; enabled?: boolean };
export type AuthInput = { mode: AuthMode; token?: string; username?: string; password?: string };
export type RequestDraft = {
  method: HttpMethod;
  url: string;
  params: KeyValueInput[];
  headers: KeyValueInput[];
  auth: AuthInput;
  bodyMode: BodyMode;
  body: string;
  form: KeyValueInput[];
  timeoutSeconds: number;
};

export type PreparedRequest = {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

export class ResponseTooLargeError extends Error {
  constructor(limit: number) {
    super(`Response exceeds the ${formatBytes(limit)} browser limit.`);
    this.name = "ResponseTooLargeError";
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildRequestUrl(input: string, params: KeyValueInput[]): string {
  const value = input.trim();
  if (!value) throw new Error("Enter an endpoint URL.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new Error("Credentials inside the endpoint URL are not supported. Use the Auth section instead.");
  for (const row of params) {
    if (row.enabled === false || !row.key.trim()) continue;
    url.searchParams.append(row.key.trim(), row.value);
  }
  return url.toString();
}

function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildRequestHeaders(rows: KeyValueInput[], auth: AuthInput): Record<string, string> {
  const headers = new Headers();
  for (const row of rows) {
    const key = row.key.trim();
    if (row.enabled === false || !key) continue;
    try {
      headers.append(key, row.value);
    } catch {
      throw new Error(`Invalid request header: ${key}.`);
    }
  }
  if (auth.mode !== "none" && headers.has("authorization")) {
    throw new Error("Authorization is set in both Headers and Auth. Remove one before sending.");
  }
  if (auth.mode === "bearer") {
    if (!auth.token?.trim()) throw new Error("Enter a bearer token.");
    headers.set("Authorization", `Bearer ${auth.token.trim()}`);
  }
  if (auth.mode === "basic") {
    if (!auth.username) throw new Error("Enter a Basic Auth username.");
    headers.set("Authorization", `Basic ${encodeBasicAuth(auth.username, auth.password ?? "")}`);
  }
  return Object.fromEntries(headers.entries());
}

export function buildRequestBody(method: HttpMethod, mode: BodyMode, body: string, form: KeyValueInput[]): { body?: string; contentType?: string } {
  if (method === "GET" || method === "HEAD" || mode === "none") return {};
  if (mode === "json") {
    if (!body.trim()) throw new Error("Enter a JSON request body.");
    try { JSON.parse(body); } catch { throw new Error("Request body is not valid JSON."); }
    return { body, contentType: "application/json" };
  }
  if (mode === "xml") return { body, contentType: "application/xml" };
  if (mode === "text") return { body, contentType: "text/plain;charset=UTF-8" };
  const values = new URLSearchParams();
  for (const row of form) if (row.enabled !== false && row.key.trim()) values.append(row.key.trim(), row.value);
  return { body: values.toString(), contentType: "application/x-www-form-urlencoded;charset=UTF-8" };
}

export function prepareRequest(draft: RequestDraft): PreparedRequest {
  const timeoutSeconds = Number(draft.timeoutSeconds);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 120) throw new Error("Timeout must be between 1 and 120 seconds.");
  const url = buildRequestUrl(draft.url, draft.params);
  const headers = buildRequestHeaders(draft.headers, draft.auth);
  const preparedBody = buildRequestBody(draft.method, draft.bodyMode, draft.body, draft.form);
  if (preparedBody.contentType && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = preparedBody.contentType;
  return { method: draft.method, url, headers, body: preparedBody.body, timeoutMs: timeoutSeconds * 1000 };
}

export async function readResponseBody(response: Response, limit = 2 * 1024 * 1024): Promise<{ text: string; bytes: number }> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new ResponseTooLargeError(limit);
  if (!response.body) return { text: "", bytes: 0 };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new ResponseTooLargeError(limit);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { text, bytes };
  } finally {
    reader.releaseLock();
  }
}

export function formatResponseBody(value: string): string {
  if (!value.trim()) return "";
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

export function formatResponseHeaders(headers: Headers | Record<string, string>): string {
  const entries = headers instanceof Headers ? Array.from(headers.entries()) : Object.entries(headers);
  return entries.map(([key, value]) => `${key}: ${value}`).join("\n");
}

export function classifyRequestError(error: unknown, timedOut: boolean): string {
  if (timedOut) return "Request timed out before the endpoint responded.";
  if (error instanceof ResponseTooLargeError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "Request canceled.";
  if (error instanceof Error && error.name === "AbortError") return "Request canceled.";
  if (error instanceof Error && error.message) {
    if (error instanceof TypeError) return "The request failed. The cause may be CORS, DNS, TLS, connectivity, or an unavailable endpoint.";
    return error.message;
  }
  return "The request failed for an unknown reason.";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function tokenizeCurl(command: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaping) { token += character; escaping = false; continue; }
    if (character === "\\" && quote !== "'") { escaping = true; continue; }
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (/\s/.test(character)) {
      if (token) { tokens.push(token); token = ""; }
      continue;
    }
    token += character;
  }
  if (escaping || quote) throw new Error("The cURL command contains an unfinished quote or escape sequence.");
  if (token) tokens.push(token);
  return tokens;
}

function splitHeader(value: string): KeyValueInput {
  const separator = value.indexOf(":");
  if (separator < 1) throw new Error(`Invalid cURL header: ${value}.`);
  return { key: value.slice(0, separator).trim(), value: value.slice(separator + 1).trim() };
}

export function parseCurlCommand(command: string): RequestDraft {
  const tokens = tokenizeCurl(command.trim().replace(/^\$\s*/, ""));
  if (tokens[0]?.toLowerCase() !== "curl") throw new Error("The command must start with curl.");
  let method: HttpMethod | "" = "";
  let url = "";
  let body = "";
  let username = "";
  let password = "";
  const headers: KeyValueInput[] = [];
  const take = (index: number, flag: string) => {
    const value = tokens[index + 1];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    return value;
  };
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "-X" || token === "--request") { method = take(index, token).toUpperCase() as HttpMethod; index += 1; continue; }
    if (token === "-H" || token === "--header") { headers.push(splitHeader(take(index, token))); index += 1; continue; }
    if (["-d", "--data", "--data-raw", "--data-binary"].includes(token)) { body = take(index, token); index += 1; continue; }
    if (token === "-u" || token === "--user") { const auth = take(index, token); const separator = auth.indexOf(":"); username = separator < 0 ? auth : auth.slice(0, separator); password = separator < 0 ? "" : auth.slice(separator + 1); index += 1; continue; }
    if (token === "--url") { url = take(index, token); index += 1; continue; }
    if (token.startsWith("-")) throw new Error(`Unsupported cURL option: ${token}.`);
    if (!url) url = token;
    else throw new Error(`Unexpected cURL value: ${token}.`);
  }
  if (!url) throw new Error("The cURL command does not contain a URL.");
  const allowed: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  const resolvedMethod = method || (body ? "POST" : "GET");
  if (!allowed.includes(resolvedMethod as HttpMethod)) throw new Error(`Unsupported HTTP method: ${resolvedMethod}.`);
  const authorizationIndex = headers.findIndex((row) => row.key.toLowerCase() === "authorization");
  let auth: AuthInput = { mode: "none" };
  if (username) auth = { mode: "basic", username, password };
  else if (authorizationIndex >= 0 && /^Bearer\s+/i.test(headers[authorizationIndex].value)) {
    auth = { mode: "bearer", token: headers[authorizationIndex].value.replace(/^Bearer\s+/i, "") };
    headers.splice(authorizationIndex, 1);
  }
  const contentType = headers.find((row) => row.key.toLowerCase() === "content-type")?.value.toLowerCase() ?? "";
  let bodyMode: BodyMode = "none";
  let form: KeyValueInput[] = [];
  if (body) {
    if (contentType.includes("json")) bodyMode = "json";
    else if (contentType.includes("xml")) bodyMode = "xml";
    else if (contentType.includes("x-www-form-urlencoded")) {
      bodyMode = "form";
      form = Array.from(new URLSearchParams(body).entries()).map(([key, value]) => ({ key, value }));
      body = "";
    }
    else { try { JSON.parse(body); bodyMode = "json"; } catch { bodyMode = "text"; } }
  }
  return { method: resolvedMethod as HttpMethod, url, params: [], headers, auth, bodyMode, body, form, timeoutSeconds: 15 };
}

function preparedForCode(draft: RequestDraft): PreparedRequest {
  return prepareRequest(draft);
}

export function generateCode(draft: RequestDraft, language: CodeLanguage): string {
  const request = preparedForCode(draft);
  const headerEntries = Object.entries(request.headers);
  if (language === "curl") {
    const lines = [`curl -X ${request.method} ${shellQuote(request.url)}`];
    for (const [key, value] of headerEntries) lines.push(`  -H ${shellQuote(`${key}: ${value}`)}`);
    if (request.body !== undefined) lines.push(`  --data-raw ${shellQuote(request.body)}`);
    return lines.join(" \\\n");
  }
  const options = [`method: ${JSON.stringify(request.method)}`];
  if (headerEntries.length) options.push(`headers: ${JSON.stringify(request.headers, null, 2)}`);
  if (request.body !== undefined) options.push(`body: ${JSON.stringify(request.body)}`);
  if (language === "javascript") return `const response = await fetch(${JSON.stringify(request.url)}, {\n  ${options.join(",\n  ")}\n});\n\nconst data = await response.text();`;
  if (language === "node") return `const controller = new AbortController();\nconst timeout = setTimeout(() => controller.abort(), ${request.timeoutMs});\n\ntry {\n  const response = await fetch(${JSON.stringify(request.url)}, {\n    ${options.join(",\n    ")},\n    signal: controller.signal\n  });\n  const data = await response.text();\n} finally {\n  clearTimeout(timeout);\n}`;
  const pythonHeaders = JSON.stringify(request.headers, null, 2);
  const bodyLine = request.body === undefined ? "" : `,\n    data=${JSON.stringify(request.body)}`;
  return `import requests\n\nresponse = requests.request(\n    ${JSON.stringify(request.method)},\n    ${JSON.stringify(request.url)},\n    headers=${pythonHeaders}${bodyLine},\n    timeout=${request.timeoutMs / 1000}\n)\n\nprint(response.text)`;
}
