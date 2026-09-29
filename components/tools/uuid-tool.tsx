"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { ActionButton, ClearButton, CopyButton } from "@/components/tool-ui";

export function UuidTool() {
  const [count, setCount] = useState(5); const [values, setValues] = useState<string[]>([]);
  function generate() { setValues(Array.from({ length: count }, () => crypto.randomUUID())); }
  return <div className="workspace">
    <div className="workspace-toolbar"><label className="number-field">Quantity<input type="number" min={1} max={100} value={count} onChange={(event) => setCount(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} /></label><ActionButton variant="primary" onClick={generate} icon={<RefreshCw size={16} />}>Generate</ActionButton></div>
    {values.length ? <div className="uuid-list">{values.map((value, index) => <div className="uuid-row" key={`${value}-${index}`}><span>{index + 1}</span><code>{value}</code><CopyButton value={value} label="Copy" /></div>)}</div> : <div className="empty-inline">Choose a quantity and generate UUIDs.</div>}
    <div className="workspace-footer"><small>Generated with your browser&apos;s secure random source.</small><div className="button-row"><ClearButton onClick={() => setValues([])} /><CopyButton value={values.join("\n")} label="Copy all" /></div></div>
  </div>;
}
