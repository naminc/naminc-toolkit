"use client";

import { Check, Clipboard, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton, IconAction, Status } from "@/components/tool-ui";
import {
  formatTotpCopy,
  generateTotp,
  getTotpCountdown,
  parseTotpLine,
  type TotpAlgorithm,
  type TotpCode,
  type TotpDefaults,
  type TotpEntry,
} from "@/lib/totp";

type ResultRow = {
  id: number;
  label: string;
  issuer?: string;
  entry?: TotpEntry;
  code?: string;
  window?: number;
  error?: string;
};

const SAMPLE = `JBSWY3DPEHPK3PXP
Naminc demo: JBSWY3DPEHPK3PXP
otpauth://totp/Naminc:demo?secret=JBSWY3DPEHPK3PXP&issuer=Naminc`;

function publicCodes(rows: ResultRow[]): TotpCode[] {
  return rows.flatMap((row) => {
    if (!row.entry || !row.code || row.window === undefined) return [];
    return [{
      label: row.entry.label,
      issuer: row.entry.issuer,
      algorithm: row.entry.algorithm,
      digits: row.entry.digits,
      period: row.entry.period,
      lineNumber: row.entry.lineNumber,
      code: row.code,
      window: row.window,
    }];
  });
}

function displayCode(code: string): string {
  const middle = code.length / 2;
  return `${code.slice(0, middle)} ${code.slice(middle)}`;
}

export function TotpTool() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [defaults, setDefaults] = useState<TotpDefaults>({ algorithm: "SHA-1", digits: 6, period: 30 });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | "all" | null>(null);
  const rowsRef = useRef<ResultRow[]>([]);
  const requestRef = useRef(0);
  const refreshingRef = useRef(false);

  function commitRows(next: ResultRow[]) {
    rowsRef.current = next;
    setRows(next);
  }

  async function generateFromInput() {
    const requestId = ++requestRef.current;
    const timestamp = Date.now();
    const lines = input.split(/\r?\n/).map((line, index) => ({ value: line, lineNumber: index + 1 })).filter((line) => line.value.trim());
    if (!lines.length) {
      commitRows([]);
      setMessage("Enter at least one Base32 secret or otpauth URI.");
      return;
    }
    if (lines.length > 200) {
      commitRows([]);
      setMessage("Process up to 200 entries at a time.");
      return;
    }

    setIsGenerating(true);
    const next = await Promise.all(lines.map(async ({ value, lineNumber }): Promise<ResultRow> => {
      try {
        const entry = parseTotpLine(value, lineNumber, defaults);
        const generated = await generateTotp(entry, timestamp);
        return { id: lineNumber, label: entry.label, issuer: entry.issuer, entry, code: generated.code, window: generated.window };
      } catch (error) {
        return { id: lineNumber, label: `Line ${lineNumber}`, error: error instanceof Error ? error.message : "Unable to generate a code." };
      }
    }));

    if (requestId !== requestRef.current) {
      setIsGenerating(false);
      return;
    }
    commitRows(next);
    setNow(timestamp);
    const validCount = next.filter((row) => row.code).length;
    const errorCount = next.length - validCount;
    setMessage(errorCount ? `Generated ${validCount} code${validCount === 1 ? "" : "s"}. ${errorCount} line${errorCount === 1 ? " has" : "s have"} an error.` : `Generated ${validCount} code${validCount === 1 ? "" : "s"}.`);
    setIsGenerating(false);
  }

  useEffect(() => {
    async function refreshExpired(timestamp: number) {
      if (refreshingRef.current) return;
      const current = rowsRef.current;
      const needsRefresh = current.some((row) => row.entry && row.window !== getTotpCountdown(timestamp, row.entry.period).window);
      if (!needsRefresh) return;
      refreshingRef.current = true;
      try {
        const next = await Promise.all(current.map(async (row): Promise<ResultRow> => {
          if (!row.entry || row.window === getTotpCountdown(timestamp, row.entry.period).window) return row;
          try {
            const generated = await generateTotp(row.entry, timestamp);
            return { ...row, code: generated.code, window: generated.window, error: undefined };
          } catch (error) {
            return { ...row, code: undefined, error: error instanceof Error ? error.message : "Unable to refresh this code." };
          }
        }));
        rowsRef.current = next;
        setRows(next);
      } finally {
        refreshingRef.current = false;
      }
    }

    const update = () => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (autoRefresh) void refreshExpired(timestamp);
    };
    const timer = window.setInterval(update, 250);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [autoRefresh]);

  async function copy(value: string, id: number | "all") {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setMessage(id === "all" ? "Copied all generated codes." : "Copied code.");
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1600);
    } catch {
      setMessage("Clipboard access failed. Check your browser permission and try again.");
    }
  }

  function clear() {
    requestRef.current += 1;
    setInput("");
    commitRows([]);
    setMessage("Cleared secrets and generated codes from this page.");
    setIsGenerating(false);
    setCopiedId(null);
  }

  const codes = publicCodes(rows);
  const hasErrors = rows.some((row) => row.error);

  return (
    <div className="workspace totp-workspace">
      <div className="workspace-toolbar totp-toolbar">
        <label className="toggle-field">
          <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
          <span>Auto refresh</span>
        </label>
        <details className="totp-settings">
          <summary><Settings2 size={15} aria-hidden="true" />Advanced settings</summary>
          <div className="settings-grid">
            <label>Algorithm<select value={defaults.algorithm} onChange={(event) => setDefaults((current) => ({ ...current, algorithm: event.target.value as TotpAlgorithm }))}><option>SHA-1</option><option>SHA-256</option><option>SHA-512</option></select></label>
            <label>Digits<select value={defaults.digits} onChange={(event) => setDefaults((current) => ({ ...current, digits: Number(event.target.value) as 6 | 8 }))}><option value="6">6</option><option value="8">8</option></select></label>
            <label>Period<input type="number" min={1} max={300} value={defaults.period} onChange={(event) => setDefaults((current) => ({ ...current, period: Math.min(300, Math.max(1, Number(event.target.value) || 30)) }))} /><span>seconds</span></label>
          </div>
          <p>These defaults apply to plain Base32 secrets. Values inside an otpauth URI take priority.</p>
        </details>
      </div>

      <div className="totp-grid">
        <section className="totp-input-panel" aria-labelledby="totp-input-label">
          <div className="panel-heading"><span id="totp-input-label">Secrets or otpauth URIs</span><button type="button" className="text-button" onClick={() => { setInput(SAMPLE); commitRows([]); setMessage("Loaded public sample secrets."); }}>Use example</button></div>
          <textarea
            aria-label="TOTP secrets"
            value={input}
            onChange={(event) => { setInput(event.target.value); commitRows([]); setMessage(""); }}
            placeholder={"One entry per line\nGitHub: JBSWY3DPEHPK3PXP\notpauth://totp/..."}
            spellCheck={false}
            autoComplete="off"
            maxLength={100000}
          />
          <div className="sensitive-note">A TOTP secret can unlock account codes. Only enter it on a device you trust.</div>
        </section>

        <section className="totp-results" aria-labelledby="totp-results-label">
          <div className="panel-heading"><span id="totp-results-label">Current codes</span><span>{codes.length} valid</span></div>
          {rows.length === 0 ? <div className="totp-empty">Generated codes appear here. Nothing is stored after you leave or reload this page.</div> : <div className="totp-code-list">
            {rows.map((row) => {
              if (row.error || !row.entry || !row.code) return <div className="totp-error-row" key={row.id}><div><strong>{row.label}</strong><span>Input error</span></div><p>{row.error ?? "Unable to generate this code."}</p></div>;
              const countdown = getTotpCountdown(now, row.entry.period);
              return <div className="totp-code-row" key={row.id}>
                <div className="totp-account"><strong>{row.label}</strong><span>{row.issuer ?? `${row.entry.algorithm}, ${row.entry.digits} digits`}</span></div>
                <div className="totp-code-wrap"><code aria-label={`Code for ${row.label}`}>{displayCode(row.code)}</code><span className="totp-remaining">{countdown.remainingSeconds}s</span></div>
                <IconAction label={`Copy code for ${row.label}`} onClick={() => void copy(row.code ?? "", row.id)}>{copiedId === row.id ? <Check size={16} /> : <Clipboard size={16} />}</IconAction>
                <progress className="totp-progress" aria-label={`Time remaining for ${row.label}`} value={countdown.progress} max={1} />
              </div>;
            })}
          </div>}
        </section>
      </div>

      {message && <Status type={hasErrors ? "error" : "success"}>{message}</Status>}
      <Status type="info">Your secrets are processed locally and never leave your browser.</Status>

      <div className="workspace-footer">
        <ActionButton variant="primary" disabled={isGenerating} onClick={() => void generateFromInput()} icon={<RefreshCw size={16} />}>{isGenerating ? "Generating" : "Generate codes"}</ActionButton>
        <div className="button-row">
          <ActionButton onClick={clear} icon={<Trash2 size={16} />}>Clear</ActionButton>
          <ActionButton disabled={!codes.length} onClick={() => void copy(formatTotpCopy(codes), "all")} icon={copiedId === "all" ? <Check size={16} /> : <Clipboard size={16} />}>{copiedId === "all" ? "Copied" : "Copy all"}</ActionButton>
        </div>
      </div>
    </div>
  );
}
