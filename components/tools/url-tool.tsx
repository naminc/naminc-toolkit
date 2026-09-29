"use client";

import { Repeat2 } from "lucide-react";
import { useState } from "react";
import { ActionButton, ClearButton, CopyButton, SegmentedControl, Status } from "@/components/tool-ui";

export function UrlTool() {
  const [mode, setMode] = useState<"encode" | "decode">("encode"); const [input, setInput] = useState(""); const [output, setOutput] = useState(""); const [error, setError] = useState("");
  function convert() { try { setOutput(mode === "encode" ? encodeURIComponent(input) : decodeURIComponent(input)); setError(""); } catch { setOutput(""); setError("The input contains invalid or incomplete percent encoding."); } }
  function swap() { setMode(mode === "encode" ? "decode" : "encode"); setInput(output); setOutput(input); setError(""); }
  return <div className="workspace"><div className="workspace-toolbar"><SegmentedControl label="URL operation" value={mode} onChange={(next) => { setMode(next); setOutput(""); setError(""); }} options={[{ value: "encode", label: "Encode" }, { value: "decode", label: "Decode" }]} /><ActionButton onClick={swap} icon={<Repeat2 size={16} />}>Swap</ActionButton></div>
    <div className="editor-grid"><label className="editor-panel"><span>Input</span><textarea aria-label="URL input" value={input} onChange={(event) => setInput(event.target.value)} placeholder={mode === "encode" ? "Text or URL component" : "Percent-encoded value"} /></label><label className="editor-panel"><span>Result</span><textarea aria-label="URL result" value={output} readOnly placeholder="Converted value appears here" /></label></div>
    {error && <Status type="error">{error}</Status>}<div className="workspace-footer"><ActionButton variant="primary" onClick={convert}>{mode === "encode" ? "Encode component" : "Decode component"}</ActionButton><div className="button-row"><ClearButton onClick={() => { setInput(""); setOutput(""); setError(""); }} /><CopyButton value={output} /></div></div></div>;
}
