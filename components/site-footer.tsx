import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p><Link className="footer-brand" href="/">naminc.tech</Link> <span>Small tools for exact work.</span></p>
        <div className="footer-links" aria-label="Footer links">
          <Link href="/privacy">Privacy</Link>
          <a href={siteConfig.links.dev} rel="me">naminc.dev ↗</a>
          <a href={siteConfig.links.io} rel="me">naminc.io ↗</a>
        </div>
      </div>
    </footer>
  );
}
