"use client";

import { Clock, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ActionButton, ClearButton, CopyButton, SegmentedControl, Status } from "@/components/tool-ui";
import { dateToTimestamps, timestampToDate } from "@/lib/tool-utils";

type Result = { local: string; utc: string; iso: string; seconds: string; milliseconds: string };

export function TimestampTool() {
  const [mode, setMode] = useState<"timestamp" | "date">("timestamp"); const [unit, setUnit] = useState<"seconds" | "milliseconds">("seconds");
  const [value, setValue] = useState(""); const [result, setResult] = useState<Result | null>(null); const [error, setError] = useState("");
  function convert(input = value) { try { let date: Date; let seconds: number; let milliseconds: number; if (mode === "timestamp") { date = timestampToDate(input, unit); milliseconds = date.getTime(); seconds = Math.floor(milliseconds / 1000); } else { const converted = dateToTimestamps(input); date = new Date(converted.milliseconds); seconds = converted.seconds; milliseconds = converted.milliseconds; } setResult({ local: date.toLocaleString(), utc: date.toUTCString(), iso: date.toISOString(), seconds: String(seconds), milliseconds: String(milliseconds) }); setError(""); } catch (caught) { setResult(null); setError(caught instanceof Error ? caught.message : "Unable to convert this value."); } }
  function useNow() { const now = new Date(); const next = mode === "timestamp" ? String(unit === "seconds" ? Math.floor(now.getTime() / 1000) : now.getTime()) : new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); setValue(next); window.setTimeout(() => convert(next), 0); }
  return <div className="workspace">
    <div className="workspace-toolbar"><SegmentedControl label="Input type" value={mode} onChange={(next) => { setMode(next); setValue(""); setResult(null); }} options={[{ value: "timestamp", label: "Timestamp to date" }, { value: "date", label: "Date to timestamp" }]} />{mode === "timestamp" && <SegmentedControl label="Timestamp unit" value={unit} onChange={(next) => { setUnit(next); setResult(null); }} options={[{ value: "seconds", label: "Seconds" }, { value: "milliseconds", label: "Milliseconds" }]} />}</div>
    <label className="field-label" htmlFor="timestamp-input">{mode === "timestamp" ? `Unix timestamp (${unit})` : "Local date and time"}</label>
    <div className="inline-field"><input id="timestamp-input" type={mode === "date" ? "datetime-local" : "text"} inputMode={mode === "timestamp" ? "numeric" : undefined} value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === "timestamp" ? "e.g. 1727000000" : undefined} /><ActionButton onClick={useNow} icon={<Clock size={16} />}>Now</ActionButton><ActionButton variant="primary" onClick={() => convert()} icon={<RefreshCw size={16} />}>Convert</ActionButton></div>
    {error && <Status type="error">{error}</Status>}
    {result && <div className="value-list">{([['Local time', result.local], ['UTC', result.utc], ['ISO 8601', result.iso], ['Unix seconds', result.seconds], ['Unix milliseconds', result.milliseconds]] as const).map(([label, output]) => <div className="value-row" key={label}><span>{label}</span><code>{output}</code><CopyButton value={output} label="Copy" /></div>)}</div>}
    <div className="workspace-footer"><span /><ClearButton onClick={() => { setValue(""); setResult(null); setError(""); }} /></div>
  </div>;
}
