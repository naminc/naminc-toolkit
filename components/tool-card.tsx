import Link from "next/link";
import type { ToolDefinition } from "@/lib/tools";

export function ToolCard({ tool, index }: { tool: ToolDefinition; index?: number }) {
  return (
    <Link className="tool-card" href={`/tools/${tool.slug}`}>
      <span className="tool-index" aria-hidden="true">{index === undefined ? "↗" : String(index + 1).padStart(2, "0")}</span>
      <span className="tool-card-copy">
        <strong>{tool.name}</strong>
        <span>{tool.shortDescription}</span>
      </span>
      <span className="tool-category">{tool.category}</span>
      <span className="tool-arrow" aria-hidden="true">→</span>
    </Link>
  );
}
