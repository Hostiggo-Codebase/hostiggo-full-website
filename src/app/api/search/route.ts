import { NextRequest, NextResponse } from "next/server";
import { HotelServiceApi } from "@/lib/services/hotel";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { lookupPlace } from "@/lib/gazetteer";
import { NEARBY_MIN_EXACT, NEARBY_TARGET, centroid, pickNearby, type Point } from "@/lib/nearby";

export const dynamic = "force-dynamic";

// Search = the search_listings_by_state RPC (location, dates, price, guests,
// rating, amenity ids, property types) + the refinements it can't express,
// applied here over the FULL match set before paginating. Doing refinement
// and sorting per page used to make "Price: high to low" only reorder the 20
// cards already loaded, and filters that shrank a page left the header count
// wrong. A destination search matches tens of stays, so collecting the whole
// set (capped) is cheap and keeps counts, order and pages exact.

const RPC_PAGE = 100;
const MAX_ROWS = 1000;
const BREAKFAST_ADDON_ID = 1;

type Row = { listing: Record<string, any> } & Record<string, any>;

const SORTS = new Set([
  "recommended",
  "price_asc",
  "price_desc",
  "top_rated",
  "most_popular",
  "newest",
  "best_value",
]);

async function collectAll(filters: Record<string, any>) {
  const rows: Row[] = [];
  let cursor: number | null = null;
  let stateBounds: any = null;
  for (;;) {
    const page = await HotelServiceApi.filterHotelsByState(filters as any, cursor, RPC_PAGE);
    if (!stateBounds && page.stateBounds) stateBounds = page.stateBounds;
    rows.push(...(page.data as Row[]));
    const last = page.data[page.data.length - 1] as Row | undefined;
    if (!page.hasMore || !last || rows.length >= MAX_ROWS) break;
    cursor = Number(last.listing?.listing_id);
  }
  return { rows: rows.slice(0, MAX_ROWS), stateBounds };
}

async function unavailableIds(ids: number[], startDate: string, endDate: string) {
  const [blocked, booked] = await Promise.all([
    supabaseAdmin
      .from("listing_calendar")
      .select("listing_id")
      .in("listing_id", ids)
      .gte("date", startDate)
      .lt("date", endDate)
      .eq("is_available", false),
    supabaseAdmin
      .from("bookings")
      .select("listing_id")
      .in("listing_id", ids)
      .eq("status_id", 2)
      .lt("start_date", endDate)
      .gt("end_date", startDate),
  ]);
  if (blocked.error) throw blocked.error;
  if (booked.error) throw booked.error;
  return new Set([
    ...(blocked.data ?? []).map((r) => r.listing_id),
    ...(booked.data ?? []).map((r) => r.listing_id),
  ]);
}

/** Facts the RPC row lacks: rating, policy, stay type, age, breakfast. */
async function enrich(ids: number[]) {
  const [listings, reviews, breakfast, stayTypes] = await Promise.all([
    supabaseAdmin
      .from("listings")
      .select("listing_id, cancellation_policy, stay_type_id, created_at")
      .in("listing_id", ids),
    supabaseAdmin.from("review").select("listing_id, rating").in("listing_id", ids),
    supabaseAdmin
      .from("listing_addons")
      .select("listing_id, price")
      .eq("addon_id", BREAKFAST_ADDON_ID)
      .in("listing_id", ids),
    supabaseAdmin.from("stay_types").select("id, title"),
  ]);
  for (const r of [listings, reviews, breakfast, stayTypes]) if (r.error) throw r.error;

  const stayTitle = new Map((stayTypes.data ?? []).map((s) => [s.id, s.title]));
  const facts = new Map<number, {
    policy: string | null;
    stayType: string | null;
    createdAt: string | null;
    ratingSum: number;
    reviewCount: number;
    breakfast: boolean;
  }>();
  for (const l of listings.data ?? []) {
    facts.set(l.listing_id, {
      policy: l.cancellation_policy ?? null,
      stayType: l.stay_type_id != null ? stayTitle.get(l.stay_type_id) ?? null : null,
      createdAt: l.created_at ?? null,
      ratingSum: 0,
      reviewCount: 0,
      breakfast: false,
    });
  }
  for (const r of reviews.data ?? []) {
    const f = r.listing_id != null ? facts.get(r.listing_id) : undefined;
    if (f && r.rating != null) {
      f.ratingSum += Number(r.rating);
      f.reviewCount += 1;
    }
  }
  for (const b of breakfast.data ?? []) {
    const f = facts.get(b.listing_id);
    if (f) f.breakfast = true;
  }
  return facts;
}

const hasAmenity = (row: Row, needles: string[]) =>
  ((row.listing?.listing_amenities ?? []) as any[]).some((a) => {
    const name = String(a?.amenities?.name ?? "").toLowerCase();
    return needles.some((n) => name.includes(n));
  });

/**
 * Applies everything that narrows a candidate set beyond the place: dates
 * (booked / blocked nights), stay type, cancellation, breakfast and amenity
 * toggles -- and attaches the real rating, policy and age the cards and sorts
 * need. Shared by the exact-place results and the nearby fallback pool, so a
 * nearby stay always obeys the same filters the guest chose.
 */
async function prepareRows(all: Row[], filters: Record<string, any>): Promise<Row[]> {
  let rows = all;
  const ids = rows.map((r) => Number(r.listing?.listing_id)).filter(Number.isFinite);

  if (filters.startDate && filters.endDate && ids.length) {
    const taken = await unavailableIds(ids, String(filters.startDate), String(filters.endDate));
    if (taken.size) rows = rows.filter((r) => !taken.has(Number(r.listing?.listing_id)));
  }

  const facts = ids.length ? await enrich(ids) : new Map();

  // Refinements.
  const stayTypes: string[] = (Array.isArray(filters.stayTypes) ? filters.stayTypes : []).map((s: string) =>
    String(s).toLowerCase(),
  );
  if (filters.privateRoom) stayTypes.push("private room");
  if (filters.sharedRoom) stayTypes.push("shared space");
  if (stayTypes.length) {
    rows = rows.filter((r) => {
      const t = facts.get(Number(r.listing?.listing_id))?.stayType?.toLowerCase();
      return !!t && stayTypes.includes(t);
    });
  }
  if (filters.freeCancellation) {
    // Flexible and Moderate both give a full refund if cancelled early enough.
    rows = rows.filter((r) => {
      const p = facts.get(Number(r.listing?.listing_id))?.policy ?? "moderate";
      return p === "flexible" || p === "moderate";
    });
  }
  if (filters.breakfast) rows = rows.filter((r) => facts.get(Number(r.listing?.listing_id))?.breakfast);
  if (filters.wifi) rows = rows.filter((r) => hasAmenity(r, ["wifi", "wi-fi", "internet"]));
  if (filters.parking) rows = rows.filter((r) => hasAmenity(r, ["parking"]));
  if (filters.ac) rows = rows.filter((r) => hasAmenity(r, ["air condition", "a/c", " ac"]));

  // Attach real rating/review count so cards and sorts use them.
  for (const r of rows) {
    const f = facts.get(Number(r.listing?.listing_id));
    if (!f) continue;
    r.listing.avg_rating = f.reviewCount ? f.ratingSum / f.reviewCount : 0;
    r.listing.review_count = f.reviewCount;
    r.listing.cancellation_policy = f.policy;
    r.listing.created_at = f.createdAt;
  }


  return rows;
}

const listingPoint = (r: Row): Point | null => {
  const lat = Number(r.listing?.latitude);
  const lon = Number(r.listing?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};

export interface NearbyNotice {
  /** The place the guest searched for, as we understood it. */
  place: string;
  /** Radius needed to find the nearby stays; null when nothing is within the cap. */
  radiusKm: number | null;
  exactCount: number;
  nearbyCount: number;
}

/**
 * When the searched place has few (or no) stays, finds stays nearby by real
 * distance (15 -> 200 km, smallest circle that supplies enough). The centre is
 * the middle of the stays that matched; for a place with none, the place's own
 * location from our list of Indian towns and states. Every filter the guest
 * chose still applies. Returns null when the place can't be located at all.
 */
async function nearbyFallback(
  exact: Row[],
  filters: Record<string, any>,
): Promise<{ rows: Row[]; notice: NearbyNotice } | null> {
  const typed = String(filters.district || filters.state || "").trim();
  if (!typed) return null;

  const known = lookupPlace(String(filters.district ?? "").split(",")[0]) ?? lookupPlace(filters.state);
  const place = known?.name ?? typed.split(",")[0].trim();
  const ref: Point | null =
    centroid(exact.map(listingPoint).filter((p): p is Point => !!p)) ?? (known ? { lat: known.lat, lon: known.lon } : null);
  if (!ref) return null;

  // Every stay that fits the guest's other filters, anywhere; then nearest first.
  const { rows: pool } = await collectAll({ ...filters, state: undefined, district: undefined });
  const have = new Set(exact.map((r) => Number(r.listing?.listing_id)));
  const candidates = await prepareRows(
    pool.filter((r) => !have.has(Number(r.listing?.listing_id))),
    filters,
  );
  const pick = pickNearby(candidates, listingPoint, ref, Math.max(1, NEARBY_TARGET - exact.length));

  const rows = pick.items.map(({ item, distanceKm }) => ({
    ...item,
    distance: Math.round(distanceKm * 1000), // metres, like the geo-sort rows
    nearby: true,
    nearbyFrom: place,
  }));
  return {
    rows,
    notice: { place, radiusKm: pick.radiusKm, exactCount: exact.length, nearbyCount: rows.length },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const filters: Record<string, any> = body.filters ?? {};
    const sort = SORTS.has(body.sort) ? body.sort : "recommended";
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(body.pageSize) || 20)));
    // Offset into the fully refined + sorted result set.
    const offset = Math.max(0, Math.floor(Number(body.cursor) || 0));

    const { rows: all, stateBounds } = await collectAll(filters);
    const rows = await prepareRows(all, filters);

    const price = (r: Row) => Number(r.listing?.price_weekday ?? 0);
    const rating = (r: Row) => Number(r.listing?.avg_rating ?? 0);
    const count = (r: Row) => Number(r.listing?.review_count ?? 0);
    const sorted = rows.slice();
    switch (sort) {
      case "price_asc":
        sorted.sort((a, b) => price(a) - price(b));
        break;
      case "price_desc":
        sorted.sort((a, b) => price(b) - price(a));
        break;
      case "top_rated":
        sorted.sort((a, b) => rating(b) - rating(a) || count(b) - count(a));
        break;
      case "most_popular":
        sorted.sort((a, b) => count(b) - count(a) || rating(b) - rating(a));
        break;
      case "newest":
        sorted.sort((a, b) =>
          String(b.listing?.created_at ?? "").localeCompare(String(a.listing?.created_at ?? "")),
        );
        break;
      case "best_value":
        // Rated stays first, then most rating per rupee.
        sorted.sort(
          (a, b) =>
            (rating(b) > 0 ? 1 : 0) - (rating(a) > 0 ? 1 : 0) ||
            rating(b) / (price(b) || 1) - rating(a) / (price(a) || 1) ||
            price(a) - price(b),
        );
        break;
      default:
        break; // RPC order
    }

    // Few or no stays in the searched place: add stays nearby, clearly marked,
    // after the exact matches. A fallback failure must never break the search.
    let ordered: Row[] = sorted;
    let nearby: NearbyNotice | null = null;
    if (sorted.length < NEARBY_MIN_EXACT && (filters.district || filters.state)) {
      try {
        const extra = await nearbyFallback(sorted, filters);
        if (extra) {
          ordered = [...sorted, ...extra.rows];
          nearby = extra.notice;
        }
      } catch (err: any) {
        console.error("[/api/search] nearby fallback failed:", err?.message);
      }
    }

    const pageRows = ordered.slice(offset, offset + pageSize);
    const next = offset + pageRows.length;
    return NextResponse.json({
      data: pageRows,
      cursor: next < ordered.length ? next : null,
      hasMore: next < ordered.length,
      totalCount: ordered.length,
      ...(nearby ? { nearby } : {}),
      ...(stateBounds ? { stateBounds } : {}),
    });
  } catch (err: any) {
    console.error("[/api/search] Error:", err?.message, err?.details ?? "");
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 500 });
  }
}
