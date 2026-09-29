"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton, ClearButton, Status } from "@/components/tool-ui";

type Match = { value: string; index: number; groups: string[] };
const workerCode = `self.onmessage=function(e){try{const {pattern,flags,text}=e.data;const safeFlags=flags.includes('g')?flags:flags+'g';const regex=new RegExp(pattern,safeFlags);const matches=[];let m;let guard=0;while((m=regex.exec(text))!==null&&guard++<1000){matches.push({value:m[0],index:m.index,groups:m.slice(1)});if(m[0]==='')regex.lastIndex++}self.postMessage({matches})}catch(error){self.postMessage({error:error.message})}}`;

export function RegexTool() {
  const [pattern, setPattern] = useState("\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b"); const [flags, setFlags] = useState("gi"); const [text, setText] = useState("Contact hello@naminc.tech or visit naminc.tech.");
  const [matches, setMatches] = useState<Match[]>([]); const [error, setError] = useState(""); const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  function test() { setError(""); setMatches([]); if (text.length > 50_000) { setError("Test text is limited to 50,000 characters."); return; } workerRef.current?.terminate(); const blob = new Blob([workerCode], { type: "text/javascript" }); const worker = new Worker(URL.createObjectURL(blob)); workerRef.current = worker; const timer = window.setTimeout(() => { worker.terminate(); setError("Matching exceeded 300 ms. The pattern may cause excessive backtracking."); }, 300); worker.onmessage = (event: MessageEvent<{ matches?: Match[]; error?: string }>) => { clearTimeout(timer); worker.terminate(); if (event.data.error) setError(event.data.error); else setMatches(event.data.matches ?? []); }; worker.postMessage({ pattern, flags: flags.replace(/[^dgimsuvy]/g, ""), text }); }
  function highlighted() { if (!matches.length) return text; const nodes: React.ReactNode[] = []; let cursor = 0; matches.forEach((match, index) => { nodes.push(text.slice(cursor, match.index)); nodes.push(<mark key={`${match.index}-${index}`}>{text.slice(match.index, match.index + match.value.length)}</mark>); cursor = match.index + match.value.length; }); nodes.push(text.slice(cursor)); return nodes; }
  return <div className="workspace"><div className="regex-fields"><label><span>Pattern</span><div className="regex-input"><b>/</b><input value={pattern} onChange={(event) => setPattern(event.target.value)} aria-label="Regular expression pattern" spellCheck={false} /><b>/</b><input className="flag-input" value={flags} onChange={(event) => setFlags(event.target.value)} aria-label="Regular expression flags" maxLength={8} /></div></label><label className="editor-panel"><span>Test text</span><textarea value={text} onChange={(event) => setText(event.target.value)} aria-label="Regex test text" /></label></div>
    <div className="workspace-actions"><ActionButton variant="primary" onClick={test} icon={<Play size={16} />}>Run test</ActionButton><ClearButton onClick={() => { setPattern(""); setText(""); setMatches([]); setError(""); }} /><span className="match-count" aria-live="polite">{matches.length} {matches.length === 1 ? "match" : "matches"}</span></div>
    {error && <Status type="error">{error}</Status>}
    <div className="regex-results"><div><span className="result-label">Highlighted text</span><pre className="highlight-output">{highlighted()}</pre></div><div><span className="result-label">Matches and groups</span>{matches.length ? <ol className="match-list">{matches.map((match, index) => <li key={`${match.index}-${index}`}><code>{match.value || "(empty match)"}</code><span>index {match.index}</span>{match.groups.map((group, groupIndex) => <small key={groupIndex}>Group {groupIndex + 1}: {group ?? "undefined"}</small>)}</li>)}</ol> : <p className="muted-result">Run the pattern to inspect matches.</p>}</div></div>
  </div>;
}
