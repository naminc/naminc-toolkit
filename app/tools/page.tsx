import type { Metadata } from "next";
import { ToolSearch } from "@/components/tool-search";

export const metadata: Metadata = { title: "Developer Tools", description: "Browse fast, private tools for JSON, JWT, Base64, timestamps, UUIDs, URLs, hashes, and regular expressions.", alternates: { canonical: "/tools" } };

export default function ToolsPage() {
  return <div className="container page-shell listing-page"><div className="page-heading"><h1>Developer tools</h1><p>Focused utilities for common technical tasks. Processing stays on your device.</p></div><ToolSearch compact /></div>;
}
