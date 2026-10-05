import { formatINR } from '@/lib/format';
import { supabase, supabaseCacheable } from '../supabase';
import { todayInIndia } from "@/lib/booking-config";
import { supabaseAdmin } from '../supabase-admin';
import { resolveDestinationAlias } from '../destinationAliases';
import {
  MIN_FUZZY_TERM_LENGTH,
  mergeScopePages,
  sanitizeSearchTerm,
  scopesFromLocations,
  type SearchScope,
} from '../destinationScopes';
import {
  SearchFilters,
  GuestlistingSearchResults,
  GuestlistingFullResults,
  LocationSummary,
  Review,
  RatingBreakdown,
} from '../../types/hotelServiceTypes';

export type SearchListingRpcRow = {
  listing: Record<string, any>;
  distance: number | null;
};

export type LocationRow = {
  location_id: number;
  state?: string | null;
  district?: string | null;
  lower_division_name?: string | null;
};

export type ListingRow = {
  listing_id: number;
  title: string;
  price_weekday: number;
  location_id: number;
  locations?: { state?: string | null; district?: string | null } | null;
  listing_media?:
    | { media_url?: string | null; is_cover?: boolean | null }[]
    | null;
};

export const HotelServiceApi = {
  // Only reached via the unstable_cache-wrapped getCachedHotelsTeaser
  // (src/lib/services/cached-reference-data.ts) -- uses supabaseCacheable
  // (no forced no-store) so this stays compatible with static generation.
  getHotels: async () => {
    const { data, error } = await supabaseCacheable
      .from('listings')
      .select(
        `
        listing_id,
        title,
        price_weekday,
        is_active,
        locations (state, district),
        listing_media (media_url)
      `,
      )
      .eq('is_active', true)
      .eq('listing_media.is_cover', true);

    if (error) {
      console.error('Fetch error:', error);
      return [];
    }

    return data;
  },

  getHotelsByLocationId: async (
    locationId: number,
    limit: number = 4,
  ): Promise<ListingRow[]> => {
    return HotelServiceApi.getListingsByLocationId(locationId, limit, 0);
  },

  // Only reached via getCachedLocations (cached-reference-data.ts) --
  // supabaseCacheable, see note on getHotels above.
  getLocationSample: async (limit: number = 22): Promise<LocationRow[]> => {
    const { data, error } = await supabaseCacheable
      .from('locations')
      .select('location_id, state, district, lower_division_name')
      .order('location_id', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Fetch error (getLocationSample):', error);
      throw error;
    }

    return (data || []) as LocationRow[];
  },

  // Ranks locations by how many active listings they have -- used for the
  // home page's "Popular in <city>" sections instead of a random sample.
  // Only reached via getCachedLocations -- supabaseCacheable, see note on
  // getHotels above.
  getPopularLocations: async (limit: number = 4): Promise<LocationRow[]> => {
    const { data, error } = await supabaseCacheable
      .from('listings')
      .select('location_id, locations (location_id, state, district, lower_division_name)')
      .eq('is_active', true)
      .not('location_id', 'is', null);

    if (error) {
      console.error('Fetch error (getPopularLocations):', error);
      throw error;
    }

    const counts = new Map<number, { row: LocationRow; count: number }>();
    for (const listing of (data || []) as any[]) {
      const loc = listing.locations;
      if (!loc?.location_id) continue;
      const existing = counts.get(loc.location_id);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(loc.location_id, {
          row: {
            location_id: loc.location_id,
            state: loc.state,
            district: loc.district,
            lower_division_name: loc.lower_division_name,
          },
          count: 1,
        });
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((entry) => entry.row);
  },

  // Only reached via getHotelsByLocationId <- getCachedHotelsTeaser
  // (cached-reference-data.ts) -- supabaseCacheable, see note on getHotels
  // above.
  getListingsByLocationId: async (
    locationId: number,
    limit: number = 6,
    offset: number = 0,
  ): Promise<ListingRow[]> => {
    const { data, error } = await supabaseCacheable
      .from('listings')
      .select(
        `
        listing_id,
        title,
        price_weekday,
        location_id,
        locations (state, district),
        listing_media (media_url, is_cover)
      `,
      )
      .eq('is_active', true)
      .eq('location_id', locationId)
      .eq('listing_media.is_cover', true)
      .order('listing_id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Fetch error (getListingsByLocationId):', error);
      throw error;
    }

    return (data || []) as ListingRow[];
  },

  // Listings owned by a given user (resolves host_uuid via the host table).
  // Paginated via offset/limit so hosts with more than a page of listings
  // (the demo host has 150+) aren't silently capped.
  getListingsByHost: async (
    userId: string,
    offset: number = 0,
    limit: number = 24,
  ): Promise<{ data: any[]; total: number }> => {
    const { data: host, error: hostError } = await supabase
      .from('host')
      .select('host_uuid')
      .eq('user_id', userId)
      .maybeSingle();

    if (hostError) {
      console.error('Fetch error (getListingsByHost/host):', hostError);
      throw hostError;
    }
    if (!host?.host_uuid) {
      console.warn('[getListingsByHost] No host profile found for user:', userId);
      return { data: [], total: 0 };
    }

    const { data, error, count } = await supabase
      .from('listings')
      .select(
        `
        listing_id,
        title,
        price_weekday,
        is_active,
        lisiting_status,
        locations (state, district),
        listing_media (media_url, is_cover)
      `,
        { count: 'exact' },
      )
      .eq('host_uuid', host.host_uuid)
      .order('listing_id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Fetch error (getListingsByHost/listings):', error);
      throw error;
    }
    return { data: data || [], total: count ?? 0 };
  },

  filterHotels: async (
    filters: SearchFilters,
    page: number = 0,
    pageSize: number = 10,
  ): Promise<SearchListingRpcRow[]> => {
    const offset = page * pageSize;
    const amenityIds = filters.amenities ? filters.amenities.map(Number) : [];
    const selectedRatings = filters.ratings || [];

    const { data, error } = await supabase.rpc('search_listings', {
      p_start_date: filters.startDate,
      p_end_date: filters.endDate,
      p_state: filters.state,
      p_district: filters.district,
      p_min_price: filters.minPrice,
      p_max_price: filters.maxPrice,
      p_total_guests: filters.totalGuests,
      p_ratings: selectedRatings,
      p_amenities: amenityIds,
      p_roomtypes: filters.roomTypes,
      p_lat: filters.latitude ?? null,
      p_lon: filters.longitude ?? null,
      p_limit: pageSize,
      p_offset: offset,
    });

    if (error) {
      console.error(
        '[filterHotels] RPC error:',
        JSON.stringify(error, null, 2),
      );
      throw error;
    }

    return (data || []) as SearchListingRpcRow[];
  },

  // Turns the search box text into the state/district scopes to search.
  // Listings are stored per state + district, and the RPC matches both
  // exactly, so free text has to be mapped onto names the `locations` table
  // really uses. In order: an explicit state (picked from the dropdown) wins;
  // then known aliases ("New Delhi", "Gurgaon"); then a state name; then an
  // exact district that has active listings; and finally a partial match on
  // the district / locality name of active listings ("Shim" -> Shimla). A
  // "Place, State" string is retried on just the place. Anything that still
  // matches nothing is searched as typed (and so returns no results).
  resolveSearchScopes: async (filters: SearchFilters): Promise<SearchScope[]> => {
    let state: string | null = filters.state?.trim() || null;
    let district: string | null = filters.district?.trim() || null;

    if (district) {
      const alias = resolveDestinationAlias(district);
      if (alias) {
        const typedName = district;
        state = alias.state ?? state;
        district = alias.district ?? null;
        // A renamed city ("Gurgaon" -> "Gurugram"): search both spellings, so
        // a listing still filed under the old name isn't lost.
        if (district && district.toLowerCase() !== typedName.toLowerCase()) {
          return [
            { state, district },
            { state, district: typedName },
          ];
        }
      }
    }

    if (!district) return [{ state, district: null }];
    if (state) return [{ state, district }];

    const typed = district;
    const terms = [
      ...new Set(
        [typed, typed.split(',')[0]]
          .map(sanitizeSearchTerm)
          .filter((t) => t.length > 0),
      ),
    ];

    // A typed STATE name (e.g. "Uttarakhand") matches no district, so search
    // the whole state. (A city that shares its name with its state still
    // works: every listing in that state includes it.)
    for (const term of terms) {
      const { data: stateMatch } = await supabase
        .from('locations')
        .select('state')
        .ilike('state', term)
        .limit(1)
        .maybeSingle();
      if (stateMatch?.state) return [{ state: stateMatch.state, district: null }];
    }

    for (const term of terms) {
      const { data: exact } = await supabase
        .from('listings')
        .select('listing_id, locations!inner(district)')
        .eq('is_active', true)
        .ilike('locations.district', term)
        .limit(1);
      if (exact?.length) return [{ state: null, district: term }];
    }

    for (const term of terms) {
      if (term.length < MIN_FUZZY_TERM_LENGTH) continue;
      const { data: fuzzy, error } = await supabase
        .from('listings')
        .select('locations!inner(state, district)')
        .eq('is_active', true)
        .or(`district.ilike.%${term}%,lower_division_name.ilike.%${term}%`, {
          referencedTable: 'locations',
        })
        .limit(200);
      if (error) {
        console.error('[resolveSearchScopes] fuzzy lookup failed:', error.message);
        continue;
      }
      const scopes = scopesFromLocations(
        (fuzzy || []).map((r: any) => (Array.isArray(r.locations) ? r.locations[0] : r.locations)),
      );
      if (scopes.length) return scopes;
    }

    // Last resort: part of a state name ("Himachal" -> Himachal Pradesh)
    // searches the whole of each state it matches.
    for (const term of terms) {
      if (term.length < MIN_FUZZY_TERM_LENGTH) continue;
      const { data: states } = await supabase
        .from('listings')
        .select('locations!inner(state)')
        .eq('is_active', true)
        .ilike('locations.state', `%${term}%`)
        .limit(200);
      const matched = scopesFromLocations(
        (states || []).map((r: any) => ({
          state: (Array.isArray(r.locations) ? r.locations[0] : r.locations)?.state,
        })),
      );
      if (matched.length) return matched;
    }

    return [{ state: null, district: typed }];
  },

  filterHotelsByState: async (
    filters: SearchFilters,
    cursor: number | null = null,
    pageSize: number = 50,
  ): Promise<{
    data: SearchListingRpcRow[];
    hasMore: boolean;
    totalCount: number | null;
    stateBounds: any;
  }> => {
    const amenityIds = filters.amenities ? filters.amenities.map(Number) : [];
    const selectedRatings = filters.ratings || [];

    const scopes = await HotelServiceApi.resolveSearchScopes(filters);
    // The first scope's state, when it names one, is also where the map bounds
    // come from below.
    const searchState = scopes[0]?.state ?? undefined;

    const pages = await Promise.all(
      scopes.map(async (scope) => {
        const { data, error } = await supabase.rpc('search_listings_by_state', {
          p_state: scope.state,
          p_district: scope.district,
          p_cursor: cursor,
          p_start_date: filters.startDate,
          p_end_date: filters.endDate,
          p_min_price: filters.minPrice,
          p_max_price: filters.maxPrice,
          p_total_guests: filters.totalGuests,
          p_ratings: selectedRatings,
          p_amenities: amenityIds,
          p_roomtypes: filters.roomTypes,
          p_limit: pageSize,
        });
        if (error) {
          console.error('[filterHotelsByState] RPC error:', JSON.stringify(error, null, 2));
          throw error;
        }
        return (data || []) as SearchListingRpcRow[];
      }),
    );
    const { rows: data, more } = mergeScopePages(pages, pageSize);

    // True match count, independent of p_limit. search_listings_by_state ends
    // with `LIMIT p_limit`, so a PostgREST `count: 'exact'` on it only ever
    // counts the current page -- which is why the header capped at the page
    // size regardless of how many listings matched. Get the real total from
    // the dedicated no-LIMIT count RPC (migration 003). Only needed on the
    // first page; later cursor pages return null so the client keeps the count
    // it already has instead of overwriting it with a per-page number.
    let totalCount: number | null = null;
    if (cursor === null) {
      try {
        const counts = await Promise.all(
          scopes.map(async (scope) => {
            const { data: cnt, error: cntErr } = await supabase.rpc(
              'search_listings_by_state_count',
              {
                p_state: scope.state,
                p_district: scope.district,
                p_start_date: filters.startDate,
                p_end_date: filters.endDate,
                p_min_price: filters.minPrice,
                p_max_price: filters.maxPrice,
                p_total_guests: filters.totalGuests,
                p_ratings: selectedRatings,
                p_amenities: amenityIds,
                p_roomtypes: filters.roomTypes,
              },
            );
            if (cntErr) throw cntErr;
            return Number(cnt ?? 0);
          }),
        );
        totalCount = counts.reduce((sum, n) => sum + n, 0);
      } catch (cntErr) {
        console.error('[filterHotelsByState] count RPC error:', JSON.stringify(cntErr, null, 2));
        // Fall back to the loaded page size so the header still shows a number.
        totalCount = data.length;
      }
    }

    // Get state boundaries for map (if state-level search). District
    // searches (the common case -- see searchByState in src/lib/api.ts,
    // which always sends `district` since the destination search box only
    // ever collects city/district text) don't have a `searchState` to key
    // off, so fall back to the state of the first matched listing -- every
    // row in a district search is necessarily within one state anyway.
    const boundsLookupState = searchState || data?.[0]?.listing?.locations?.state;
    let stateBounds = null;
    if (boundsLookupState) {
      // supabase-js's select-string type parser can't resolve a raw SQL
      // function call like `ST_AsGeoJSON(boundary) as boundary` -- it infers
      // a ParserError type for the row even though PostgREST runs it fine.
      // Override with the actual shape instead of widening to `any`.
      const { data: locationData } = (await supabase
        .from('locations')
        .select('state, ST_AsGeoJSON(boundary) as boundary')
        .eq('state', boundsLookupState)
        .maybeSingle()) as { data: { state: string; boundary: string | null } | null };

      if (locationData?.boundary) {
        try {
          const geoJSON = JSON.parse(locationData.boundary);
          const coordinates = geoJSON.coordinates?.[0] || [];
          if (coordinates.length > 0) {
            const lats = coordinates.map((c: any) => c[1]);
            const lngs = coordinates.map((c: any) => c[0]);
            stateBounds = {
              north: Math.max(...lats),
              south: Math.min(...lats),
              east: Math.max(...lngs),
              west: Math.min(...lngs),
            };
          }
        } catch (e) {
          console.warn('[filterHotelsByState] Failed to parse boundary:', e);
        }
      }
    }

    return {
      data,
      hasMore: more,
      totalCount,
      stateBounds,
    };
  },

  formatPrice: (price: number): string => {
    return `${formatINR(price)}`;
  },

  getHotelDetail: async (id: string) => {
    const listingId = Number(id);

    if (isNaN(listingId)) {
      console.error(`[getHotelDetail] Invalid hotel ID: ${id}`);
      return null;
    }

    // Uses the admin client, not the anon `supabase` client used elsewhere
    // in this file -- unlike the RPC-backed search functions (which run as
    // SECURITY DEFINER and bypass RLS regardless of caller), this is a
    // direct table select with nested embeds (listing_addons,
    // listing_discounts). If RLS on those child tables doesn't grant the
    // anon role read access, Supabase doesn't error -- it silently returns
    // an empty array for that embed while the rest of the row loads fine,
    // which is exactly why host-added addons weren't showing up on the
    // guest-facing property page.
    const { data, error } = await supabaseAdmin
      .from('listings')
      .select(
        `
        *,
        locations (*),
        listing_media (media_url, is_cover),
        review (*),
        listing_amenities (
          amenity_id,
          amenities (amenity_id, name, icon, category)
        ),
        listing_bedrooms (
          bedroom_index, beds, bathrooms, max_guests
        ),
        listing_discounts (
          id, discount_type, percent, enabled
        ),
        listing_addons (
          id, price, includes, timing_from, timing_to, additional_notes,
          addons (addon_id, name, icon, category)
        )
      `,
      )
      .eq('listing_id', listingId)
      .eq('is_active', true)
      .maybeSingle();

    // No row = the listing doesn't exist or isn't live (a real "not found").
    // Any other failure is an outage and must not masquerade as a 404.
    if (error) {
      console.error(`[getHotelDetail] Query failed for id=${id}:`, error.message);
      throw error;
    }
    if (!data) return null;

    // listing_house_rules and listing_safety_details have RLS policies that
    // block the anon client's SELECT entirely (confirmed live, rows exist
    // but the anon key always sees an empty result), unlike the other
    // tables joined above. Fetch these two with the service-role client
    // instead so real host-entered data actually reaches the guest page.
    // Note: use a plain array select + take [0], not .maybeSingle(), in
    // this Promise.all/dev-server context .maybeSingle() reproducibly
    // returned null even though the row genuinely exists (confirmed via an
    // isolated script and a plain array query against the identical
    // filter); the array form doesn't have that problem.
    const today = todayInIndia();
    const [houseRules, safetyDetails, , tripsHosted] = await Promise.all([
      supabaseAdmin
        .from('listing_house_rules')
        .select('check_in_time, check_out_time, smoking_allowed, pets_allowed, parties_allowed, quiet_hours')
        .eq('listing_id', listingId),
      supabaseAdmin
        .from('listing_safety_details')
        .select('id, enabled, safety_features (feature_id, name, icon, description)')
        .eq('listing_id', listingId),
      // Host card ("Hosted by ..."): name lives on users, photo/verified on host.
      supabaseAdmin
        .from('host')
        .select('host_uuid, user_id, photo, is_verified')
        .eq('host_uuid', data.host_uuid)
        .limit(1),
      // Trips hosted = confirmed bookings (status_id 2) that have checked out.
      supabaseAdmin
        .from('bookings')
        .select('booking_id', { count: 'exact', head: true })
        .eq('host_uuid', data.host_uuid)
        .eq('status_id', 2)
        .lte('end_date', today),
    ]);

    // Resolve the owner for the "Hosted by" section. The listings query above
    // can't embed this (host_uuid -> host.user_id -> users.name spans two
    // hops), so look it up and attach as `host`, which the guest page reads
    // instead of falling back to the literal string "Host".
    let host: Record<string, unknown> | null = null;
    if ((data as any).host_uuid) {
      const { data: hostRow } = await supabaseAdmin
        .from('host')
        .select('host_uuid, user_id, photo, is_verified, about')
        .eq('host_uuid', (data as any).host_uuid)
        .maybeSingle();
      if (hostRow) {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('name, profile_pic_url')
          .eq('user_id', hostRow.user_id)
          .maybeSingle();
        host = {
          id: hostRow.host_uuid,
          name: userRow?.name ?? 'Host',
          photo: userRow?.profile_pic_url ?? hostRow.photo ?? null,
          is_verified: hostRow.is_verified ?? false,
          about: hostRow.about ?? null,
          tripsHosted: tripsHosted.count ?? 0,
        };
      }
    }

    // Reviews carry only user_id -- attach each reviewer's first name and
    // photo (never their full name or any contact detail), newest first.
    const rawReviews = (((data as any).review ?? []) as any[]).slice();
    const reviewerIds = [...new Set(rawReviews.map((r) => r.user_id).filter(Boolean))];
    const { data: reviewers } = reviewerIds.length
      ? await supabaseAdmin.from('users').select('user_id, name, profile_pic_url').in('user_id', reviewerIds)
      : { data: [] as any[] };
    const reviewerById = new Map((reviewers ?? []).map((u: any) => [u.user_id, u]));
    const review = rawReviews
      .map((r) => {
        const u = reviewerById.get(r.user_id);
        return {
          ...r,
          user_name: String(u?.name ?? '').trim().split(/\s+/)[0] || 'Guest',
          user_avatar: u?.profile_pic_url ?? null,
          reviewed_at: r.reviewd_at ?? null,
        };
      })
      .sort((a, b) => String(b.reviewed_at ?? '').localeCompare(String(a.reviewed_at ?? '')));

    return {
      ...data,
      review,
      host,
      listing_house_rules: houseRules.data?.[0] ?? null,
      listing_safety_details: safetyDetails.data ?? [],
    };
  },

  getAmenities: async () => {
    const { data, error } = await supabase
      .from('amenities')
      .select('amenity_id, name')
      .order('name', { ascending: true });

    if (error) {
      console.error('Fetch error (getAmenities):', error);
      return [];
    }

    return data;
  },

  searchLocations: async (searchTerm: string) => {
    if (!searchTerm || !searchTerm.trim()) return [];

    const { data, error } = await supabase.rpc('search_locations_partial', {
      search_term: searchTerm.trim(),
    });

    if (error) {
      console.error('Search error (searchLocations - partial):', {
        error,
        searchTerm,
      });
      return [];
    }

    return data || [];
  },

  getUniqueRoomType: async () => {
    const { data, error } = await supabase.rpc('get_unique_room_types');
    if (error) {
      console.error('RPC error (getUniqueRoomType):', error);
      return [];
    }
    return data || [];
  },
};
