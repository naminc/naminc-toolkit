import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="wordmark" href="/" aria-label="Naminc Tech Tools home">
          <span>naminc</span><span className="wordmark-dot">.tech</span>
        </Link>
        <SiteNav />
        <ThemeToggle />
      </div>
    </header>
  );
}
