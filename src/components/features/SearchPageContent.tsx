'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toISODate } from '@/lib/utils';
import { parseISODay } from '@/lib/format';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FiltersSidebar from '@/components/features/FiltersSidebar';
import SortDropdown from '@/components/features/SortDropdown';
import ActiveFilterTags from '@/components/features/ActiveFilterTags';
import PropertyCardList from '@/components/features/PropertyCardList';
import PropertyCardSkeleton from '@/components/features/PropertyCardSkeleton';
import GuestMapSearch from '@/components/features/GuestMapSearch';
import { CompactSearchBar } from '@/components/features/SearchForm';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import {
  useListingState,
  useListingActions,
} from '@/context/ListingFilterContext';
import type { Property, SearchFilters, SortOption } from '@/types';
import { X, SlidersHorizontal, MapPin } from 'lucide-react';

type ViewMode = 'list' | 'map' | 'split';

export default function SearchPageContent() {
  const searchParams = useSearchParams();
  const { properties, loading, error, pagination, filters, sort, location, counts, dates, guests } =
    useListingState();
  const router = useRouter();
  const pathname = usePathname();
  const {
    setSort,
    setPriceRange,
    setRating,
    toggleAmenity,
    togglePropertyType,
    toggleStayType,
    setBooleanFilter,
    fetchMore,
    clearFilters,
    setLocation,
    setDates,
    setGuests,
    refresh,
  } = useListingActions();

  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (searchParams?.get('view') as ViewMode) || 'list',
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The URL is the source of truth for a search: destination, dates, guests,
  // sort and view all round-trip through it, so a refresh or a shared link
  // restores exactly the same results. Read once on mount...
  const hydratedRef = useRef(false);
  useEffect(() => {
    const dest = searchParams?.get('destination');
    // `state` is set when the link came from a place picked in the dropdown.
    if (dest && dest !== location.query) {
      setLocation({ query: dest, state: searchParams?.get('state') || undefined });
    }
    const view = searchParams?.get('view');
    if (view === 'map' || view === 'list') setViewMode(view);

    const isDay = (v: string | null | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const ci = searchParams?.get('checkIn');
    const co = searchParams?.get('checkOut');
    if (isDay(ci) && isDay(co) && co! > ci!) {
      setDates({ checkIn: parseISODay(ci!), checkOut: parseISODay(co!) });
    }
    const adults = Number(searchParams?.get('adults'));
    const children = Number(searchParams?.get('children'));
    if (Number.isInteger(adults) && adults >= 1 && adults <= 30) {
      setGuests({
        ...guests,
        adults,
        children: Number.isInteger(children) && children >= 0 && children <= 20 ? children : 0,
      });
    }
    const urlSort = searchParams?.get('sort');
    if (urlSort) setSort(urlSort as SortOption);
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ...and written back whenever the search changes (replace, not push, so
  // Back leaves the results page instead of stepping through every tweak).
  // Skip the mount run: it happens in the same commit as the hydration effect
  // above, before those state updates apply, and would wipe the URL.
  const firstWriteRef = useRef(true);
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (firstWriteRef.current) {
      firstWriteRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (location.query) params.set('destination', location.query);
    const area = searchParams?.get('area');
    if (area) params.set('area', area);
    const ci = toISODate(dates.checkIn);
    const co = toISODate(dates.checkOut);
    if (ci && co) {
      params.set('checkIn', ci);
      params.set('checkOut', co);
    }
    if (guests.adults !== 1 || guests.children > 0) {
      params.set('adults', String(guests.adults));
      if (guests.children > 0) params.set('children', String(guests.children));
    }
    if (sort && sort !== 'recommended') params.set('sort', sort);
    if (viewMode === 'map') params.set('view', 'map');
    const next = params.toString();
    if (next !== (searchParams?.toString() ?? '')) {
      router.replace(`${pathname}${next ? `?${next}` : ''}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.query, dates, guests, sort, viewMode]);

  const handleRemoveFilter = (key: keyof SearchFilters, value?: string) => {
    if (key === 'propertyTypes' && value) {
      togglePropertyType(value);
    } else if (key === 'amenities' && value) {
      toggleAmenity(value);
    } else if (key === 'stayTypes' && value) {
      toggleStayType(value);
    } else if (key === 'priceMin' || key === 'priceMax') {
      setPriceRange([0, 100000]);
    } else if (key === 'guestRating') {
      setRating(null);
    } else if (typeof filters[key] === 'boolean') {
      setBooleanFilter(key, false);
    }
  };

  const areaParam = searchParams?.get('area');
  const displayDest = location.query || 'All destinations';
  const headerDest = areaParam ? `${areaParam}, ${displayDest}` : displayDest;
  const showMap = viewMode === 'map' || viewMode === 'split';
  const showList = viewMode === 'list' || viewMode === 'split';

  return (
    <div className="flex flex-col h-screen bg-[#FFFEF9]">
      <Navbar />

      {/* Search bar strip */}
      <div className="bg-[#004772] flex-shrink-0 py-3.5 px-4 sm:px-6 lg:px-8 shadow-md z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          <div className="flex-1">
            <CompactSearchBar />
          </div>
        </div>
      </div>

      {viewMode === 'map' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="hidden lg:block w-[320px] flex-shrink-0 overflow-y-auto bg-[#FFFEF9] p-4">
            <FiltersSidebar
              filters={filters}
              city={displayDest}
              count={counts.total}
            />
          </div>
          <div className="flex-1 relative overflow-hidden">
            <GuestMapSearch
              properties={properties}
              activeId={activeMapId}
              onMarkerClick={setActiveMapId}
              className="w-full h-full"
            />
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
            <div className="flex gap-6 items-start">
              <div className="hidden lg:block">
                <FiltersSidebar
                  filters={filters}
                  city={displayDest}
                  count={counts.total}
                />
              </div>

              {mobileSidebar && (
                <div className="fixed inset-0 z-50 lg:hidden">
                  <div
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={() => setMobileSidebar(false)}
                  />
                  <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-white overflow-y-auto p-4 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-bold text-gray-800 text-sm">
                        Filters
                      </h2>
                      <button
                        onClick={() => setMobileSidebar(false)}
                        className="p-1.5 rounded-lg hover:bg-gray-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <FiltersSidebar
                      filters={filters}
                      onReset={() => {
                        clearFilters();
                        setMobileSidebar(false);
                      }}
                      city={displayDest}
                      count={counts.total}
                    />
                  </div>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <ResultsHeader
                  dest={headerDest}
                  count={counts.total}
                  sort={sort}
                  setSort={setSort}
                  onMobileFilter={() => setMobileSidebar(true)}
                  filters={filters}
                  onRemoveFilter={handleRemoveFilter}
                  onClearAll={clearFilters}
                />
                <ListResults
                  error={error}
                  onRetry={refresh}
                  paginated={properties}
                  hasMore={pagination.hasMore}
                  loading={loading}
                  onLoadMore={fetchMore}
                  onHover={setHoveredId}
                  resetFilters={clearFilters}
                  totalCount={counts.total}
                />
              </div>
            </div>
          </div>
          <Footer />
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setViewMode((v) => (v === 'map' ? 'list' : 'map'))}
        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900 text-white px-5 py-3 rounded-full font-bold shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:bg-gray-800 hover:-translate-y-1 active:scale-95 transition-all flex items-center gap-2"
      >
        {viewMode === 'map' ? (
          <>
            <SlidersHorizontal className="w-4 h-4" />
            Show List
          </>
        ) : (
          <>
            <MapPin className="w-4 h-4" />
            Show Map
          </>
        )}
      </button>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

interface ResultsHeaderProps {
  dest: string;
  count: number;
  sort: SortOption;
  setSort: (s: SortOption) => void;
  onMobileFilter: () => void;
  filters: SearchFilters;
  onRemoveFilter: (key: keyof SearchFilters, value?: string) => void;
  onClearAll: () => void;
}

function ResultsHeader({
  dest,
  count,
  sort,
  setSort,
  onMobileFilter,
  filters,
  onRemoveFilter,
  onClearAll,
}: ResultsHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-extrabold text-gray-900 capitalize mb-1.5">
        {dest}
      </h1>
      <p className="text-[22px] text-gray-800 leading-snug mb-5">
        {count.toLocaleString('en-IN')} {count === 1 ? 'homestay' : 'homestays'} found
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SortDropdown value={sort} onChange={setSort} />
        <ActiveFilterTags
          filters={filters}
          onRemove={onRemoveFilter}
          onClearAll={onClearAll}
        />

        <button
          onClick={onMobileFilter}
          className="lg:hidden flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-gray-200 bg-white text-[13px] font-semibold text-gray-700 hover:border-gray-300 transition-all ml-auto"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          More Filters
        </button>
      </div>
    </div>
  );
}

interface ListResultsProps {
  error: string | null;
  onRetry: () => void;
  paginated: Property[];
  hasMore: boolean;
  onLoadMore: () => void;
  onHover: (id: string | null) => void;
  resetFilters: () => void;
  loading: boolean;
  totalCount: number;
}

function ListResults({
  error,
  onRetry,
  paginated,
  hasMore,
  onLoadMore,
  onHover,
  resetFilters,
  loading,
  totalCount,
}: ListResultsProps) {
  const sentinelRef = useInfiniteScroll(onLoadMore, hasMore, loading, {
    threshold: 0.5,
  });

  // A failed search is not "no results" -- say what happened and offer a retry.
  if (error && !loading && paginated.length === 0) {
    return (
      <div
        role="alert"
        className="bg-white rounded-2xl p-12 text-center"
        style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}
      >
        <div className="text-5xl mb-4">⚠️</div>
        <h3 className="text-lg font-bold text-gray-700 mb-2">We couldn&apos;t load stays right now</h3>
        <p className="text-sm text-gray-500 mb-5">Please check your connection and try again.</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-6 py-2.5 rounded-full bg-[#004772] text-white text-sm font-semibold hover:bg-[#003a5c]"
        >
          Try again
        </button>
      </div>
    );
  }

  // Show skeleton loaders during initial load
  if (loading && paginated.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <PropertyCardSkeleton key={i} variant="modern" />
        ))}
      </div>
    );
  }

  if (totalCount === 0 && !loading) {
    return (
      <div
        className="bg-white rounded-2xl p-12 text-center"
        style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}
      >
        <div className="text-5xl mb-4">🏨</div>
        <h3 className="text-lg font-bold text-gray-700 mb-2">
          No properties found
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          Try adjusting your filters or search for a different destination.
        </p>
        <button
          onClick={resetFilters}
          className="bg-figma-navy text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-figma-navy/90 active:scale-95"
        >
          Clear all filters
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {paginated.map((p) => (
          <div
            key={p.id}
            onMouseEnter={() => onHover(p.id)}
            onMouseLeave={() => onHover(null)}
          >
            <PropertyCardList property={p} />
          </div>
        ))}

        {/* Show skeleton cards while loading more */}
        {loading && paginated.length > 0 && (
          <>
            {Array.from({ length: 2 }).map((_, i) => (
              <PropertyCardSkeleton key={`loading-${i}`} variant="modern" />
            ))}
          </>
        )}
      </div>

      {/* Sentinel element for intersection observer - triggers lazy loading */}
      {hasMore && (
        <div
          ref={sentinelRef}
          className={`mt-8 py-6 text-center transition-opacity ${
            loading ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-3">
              <div className="flex gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full bg-figma-navy animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-2.5 h-2.5 rounded-full bg-figma-navy animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-2.5 h-2.5 rounded-full bg-figma-navy animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
              <span className="text-sm text-gray-600 font-medium">
                Loading more properties...
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/* Count display and end message */}
      <div className="mt-8 py-4 text-center">
        {totalCount && (
          <p className="text-sm text-gray-500 font-medium">
            {paginated.length} of {totalCount.toLocaleString('en-IN')} properties loaded
          </p>
        )}
        {!hasMore && paginated.length > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            ✓ Showing all properties in this area
          </p>
        )}
      </div>
    </>
  );
}
