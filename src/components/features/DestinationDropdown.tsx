import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Clock, Navigation, Loader2 } from 'lucide-react';
import { SUGGESTED_DESTINATIONS, findCityGuide } from '@/constants/data';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { buildDestinationOptions, countStaysFor } from '@/lib/destinationOptions';
import { reverseGeocode } from '@/lib/services/geocoding';
import { toast } from 'sonner';

interface DestinationDropdownProps {
  // Live text of the search bar's own destination input. The panel has no
  // input of its own -- typing happens in the bar, and the suggestions
  // follow this value.
  value: string;
  // Called with typed text when the dropdown closes without a pick, so the
  // search runs on what was typed -- not on every keystroke along the way.
  onQueryChange: (value: string) => void;
  // `state` is set when a specific place was picked from the list.
  onSelect: (value: string, state?: string) => void;
  onClose: () => void;
  /** Fill the parent's width (homepage hero) instead of a fixed 560px panel. */
  fullWidth?: boolean;
}

const RECENT_STORAGE_KEY = 'hostiggo:recent-searches';
const MAX_RECENT = 3;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function pushRecentSearch(value: string) {
  try {
    const current = getRecentSearches().filter((v) => v.toLowerCase() !== value.toLowerCase());
    const next = [value, ...current].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

const FALLBACK_IMG = '/placeholder.svg';

export default function DestinationDropdown({
  value,
  onQueryChange,
  onSelect,
  onClose,
  fullWidth = false,
}: DestinationDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // On short screens the panel opens below the fold -- bring it into view.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);
  // The text being searched is the parent input's value.
  const query = value;
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const [allListings, setAllListings] = useState<any[]>([]);

  // Typed text is only handed to the parent when the dropdown goes away
  // without a pick (click elsewhere, press Search). Updating the parent on
  // every keystroke ran a full listing search per letter -- "Del" flashed an
  // empty result list before "Delhi" was finished.
  const queryRef = useRef(value);
  const committedRef = useRef(false);
  const onQueryChangeRef = useRef(onQueryChange);
  const initialValueRef = useRef(value);
  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);
  useEffect(
    () => () => {
      if (!committedRef.current && queryRef.current !== initialValueRef.current) {
        onQueryChangeRef.current(queryRef.current);
      }
    },
    [],
  );

  // Load every active listing once so destinations can be ranked by how many
  // listings each state actually has. Cheap (cached, cover-photo rows only).
  useEffect(() => {
    let mounted = true;
    api
      .hotels()
      .then((rows) => {
        if (mounted) setAllListings(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        /* ranking is a nicety -- fall back to the original order on error */
      });
    return () => {
      mounted = false;
    };
  }, []);

  // state name (normalised) -> number of listings in that state.
  const listingCountByState = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of allListings) {
      const state = (row?.locations?.state ?? '').trim().toLowerCase();
      if (!state) continue;
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return counts;
  }, [allListings]);

  // Listings in the state a destination points at -- used to rank places.
  const countOf = useCallback(
    (place?: string | null) =>
      listingCountByState.get((place ?? '').trim().toLowerCase()) ?? 0,
    [listingCountByState],
  );

  // Listings a search for this destination will actually return. Drives the
  // "(N stays)" labels and the ranking of the suggestions, so a city shows its
  // own count rather than its whole state's.
  const staysFor = useCallback(
    (destination: string) => countStaysFor(destination, allListings),
    [allListings],
  );

  // Live results, one option per place (plus the whole state when the query
  // names one), re-ranked on every change so states with the most listings
  // come first.
  const destinationOptions = useMemo(
    () => buildDestinationOptions(results, query, countOf),
    [results, query, countOf],
  );

  // Same ranking for the default "click to open" suggestions.
  const sortedSuggested = useMemo(
    () => [...SUGGESTED_DESTINATIONS].sort((a, b) => staysFor(b.name) - staysFor(a.name)),
    [staysFor],
  );

  useEffect(() => {
    setRecent(getRecentSearches());
  }, []);

  // Remember the latest typed text for the unmount commit above.
  useEffect(() => {
    queryRef.current = value;
  }, [value]);

  // Debounce API calls
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    // Don't fire the network request for very short queries (e.g. a single
    // character). Leave any existing results unchanged until length >= 2.
    if (query.trim().length < 2) {
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.locations(10, query);
        setResults(data || []);
      } catch (e) {
        console.error('Location search error:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Deliberately doesn't call onClose() here -- onSelect already decides
  // the right terminal panel state for its caller (SearchForm advances to
  // the date panel, CompactSearchBar closes to null). Calling onClose()
  // right after onSelect() used to fire a second setActivePanel(null) that
  // clobbered whatever onSelect had just set, so picking any destination
  // that wasn't one of the hardcoded city-guide entries (which navigate
  // straight to /search via goToSearch below, sidestepping this) silently
  // closed the whole search bar instead of moving on to date selection --
  // looked like nothing happened when you picked a location.
  const handleSelect = (name: string, state?: string) => {
    committedRef.current = true;
    pushRecentSearch(name);
    onSelect(name, state);
  };

  const handleUseCurrentLocation = () => {
    if (locating) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error("Your browser can't share its location. Type a destination instead.", { id: 'geo' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await reverseGeocode(position.coords.latitude, position.coords.longitude);
          const label = result?.address.city || result?.address.county || result?.displayName;
          if (label) handleSelect(label);
          else toast.error("We couldn't work out where you are. Type a destination instead.", { id: 'geo' });
        } catch {
          toast.error("We couldn't look up your location. Check your connection and try again.", { id: 'geo' });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location access is blocked. Allow it in your browser settings, or type a destination.'
            : "We couldn't get your location. Please try again or type a destination.",
          { id: 'geo' },
        );
      },
      { timeout: 10000 },
    );
  };

  // Navigate straight to the results for a city (optionally focused on one of
  // its areas). Stays are stored at city level, so `destination` is always the
  // city; `area` is passed through only as display context for the results
  // header.
  const goToSearch = (city: string, area?: string) => {
    committedRef.current = true;
    onSelect(city);
    onClose();
    const params = new URLSearchParams({ destination: city });
    if (area) params.set('area', area);
    router.push(`/search?${params.toString()}`);
  };

  const cityGuide = findCityGuide(query);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Choose destination"
      className="dropdown-panel !relative shrink-0 animate-fade-in-down"
      style={{ width: fullWidth ? '100%' : 'min(560px, 92vw)' }}
    >
      <div className="max-h-[min(480px,calc(100dvh-12rem))] overflow-y-auto overscroll-contain scrollbar-hide">
        {query.trim() && cityGuide ? (
          /* Matched city guide: city header + popular areas */
          <div className="py-2">
            <button
              onClick={() => goToSearch(cityGuide.city)}
              className="w-full flex items-center gap-3.5 px-4 py-3 hover:bg-figma-navy/5 transition-colors text-left group"
            >
              <img
                src={cityGuide.imageUrl}
                alt={cityGuide.city}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }}
                className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 bg-gray-100"
              />
              <div className="min-w-0">
                <p className="text-[16px] font-bold text-gray-900 leading-tight">
                  {cityGuide.city}
                </p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  ({staysFor(cityGuide.city).toLocaleString('en-IN')} stays)
                </p>
              </div>
            </button>

            <div className="h-px bg-gray-100 mx-4 my-1.5" />

            {cityGuide.areas.map((area) => (
              <button
                key={area.name}
                onClick={() => goToSearch(cityGuide.city, area.name)}
                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-figma-navy/5 transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-figma-navy/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-figma-navy/20 transition-colors">
                  <MapPin className="w-4 h-4 text-figma-navy" />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-gray-900 leading-tight">
                    {area.name}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {area.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : !query.trim() ? (
          /* Empty state: current location, recent searches, then suggested destinations */
          <div className="pt-2">
            <button
              onClick={handleUseCurrentLocation}
              disabled={locating}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-figma-navy/5 transition-colors text-left group disabled:opacity-60"
            >
              <div className="w-9 h-9 bg-figma-navy/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-figma-navy/20 transition-colors">
                {locating ? (
                  <Loader2 className="w-4 h-4 text-figma-navy animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4 text-figma-navy" />
                )}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-800">
                  {locating ? 'Finding your location…' : 'Use current location'}
                </p>
                <p className="text-[11px] text-gray-400">Near me stays</p>
              </div>
            </button>

            {recent.length > 0 && (
              <>
                <p className="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Recent searches
                </p>
                {recent.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleSelect(r)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                    <span className="text-[13px] font-medium text-gray-700">
                      {r}
                    </span>
                  </button>
                ))}
              </>
            )}

            <p className="px-4 pt-3 pb-3 text-[15px] font-bold text-gray-900">
              Suggested destinations
            </p>
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
              {sortedSuggested.map((dest) => (
                <button
                  key={dest.id}
                  onClick={() => handleSelect(dest.name)}
                  className="flex items-center gap-3 p-1.5 rounded-2xl hover:bg-figma-navy/5 transition-colors text-left group"
                >
                  <img
                    src={dest.imageUrl}
                    alt={dest.name}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG; }}
                    className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 bg-gray-100"
                  />
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-gray-900 leading-tight truncate">
                      {dest.name}
                    </p>
                    {dest.state && dest.state.toLowerCase() !== dest.name.toLowerCase() && (
                      <p className="text-[12px] text-gray-500 leading-tight truncate">
                        {dest.state}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      ({staysFor(dest.name).toLocaleString('en-IN')} stays)
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Typed query with no matching city guide: live location results */
          <div className="py-2">
            {loading ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-400 font-medium">Searching...</p>
              </div>
            ) : destinationOptions.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-400 font-medium">
                  No exact match found in database
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  You can still search for &quot;{query}&quot;
                </p>
              </div>
            ) : (
              destinationOptions.map((dest) => {
                const displayName = dest.name;
                return (
                  <button
                    key={dest.key}
                    onClick={() => handleSelect(displayName, dest.wholeState ? undefined : dest.state)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 hover:bg-figma-navy/5 transition-colors text-left group',
                      value === displayName && 'bg-figma-navy/5',
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-figma-navy/20 transition-colors">
                      <MapPin className="w-5 h-5 text-gray-500 group-hover:text-figma-navy transition-colors" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-800 truncate">
                        {displayName}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {dest.wholeState ? `All stays in ${dest.state}` : dest.state}
                      </p>
                    </div>
                    {value === displayName && (
                      <div className="w-2 h-2 rounded-full bg-figma-navy flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
