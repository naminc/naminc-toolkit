"use client";

import { Download, Play, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionButton, ClearButton, CopyButton, SegmentedControl, Status } from "@/components/tool-ui";
import {
  analyzeCron,
  buildCronExpression,
  cronDownloadText,
  cronPresets,
  cronTimeZones,
  defaultCronBuilder,
  type CronAnalysis,
  type CronBuilder,
  type CronResult,
  type CronSyntaxMode,
  type CronTimeZone,
} from "@/lib/cron-expression";

type WorkspaceMode = "parse" | "build";

const builderOptions = {
  second: [["0", "At second 0"], ["15", "At second 15"], ["30", "At second 30"], ["45", "At second 45"], ["*", "Every second"]],
  minute: [["*", "Every minute"], ["*/5", "Every 5 minutes"], ["*/15", "Every 15 minutes"], ["*/30", "Every 30 minutes"], ["0", "At minute 0"], ["15", "At minute 15"], ["30", "At minute 30"], ["45", "At minute 45"]],
  hour: [["*", "Every hour"], ["0", "00:00"], ["6", "06:00"], ["9", "09:00"], ["12", "12:00"], ["17", "17:00"], ["9-17", "09:00 through 17:59"]],
  dayOfMonth: [["*", "Every day"], ["1", "Day 1"], ["15", "Day 15"], ["28", "Day 28"]],
  month: [["*", "Every month"], ["JAN", "January"], ["APR", "April"], ["JUL", "July"], ["OCT", "October"], ["DEC", "December"]],
  dayOfWeek: [["*", "Every day"], ["1-5", "Monday through Friday"], ["0", "Sunday"], ["1", "Monday"], ["5", "Friday"], ["6", "Saturday"]],
} satisfies Record<keyof CronBuilder, readonly (readonly [string, string])[]>;

function builderFromExpression(expression: string, mode: CronSyntaxMode): CronBuilder {
  const parts = expression.split(" ");
  const standard = mode === "six" ? parts.slice(1) : parts;
  return {
    second: mode === "six" ? parts[0] : "0",
    minute: standard[0],
    hour: standard[1],
    dayOfMonth: standard[2],
    month: standard[3],
    dayOfWeek: standard[4],
  };
}

function BuilderSelect({ label, field, value, onChange }: { label: string; field: keyof CronBuilder; value: string; onChange: (field: keyof CronBuilder, value: string) => void }) {
  return <label><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(field, event.target.value)}>{builderOptions[field].map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

export function CronExpressionTool() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("parse");
  const [syntaxMode, setSyntaxMode] = useState<CronSyntaxMode>("five");
  const [expression, setExpression] = useState("");
  const [timezone, setTimezone] = useState<CronTimeZone>("local");
  const [builder, setBuilder] = useState<CronBuilder>(defaultCronBuilder);
  const [result, setResult] = useState<CronResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!expression.trim()) return;
    const timer = window.setTimeout(() => {
      const next = analyzeCron(expression, syntaxMode, timezone);
      setResult(next);
      setStatus(next.ok ? "Expression parsed successfully." : next.message);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [expression, syntaxMode, timezone]);

  function parse() {
    const next = analyzeCron(expression, syntaxMode, timezone);
    setResult(next);
    setStatus(next.ok ? "Expression parsed successfully." : next.message);
  }

  function changeExpression(value: string) {
    setExpression(value);
    setResult(null);
    setStatus(null);
  }

  function changeWorkspaceMode(next: WorkspaceMode) {
    setWorkspaceMode(next);
    if (next === "build") {
      const built = buildCronExpression(builder, syntaxMode);
      setExpression(built);
      setResult(null);
      setStatus(null);
    }
  }

  function changeSyntaxMode(next: CronSyntaxMode) {
    setSyntaxMode(next);
    if (workspaceMode === "build") setExpression(buildCronExpression(builder, next));
    setResult(null);
    setStatus(null);
  }

  function changeBuilder(field: keyof CronBuilder, value: string) {
    const next = { ...builder, [field]: value };
    setBuilder(next);
    setExpression(buildCronExpression(next, syntaxMode));
    setResult(null);
    setStatus(null);
  }

  function applyPreset(value: string) {
    const preset = cronPresets[Number(value)];
    if (!preset) return;
    const nextExpression = preset[syntaxMode];
    setBuilder(builderFromExpression(nextExpression, syntaxMode));
    setExpression(nextExpression);
    setResult(null);
    setStatus(null);
  }

  function useExample() {
    setWorkspaceMode("parse");
    setSyntaxMode("five");
    changeExpression("*/15 9-17 * * 1-5");
  }

  function clear() {
    setExpression("");
    setResult(null);
    setStatus(null);
    setBuilder(defaultCronBuilder);
  }

  function download() {
    if (!result?.ok) return;
    const objectUrl = URL.createObjectURL(new Blob([cronDownloadText(result)], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "cron-schedule.txt";
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  const analysis: CronAnalysis | null = result?.ok ? result : null;

  return <div className="workspace cron-workspace">
    <div className="workspace-toolbar cron-toolbar">
      <SegmentedControl label="Cron workspace mode" value={workspaceMode} onChange={changeWorkspaceMode} options={[{ value: "parse", label: "Parse" }, { value: "build", label: "Build" }]} />
      <SegmentedControl label="Cron syntax" value={syntaxMode} onChange={changeSyntaxMode} options={[{ value: "five", label: "Standard 5 fields" }, { value: "six", label: "With seconds 6 fields" }]} />
    </div>

    <div className="cron-expression-bar">
      <label><span>Cron expression</span><input aria-label="Cron expression" value={expression} onChange={(event) => changeExpression(event.target.value)} placeholder={syntaxMode === "five" ? "*/15 9-17 * * 1-5" : "0 */15 9-17 * * 1-5"} autoComplete="off" spellCheck={false} /></label>
      <ActionButton variant="primary" onClick={parse} disabled={!expression.trim()} icon={<Play size={15} />}>Parse</ActionButton>
    </div>

    {workspaceMode === "build" && <div className="cron-builder">
      <div className="cron-builder-heading"><span><SlidersHorizontal size={14} aria-hidden="true" />Schedule controls</span><label>Preset<select aria-label="Cron preset" defaultValue="" onChange={(event) => applyPreset(event.target.value)}><option value="" disabled>Choose preset</option>{cronPresets.map((preset, index) => <option key={preset.label} value={index}>{preset.label}</option>)}</select></label></div>
      <div className="cron-builder-grid">
        {syntaxMode === "six" && <BuilderSelect label="Second" field="second" value={builder.second} onChange={changeBuilder} />}
        <BuilderSelect label="Minute" field="minute" value={builder.minute} onChange={changeBuilder} />
        <BuilderSelect label="Hour" field="hour" value={builder.hour} onChange={changeBuilder} />
        <BuilderSelect label="Day of month" field="dayOfMonth" value={builder.dayOfMonth} onChange={changeBuilder} />
        <BuilderSelect label="Month" field="month" value={builder.month} onChange={changeBuilder} />
        <BuilderSelect label="Day of week" field="dayOfWeek" value={builder.dayOfWeek} onChange={changeBuilder} />
      </div>
    </div>}

    <div className="cron-result-layout">
      <section className="cron-interpretation" aria-label="Cron interpretation">
        <div className="cron-section-heading"><span>Interpretation</span>{analysis && <small>{analysis.syntaxLabel}</small>}</div>
        {!result && <div className="cron-empty"><strong>Enter a schedule to inspect it</strong><span>The field breakdown and next run times will appear here.</span></div>}
        {result && !result.ok && <div className="cron-error"><strong>Invalid expression</strong><span>{result.field ? `${result.field}: ` : ""}{result.message}</span></div>}
        {analysis && <>
          <p className="cron-summary">{analysis.summary}</p>
          <div className="cron-field-table" role="table" aria-label="Cron field explanation">
            <div className="cron-field-row cron-field-head" role="row"><span role="columnheader">Field</span><span role="columnheader">Value</span><span role="columnheader">Meaning</span></div>
            {analysis.fields.map((field) => <div className="cron-field-row" role="row" key={field.name}><span role="cell">{field.name}</span><code role="cell">{field.value}</code><span role="cell">{field.meaning}</span></div>)}
          </div>
          <p className="cron-semantics">When both day-of-month and day-of-week are restricted, this parser uses Vixie cron OR semantics.</p>
        </>}
      </section>

      <section className="cron-runs" aria-label="Next runs">
        <div className="cron-section-heading"><span>Next 10 runs</span><label>Timezone<select aria-label="Timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="local">Browser local</option>{cronTimeZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label></div>
        {!analysis && <div className="cron-empty"><strong>No run times yet</strong><span>Valid expressions are evaluated from the current time.</span></div>}
        {analysis && <div className="cron-run-list">{analysis.runs.map((run, index) => <article key={run.iso} className="cron-run-row"><span className="cron-run-index">{String(index + 1).padStart(2, "0")}</span><div><time dateTime={run.iso}>{run.local}</time><span>{run.relative}</span><code>{run.utc}</code><code>{run.iso}</code></div></article>)}</div>}
        {analysis?.runs.length === 0 && <Status type="info">No matching run was found within the bounded search.</Status>}
        {analysis?.dstWarning && <div className="cron-dst-note" role="note">{analysis.dstWarning}</div>}
      </section>
    </div>

    {status && <Status type={result?.ok ? "success" : "error"}>{status}</Status>}
    <Status type="info">Your cron expressions are processed locally in your browser.</Status>
    <div className="workspace-footer"><button type="button" className="text-button" onClick={useExample}>Use example</button><div className="button-row"><ActionButton onClick={download} disabled={!analysis} icon={<Download size={15} />}>Download</ActionButton><ClearButton onClick={clear} /><CopyButton value={expression} label="Copy expression" /></div></div>
  </div>;
}
