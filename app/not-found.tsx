import Link from "next/link";

export default function NotFound() { return <div className="container page-shell empty-page"><p className="eyebrow">404</p><h1>That page is not in the toolkit.</h1><p>The address may have changed, or the tool may not exist yet.</p><Link className="button button-primary" href="/tools">Browse all tools</Link></div>; }
