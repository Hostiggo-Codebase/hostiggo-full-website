import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { HotelServiceApi } from "@/lib/services/hotel";
import PropertyDetailsClient from "./PropertyDetailsClient";
import JsonLd from "@/components/JsonLd";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// One lookup per request, shared by generateMetadata and the page.
const loadListing = cache(async (id: string) => {
  if (!/^\d+$/.test(id)) return null;
  try {
    return await HotelServiceApi.getHotelDetail(id);
  } catch (err) {
    console.error("[property page] failed to load listing", id, err);
    // Treat a backend failure as "unknown" rather than "missing": the client
    // retries and shows a proper error state instead of a false 404.
    return undefined;
  }
});

type Props = { params: Promise<{ id: string }> };

// schema.org markup so search engines can show price, rating and location.
// Only fields we really have; the rating block appears only with real reviews.
function lodgingJsonLd(id: string, row: any): Record<string, unknown> {
  const images = (row.listing_media ?? []).map((m: any) => m?.media_url).filter(Boolean).slice(0, 6);
  const reviews = Number(row.review_count ?? 0);
  const rating = Number(row.avg_rating ?? 0);
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "@id": `${SITE_URL}/property/${id}`,
    name: row.title,
    url: `${SITE_URL}/property/${id}`,
    description: String(row.description ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || undefined,
    ...(images.length ? { image: images } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: row.locations?.district ?? undefined,
      addressRegion: row.locations?.state ?? undefined,
      addressCountry: "IN",
    },
    ...(row.latitude != null && row.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: Number(row.latitude), longitude: Number(row.longitude) } }
      : {}),
    ...(Number(row.price_weekday) > 0 ? { priceRange: `₹${Number(row.price_weekday)} per night` } : {}),
    currenciesAccepted: "INR",
    ...(reviews > 0 && rating > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating, reviewCount: reviews, bestRating: 5 } }
      : {}),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const row: any = await loadListing(id);
  if (!row) return { title: "Stay not found" };
  const place = [row.locations?.district, row.locations?.state].filter(Boolean).join(", ");
  const description = String(row.description ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  const cover =
    row.listing_media?.find((m: any) => m.is_cover)?.media_url ?? row.listing_media?.[0]?.media_url;
  const title = `${row.title}${place ? ` · ${place}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: `/property/${id}` },
    openGraph: { title, description, type: "website", ...(cover ? { images: [cover] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(cover ? { images: [cover] } : {}) },
  };
}

export default async function PropertyPage({ params }: Props) {
  const { id } = await params;
  const row = await loadListing(id);
  // null = the listing doesn't exist or isn't live -> a real 404, not a
  // "Property not found" page served with HTTP 200.
  if (row === null) notFound();
  return (
    <>
      {row ? <JsonLd data={lodgingJsonLd(id, row)} /> : null}
      <PropertyDetailsClient initialRow={row ?? null} />
    </>
  );
}
