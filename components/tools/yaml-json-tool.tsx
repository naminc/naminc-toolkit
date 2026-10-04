"use client";

import { ArrowLeftRight, Download, FileUp, Settings2, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton, ClearButton, CopyButton, SegmentedControl, Status } from "@/components/tool-ui";
import {
  byteSize,
  convertInput,
  defaultConverterSettings,
  formatInput,
  outputFile,
  validateInput,
  validateUpload,
  type ConversionDirection,
  type ConversionResult,
  type ConverterSettings,
} from "@/lib/yaml-json";

const yamlSample = `# Naminc Tech Tools example
service:
  name: naminc.tech
  enabled: true
  ports:
    - 80
    - 443
  metadata:
    owner: Naminc
    private: false
`;

const jsonSample = `{
  "service": {
    "name": "naminc.tech",
    "enabled": true,
    "ports": [80, 443],
    "metadata": {
      "owner": "Naminc",
      "private": false
    }
  }
}`;

function resultMessage(result: ConversionResult, direction: ConversionDirection, action: "convert" | "format" | "validate") {
  if (!result.ok) {
    const location = result.line ? ` Line ${result.line}${result.column ? `, column ${result.column}` : ""}.` : "";
    const document = result.document && result.document > 1 ? ` Document ${result.document}.` : "";
    return `${result.message}${document}${location}`;
  }
  const format = direction === "yaml-to-json" ? "YAML" : "JSON";
  if (action === "validate") return `Valid ${format}.${direction === "yaml-to-json" ? ` ${result.documentCount} document${result.documentCount === 1 ? "" : "s"} detected.` : ""}`;
  if (action === "format") return `Valid ${format}, formatted successfully.${format === "YAML" ? " Comments were preserved." : ""}`;
  return direction === "yaml-to-json"
    ? `Converted ${result.documentCount} YAML document${result.documentCount === 1 ? "" : "s"} to JSON.`
    : "Converted JSON to YAML.";
}

export function YamlJsonTool() {
  const [direction, setDirection] = useState<ConversionDirection>("yaml-to-json");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [settings, setSettings] = useState<ConverterSettings>(defaultConverterSettings);
  const [autoConvert, setAutoConvert] = useState(true);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [status, setStatus] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoConvert || !input.trim()) return;
    const timer = window.setTimeout(() => {
      const next = convertInput(input, direction, settings);
      setResult(next);
      setOutput(next.ok ? next.output : "");
      setStatus({ type: next.ok ? "success" : "error", text: resultMessage(next, direction, "convert") });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [autoConvert, direction, input, settings]);

  function runConversion() {
    const next = convertInput(input, direction, settings);
    setResult(next);
    setOutput(next.ok ? next.output : "");
    setStatus({ type: next.ok ? "success" : "error", text: resultMessage(next, direction, "convert") });
  }

  function formatCurrentInput() {
    const next = formatInput(input, direction, settings);
    setResult(next);
    if (next.ok) setInput(next.output);
    setStatus({ type: next.ok ? "success" : "error", text: resultMessage(next, direction, "format") });
  }

  function validateCurrentInput() {
    const next = validateInput(input, direction);
    setResult(next);
    setStatus({ type: next.ok ? "success" : "error", text: resultMessage(next, direction, "validate") });
  }

  function changeDirection(next: ConversionDirection) {
    setDirection(next);
    setOutput("");
    setResult(null);
    setStatus(null);
  }

  function swap() {
    if (!result?.ok || !output) {
      setStatus({ type: "error", text: "Convert the current input successfully before swapping." });
      return;
    }
    setDirection((current) => current === "yaml-to-json" ? "json-to-yaml" : "yaml-to-json");
    setInput(output);
    setOutput(input);
    setResult(null);
    setStatus({ type: "info", text: "Swapped the valid input and output. Review the result before downloading." });
  }

  async function openFile(file?: File) {
    if (!file) return;
    try {
      const nextDirection = validateUpload(file);
      const content = await file.text();
      setDirection(nextDirection);
      setInput(content);
      setOutput("");
      setResult(null);
      setStatus({ type: "info", text: `Loaded a local ${nextDirection === "yaml-to-json" ? "YAML" : "JSON"} file.` });
    } catch (caught) {
      setOutput("");
      setResult(null);
      setStatus({ type: "error", text: caught instanceof Error ? caught.message : "The local file could not be read." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function download() {
    if (!output) return;
    const file = outputFile(direction);
    const objectUrl = URL.createObjectURL(new Blob([output], { type: file.type }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  function useExample() {
    setInput(direction === "yaml-to-json" ? yamlSample : jsonSample);
    setOutput("");
    setResult(null);
    setStatus(null);
  }

  function clear() {
    setInput("");
    setOutput("");
    setResult(null);
    setStatus(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const inputFormat = direction === "yaml-to-json" ? "YAML" : "JSON";
  const outputFormat = direction === "yaml-to-json" ? "JSON" : "YAML";
  const inputBytes = result?.inputBytes ?? byteSize(input);
  const outputBytes = result?.ok ? result.outputBytes : byteSize(output);

  return <div className="workspace yaml-workspace">
    <div className="workspace-toolbar yaml-mode-bar">
      <SegmentedControl label="Conversion direction" value={direction} onChange={changeDirection} options={[{ value: "yaml-to-json", label: "YAML to JSON" }, { value: "json-to-yaml", label: "JSON to YAML" }]} />
      <details className="yaml-settings">
        <summary><Settings2 size={15} aria-hidden="true" />Advanced settings</summary>
        <div className="yaml-settings-grid">
          <label>JSON indentation<select aria-label="JSON indentation" value={settings.jsonIndent} onChange={(event) => setSettings((current) => ({ ...current, jsonIndent: Number(event.target.value) as 2 | 4 }))}><option value={2}>2 spaces</option><option value={4}>4 spaces</option></select></label>
          <label>YAML indentation<select aria-label="YAML indentation" value={settings.yamlIndent} onChange={(event) => setSettings((current) => ({ ...current, yamlIndent: Number(event.target.value) as 2 | 4 }))}><option value={2}>2 spaces</option><option value={4}>4 spaces</option></select></label>
          <label>YAML line width<input aria-label="YAML line width" type="number" min={40} max={200} value={settings.yamlLineWidth} onChange={(event) => setSettings((current) => ({ ...current, yamlLineWidth: Math.min(200, Math.max(40, Number(event.target.value) || 100)) }))} /></label>
          <label>Quote style<select aria-label="YAML quote style" value={settings.quoteStyle} onChange={(event) => setSettings((current) => ({ ...current, quoteStyle: event.target.value as ConverterSettings["quoteStyle"] }))}><option value="plain">Plain when safe</option><option value="single">Single quotes</option><option value="double">Double quotes</option></select></label>
          <label className="yaml-check"><input aria-label="Sort object keys" type="checkbox" checked={settings.sortKeys} onChange={(event) => setSettings((current) => ({ ...current, sortKeys: event.target.checked }))} /><span>Sort object keys</span></label>
          <label className="yaml-check"><input aria-label="Compact JSON output" type="checkbox" checked={settings.compactJson} onChange={(event) => setSettings((current) => ({ ...current, compactJson: event.target.checked }))} /><span>Compact JSON</span></label>
          <label className="yaml-check"><input aria-label="Auto convert" type="checkbox" checked={autoConvert} onChange={(event) => setAutoConvert(event.target.checked)} /><span>Auto convert</span></label>
        </div>
      </details>
    </div>

    <div className="yaml-actions">
      <div className="button-row"><ActionButton variant="primary" onClick={runConversion} disabled={!input.trim()} icon={<WandSparkles size={15} />}>Convert</ActionButton><ActionButton onClick={formatCurrentInput} disabled={!input.trim()}>Format input</ActionButton><ActionButton onClick={validateCurrentInput} disabled={!input.trim()}>Validate</ActionButton><ActionButton onClick={swap} disabled={!output} icon={<ArrowLeftRight size={15} />}>Swap</ActionButton></div>
      <div className="button-row"><input ref={fileRef} className="sr-only" aria-label="Open YAML or JSON file" type="file" accept=".yaml,.yml,.json,application/json,application/yaml,text/yaml,application/x-yaml,text/x-yaml,text/plain" onChange={(event) => void openFile(event.target.files?.[0])} /><ActionButton onClick={() => fileRef.current?.click()} icon={<FileUp size={15} />}>Open</ActionButton><ActionButton onClick={download} disabled={!output} icon={<Download size={15} />}>Download</ActionButton></div>
    </div>

    <div className="editor-grid yaml-editors">
      <label className="editor-panel"><span>{inputFormat} input</span><textarea aria-label={`${inputFormat} input`} value={input} onChange={(event) => { setInput(event.target.value); setOutput(""); setResult(null); setStatus(null); }} placeholder={direction === "yaml-to-json" ? "name: Naminc\nsite: naminc.tech" : '{"name":"Naminc","site":"naminc.tech"}'} spellCheck={false} /></label>
      <label className="editor-panel"><span>{outputFormat} output</span><textarea aria-label={`${outputFormat} output`} value={output} readOnly placeholder={`${outputFormat} output appears here`} spellCheck={false} /></label>
    </div>

    <div className="yaml-metrics" aria-label="Conversion statistics"><span>{inputBytes.toLocaleString()} B input</span><span>{outputBytes.toLocaleString()} B output</span><span>{result?.ok && direction === "yaml-to-json" ? `${result.documentCount} document${result.documentCount === 1 ? "" : "s"}` : autoConvert ? "Auto convert on" : "Manual convert"}</span></div>
    {status && <Status type={status.type}>{status.text}</Status>}
    <div className="yaml-roundtrip-note" role="note">JSON has no comments. YAML comments and original formatting may be lost after a YAML to JSON to YAML round trip.</div>
    <Status type="info">Your YAML and JSON are processed locally in your browser.</Status>
    <div className="workspace-footer"><button className="text-button" type="button" onClick={useExample}>Use example</button><div className="button-row"><ClearButton onClick={clear} /><CopyButton value={output} label={`Copy ${outputFormat}`} /></div></div>
  </div>;
}
