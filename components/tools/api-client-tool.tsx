"use client";

import { Check, Clipboard, Code2, Download, Plus, Send, Square, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ActionButton, IconAction, SegmentedControl, Status } from "@/components/tool-ui";
import {
  classifyRequestError,
  formatBytes,
  formatResponseBody,
  formatResponseHeaders,
  generateCode,
  parseCurlCommand,
  prepareRequest,
  readResponseBody,
  type AuthInput,
  type BodyMode,
  type CodeLanguage,
  type HttpMethod,
  type KeyValueInput,
  type RequestDraft,
} from "@/lib/api-client";
import type { ProxyApiResponse, ProxyErrorCode, ProxySuccessResponse } from "@/lib/http-proxy-types";

type UiRow = KeyValueInput & { id: number };
type RequestTab = "params" | "headers" | "auth" | "body";
type ResponseTab = "body" | "headers";
type RequestMode = "browser" | "proxy";
type ResponseResult = {
  status: number;
  statusText: string;
  duration: number;
  bytes: number;
  contentType: string;
  headers: string;
  raw: string;
  pretty: string;
  bodyEncoding: "text" | "base64";
  redirects: number;
};

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const proxyErrorMessages: Partial<Record<ProxyErrorCode, string>> = {
  BLOCKED_TARGET: "This target is blocked by proxy network security rules.",
  CLIENT_ABORTED: "The proxy request was canceled.",
  DNS_FAILURE: "The proxy could not resolve the target hostname.",
  RATE_LIMITED: "Proxy rate limit exceeded. Wait for the retry window and try again.",
  RATE_LIMIT_UNAVAILABLE: "Proxy mode is unavailable because its shared rate limiter is not configured or reachable.",
  REDIRECT_LIMIT: "The target exceeded the proxy redirect limit.",
  REQUEST_TOO_LARGE: "The request exceeds the proxy 1 MB body limit.",
  RESPONSE_TOO_LARGE: "The response exceeds the proxy 2 MB limit.",
  TIMEOUT: "The target did not respond before the proxy timeout.",
};
let rowSequence = 10;

function row(key = "", value = ""): UiRow {
  rowSequence += 1;
  return { id: rowSequence, key, value };
}

function stripRows(rows: UiRow[]): KeyValueInput[] {
  return rows.map(({ key, value, enabled }) => ({ key, value, enabled }));
}

function KeyValueEditor({ rows, onChange, keyLabel, valueLabel }: { rows: UiRow[]; onChange: (rows: UiRow[]) => void; keyLabel: string; valueLabel: string }) {
  function update(id: number, field: "key" | "value", value: string) {
    onChange(rows.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }
  return <div className="api-row-editor">
    <div className="api-row-head"><span>{keyLabel}</span><span>{valueLabel}</span><span className="sr-only">Actions</span></div>
    {rows.map((item, index) => <div className="api-kv-row" key={item.id}>
      <label><span className="sr-only">{keyLabel} {index + 1}</span><input aria-label={`${keyLabel} ${index + 1}`} value={item.key} onChange={(event) => update(item.id, "key", event.target.value)} autoComplete="off" /></label>
      <label><span className="sr-only">{valueLabel} {index + 1}</span><input aria-label={`${valueLabel} ${index + 1}`} value={item.value} onChange={(event) => update(item.id, "value", event.target.value)} autoComplete="off" /></label>
      <IconAction label={`Remove row ${index + 1}`} onClick={() => onChange(rows.length === 1 ? [{ ...item, key: "", value: "" }] : rows.filter((candidate) => candidate.id !== item.id))}><X size={15} /></IconAction>
    </div>)}
    <button className="api-add-row" type="button" onClick={() => onChange([...rows, row()])}><Plus size={14} aria-hidden="true" />Add row</button>
  </div>;
}

export function ApiClientTool() {
  const [requestMode, setRequestMode] = useState<RequestMode>("browser");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("");
  const [params, setParams] = useState<UiRow[]>([{ id: 1, key: "", value: "" }]);
  const [headers, setHeaders] = useState<UiRow[]>([{ id: 2, key: "", value: "" }]);
  const [auth, setAuth] = useState<AuthInput>({ mode: "none" });
  const [bodyMode, setBodyMode] = useState<BodyMode>("none");
  const [body, setBody] = useState("");
  const [form, setForm] = useState<UiRow[]>([{ id: 3, key: "", value: "" }]);
  const [timeoutSeconds, setTimeoutSeconds] = useState(15);
  const [requestTab, setRequestTab] = useState<RequestTab>("params");
  const [responseTab, setResponseTab] = useState<ResponseTab>("body");
  const [viewMode, setViewMode] = useState<"pretty" | "raw">("pretty");
  const [result, setResult] = useState<ResponseResult | null>(null);
  const [error, setError] = useState("");
  const [errorTitle, setErrorTitle] = useState("Request failed");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [curlInput, setCurlInput] = useState("");
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>("curl");
  const [copied, setCopied] = useState<"body" | "headers" | "code" | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const canceledRef = useRef(false);

  const draft: RequestDraft = useMemo(() => ({ method, url, params: stripRows(params), headers: stripRows(headers), auth, bodyMode, body, form: stripRows(form), timeoutSeconds }), [method, url, params, headers, auth, bodyMode, body, form, timeoutSeconds]);
  const generatedCode = useMemo(() => {
    try { return generateCode(draft, codeLanguage); } catch (caught) { return caught instanceof Error ? caught.message : "Complete the request to generate code."; }
  }, [draft, codeLanguage]);

  function resetFeedback() {
    setError("");
    setErrorTitle("Request failed");
    setNotice("");
  }

  function proxyResult(result: ProxySuccessResponse): ResponseResult {
    const raw = result.body;
    return {
      status: result.status,
      statusText: result.statusText,
      duration: result.responseTimeMs,
      bytes: result.responseSize,
      contentType: result.contentType,
      headers: formatResponseHeaders(new Headers(result.headers)),
      raw,
      pretty: result.bodyEncoding === "text" ? formatResponseBody(raw) : raw,
      bodyEncoding: result.bodyEncoding,
      redirects: result.redirects.length,
    };
  }

  async function sendRequest() {
    resetFeedback();
    setResult(null);
    let prepared;
    try { prepared = prepareRequest(draft); } catch (caught) { setError(caught instanceof Error ? caught.message : "Check the request fields."); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    canceledRef.current = false;
    setLoading(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, prepared.timeoutMs + (requestMode === "proxy" ? 2_000 : 0));
    const started = performance.now();
    try {
      if (requestMode === "proxy") {
        const response = await fetch("/api/http-proxy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: prepared.url, method: prepared.method, headers: prepared.headers, body: prepared.body ?? null, timeoutMs: prepared.timeoutMs }),
          signal: controller.signal,
        });
        const data = await response.json() as ProxyApiResponse;
        if (!data.ok) {
          setErrorTitle(data.error.code === "RATE_LIMITED" ? "Rate limit reached" : data.error.code === "BLOCKED_TARGET" ? "Target blocked" : data.error.code === "TIMEOUT" ? "Request timed out" : "Proxy request failed");
          setError(proxyErrorMessages[data.error.code] ?? data.error.message);
          return;
        }
        setResult(proxyResult(data));
        setNotice(`Proxy request completed with HTTP ${data.status}.`);
      } else {
        const response = await fetch(prepared.url, { method: prepared.method, headers: prepared.headers, body: prepared.body, signal: controller.signal });
        const responseBody = await readResponseBody(response, MAX_RESPONSE_BYTES);
        const duration = Math.round(performance.now() - started);
        setResult({
          status: response.status,
          statusText: response.statusText,
          duration,
          bytes: responseBody.bytes,
          contentType: response.headers.get("content-type") ?? "Not exposed",
          headers: formatResponseHeaders(response.headers),
          raw: responseBody.text,
          pretty: formatResponseBody(responseBody.text),
          bodyEncoding: "text",
          redirects: 0,
        });
        setNotice(`Request completed with HTTP ${response.status}.`);
      }
      setResponseTab("body");
    } catch (caught) {
      setError(classifyRequestError(caught, timedOut && !canceledRef.current));
    } finally {
      window.clearTimeout(timeout);
      controllerRef.current = null;
      setLoading(false);
    }
  }

  function cancelRequest() {
    canceledRef.current = true;
    controllerRef.current?.abort();
  }

  function clearRequest() {
    cancelRequest();
    setMethod("GET"); setUrl(""); setParams([row()]); setHeaders([row()]); setAuth({ mode: "none" });
    setBodyMode("none"); setBody(""); setForm([row()]); setTimeoutSeconds(15); setResult(null); setError("");
    setNotice("Cleared request data and credentials from this page."); setCurlInput(""); setCopied(null);
  }

  function changeMode(mode: RequestMode) {
    cancelRequest();
    setRequestMode(mode);
    setResult(null);
    resetFeedback();
  }

  function useExample() {
    setMethod("GET"); setUrl("https://jsonplaceholder.typicode.com/posts");
    setParams([{ ...row(), key: "userId", value: "1" }]); setHeaders([{ ...row(), key: "Accept", value: "application/json" }]);
    setAuth({ mode: "none" }); setBodyMode("none"); setBody(""); setForm([row()]); setResult(null); resetFeedback();
  }

  function importCurl() {
    try {
      const imported = parseCurlCommand(curlInput);
      setMethod(imported.method); setUrl(imported.url); setParams(imported.params.length ? imported.params.map((item) => ({ ...item, id: row().id })) : [row()]);
      setHeaders(imported.headers.length ? imported.headers.map((item) => ({ ...item, id: row().id })) : [row()]);
      setAuth(imported.auth); setBodyMode(imported.bodyMode); setBody(imported.body);
      setForm(imported.form.length ? imported.form.map((item) => ({ ...item, id: row().id })) : [row()]);
      setTimeoutSeconds(imported.timeoutSeconds); setResult(null); setError(""); setNotice("Imported the supported cURL fields.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to import this cURL command."); }
  }

  async function copy(value: string, target: "body" | "headers" | "code") {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value); setCopied(target); setNotice(`Copied ${target}.`);
      window.setTimeout(() => setCopied((current) => current === target ? null : current), 1500);
    } catch { setError("Clipboard access failed. Check browser permissions and try again."); }
  }

  function downloadResponse() {
    if (!result?.raw) return;
    const content = result.bodyEncoding === "base64"
      ? Uint8Array.from(atob(result.raw), (character) => character.charCodeAt(0))
      : result.raw;
    const objectUrl = URL.createObjectURL(new Blob([content], { type: result.contentType === "Not exposed" ? "text/plain" : result.contentType }));
    const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = result.contentType.includes("json") ? "response.json" : "response.txt"; anchor.click(); URL.revokeObjectURL(objectUrl);
  }

  const bodyDisabled = method === "GET" || method === "HEAD";
  const displayedBody = result ? (viewMode === "pretty" ? result.pretty : result.raw) : "";

  return <div className="workspace api-workspace">
    <div className="api-mode-bar">
      <SegmentedControl label="Request mode" value={requestMode} onChange={changeMode} options={[{ value: "browser", label: "Browser" }, { value: "proxy", label: "Proxy" }]} />
      <span>{requestMode === "browser" ? "Direct request. CORS applies." : "Vercel proxy. Public targets only."}</span>
    </div>
    <div className="api-address-bar">
      <label className="sr-only" htmlFor="api-method">HTTP method</label>
      <select id="api-method" aria-label="HTTP method" value={method} onChange={(event) => { const next = event.target.value as HttpMethod; setMethod(next); if (next === "GET" || next === "HEAD") setBodyMode("none"); resetFeedback(); }}>{methods.map((item) => <option key={item}>{item}</option>)}</select>
      <label className="sr-only" htmlFor="api-url">Endpoint URL</label>
      <input id="api-url" aria-label="Endpoint URL" type="url" value={url} onChange={(event) => { setUrl(event.target.value); resetFeedback(); }} placeholder="https://api.example.com/v1/resource" autoComplete="off" spellCheck={false} />
      {loading ? <ActionButton variant="danger" onClick={cancelRequest} icon={<Square size={14} />}>Cancel</ActionButton> : <ActionButton variant="primary" onClick={() => void sendRequest()} icon={<Send size={15} />}>Send</ActionButton>}
    </div>

    <div className="api-layout">
      <section className="api-request" aria-label="Request builder">
        <div className="api-tabs" role="tablist" aria-label="Request options">
          {(["params", "headers", "auth", "body"] as RequestTab[]).map((tab) => <button type="button" role="tab" aria-selected={requestTab === tab} key={tab} className={requestTab === tab ? "active" : ""} onClick={() => setRequestTab(tab)}>{tab === "params" ? "Params" : tab[0].toUpperCase() + tab.slice(1)}</button>)}
        </div>
        <div className="api-tab-panel" role="tabpanel">
          {requestTab === "params" && <KeyValueEditor rows={params} onChange={setParams} keyLabel="Parameter" valueLabel="Value" />}
          {requestTab === "headers" && <KeyValueEditor rows={headers} onChange={setHeaders} keyLabel="Header" valueLabel="Value" />}
          {requestTab === "auth" && <div className="api-auth-panel">
            <label className="api-field"><span>Authorization type</span><select aria-label="Authorization type" value={auth.mode} onChange={(event) => setAuth({ mode: event.target.value as AuthInput["mode"] })}><option value="none">None</option><option value="bearer">Bearer Token</option><option value="basic">Basic Auth</option></select></label>
            {auth.mode === "bearer" && <label className="api-field"><span>Bearer token</span><input aria-label="Bearer token" type="password" value={auth.token ?? ""} onChange={(event) => setAuth({ mode: "bearer", token: event.target.value })} autoComplete="off" /></label>}
            {auth.mode === "basic" && <><label className="api-field"><span>Username</span><input aria-label="Basic Auth username" value={auth.username ?? ""} onChange={(event) => setAuth((current) => ({ ...current, username: event.target.value }))} autoComplete="off" /></label><label className="api-field"><span>Password</span><input aria-label="Basic Auth password" type="password" value={auth.password ?? ""} onChange={(event) => setAuth((current) => ({ ...current, password: event.target.value }))} autoComplete="off" /></label></>}
            <p>{requestMode === "browser" ? "Authorization values stay in page memory and are sent directly to the target endpoint." : "Authorization values stay in page memory, pass through Naminc infrastructure, and are forwarded to the target."}</p>
          </div>}
          {requestTab === "body" && <div className="api-body-panel">
            {bodyDisabled ? <div className="api-panel-empty">{method} requests do not include a request body.</div> : <>
              <SegmentedControl label="Request body type" value={bodyMode} onChange={setBodyMode} options={[{ value: "none", label: "None" }, { value: "json", label: "JSON" }, { value: "text", label: "Text" }, { value: "xml", label: "XML" }, { value: "form", label: "Form" }]} />
              {bodyMode === "form" ? <KeyValueEditor rows={form} onChange={setForm} keyLabel="Field" valueLabel="Value" /> : bodyMode !== "none" ? <label className="api-body-editor"><span>Request body</span><textarea aria-label="Request body" value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} placeholder={bodyMode === "json" ? '{"name":"Naminc"}' : bodyMode === "xml" ? "<request></request>" : "Request text"} /></label> : <div className="api-panel-empty">Select a body type to add request data.</div>}
            </>}
          </div>}
        </div>
        <div className="api-request-settings"><label>Timeout<input aria-label="Request timeout in seconds" type="number" min={1} max={15} value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(Number(event.target.value))} /><span>seconds</span></label><span>{requestMode === "proxy" ? "Request: 1 MB / Response: 2 MB" : "Response limit: 2 MB"}</span></div>
      </section>

      <section className="api-response" aria-label="Response viewer" aria-busy={loading}>
        <div className="api-response-head">
          <div className="api-tabs" role="tablist" aria-label="Response sections"><button type="button" role="tab" aria-selected={responseTab === "body"} className={responseTab === "body" ? "active" : ""} onClick={() => setResponseTab("body")}>Body</button><button type="button" role="tab" aria-selected={responseTab === "headers"} className={responseTab === "headers" ? "active" : ""} onClick={() => setResponseTab("headers")}>Headers</button></div>
          {result && <div className="api-response-metrics"><strong className={result.status >= 400 ? "error" : ""}>{result.status} {result.statusText}</strong><span>{result.duration} ms</span><span>{formatBytes(result.bytes)}</span>{result.redirects > 0 && <span>{result.redirects} redirect{result.redirects === 1 ? "" : "s"}</span>}</div>}
        </div>
        {loading ? <div className="api-loading" role="status"><span>Sending request</span><i /><i /><i /></div> : error ? <div className="api-response-error" role="alert"><strong>{errorTitle}</strong><p>{error}</p></div> : !result ? <div className="api-response-empty"><strong>No response yet</strong><p>{requestMode === "browser" ? "Configure the request and select Send. Browser CORS rules apply." : "Configure the request and select Send. Private network targets are blocked."}</p></div> : <>
          <div className="api-response-toolbar">
            {responseTab === "body" ? <SegmentedControl label="Response body view" value={viewMode} onChange={setViewMode} options={[{ value: "pretty", label: "Pretty" }, { value: "raw", label: "Raw" }]} /> : <span>{result.contentType}</span>}
            <div className="button-row">{responseTab === "body" && <IconAction label="Download response body" onClick={downloadResponse}><Download size={15} /></IconAction>}<IconAction label={`Copy response ${responseTab}`} onClick={() => void copy(responseTab === "body" ? displayedBody : result.headers, responseTab)}>{copied === responseTab ? <Check size={15} /> : <Clipboard size={15} />}</IconAction></div>
          </div>
          <pre className="api-response-content">{responseTab === "body" ? (result.bodyEncoding === "base64" && displayedBody ? `Base64 encoded binary response:\n${displayedBody}` : displayedBody || "This response has no body.") : result.headers || "No response headers are exposed."}</pre>
        </>}
      </section>
    </div>

    {notice && !error && <Status type="success">{notice}</Status>}
    {requestMode === "browser"
      ? <Status type="info">Requests are sent directly from your browser to the target endpoint. CORS rules apply.</Status>
      : <Status type="info">Proxy mode sends the request through Naminc infrastructure. Do not use production credentials unless you trust this service.</Status>}

    <div className="api-utilities">
      <details><summary>Import cURL</summary><div className="api-utility-content"><label className="api-body-editor"><span>cURL command</span><textarea aria-label="cURL command" value={curlInput} onChange={(event) => setCurlInput(event.target.value)} placeholder="curl -X POST https://api.example.com -H 'Content-Type: application/json' -d '{&quot;ok&quot;:true}'" spellCheck={false} /></label><p>Supports URL, method, headers, data, Basic Auth, and Bearer headers. Shell commands are parsed as text and never executed.</p><ActionButton onClick={importCurl}>Import request</ActionButton></div></details>
      <details><summary><Code2 size={15} aria-hidden="true" />Generate code</summary><div className="api-utility-content"><SegmentedControl label="Code language" value={codeLanguage} onChange={setCodeLanguage} options={[{ value: "curl", label: "cURL" }, { value: "javascript", label: "Browser Fetch" }, { value: "node", label: "Node.js" }, { value: "python", label: "Python" }]} /><div className="api-code-head"><span>Generated request</span><IconAction label="Copy generated code" onClick={() => void copy(generatedCode, "code")}>{copied === "code" ? <Check size={15} /> : <Clipboard size={15} />}</IconAction></div><pre className="api-code-output">{generatedCode}</pre></div></details>
    </div>

    <div className="workspace-footer"><button className="text-button" type="button" onClick={useExample}>Use example</button><ActionButton onClick={clearRequest} icon={<Trash2 size={15} />}>Clear</ActionButton></div>
  </div>;
}
