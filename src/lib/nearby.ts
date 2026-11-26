import { haversineKm } from "./gazetteer";

// Nearby fallback for search. When a place has few (or no) stays, widen the
// search by real distance instead of leaving the page empty. Same widening
// ladder as the standalone search service (15 -> 200 km): start small, and only
// go wider if the smaller circle cannot supply enough stays, so a sparse region
// never silently pulls in results from across the country.

export const NEARBY_RADII_KM = [15, 30, 60, 120, 200] as const;
/** Fewer matches than this in the searched place triggers the nearby fallback. */
export const NEARBY_MIN_EXACT = 6;
/** Aim to show about this many stays in total (exact + nearby). */
export const NEARBY_TARGET = 8;
/** Never add more than this many nearby stays. */
export const NEARBY_MAX = 40;

export interface Point {
  lat: number;
  lon: number;
}

export interface NearbyPick<T> {
  /** The radius that was needed; null when nothing is within the cap. */
  radiusKm: number | null;
  /** Nearest first. */
  items: Array<{ item: T; distanceKm: number }>;
}

/**
 * From candidate stays (each with coordinates), picks the nearest ones around
 * `ref`: the smallest radius on the ladder that supplies `needed` stays, or
 * everything within the largest radius if none does.
 */
export function pickNearby<T>(candidates: T[], coords: (c: T) => Point | null, ref: Point, needed: number): NearbyPick<T> {
  const cap = NEARBY_RADII_KM[NEARBY_RADII_KM.length - 1];
  const within: Array<{ item: T; distanceKm: number }> = [];
  for (const item of candidates) {
    const p = coords(item);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const distanceKm = haversineKm(ref.lat, ref.lon, p.lat, p.lon);
    if (distanceKm <= cap) within.push({ item, distanceKm });
  }
  within.sort((a, b) => a.distanceKm - b.distanceKm);
  if (!within.length) return { radiusKm: null, items: [] };

  const want = Math.max(1, needed);
  let radiusKm: number = cap;
  for (const r of NEARBY_RADII_KM) {
    if (within.filter((w) => w.distanceKm <= r).length >= want) {
      radiusKm = r;
      break;
    }
  }
  return { radiusKm, items: within.filter((w) => w.distanceKm <= radiusKm).slice(0, NEARBY_MAX) };
}

/** Centre of a set of stays (plain average of their coordinates). */
export function centroid(points: Point[]): Point | null {
  const good = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!good.length) return null;
  return {
    lat: good.reduce((s, p) => s + p.lat, 0) / good.length,
    lon: good.reduce((s, p) => s + p.lon, 0) / good.length,
  };
}
