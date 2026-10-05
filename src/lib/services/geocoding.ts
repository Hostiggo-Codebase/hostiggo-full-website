/**
 * Geocoding utilities backed by the Google Maps JavaScript API (Geocoding +
 * Places libraries). Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
 * Forward geocoding: address → coordinates
 * Reverse geocoding: coordinates → address
 */

import { loadGoogleMaps } from './googleMaps';
import { api } from '../api';
import { canonicalPlaceName } from '../destinationAliases';

/**
 * Simple in-memory cache for geocoding lookups to avoid re-hitting the network
 * for repeated identical queries within a session. FIFO eviction past the cap
 * keeps memory bounded. Errors are never cached (do not poison on failure).
 */
const GEO_CACHE_MAX = 200;
const geoCache = new Map<string, unknown>();

function cacheGet<T>(key: string): T | undefined {
  return geoCache.has(key) ? (geoCache.get(key) as T) : undefined;
}

function cacheSet<T>(key: string, value: T): void {
  if (geoCache.size >= GEO_CACHE_MAX) {
    const oldest = geoCache.keys().next().value;
    if (oldest !== undefined) geoCache.delete(oldest);
  }
  geoCache.set(key, value);
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
  address: {
    street?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countryCode?: string;
  };
}

export interface AutocompleteResult {
  placeId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  boundingBox: [number, number, number, number]; // [south, north, west, east]
}

function addressComponents(
  components: google.maps.GeocoderAddressComponent[] = [],
): GeocodingResult['address'] {
  const find = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name;
  const findShort = (type: string) =>
    components.find((c) => c.types.includes(type))?.short_name;

  return {
    street: [find('street_number'), find('route')].filter(Boolean).join(' ') || undefined,
    city: find('locality') || find('postal_town') || find('administrative_area_level_2'),
    county: find('administrative_area_level_2'),
    state: find('administrative_area_level_1'),
    postcode: find('postal_code'),
    country: find('country'),
    countryCode: findShort('country')?.toUpperCase(),
  };
}

async function getGeocoder(): Promise<google.maps.Geocoder> {
  const g = await loadGoogleMaps();
  return new g.maps.Geocoder();
}

/**
 * Forward geocoding: convert address string to coordinates
 * @param query - Address to search for
 * @returns GeocodingResult with coordinates and address components
 */
export async function geocodeAddress(query: string): Promise<GeocodingResult | null> {
  if (!query.trim()) return null;

  const cacheKey = `geocode:${query.trim().toLowerCase()}`;
  const cached = cacheGet<GeocodingResult | null>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const geocoder = await getGeocoder();
    const { results } = await geocoder.geocode({ address: query });

    if (!results || results.length === 0) {
      cacheSet(cacheKey, null);
      return null;
    }

    const result = results[0];
    const geocoded: GeocodingResult = {
      latitude: result.geometry.location.lat(),
      longitude: result.geometry.location.lng(),
      displayName: result.formatted_address,
      address: addressComponents(result.address_components),
    };
    cacheSet(cacheKey, geocoded);
    return geocoded;
  } catch (error) {
    console.error('[geocodeAddress] Error:', error);
    return null;
  }
}

/**
 * Reverse geocoding: convert coordinates to address
 * @param latitude - Latitude
 * @param longitude - Longitude
 * @returns GeocodingResult with address components
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodingResult | null> {
  if (!latitude || !longitude) return null;

  const cacheKey = `reverse:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = cacheGet<GeocodingResult | null>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const geocoder = await getGeocoder();
    const { results } = await geocoder.geocode({ location: { lat: latitude, lng: longitude } });

    if (!results || results.length === 0) {
      cacheSet(cacheKey, null);
      return null;
    }

    const result = results[0];
    const geocoded: GeocodingResult = {
      latitude,
      longitude,
      displayName: result.formatted_address,
      address: addressComponents(result.address_components),
    };
    cacheSet(cacheKey, geocoded);
    return geocoded;
  } catch (error: any) {
    // Silently fail for billing/authorization errors
    if (error?.message?.includes('REQUEST_DENIED') || 
        error?.message?.includes('BillingNotEnabled')) {
      return null;
    }
    console.error('[reverseGeocode] Error:', error);
    return null;
  }
}

/**
 * Autocomplete search for addresses
 * @param query - Search query
 * @returns Array of autocomplete suggestions
 */
export async function autocompleteAddress(query: string): Promise<AutocompleteResult[]> {
  if (!query.trim() || query.length < 3) return [];

  const cacheKey = `autocomplete:${query.trim().toLowerCase()}`;
  const cached = cacheGet<AutocompleteResult[]>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const g = await loadGoogleMaps();
    const autocompleteService = new g.maps.places.AutocompleteService();

    const predictions = await new Promise<google.maps.places.AutocompletePrediction[]>(
      (resolve, reject) => {
        autocompleteService.getPlacePredictions({ input: query }, (preds, status) => {
          if (status === g.maps.places.PlacesServiceStatus.OK && preds) {
            resolve(preds);
          } else if (status === g.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve([]);
          } else {
            reject(new Error(`Places autocomplete failed: ${status}`));
          }
        });
      },
    );

    if (predictions.length === 0) {
      cacheSet(cacheKey, []);
      return [];
    }

    // Places Autocomplete doesn't return coordinates directly, so resolve
    // each prediction's lat/lng via the Geocoder (keyed by place_id).
    const geocoder = await getGeocoder();
    const resolved = await Promise.all(
      predictions.slice(0, 5).map(async (prediction) => {
        try {
          const { results } = await geocoder.geocode({ placeId: prediction.place_id });
          const result = results?.[0];
          if (!result) return null;

          const bounds = result.geometry.viewport;
          const boundingBox: [number, number, number, number] = bounds
            ? [
                bounds.getSouthWest().lat(),
                bounds.getNorthEast().lat(),
                bounds.getSouthWest().lng(),
                bounds.getNorthEast().lng(),
              ]
            : [0, 0, 0, 0];

          const suggestion: AutocompleteResult = {
            placeId: prediction.place_id,
            displayName: prediction.description,
            latitude: result.geometry.location.lat(),
            longitude: result.geometry.location.lng(),
            boundingBox,
          };
          return suggestion;
        } catch {
          return null;
        }
      }),
    );

    const results = resolved.filter((r): r is AutocompleteResult => r !== null);
    cacheSet(cacheKey, results);
    return results;
  } catch (error) {
    console.error('[autocompleteAddress] Error:', error);
    return [];
  }
}

/**
 * Format address components into a readable string
 */
export function formatAddress(address: GeocodingResult['address']): string {
  const parts = [];
  if (address.street) parts.push(address.street);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.postcode) parts.push(address.postcode);
  if (address.country) parts.push(address.country);
  return parts.filter(Boolean).join(', ');
}

/**
 * Matches a geocoded city/district against the platform's curated
 * locations table (the same lookup the destination search bar uses) so a
 * listing gets tagged with a real location_id instead of silently staying
 * unset. Best-effort: many towns genuinely aren't in that curated list
 * yet, so no match just means no location_id -- not a case to fake a
 * wrong location for. Shared between the listing-creation wizard and the
 * post-listing "manage" edit page, so both auto-detect the same way.
 */
export async function resolveLocationId(city?: string, county?: string): Promise<number | undefined> {
  // The search endpoint is a *prefix* full-text match
  // (search_locations_partial: `term:*`), and this used to accept whatever
  // row came back first. So a geocoded name that merely starts like, or
  // shares a word with, a curated location got silently tagged with it
  // (e.g. "Dehra" -> Dehradun), and the listing then displayed that city.
  // Only accept a row whose district/area name actually equals the
  // geocoded name; otherwise leave location_id unset for the host to pick.
  const norm = (v: unknown) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\b(district|city|division|tehsil)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  for (const candidate of [city, county]) {
    if (!candidate) continue;
    try {
      // Look up old city names under their current one ("Gurgaon" ->
      // "Gurugram"), which is how the curated locations are filed.
      const name = canonicalPlaceName(candidate);
      const wanted = norm(name);
      if (!wanted) continue;
      const results = await api.locations(1, name);
      const match = (results ?? []).find(
        (l: any) => norm(l?.district) === wanted || norm(l?.lower_division_name) === wanted,
      );
      if (match?.location_id) return match.location_id;
    } catch {
      // Non-fatal -- callers shouldn't fail because location lookup failed.
    }
  }
  return undefined;
}
