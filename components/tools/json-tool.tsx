"use client";

import { Download, FileUp, WandSparkles } from "lucide-react";
import { useRef, useState } from "react";
import { ActionButton, ClearButton, CopyButton, Status } from "@/components/tool-ui";
import { transformJson } from "@/lib/tool-utils";

const sample = '{"name":"Naminc","site":"naminc.tech","tools":["json","jwt","base64"],"private":true}';

export function JsonTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function run(mode: "format" | "minify") {
    if (!input.trim()) { setOutput(""); setStatus({ type: "error", text: "Paste JSON or open a file first." }); return; }
    const result = transformJson(input, mode);
    if (result.ok) { setOutput(result.value); setStatus({ type: "success", text: mode === "format" ? "Valid JSON, formatted successfully." : "Valid JSON, minified successfully." }); }
    else { setOutput(""); setStatus({ type: "error", text: result.error }); }
  }

  async function openFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setStatus({ type: "error", text: "Please choose a JSON file smaller than 2 MB." }); return; }
    setInput(await file.text()); setOutput(""); setStatus(null);
  }

  function download() {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "formatted.json"; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="workspace">
      <div className="workspace-toolbar">
        <div className="button-row"><ActionButton variant="primary" onClick={() => run("format")} icon={<WandSparkles size={16} />}>Format</ActionButton><ActionButton onClick={() => run("minify")}>Minify</ActionButton><ActionButton onClick={() => { const result = transformJson(input, "format"); setStatus(result.ok ? { type: "success", text: "JSON is valid." } : { type: "error", text: result.error }); }}>Validate</ActionButton></div>
        <div className="button-row"><input ref={fileRef} className="sr-only" type="file" accept=".json,application/json" onChange={(event) => openFile(event.target.files?.[0])} /><ActionButton onClick={() => fileRef.current?.click()} icon={<FileUp size={16} />}>Open</ActionButton><ActionButton onClick={download} disabled={!output} icon={<Download size={16} />}>Download</ActionButton></div>
      </div>
      <div className="editor-grid">
        <label className="editor-panel"><span>Input</span><textarea aria-label="JSON input" value={input} onChange={(event) => { setInput(event.target.value); setStatus(null); }} placeholder='Paste JSON, for example {"hello":"world"}' spellCheck={false} /></label>
        <label className="editor-panel"><span>Result</span><textarea aria-label="JSON result" value={output} readOnly placeholder="Formatted JSON appears here" spellCheck={false} /></label>
      </div>
      {status && <Status type={status.type}>{status.text}</Status>}
      <div className="workspace-footer"><button className="text-button" type="button" onClick={() => setInput(sample)}>Use example</button><div className="button-row"><ClearButton onClick={() => { setInput(""); setOutput(""); setStatus(null); }} /><CopyButton value={output} /></div></div>
    </div>
  );
}
