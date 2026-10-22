"use client";

import { ArrowLeftRight, Download, FileUp, ListFilter, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton, ClearButton, CopyButton, SegmentedControl, Status } from "@/components/tool-ui";
import {
  defaultExtractorSettings,
  displayDelimiter,
  extractTextColumns,
  extractionDownloadFile,
  physicalLineCount,
  resolveInputDelimiter,
  resolveOutputDelimiter,
  textByteSize,
  validateTextFile,
  type ExtractionResult,
  type ExtractorSettings,
  type InputDelimiterPreset,
  type OutputDelimiterPreset,
  type ParsingMode,
} from "@/lib/text-column-extractor";

const textSample = `alpha|example-value|A1B2C3
bravo|another-value|D4E5F6
charlie|sample-value|G7H8I9`;

const delimiterOptions: Array<{ value: InputDelimiterPreset; label: string }> = [
  { value: "pipe", label: "Pipe |" },
  { value: "comma", label: "Comma ," },
  { value: "colon", label: "Colon :" },
  { value: "semicolon", label: "Semicolon ;" },
  { value: "tab", label: "Tab" },
  { value: "space", label: "Space" },
  { value: "custom", label: "Custom" },
];

const outputDelimiterOptions: Array<{ value: OutputDelimiterPreset; label: string }> = [
  { value: "same", label: "Same as input" },
  ...delimiterOptions,
];

function statusMessage(result: ExtractionResult) {
  if (!result.ok) {
    const line = result.line ? ` Row ${result.line}.` : "";
    return `${result.message}${line}`;
  }
  const columns = result.selectedColumns.join(", ");
  const missing = result.missingRows > 0 ? ` ${result.missingRows} row${result.missingRows === 1 ? "" : "s"} lacked a selected column.` : "";
  return `Extracted ${result.outputRows} row${result.outputRows === 1 ? "" : "s"} using column${result.selectedColumns.length === 1 ? "" : "s"} ${columns}.${missing}`;
}

export function TextColumnExtractorTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [settings, setSettings] = useState<ExtractorSettings>(defaultExtractorSettings);
  const [autoExtract, setAutoExtract] = useState(true);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [status, setStatus] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoExtract || !input.trim()) return;
    const timer = window.setTimeout(() => {
      const next = extractTextColumns(input, settings);
      setResult(next);
      setOutput(next.ok ? next.output : "");
      setStatus({ type: next.ok ? "success" : "error", text: statusMessage(next) });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [autoExtract, input, settings]);

  function runExtraction() {
    const next = extractTextColumns(input, settings);
    setResult(next);
    setOutput(next.ok ? next.output : "");
    setStatus({ type: next.ok ? "success" : "error", text: statusMessage(next) });
  }

  function changeInput(value: string) {
    setInput(value);
    setOutput("");
    setResult(null);
    setStatus(null);
  }

  function updateSetting<K extends keyof ExtractorSettings>(key: K, value: ExtractorSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setOutput("");
    setResult(null);
    setStatus(null);
  }

  function changeMode(mode: ParsingMode) {
    updateSetting("parsingMode", mode);
  }

  function swap() {
    if (!result?.ok || !output) {
      setStatus({ type: "error", text: "Extract the current input successfully before swapping." });
      return;
    }
    setInput(output);
    setOutput(input);
    setResult(null);
    setAutoExtract(false);
    setStatus({ type: "info", text: "Swapped input and output. Auto extract was turned off so both values remain available." });
  }

  async function openFile(file?: File) {
    if (!file) return;
    try {
      const validation = validateTextFile(file);
      const content = await file.text();
      changeInput(content);
      const suggestion = validation.suggestion ? ` Consider the ${validation.suggestion === "comma" ? "Comma" : "Tab"} delimiter for this file.` : "";
      setStatus({ type: "info", text: `Loaded a local ${validation.extension} file.${suggestion}` });
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
    try {
      const inputDelimiter = resolveInputDelimiter(settings.inputDelimiter, settings.customInputDelimiter);
      const outputDelimiter = resolveOutputDelimiter(settings.outputDelimiter, settings.customOutputDelimiter, inputDelimiter);
      const file = extractionDownloadFile(outputDelimiter);
      const objectUrl = URL.createObjectURL(new Blob([output], { type: file.type }));
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setStatus({ type: "error", text: "Choose a valid output delimiter before downloading." });
    }
  }

  function clear() {
    setInput("");
    setOutput("");
    setResult(null);
    setStatus(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const inputBytes = result?.inputBytes ?? textByteSize(input);
  const outputBytes = result?.ok ? result.outputBytes : textByteSize(output);
  const inputLines = result?.ok ? result.inputLines : physicalLineCount(input);
  const selectedColumns = result?.ok ? result.selectedColumns : [];
  let currentDelimiter = "Invalid";
  try {
    currentDelimiter = displayDelimiter(resolveInputDelimiter(settings.inputDelimiter, settings.customInputDelimiter));
  } catch {
    currentDelimiter = "Invalid";
  }

  return <div className="workspace extractor-workspace">
    <div className="workspace-toolbar extractor-mode-bar">
      <SegmentedControl label="Parsing mode" value={settings.parsingMode} onChange={changeMode} options={[{ value: "literal", label: "Literal delimiter" }, { value: "csv", label: "CSV-compatible" }]} />
      <span className="extractor-mode-note">Delimiter: {currentDelimiter}</span>
    </div>

    <div className="extractor-config">
      <label><span>Input delimiter</span><select aria-label="Input delimiter" value={settings.inputDelimiter} onChange={(event) => updateSetting("inputDelimiter", event.target.value as InputDelimiterPreset)}>{delimiterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {settings.inputDelimiter === "custom" && <label><span>Custom input delimiter</span><input aria-label="Custom input delimiter" value={settings.customInputDelimiter} onChange={(event) => updateSetting("customInputDelimiter", event.target.value)} placeholder=":: or \t" /></label>}
      <label className="extractor-columns-field"><span>Columns</span><input aria-label="Column selection" value={settings.columnSelection} onChange={(event) => updateSetting("columnSelection", event.target.value)} placeholder="1,3 or 1-3" /></label>
      <label><span>Output delimiter</span><select aria-label="Output delimiter" value={settings.outputDelimiter} onChange={(event) => updateSetting("outputDelimiter", event.target.value as OutputDelimiterPreset)}>{outputDelimiterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {settings.outputDelimiter === "custom" && <label><span>Custom output delimiter</span><input aria-label="Custom output delimiter" value={settings.customOutputDelimiter} onChange={(event) => updateSetting("customOutputDelimiter", event.target.value)} placeholder=":: or \t" /></label>}
    </div>

    <div className="extractor-actions">
      <div className="button-row"><ActionButton variant="primary" onClick={runExtraction} disabled={!input.trim()} icon={<ListFilter size={15} />}>Extract</ActionButton><ActionButton onClick={swap} disabled={!result?.ok || !output} icon={<ArrowLeftRight size={15} />}>Swap</ActionButton></div>
      <div className="button-row"><input ref={fileRef} className="sr-only" aria-label="Open delimited text file" type="file" accept=".txt,.csv,.tsv,.log,text/plain,text/csv,application/csv,text/tab-separated-values,text/x-log" onChange={(event) => void openFile(event.target.files?.[0])} /><ActionButton onClick={() => fileRef.current?.click()} icon={<FileUp size={15} />}>Open</ActionButton><ActionButton onClick={download} disabled={!output} icon={<Download size={15} />}>Download</ActionButton></div>
    </div>

    <details className="extractor-settings">
      <summary><Settings2 size={15} aria-hidden="true" />Advanced settings</summary>
      <div className="extractor-settings-grid">
        <label>Missing columns<select aria-label="Missing column strategy" value={settings.missingColumnStrategy} onChange={(event) => updateSetting("missingColumnStrategy", event.target.value as ExtractorSettings["missingColumnStrategy"])}><option value="empty">Keep with empty values</option><option value="skip">Skip invalid rows</option><option value="original">Keep original row</option><option value="error">Report as error</option></select></label>
        <label>Line endings<select aria-label="Output line endings" value={settings.lineEnding} onChange={(event) => updateSetting("lineEnding", event.target.value as ExtractorSettings["lineEnding"])}><option value="preserve">Preserve</option><option value="lf">LF</option><option value="crlf">CRLF</option></select></label>
        <label className="extractor-check"><input aria-label="Trim values" type="checkbox" checked={settings.trimValues} onChange={(event) => updateSetting("trimValues", event.target.checked)} /><span>Trim values</span></label>
        <label className="extractor-check"><input aria-label="Skip empty rows" type="checkbox" checked={settings.skipEmptyRows} onChange={(event) => updateSetting("skipEmptyRows", event.target.checked)} /><span>Skip empty rows</span></label>
        <label className="extractor-check"><input aria-label="Remove duplicate rows" type="checkbox" checked={settings.removeDuplicates} onChange={(event) => updateSetting("removeDuplicates", event.target.checked)} /><span>Remove duplicates</span></label>
        <label className="extractor-check"><input aria-label="Keep empty columns" type="checkbox" checked={settings.keepEmptyColumns} onChange={(event) => updateSetting("keepEmptyColumns", event.target.checked)} /><span>Keep empty columns</span></label>
        <label className="extractor-check"><input aria-label="Auto extract" type="checkbox" checked={autoExtract} onChange={(event) => setAutoExtract(event.target.checked)} /><span>Auto extract</span></label>
      </div>
    </details>

    <div className="editor-grid extractor-editors">
      <label className="editor-panel"><span>Input text</span><textarea aria-label="Delimited text input" value={input} onChange={(event) => changeInput(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); runExtraction(); } }} placeholder="alpha|example-value|A1B2C3" spellCheck={false} /></label>
      <label className="editor-panel"><span>Extracted output</span><textarea aria-label="Extracted text output" value={output} readOnly placeholder="Selected columns appear here" spellCheck={false} /></label>
    </div>

    <div className="extractor-metrics" aria-label="Extraction statistics"><span>{inputBytes.toLocaleString()} B input</span><span>{outputBytes.toLocaleString()} B output</span><span>{inputLines} input lines</span><span>{result?.ok ? `${result.outputRows} output rows` : "0 output rows"}</span><span>{result?.ok ? `${result.maxColumns} max columns` : "0 max columns"}</span><span>{selectedColumns.length} selected</span><span>{result?.ok ? `${result.missingRows} missing` : "0 missing"}</span><span>{result?.ok ? `${result.duplicatesRemoved} duplicates removed` : "0 duplicates removed"}</span><span>{settings.parsingMode === "csv" ? "CSV-compatible" : "Literal"}</span><span>{autoExtract ? "Auto on" : "Manual"}</span></div>
    {status && <Status type={status.type}>{status.text}</Status>}
    {result?.ok && result.missingLineNumbers.length > 0 && <div className="extractor-row-note" role="note">Rows missing selected columns: {result.missingLineNumbers.join(", ")}{result.missingRows > result.missingLineNumbers.length ? ` and ${result.missingRows - result.missingLineNumbers.length} more` : ""}.</div>}

    <section className="extractor-preview" aria-label="Delimited text preview">
      <div className="extractor-preview-heading"><div><strong>Preview</strong><span>{result?.ok ? `${result.parsedRows} parsed rows` : "Run extraction to inspect columns"}</span></div>{result?.ok && result.previewTruncated && <small>Showing the first 100 rows and 20 columns.</small>}</div>
      {result?.ok && result.previewRows.length > 0 ? <div className="extractor-table-scroll"><table><thead><tr><th scope="col">Row</th>{Array.from({ length: result.previewColumns }, (_, index) => <th key={index} scope="col" className={result.selectedColumns.includes(index + 1) ? "selected" : ""}>Column {index + 1}</th>)}</tr></thead><tbody>{result.previewRows.map((row) => <tr key={row.rowNumber} className={row.missingSelectedColumn ? "missing" : ""}><th scope="row">{row.rowNumber}</th>{Array.from({ length: result.previewColumns }, (_, index) => <td key={index} className={result.selectedColumns.includes(index + 1) ? "selected" : ""} title={row.fields[index] ?? ""}>{row.fields[index] ?? ""}</td>)}</tr>)}</tbody></table></div> : <div className="extractor-preview-empty">No parsed rows to preview.</div>}
    </section>

    <div className="extractor-sensitive-note" role="note">Delimited text may contain passwords, tokens, or personal data. Use synthetic data whenever possible.</div>
    <Status type="info">Your text is processed locally in your browser.</Status>
    <div className="workspace-footer"><button className="text-button" type="button" onClick={() => changeInput(textSample)}>Use example</button><div className="button-row"><ClearButton onClick={clear} /><CopyButton value={output} label="Copy output" /></div></div>
  </div>;
}
