import type { Metadata } from "next";
import Link from "next/link";
import { ToolSearch } from "@/components/tool-search";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <div className="container page-shell home-page">
      <section className="home-intro">
        <div>
          <h1>Small tools for exact work.</h1>
          <p>Format, inspect, convert, and verify common developer data without sending it anywhere.</p>
        </div>
      </section>
      <div className="home-layout">
        <ToolSearch />
        <aside className="home-aside" aria-label="Site notes">
          <section><h2>Recent notes</h2><Link href="/notes/how-to-read-unix-timestamps"><span>How to read a Unix timestamp</span><small>5 min</small></Link><Link href="/notes/jwt-decoding-vs-verification"><span>JWT decoding vs. verification</span><small>6 min</small></Link><Link className="aside-more" href="/notes">All notes →</Link></section>
          <section className="privacy-line"><h2>Local by default</h2><p>Inputs stay in your browser. No accounts, analytics, or uploads.</p><Link href="/privacy">Privacy details →</Link></section>
        </aside>
      </div>
    </div>
  );
}
