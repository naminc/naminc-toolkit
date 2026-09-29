import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StructuredData } from "@/components/structured-data";
import { ToolCard } from "@/components/tool-card";
import { ToolWorkspace } from "@/components/tool-workspace";
import { siteConfig } from "@/lib/site";
import { toolMap, tools } from "@/lib/tools";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return tools.map((tool) => ({ slug: tool.slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const tool = toolMap.get(slug); if (!tool) return {};
  const title = tool.name; const description = `${tool.shortDescription} Free, private, and processed entirely in your browser.`;
  return { title, description, keywords: tool.keywords, alternates: { canonical: `/tools/${slug}` }, openGraph: { title: `${title} | ${siteConfig.name}`, description, url: `/tools/${slug}`, type: "website" }, twitter: { card: "summary", title, description } };
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params; const tool = toolMap.get(slug); if (!tool) notFound();
  const related = tool.relatedTools.map((relatedSlug) => toolMap.get(relatedSlug)).filter(Boolean);
  const schemas = [
    { "@context": "https://schema.org", "@type": "WebApplication", name: tool.name, url: `${siteConfig.url}/tools/${slug}`, description: tool.shortDescription, applicationCategory: "DeveloperApplication", operatingSystem: "Any modern web browser", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, author: { "@type": "Person", name: "Naminc", url: `${siteConfig.url}/about` } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url }, { "@type": "ListItem", position: 2, name: "Tools", item: `${siteConfig.url}/tools` }, { "@type": "ListItem", position: 3, name: tool.name, item: `${siteConfig.url}/tools/${slug}` }] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: tool.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) },
  ];
  return <div className="container page-shell tool-page">
    <StructuredData data={schemas} />
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/tools">Tools</Link><span>/</span><span aria-current="page">{tool.name}</span></nav>
    <header className="tool-header"><p className="tool-meta">{tool.category}</p><h1>{tool.name}</h1><p>{tool.description}</p></header>
    <p className="local-note">Local processing. Your data stays in this browser.</p>
    <ToolWorkspace slug={slug} />
    <div className="content-grid"><section><h2>How to use it</h2><ul className="steps">{tool.howTo.map((step) => <li key={step}>{step}</li>)}</ul></section><section><h2>Example</h2><div className="example-block"><span>Input</span><pre>{tool.example.input}</pre><span>Output</span><pre>{tool.example.output}</pre></div></section></div>
    {tool.sections && <section className="tool-explainer" aria-label={`About ${tool.name}`}>{tool.sections.map((section) => <div key={section.title}><h2>{section.title}</h2><p>{section.body}</p></div>)}</section>}
    <section className="faq-section"><h2>Common questions</h2><dl className="faq-list">{tool.faqs.map((faq) => <div key={faq.question}><dt>{faq.question}</dt><dd>{faq.answer}</dd></div>)}</dl></section>
    <section className="related-section"><div className="section-heading"><h2>Related tools</h2><Link href="/tools">All tools →</Link></div><div className="related-list">{related.map((item) => item && <ToolCard key={item.slug} tool={item} />)}</div></section>
  </div>;
}
