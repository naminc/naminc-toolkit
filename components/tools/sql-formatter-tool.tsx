"use client";

import { ArrowLeftRight, Download, FileUp, Settings2, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton, ClearButton, CopyButton, Status } from "@/components/tool-ui";
import {
  defaultSqlFormatterSettings,
  formatSql,
  sqlByteSize,
  sqlDialects,
  sqlDownloadFile,
  sqlLineCount,
  validateSqlFile,
  type SqlDialectId,
  type SqlFormatResult,
  type SqlFormatterSettings,
} from "@/lib/sql-formatter";

const sqlSample = `WITH active_projects AS (
  SELECT p.id, p.name, COUNT(t.id) AS task_count
  FROM projects p
  LEFT JOIN tasks t ON t.project_id = p.id AND t.completed_at IS NULL
  WHERE p.archived_at IS NULL
  GROUP BY p.id, p.name
)
SELECT id, name, task_count
FROM active_projects
WHERE task_count > 0
ORDER BY task_count DESC;`;

function dialectLabel(dialect: SqlDialectId) {
  return sqlDialects.find((item) => item.id === dialect)?.label ?? "Standard SQL";
}

function resultMessage(result: SqlFormatResult, dialect: SqlDialectId) {
  if (result.ok) return `Formatted successfully using ${dialectLabel(dialect)}.`;
  const location = result.line ? ` Line ${result.line}${result.column ? `, column ${result.column}` : ""}.` : "";
  return `${result.message}${location} Dialect: ${dialectLabel(dialect)}.`;
}

export function SqlFormatterTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [dialect, setDialect] = useState<SqlDialectId>("sql");
  const [settings, setSettings] = useState<SqlFormatterSettings>(defaultSqlFormatterSettings);
  const [autoFormat, setAutoFormat] = useState(true);
  const [result, setResult] = useState<SqlFormatResult | null>(null);
  const [status, setStatus] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFormat || !input.trim()) return;
    const timer = window.setTimeout(() => {
      const next = formatSql(input, dialect, settings);
      setResult(next);
      setOutput(next.ok ? next.output : "");
      setStatus({ type: next.ok ? "success" : "error", text: resultMessage(next, dialect) });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [autoFormat, dialect, input, settings]);

  function runFormat() {
    const next = formatSql(input, dialect, settings);
    setResult(next);
    setOutput(next.ok ? next.output : "");
    setStatus({ type: next.ok ? "success" : "error", text: resultMessage(next, dialect) });
  }

  function changeInput(value: string) {
    setInput(value);
    setOutput("");
    setResult(null);
    setStatus(null);
  }

  function formatInputInPlace() {
    const next = formatSql(input, dialect, settings);
    setResult(next);
    setOutput(next.ok ? next.output : "");
    if (next.ok) setInput(next.output);
    setStatus({ type: next.ok ? "success" : "error", text: next.ok ? `Input formatted using ${dialectLabel(dialect)}.` : resultMessage(next, dialect) });
  }

  function swap() {
    if (!result?.ok || !output) {
      setStatus({ type: "error", text: "Format the current input successfully before swapping." });
      return;
    }
    const previousInput = input;
    setInput(output);
    setOutput(previousInput);
    setResult({ ok: true, output: previousInput, inputBytes: sqlByteSize(output), outputBytes: sqlByteSize(previousInput) });
    setStatus({ type: "info", text: "Swapped the valid input and output." });
  }

  async function openFile(file?: File) {
    if (!file) return;
    try {
      validateSqlFile(file);
      const content = await file.text();
      changeInput(content);
      setStatus({ type: "info", text: "Loaded a local SQL file. Its contents were not uploaded." });
    } catch (caught) {
      setOutput("");
      setResult(null);
      setStatus({ type: "error", text: caught instanceof Error ? caught.message : "The local file could not be read." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function download() {
    if (!result?.ok || !output) return;
    const file = sqlDownloadFile();
    const objectUrl = URL.createObjectURL(new Blob([output], { type: file.type }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  function clear() {
    setInput("");
    setOutput("");
    setResult(null);
    setStatus(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function updateSettings<K extends keyof SqlFormatterSettings>(key: K, value: SqlFormatterSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  const inputBytes = result?.inputBytes ?? sqlByteSize(input);
  const outputBytes = result?.ok ? result.outputBytes : sqlByteSize(output);

  return <div className="workspace sql-workspace">
    <div className="workspace-toolbar sql-toolbar">
      <label className="sql-dialect-field"><span>SQL dialect</span><select aria-label="SQL dialect" value={dialect} onChange={(event) => setDialect(event.target.value as SqlDialectId)}>{sqlDialects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <details className="sql-settings">
        <summary><Settings2 size={15} aria-hidden="true" />Advanced settings</summary>
        <div className="sql-settings-grid">
          <label>Indentation<select aria-label="SQL indentation" value={settings.indentation} onChange={(event) => updateSettings("indentation", event.target.value as SqlFormatterSettings["indentation"])}><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option></select></label>
          <label>Keyword case<select aria-label="SQL keyword case" value={settings.keywordCase} onChange={(event) => updateSettings("keywordCase", event.target.value as SqlFormatterSettings["keywordCase"])}><option value="upper">Uppercase</option><option value="lower">Lowercase</option><option value="preserve">Preserve</option></select></label>
          <label>Data type case<select aria-label="SQL data type case" value={settings.dataTypeCase} onChange={(event) => updateSettings("dataTypeCase", event.target.value as SqlFormatterSettings["dataTypeCase"])}><option value="upper">Uppercase</option><option value="lower">Lowercase</option><option value="preserve">Preserve</option></select></label>
          <label>Function case<select aria-label="SQL function case" value={settings.functionCase} onChange={(event) => updateSettings("functionCase", event.target.value as SqlFormatterSettings["functionCase"])}><option value="upper">Uppercase</option><option value="lower">Lowercase</option><option value="preserve">Preserve</option></select></label>
          <label>Logical operators<select aria-label="SQL logical operator newline" value={settings.logicalOperatorNewline} onChange={(event) => updateSettings("logicalOperatorNewline", event.target.value as SqlFormatterSettings["logicalOperatorNewline"])}><option value="before">Before operator</option><option value="after">After operator</option></select></label>
          <label>Expression width<input aria-label="SQL expression width" type="number" min={20} max={120} value={settings.expressionWidth} onChange={(event) => updateSettings("expressionWidth", Math.min(120, Math.max(20, Number(event.target.value) || 50)))} /></label>
          <label>Between statements<select aria-label="Lines between SQL statements" value={settings.linesBetweenQueries} onChange={(event) => updateSettings("linesBetweenQueries", Number(event.target.value) as 1 | 2)}><option value={1}>1 line</option><option value={2}>2 lines</option></select></label>
          <label className="sql-check"><input aria-label="Dense SQL operators" type="checkbox" checked={settings.denseOperators} onChange={(event) => updateSettings("denseOperators", event.target.checked)} /><span>Dense operators</span></label>
          <label className="sql-check"><input aria-label="Auto format SQL" type="checkbox" checked={autoFormat} onChange={(event) => setAutoFormat(event.target.checked)} /><span>Auto format</span></label>
        </div>
      </details>
    </div>

    <div className="sql-actions">
      <div className="button-row"><ActionButton variant="primary" onClick={runFormat} disabled={!input.trim()} icon={<WandSparkles size={15} />}>Format</ActionButton><ActionButton onClick={formatInputInPlace} disabled={!input.trim()}>Format input</ActionButton><ActionButton onClick={swap} disabled={!result?.ok || !output} icon={<ArrowLeftRight size={15} />}>Swap</ActionButton></div>
      <div className="button-row"><input ref={fileRef} className="sr-only" aria-label="Open SQL file" type="file" accept=".sql,application/sql,application/x-sql,text/sql,text/plain" onChange={(event) => void openFile(event.target.files?.[0])} /><ActionButton onClick={() => fileRef.current?.click()} icon={<FileUp size={15} />}>Open</ActionButton><ActionButton onClick={download} disabled={!result?.ok || !output} icon={<Download size={15} />}>Download</ActionButton></div>
    </div>

    <div className="editor-grid sql-editors">
      <label className="editor-panel"><span>SQL input</span><textarea aria-label="SQL input" value={input} onChange={(event) => changeInput(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); runFormat(); } }} placeholder="SELECT id, name FROM users WHERE active = true;" spellCheck={false} /></label>
      <label className="editor-panel"><span>Formatted output</span><textarea aria-label="Formatted SQL output" value={output} readOnly placeholder="Formatted SQL appears here" spellCheck={false} /></label>
    </div>

    <div className="sql-metrics" aria-label="SQL formatting statistics"><span>{inputBytes.toLocaleString()} B input</span><span>{outputBytes.toLocaleString()} B output</span><span>{sqlLineCount(input)} input lines</span><span>{dialectLabel(dialect)}</span><span>{autoFormat ? "Auto format on" : "Manual format"}</span></div>
    {status && <Status type={status.type}>{status.text}</Status>}
    <div className="sql-safety-note" role="note">This tool formats SQL but does not execute queries or verify them against a database.</div>
    <Status type="info">Your SQL is processed locally in your browser.</Status>
    <div className="workspace-footer"><button className="text-button" type="button" onClick={() => changeInput(sqlSample)}>Use example</button><div className="button-row"><ClearButton onClick={clear} /><CopyButton value={output} label="Copy output" /></div></div>
  </div>;
}
