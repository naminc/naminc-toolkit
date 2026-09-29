"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ActionButton, ClearButton, CopyButton, SegmentedControl, Status } from "@/components/tool-ui";

type Algorithm = "SHA-256" | "SHA-384" | "SHA-512";

export function HashTool() {
  const [algorithm, setAlgorithm] = useState<Algorithm>("SHA-256"); const [input, setInput] = useState(""); const [output, setOutput] = useState("");
  async function generate() { const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(input)); setOutput(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")); }
  return <div className="workspace"><div className="workspace-toolbar"><SegmentedControl label="Hash algorithm" value={algorithm} onChange={(next) => { setAlgorithm(next); setOutput(""); }} options={[{ value: "SHA-256", label: "SHA-256" }, { value: "SHA-384", label: "SHA-384" }, { value: "SHA-512", label: "SHA-512" }]} /></div>
    <label className="editor-panel standalone"><span>Text to hash</span><textarea value={input} onChange={(event) => { setInput(event.target.value); setOutput(""); }} aria-label="Text to hash" placeholder="Enter UTF-8 text" /></label>
    {output && <div className="digest-result"><span>{algorithm} digest</span><code>{output}</code><CopyButton value={output} /></div>}
    <Status type="info"><ShieldCheck size={17} aria-hidden="true" />SHA-2 is suitable for integrity checks, but use Argon2id, scrypt, or bcrypt for passwords.</Status>
    <div className="workspace-footer"><ActionButton variant="primary" onClick={generate}>Generate hash</ActionButton><ClearButton onClick={() => { setInput(""); setOutput(""); }} /></div></div>;
}
