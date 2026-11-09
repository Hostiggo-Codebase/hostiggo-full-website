import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DESTINATIONS, type Destination } from "@/lib/destinations";
import { allInNightlyPrice } from "@/lib/billing/invoice";

export type DestinationStay = {
  id: number;
  title: string;
  place: string;
  image: string | null;
  nightlyFrom: number;
  guests: number | null;
  bedrooms: number | null;
};

const matchesDistrict = (d: Destination, district: string | null | undefined) =>
  !!district && d.districts.some((x) => x.toLowerCase() === district.trim().toLowerCase());

// One cached read of every live listing's destination fields, shared by the
// destination pages, the hub and the sitemap. Revalidates every 10 minutes.
const loadLive = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("listings")
      .select(
        "listing_id, title, price_weekday, num_guests, num_bedrooms, updated_at, locations(district, state), listing_media(media_url, is_cover)",
      )
      .eq("is_active", true)
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as any[];
  },
  ["destination-stays-live"],
  { revalidate: 600, tags: ["hotels-teaser"] },
);

export async function getDestinationStays(d: Destination): Promise<DestinationStay[]> {
  const rows = await loadLive();
  return rows
    .filter((r) => matchesDistrict(d, r.locations?.district))
    .map((r) => {
      const media: any[] = r.listing_media ?? [];
      const cover = media.find((m) => m.is_cover)?.media_url ?? media[0]?.media_url ?? null;
      return {
        id: r.listing_id,
        title: r.title,
        place: [r.locations?.district, r.locations?.state].filter(Boolean).join(", "),
        image: cover,
        nightlyFrom: allInNightlyPrice(Number(r.price_weekday)),
        guests: r.num_guests ?? null,
        bedrooms: r.num_bedrooms ?? null,
      };
    })
    .sort((a, b) => a.nightlyFrom - b.nightlyFrom);
}

/** Live stay counts per destination slug (for the hub, footer links and sitemap). */
export async function getDestinationCounts(): Promise<Record<string, number>> {
  const rows = await loadLive();
  const out: Record<string, number> = {};
  for (const d of DESTINATIONS) {
    out[d.slug] = rows.filter((r) => matchesDistrict(d, r.locations?.district)).length;
  }
  return out;
}
