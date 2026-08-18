import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_BASE_URL as BASE_URL } from "@/lib/hasat/constants";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
  lastmod?: string;
}

function slugifyFarmerName(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/tarifler", changefreq: "weekly", priority: "0.9" },
          { path: "/join", changefreq: "monthly", priority: "0.8" },
          { path: "/login", changefreq: "monthly", priority: "0.5" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/terms", changefreq: "yearly", priority: "0.3" },
        ];

        // P23-M4-c: dynamic from `recipes` — a new published recipe appears
        // here on its own, no manual sitemap edit needed. anon-safe (same RLS
        // `/tarifler` itself relies on).
        const { data: recipeRows } = await supabase
          .from("recipes")
          .select("slug, updated_at")
          .eq("visibility", "public")
          .eq("status", "published");
        for (const r of (recipeRows ?? []) as Array<{ slug: string; updated_at: string | null }>) {
          entries.push({
            path: `/tarifler/${r.slug}`,
            changefreq: "monthly",
            priority: "0.7",
            lastmod: r.updated_at ? r.updated_at.slice(0, 10) : undefined,
          });
        }

        // Public storefronts (/s/$slug) — same slugify rule s.$slug.tsx uses
        // to resolve a slug back to a farmer, so links here actually resolve.
        const { data: farmerRows } = await (supabase as any)
          .from("public_farmer_profiles")
          .select("id, name");
        for (const f of (farmerRows ?? []) as Array<{ id: string; name: string | null }>) {
          const slug = f.name ? slugifyFarmerName(f.name) : "";
          entries.push({
            path: `/s/${slug || f.id}`,
            changefreq: "weekly",
            priority: "0.6",
          });
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
