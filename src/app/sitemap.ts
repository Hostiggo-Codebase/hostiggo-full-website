import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SITE_URL } from "@/lib/site";

// Regenerated hourly. Listing rows come from the database; if it can't be
// reached (e.g. during a build without credentials) the static pages still ship.
// Always rendered on request: the listing query uses no-store fetches, which cannot be
// prerendered (the build was silently serving a sitemap with no listings).
export const dynamic = "force-dynamic";

const SITE = SITE_URL;

const STATIC_PATHS = [
  "",
  "/search",
  "/become-a-host",
  "/about",
  "/help",
  "/help/refunds",
  "/help/payouts",
  "/help/add-ons",
  "/help/verify-identity",
  "/help/chat-guidelines",
  "/help/delisting",
  "/faq",
  "/safety",
  "/support",
  "/contact",
  "/cancellation",
  "/terms",
  "/privacy",
  "/cookies",
  "/shipping-policy",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${SITE}${path}`,
    // No lastModified: these pages change on deploy, not daily, and a
    // constantly-fresh date teaches crawlers to ignore the field.
    changeFrequency: path === "" || path === "/search" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));

  try {
    const { data, error } = await supabaseAdmin
      .from("listings")
      .select("listing_id, updated_at")
      .eq("is_active", true)
      .limit(5000);
    if (error) throw error;
    for (const row of data ?? []) {
      pages.push({
        url: `${SITE}/property/${row.listing_id}`,
        lastModified: row.updated_at ? new Date(row.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error("[sitemap] listing lookup failed; serving static pages only:", err);
  }
  return pages;
}
