import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { StructuredData } from "@/components/structured-data";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = { title: "About Naminc", description: "Naminc builds focused technical tools and writes practical notes for developers and IT professionals.", alternates: { canonical: "/about" } };

export default function AboutPage() {
  const schema = { "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: { "@type": "Person", name: "Naminc", url: `${siteConfig.url}/about`, sameAs: [siteConfig.links.dev, siteConfig.links.io] } };
  return <div className="container page-shell narrow-page"><StructuredData data={schema} /><div className="page-heading"><h1>Built by Naminc.</h1><p>Focused utilities and practical notes for developers and people working with technology.</p></div><section className="plain-section"><h2>What this site is for</h2><p>The tools here solve small, recurring tasks: inspecting structured data, converting formats, checking timestamps, and understanding values without handing them to a third-party server.</p><p>Each utility is fast, keyboard-friendly, and useful without an account. Inputs are processed locally whenever browser APIs make that possible.</p></section><section className="identity-links"><h2>Naminc on the web</h2><a href={siteConfig.links.dev} rel="me">naminc.dev <ExternalLink size={15} /></a><a href={siteConfig.links.io} rel="me">naminc.io <ExternalLink size={15} /></a></section><p className="inline-cta">Start with the <Link href="/tools">developer toolkit</Link> or browse the <Link href="/notes">technical notes</Link>.</p></div>;
}
