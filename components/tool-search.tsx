"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolCard } from "@/components/tool-card";
import { tools } from "@/lib/tools";

export function ToolSearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tools;
    return tools.filter((tool) => [tool.name, tool.shortDescription, tool.category, ...tool.keywords].join(" ").toLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  return (
    <div className={compact ? "tool-search compact" : "tool-search"}>
      <div className="search-field">
        <Search aria-hidden="true" size={20} />
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a tool..." aria-label="Search developer tools" />
        {query ? (
          <button type="button" className="clear-search" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear search" title="Clear search"><X size={17} /></button>
        ) : <kbd>Ctrl K</kbd>}
      </div>
      <div className="directory-heading"><span>Tool</span><span>Category</span><span aria-live="polite">{filtered.length} total</span></div>
      {filtered.length ? <div className="tool-directory">{filtered.map((tool, index) => <ToolCard key={tool.slug} tool={tool} index={index} />)}</div> : (
        <div className="empty-state"><Search size={24} aria-hidden="true" /><h2>No matching tools</h2><p>Try a broader term such as JSON, encode, time, or security.</p></div>
      )}
    </div>
  );
}
