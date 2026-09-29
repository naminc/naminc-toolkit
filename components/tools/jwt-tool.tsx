"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { ClearButton, CopyButton, Status } from "@/components/tool-ui";
import { parseJwt } from "@/lib/tool-utils";

const sample = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ik5hbWluYyIsImlhdCI6MTUxNjIzOTAyMn0.invalid-signature";

function timeClaim(payload: Record<string, unknown>, key: "iat" | "exp") {
  const value = payload[key];
  if (typeof value !== "number") return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : { key, value, formatted: date.toLocaleString(), iso: date.toISOString() };
}

export function JwtTool() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<{ header: string; payload: string; rawPayload: Record<string, unknown> } | null>(null);
  const [error, setError] = useState("");

  function decode(value = token) {
    try {
      const decoded = parseJwt(value);
      setResult({ header: JSON.stringify(decoded.header, null, 2), payload: JSON.stringify(decoded.payload, null, 2), rawPayload: decoded.payload }); setError("");
    } catch (caught) { setResult(null); setError(caught instanceof Error ? caught.message : "Unable to decode this token."); }
  }

  const claims = result ? ([timeClaim(result.rawPayload, "iat"), timeClaim(result.rawPayload, "exp")].filter(Boolean) as NonNullable<ReturnType<typeof timeClaim>>[]) : [];
  return (
    <div className="workspace">
      <label className="field-label" htmlFor="jwt-input">Encoded token</label>
      <textarea id="jwt-input" className="code-input compact-area" value={token} onChange={(event) => { setToken(event.target.value); setError(""); }} placeholder="Paste a JSON Web Token" spellCheck={false} />
      <div className="workspace-actions"><button className="button button-primary" type="button" onClick={() => decode()}>Decode token</button><button className="text-button" type="button" onClick={() => { setToken(sample); decode(sample); }}>Use example</button><span className="action-spacer" /><ClearButton onClick={() => { setToken(""); setResult(null); setError(""); }} /></div>
      {error && <Status type="error">{error}</Status>}
      <Status type="info"><AlertTriangle size={17} aria-hidden="true" />Decoding does not verify the token signature. Never trust a JWT until your application verifies it.</Status>
      {result && <>
        <div className="editor-grid result-grid"><div className="result-panel"><div className="panel-heading"><span>Header</span><CopyButton value={result.header} label="Copy" /></div><pre>{result.header}</pre></div><div className="result-panel"><div className="panel-heading"><span>Payload</span><CopyButton value={result.payload} label="Copy" /></div><pre>{result.payload}</pre></div></div>
        {claims.length > 0 && <div className="claim-grid">{claims.map((claim) => <div className="claim" key={claim.key}><span>{claim.key}</span><strong>{claim.formatted}</strong><small>{claim.iso}</small></div>)}</div>}
      </>}
    </div>
  );
}
