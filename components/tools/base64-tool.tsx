"use client";

import { FileUp, Repeat2 } from "lucide-react";
import { useRef, useState } from "react";
import { ActionButton, ClearButton, CopyButton, SegmentedControl, Status } from "@/components/tool-ui";
import { decodeBase64, encodeBase64 } from "@/lib/tool-utils";

export function Base64Tool() {
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [input, setInput] = useState(""); const [output, setOutput] = useState(""); const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  function convert() { try { setOutput(mode === "encode" ? encodeBase64(input) : decodeBase64(input)); setError(""); } catch { setOutput(""); setError("The input is not valid Base64 or does not contain valid UTF-8 text."); } }
  function swap() { setMode(mode === "encode" ? "decode" : "encode"); setInput(output); setOutput(input); setError(""); }
  function readFile(file?: File) { if (!file) return; if (file.size > 3_000_000) { setError("Please choose a file smaller than 3 MB."); return; } const reader = new FileReader(); reader.onload = () => { const data = String(reader.result).split(",")[1] ?? ""; setMode("encode"); setInput(`[File: ${file.name}]`); setOutput(data); setError(""); }; reader.readAsDataURL(file); }
  return <div className="workspace">
    <div className="workspace-toolbar"><SegmentedControl label="Base64 operation" value={mode} onChange={(next) => { setMode(next); setOutput(""); setError(""); }} options={[{ value: "encode", label: "Encode" }, { value: "decode", label: "Decode" }]} /><div><input ref={fileRef} className="sr-only" type="file" onChange={(event) => readFile(event.target.files?.[0])} /><ActionButton onClick={() => fileRef.current?.click()} icon={<FileUp size={16} />}>Encode file</ActionButton></div></div>
    <div className="editor-grid"><label className="editor-panel"><span>{mode === "encode" ? "UTF-8 text" : "Base64"}</span><textarea aria-label="Base64 input" value={input} onChange={(event) => { setInput(event.target.value); setOutput(""); }} placeholder={mode === "encode" ? "Enter text to encode" : "Paste Base64 to decode"} /></label><label className="editor-panel"><span>Result</span><textarea aria-label="Base64 result" readOnly value={output} placeholder="Converted value appears here" /></label></div>
    {error && <Status type="error">{error}</Status>}
    <div className="workspace-footer"><ActionButton variant="primary" onClick={convert}>{mode === "encode" ? "Encode" : "Decode"}</ActionButton><div className="button-row"><ActionButton onClick={swap} icon={<Repeat2 size={16} />}>Swap</ActionButton><ClearButton onClick={() => { setInput(""); setOutput(""); setError(""); }} /><CopyButton value={output} /></div></div>
  </div>;
}
