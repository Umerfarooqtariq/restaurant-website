import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const host = site?.hostname;
  const sitemap = host && host !== "localhost" && host !== "127.0.0.1"
    ? `Sitemap: ${new URL("sitemap-index.xml", site).href}\n`
    : "";
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\n${sitemap}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
