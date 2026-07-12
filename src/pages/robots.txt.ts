import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site, url }) => {
	const origin = site ?? url;
	const sitemapUrl = new URL("/sitemap.xml", origin);

	return new Response(
		`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${sitemapUrl.href}\n`,
		{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
	);
};
