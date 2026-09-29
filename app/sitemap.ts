import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";
import { tools } from "@/lib/tools";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/tools", "/notes", "/about", "/privacy", "/notes/how-to-read-unix-timestamps", "/notes/jwt-decoding-vs-verification"];
  return [...pages.map((path) => ({ url: `${siteConfig.url}${path}`, changeFrequency: path === "" ? "weekly" as const : "monthly" as const, priority: path === "" ? 1 : 0.7 })), ...tools.map((tool) => ({ url: `${siteConfig.url}/tools/${tool.slug}`, changeFrequency: "monthly" as const, priority: tool.popular ? 0.9 : 0.8 }))];
}
