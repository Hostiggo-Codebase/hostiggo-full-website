'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
  useMemo,
} from 'react';
import type { Property, SearchFilters, SortOption, GuestCount } from '@/types';
import { api, mapListingToProperty } from '@/lib/api';
import { toISODate } from '@/lib/utils';

interface ListingState {
  properties: Property[];
  loading: boolean;
  error: string | null;
  filters: SearchFilters;
  location: {
    query: string;
    // State of a place picked from the destination dropdown (not set for
    // typed text), so the search can tell same-named places apart.
    state?: string;
    latitude?: number;
    longitude?: number;
  };
  dates: {
    checkIn: Date | null;
    checkOut: Date | null;
  };
  guests: GuestCount;
  sort: SortOption;
  pagination: {
    page: number;
    pageSize: number;
    hasMore: boolean;
    cursor: number | null;
    totalCount: number | null;
  };
  counts: {
    total: number;
  };
  stateBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
  allProperties: Property[];
}

interface ListingActions {
  setSort: (sort: SortOption) => void;
  setPriceRange: (range: [number, number]) => void;
  setRating: (rating: number | null) => void;
  toggleAmenity: (amenity: string) => void;
  togglePropertyType: (type: string) => void;
  toggleStayType: (type: string) => void;
  toggleBedType: (type: string) => void;
  setBooleanFilter: (key: keyof SearchFilters, value: boolean) => void;
  fetchMore: () => void;
  clearFilters: () => void;
  setLocation: (loc: {
    query: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  }) => void;
  setDates: (dates: { checkIn: Date | null; checkOut: Date | null }) => void;
  setGuests: (guests: GuestCount) => void;
  refresh: () => Promise<void>;
}

const ListingStateContext = createContext<ListingState | undefined>(undefined);
const ListingDispatchContext = createContext<ListingActions | undefined>(
  undefined,
);

const DEFAULT_PAGE_SIZE = 20;

const DEFAULT_FILTERS: SearchFilters = {
  priceMin: 0,
  priceMax: 100000,
  guestRating: null,
  propertyTypes: [],
  stayTypes: [],
  amenities: [],
  bedTypes: [],
  freeCancellation: false,
  breakfast: false,
  parking: false,
  wifi: false,
  ac: false,
  privateRoom: false,
  sharedRoom: false,
  doubleBed: false,
  coupleFriendly: false,
  familyFriendly: false,
};

const DEFAULT_GUESTS: GuestCount = {
  adults: 1,
  children: 0,
  rooms: 1,
  pets: false,
};

// The Facilities checkboxes hold display labels (e.g. "Parking", "Pool") while
// the search RPC wants amenity ids. Each label is scored against the DB
// catalogue and the best match wins. Scoring prefers an exact name, then a
// head-noun match (the catalogue name's last word equals the label, so "Pool"
// → "Swimming Pool" rather than "Pool Table"), then a loose substring match.
// Unmatched labels (e.g. "Mountain view", which has no row) are dropped.
const scoreAmenity = (needle: string, name: string): number => {
  if (name === needle) return 100;
  const lastWord = name.split(/\s+/).pop() ?? '';
  if (lastWord === needle) return 50;
  if (name.includes(needle)) return 10;
  if (needle.includes(name)) return 5;
  return 0;
};

const resolveAmenityIds = (
  labels: string[],
  catalogue: { amenity_id: number; name: string }[],
): number[] => {
  if (!labels.length || !catalogue.length) return [];
  const ids: number[] = [];
  for (const label of labels) {
    const needle = label.trim().toLowerCase();
    let best: { id: number; score: number; len: number } | null = null;
    for (const a of catalogue) {
      const name = a.name.toLowerCase();
      const score = scoreAmenity(needle, name);
      if (score === 0) continue;
      // Higher score wins; on a tie prefer the shorter (closer) name.
      if (!best || score > best.score || (score === best.score && name.length < best.len)) {
        best = { id: a.amenity_id, score, len: name.length };
      }
    }
    if (best && !ids.includes(best.id)) ids.push(best.id);
  }
  return ids;
};

export function ListingFilterProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [location, setLocationState] = useState<{
    query: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  }>({ query: '' });
  const [dates, setDatesState] = useState<{
    checkIn: Date | null;
    checkOut: Date | null;
  }>({ checkIn: null, checkOut: null });
  const [guests, setGuestsState] = useState<GuestCount>(DEFAULT_GUESTS);
  const [sort, setSortState] = useState<SortOption>('recommended');
  const [page, setPage] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [stateBounds, setStateBounds] = useState<any>(null);
  const [amenityCatalogue, setAmenityCatalogue] = useState<
    { amenity_id: number; name: string }[]
  >([]);

  const mountedRef = useRef(true);
  // Guards against overlapping fetchResults() calls -- e.g. one fired by
  // the mount-time URL->location sync effect and another by a filter/date
  // change landing before the first request finished. Without this, the
  // slower response can resolve last and silently overwrite the faster,
  // more-current one, showing a result count and a properties list from
  // two different requests (e.g. "2 found" but only 1 card rendered).
  // Each call captures its own id; only the call whose id still matches
  // this ref when its response comes back is allowed to apply it.
  const requestSeqRef = useRef(0);

  // Load the amenity catalogue once so Facilities labels can be mapped to ids.
  useEffect(() => {
    let active = true;
    api
      .amenities()
      .then((rows) => {
        if (active) setAmenityCatalogue(rows ?? []);
      })
      .catch((err) => console.error('[Context] amenities load failed:', err));
    return () => {
      active = false;
    };
  }, []);

  const fetchResults = useCallback(
    async (cursorVal: number | null = null, isRefresh: boolean = false) => {
      if (!mountedRef.current) {
        return;
      }

      // Claim this call's slot. If another fetchResults() call starts
      // before this one's response comes back, requestSeqRef.current will
      // have moved on by then, and every state update below is skipped --
      // only the most recently *started* request is ever allowed to apply
      // its results, so a slow, stale response can never clobber a newer
      // one's (see requestSeqRef's declaration above for why this exists).
      const mySeq = ++requestSeqRef.current;
      const isStale = () => requestSeqRef.current !== mySeq;

      setLoading(true);
      setError(null);

      try {
        // Use cursor-based pagination for infinite scroll (works for all searches)
        const response = await api.searchByState(
          filters,
          location.query,
          cursorVal,
          DEFAULT_PAGE_SIZE,
          {
            startDate: toISODate(dates.checkIn),
            endDate: toISODate(dates.checkOut),
            totalGuests: guests.adults + guests.children,
            amenities: resolveAmenityIds(filters.amenities, amenityCatalogue),
            state: location.state,
            sort,
          },
        );

        if (!mountedRef.current || isStale()) return;

        const mapped = response.data.map(mapListingToProperty).filter((item) => item.id);

        if (isRefresh || cursorVal === null) {
          setProperties(mapped);
          setAllProperties(mapped);
        } else {
          setProperties((prev) => [...prev, ...mapped]);
          setAllProperties((prev) => [...prev, ...mapped]);
        }

        setCursor(response.cursor || null);
        setHasMore(response.hasMore);
        // Only the first page (cursor === null) carries the true total; later
        // pages return null so we keep the count already shown rather than
        // overwriting it with a per-page number. A null on the first page
        // means the total isn't known (filters narrowed a multi-page result),
        // so drop the previous search's count and count what's loaded.
        if (response.totalCount != null) setTotalCount(response.totalCount);
        else if (cursorVal === null) setTotalCount(null);
        if (response.stateBounds) {
          setStateBounds(response.stateBounds);
        }
      } catch (err) {
        if (!mountedRef.current || isStale()) return;
        console.error('[Context] Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (mountedRef.current && !isStale()) setLoading(false);
      }
    },
    [filters, location.query, location.state, dates, guests, amenityCatalogue, sort],
  );

  const refresh = useCallback(async () => {
    await fetchResults(null, true);
  }, [fetchResults]);

  const setSort = useCallback((newSort: SortOption) => {
    setSortState(newSort);
  }, []);

  const setPriceRange = useCallback((range: [number, number]) => {
    setFilters((prev) => ({ ...prev, priceMin: range[0], priceMax: range[1] }));
  }, []);

  const setRating = useCallback((rating: number | null) => {
    setFilters((prev) => ({ ...prev, guestRating: rating }));
  }, []);

  const toggleAmenity = useCallback((amenity: string) => {
    setFilters((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  }, []);

  const togglePropertyType = useCallback((type: string) => {
    setFilters((prev) => ({
      ...prev,
      propertyTypes: prev.propertyTypes.includes(type)
        ? prev.propertyTypes.filter((t) => t !== type)
        : [...prev.propertyTypes, type],
    }));
  }, []);

  const toggleStayType = useCallback((type: string) => {
    setFilters((prev) => ({
      ...prev,
      stayTypes: prev.stayTypes.includes(type)
        ? prev.stayTypes.filter((t) => t !== type)
        : [...prev.stayTypes, type],
    }));
  }, []);

  const toggleBedType = useCallback((type: string) => {
    setFilters((prev) => ({
      ...prev,
      bedTypes: prev.bedTypes.includes(type)
        ? prev.bedTypes.filter((t) => t !== type)
        : [...prev.bedTypes, type],
    }));
  }, []);

  const setBooleanFilter = useCallback(
    (key: keyof SearchFilters, value: boolean) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const fetchMore = useCallback(() => {
    if (hasMore && !loading) {
      fetchResults(cursor);
    }
  }, [hasMore, loading, cursor, fetchResults]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const setLocation = useCallback(
    (loc: { query: string; latitude?: number; longitude?: number }) => {
      setLocationState(loc);
    },
    [],
  );

  const setDates = useCallback(
    (newDates: { checkIn: Date | null; checkOut: Date | null }) => {
      setDatesState(newDates);
    },
    [],
  );

  const setGuests = useCallback((newGuests: GuestCount) => {
    setGuestsState(newGuests);
  }, []);

  const initializedRef = useRef(false);
  const prevLocationRef = useRef(`${location.query}|${location.state ?? ''}`);
  const prevFiltersRef = useRef(JSON.stringify(filters));
  const prevDatesRef = useRef(JSON.stringify(dates));
  const prevGuestsRef = useRef(JSON.stringify(guests));
  const prevSortRef = useRef(sort);

  // Trigger initial fetch and fetch on filter/location/date/guest change
  useEffect(() => {
    const datesKey = JSON.stringify(dates);
    const guestsKey = JSON.stringify(guests);
    const locationKey = `${location.query}|${location.state ?? ''}`;
    const locationChanged = prevLocationRef.current !== locationKey;
    const filtersChanged = prevFiltersRef.current !== JSON.stringify(filters);
    const datesChanged = prevDatesRef.current !== datesKey;
    const guestsChanged = prevGuestsRef.current !== guestsKey;
    const sortChanged = prevSortRef.current !== sort;

    prevLocationRef.current = locationKey;
    prevFiltersRef.current = JSON.stringify(filters);
    prevDatesRef.current = datesKey;
    prevGuestsRef.current = guestsKey;
    prevSortRef.current = sort;

    // Skip initial empty render
    if (!initializedRef.current && !location.query) {
      initializedRef.current = true;
      return;
    }

    initializedRef.current = true;

    // Reset page and properties when location changes
    if (locationChanged) {
      console.log('[Context] Location changed to:', location.query);
      setPage(0);
      setCursor(null);
      setProperties([]);
      setAllProperties([]);
      setHasMore(true);
      setStateBounds(null);
    }

    // Fetch results (always from beginning for new location/filters/dates/guests)
    if (locationChanged || filtersChanged || datesChanged || guestsChanged || sortChanged) {
      fetchResults(null, true);
    }
  }, [location.query, location.state, filters, dates, guests, sort]); // fetchResults intentionally omitted

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Sorting is done by /api/search across ALL matches before paging --
  // sorting only the loaded page put the wrong stays first on multi-page
  // results. `properties` already arrives in the chosen order.
  const sortedProperties = properties;

  const state: ListingState = {
    properties: sortedProperties,
    loading,
    error,
    filters,
    location,
    dates,
    guests,
    sort,
    pagination: {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      hasMore,
      cursor,
      totalCount,
    },
    counts: {
      total: totalCount ?? properties.length,
    },
    stateBounds,
    allProperties,
  };

  const actions: ListingActions = {
    setSort,
    setPriceRange,
    setRating,
    toggleAmenity,
    togglePropertyType,
    toggleStayType,
    toggleBedType,
    setBooleanFilter,
    fetchMore,
    clearFilters,
    setLocation,
    setDates,
    setGuests,
    refresh,
  };

  return (
    <ListingStateContext.Provider value={state}>
      <ListingDispatchContext.Provider value={actions}>
        {children}
      </ListingDispatchContext.Provider>
    </ListingStateContext.Provider>
  );
}

export function useListingState(): ListingState {
  const context = useContext(ListingStateContext);
  if (!context) {
    throw new Error(
      'useListingState must be used within ListingFilterProvider',
    );
  }
  return context;
}

export function useListingActions(): ListingActions {
  const context = useContext(ListingDispatchContext);
  if (!context) {
    throw new Error(
      'useListingActions must be used within ListingFilterProvider',
    );
  }
  return context;
}
