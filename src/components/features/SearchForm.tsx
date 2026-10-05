'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Calendar, Users, ChevronDown, X, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import DestinationDropdown from '@/components/features/DestinationDropdown';
import DateRangePicker from '@/components/features/DateRangePicker';
import GuestDropdown from '@/components/features/GuestDropdown';
import {
  useListingState,
  useListingActions,
} from '@/context/ListingFilterContext';
import { cn, toISODate } from '@/lib/utils';
import { plural } from '@/lib/format';

type Panel = 'destination' | 'date' | 'guests' | null;

function fmtDate(d: Date | null) {
  if (!d) return null;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * destination + dates + guests, so a refreshed or shared results URL keeps them.
 * `state` is only known for a place picked from the destination list.
 */
function searchQueryString(
  destination: string,
  dates: { checkIn: Date | null; checkOut: Date | null },
  guests: { adults: number; children: number },
  state?: string,
) {
  const params = new URLSearchParams({ destination: destination.trim() });
  if (state) params.set('state', state);
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
  return params.toString();
}

/** Compact search bar used on the SearchResultsPage */
export function CompactSearchBar() {
  const { location, dates, guests } = useListingState();
  const { setLocation, setDates, setGuests } = useListingActions();
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // Text typed in the destination box but not picked from the list yet. Kept
  // in a ref (no re-render, no search) and used when Search is pressed.
  const draftRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setActivePanel(null);
    };
    // Escape closes whichever panel is open (destination, dates, guests).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePanel(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const toggle = (p: Panel) => setActivePanel((cur) => (cur === p ? null : p));

  const handleSearch = () => {
    const draft = draftRef.current;
    const query = (draft ?? location.query).trim();
    if (!query) {
      toast.error('Please enter a destination');
      return;
    }
    if (draft != null) {
      setLocation({ query });
      draftRef.current = null;
    }
    router.push(
      `/search?${searchQueryString(query, dates, guests, draft != null ? undefined : location.state)}`,
    );
    setActivePanel(null);
  };

  return (
    <div ref={wrapRef} className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
      {/* Scrim behind an open pill's dropdown -- the results page always has a
          map/map-preview card directly beneath this bar, and since the
          dropdown is only as wide/tall as its own content, any part of that
          card outside the dropdown's own footprint peeks out from behind it.
          The scrim covers the whole page below the dropdown so nothing shows
          through regardless of viewport width. */}
      {activePanel && (
        <div
          className="fixed inset-0 z-[1050] bg-black/10"
          aria-hidden="true"
          onClick={() => setActivePanel(null)}
        />
      )}
      {/* Destination Pill */}
      <div className="relative z-[1100] w-full sm:flex-[1.2] min-w-0">
        <button
          onClick={() => toggle('destination')}
          className={cn(
            'w-full h-[52px] flex items-center gap-3 px-5 rounded-full bg-white transition-all text-left border-2',
            activePanel === 'destination'
              ? 'border-figma-navy/40'
              : 'border-transparent',
          )}
        >
          <Search
            className="w-5 h-5 text-gray-400 flex-shrink-0"
            strokeWidth={2.5}
          />
          <span
            className={cn(
              'text-[14px] font-medium truncate',
              location.query ? 'text-gray-900' : 'text-gray-400',
            )}
          >
            {location.query || 'New Delhi'}
          </span>
          {location.query && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear destination"
              className="ml-auto p-1 hover:bg-gray-100 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                draftRef.current = null;
                setLocation({ query: '' });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  draftRef.current = null;
                  setLocation({ query: '' });
                }
              }}
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </span>
          )}
        </button>
        {activePanel === 'destination' && (
          <div className="absolute top-[calc(100%+12px)] left-0 w-full min-w-[320px] z-[1100]">
            <DestinationDropdown
              value={location.query}
              onQueryChange={(v) => {
                draftRef.current = null;
                setLocation({ query: v });
              }}
              onDraftChange={(v) => {
                draftRef.current = v;
              }}
              onSelect={(v, state) => {
                draftRef.current = null;
                setLocation({ query: v, state });
                setActivePanel(null);
              }}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}
      </div>

      {/* Date Pill */}
      <div className="relative z-[1100] w-full sm:flex-[1.5] min-w-0">
        <button
          onClick={() => toggle('date')}
          className={cn(
            'w-full h-[52px] flex items-center gap-4 px-5 rounded-full bg-white transition-all text-left border-2',
            activePanel === 'date' ? 'border-figma-navy/40' : 'border-transparent',
          )}
        >
          <Calendar
            className="w-5 h-5 text-gray-600 flex-shrink-0"
            strokeWidth={1.5}
          />
          <div className="flex items-center gap-6 min-w-0 flex-1">
            <div className="min-w-0">
              {dates.checkIn ? (
                <>
                  <p className="text-[13px] font-bold text-gray-900 leading-none mb-1">
                    {fmtDate(dates.checkIn)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {dates.checkIn.toLocaleDateString('en-US', {
                      weekday: 'long',
                    })}
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-gray-400">Add dates</p>
              )}
            </div>

            <svg
              width="14"
              height="12"
              viewBox="0 0 14 12"
              fill="none"
              className="text-gray-300 flex-shrink-0"
            >
              <path
                d="M1 6H13M13 6L8.5 1.5M13 6L8.5 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <div className="min-w-0">
              {dates.checkOut ? (
                <>
                  <p className="text-[13px] font-bold text-gray-900 leading-none mb-1">
                    {fmtDate(dates.checkOut)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {dates.checkOut.toLocaleDateString('en-US', {
                      weekday: 'long',
                    })}
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-gray-400">Add dates</p>
              )}
            </div>
          </div>
        </button>
        {activePanel === 'date' && (
          // DateRangePicker overrides .dropdown-panel's default `position:
          // absolute` with `!relative` and sets its own width, so this
          // wrapper naturally shrink-to-fits around it -- `-translate-x-1/2`
          // then centers correctly off the wrapper's own (now non-zero)
          // rendered width.
          <div className="absolute top-[calc(100%+12px)] left-1/2 -translate-x-1/2 z-[1100]">
            <DateRangePicker
              checkIn={dates.checkIn}
              checkOut={dates.checkOut}
              onChange={(checkIn, checkOut) => setDates({ checkIn, checkOut })}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}
      </div>

      {/* Guests Pill */}
      <div className="relative z-[1100] w-full sm:flex-[1.3] min-w-0">
        <button
          onClick={() => toggle('guests')}
          className={cn(
            'w-full h-[52px] flex items-center gap-3 px-5 rounded-full bg-white transition-all text-left border-2',
            activePanel === 'guests'
              ? 'border-figma-navy/40'
              : 'border-transparent',
          )}
        >
          <Users
            className="w-5 h-5 text-gray-500 flex-shrink-0"
            strokeWidth={1.5}
          />
          <div className="flex-1 truncate">
            <p className="text-[13px] font-bold text-gray-800">
              {plural(guests.adults, "Adult")} • {plural(guests.rooms, "Room")}
            </p>
            <p className="text-[11px] text-gray-400">
              {plural(guests.children, "Child", "Children")}
            </p>
          </div>
          <ChevronDown
            className={cn(
              'w-5 h-5 text-gray-400 transition-transform',
              activePanel === 'guests' && 'rotate-180',
            )}
          />
        </button>
        {activePanel === 'guests' && (
          // Width must match GuestDropdown's own w-[320px]: the panel is
          // itself position:absolute (.dropdown-panel), so without a sized
          // wrapper it would extend 320px RIGHTWARD from this right-edge
          // anchor -- off the viewport (same bug family as the invisible
          // date picker).
          <div className="absolute top-[calc(100%+12px)] right-0 z-[1100] w-[320px] max-w-[92vw]">
            <GuestDropdown
              guests={guests}
              onChange={setGuests}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}
      </div>

      {/* Search Button */}
      <button
        onClick={handleSearch}
        className="h-[52px] px-8 w-full sm:w-auto bg-primary-gradient border-2 border-white/20 text-white font-bold text-[15px] rounded-full transition-all shadow-md active:scale-95 sm:flex-shrink-0"
      >
        Search
      </button>
    </div>
  );
}

export default function SearchForm() {
  const { location, dates, guests } = useListingState();
  const { setLocation, setDates, setGuests } = useListingActions();
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // Text typed in the destination box but not picked from the list yet. Kept
  // in a ref (no re-render, no search) and used when Search is pressed.
  const draftRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setActivePanel(null);
    };
    // Escape closes whichever panel is open (destination, dates, guests).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePanel(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const toggle = (p: Panel) => setActivePanel((cur) => (cur === p ? null : p));

  const handleSearch = () => {
    const draft = draftRef.current;
    const query = (draft ?? location.query).trim();
    if (!query) {
      toast.error('Please enter a destination');
      return;
    }
    if (draft != null) {
      setLocation({ query });
      draftRef.current = null;
    }
    router.push(
      `/search?${searchQueryString(query, dates, guests, draft != null ? undefined : location.state)}`,
    );
    setActivePanel(null);
  };

  return (
    <div
      ref={wrapRef}
      className="w-full h-full flex flex-col justify-between py-1 gap-3.5"
    >
      {/* Destination */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggle('destination')}
          aria-haspopup="dialog"
          aria-expanded={activePanel === 'destination'}
          className={cn(
            'w-full h-[52px] flex items-center gap-3 px-5 rounded-full border transition-all text-left bg-white',
            activePanel === 'destination'
              ? 'border-figma-navy shadow-md ring-4 ring-figma-navy/10'
              : 'border-gray-200 hover:border-gray-300 shadow-sm hover:shadow',
          )}
        >
          <Search
            className="w-4 h-4 text-gray-400 flex-shrink-0"
            strokeWidth={2}
          />
          <div className="min-w-0 flex-1">
            {location.query ? (
              <p className="text-[18px] font-medium text-gray-900 truncate">
                {location.query}
              </p>
            ) : (
              <p className="text-[17px] font-normal text-gray-400 truncate">
                Search destination or homestay
              </p>
            )}
          </div>
        </button>
        {activePanel === 'destination' && (
          <div className="absolute top-[calc(100%+8px)] left-0 w-full z-[1100]">
            <DestinationDropdown
              fullWidth
              value={location.query}
              onQueryChange={(v) => {
                draftRef.current = null;
                setLocation({ query: v });
              }}
              onDraftChange={(v) => {
                draftRef.current = v;
              }}
              onSelect={(v, state) => {
                draftRef.current = null;
                setLocation({ query: v, state });
                setActivePanel('date');
              }}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}
      </div>

      {/* Dates Row */}
      <div className="flex gap-3 relative">
        {/* Check In */}
        <div className="relative flex-1">
          <button
            onClick={() => toggle('date')}
            className={cn(
              'w-full h-[76px] flex flex-col justify-center gap-0.5 px-4 py-2.5 rounded-2xl border transition-all text-left bg-white',
              activePanel === 'date'
                ? 'border-figma-navy shadow-md ring-4 ring-figma-navy/10'
                : 'border-gray-200 hover:border-gray-300 shadow-sm hover:shadow',
            )}
          >
            <div className="flex items-center gap-1.5">
              <Calendar
                className="w-4 h-4 text-gray-700 flex-shrink-0"
                strokeWidth={1.8}
              />
              <span className="text-[15px] font-semibold text-gray-900">
                Check In
              </span>
            </div>
            <div>
              {dates.checkIn ? (
                <>
                  <p className="text-[13px] font-normal text-gray-400 leading-none mb-0.5">
                    {dates.checkIn.toLocaleDateString('en-US', {
                      weekday: 'long',
                    })}
                  </p>
                  <p className="text-[17px] font-medium text-gray-900 leading-tight">
                    {fmtDate(dates.checkIn)}
                  </p>
                </>
              ) : (
                <p className="text-[15px] font-normal text-gray-400">Add date</p>
              )}
            </div>
          </button>
        </div>

        {/* Check Out */}
        <div className="relative flex-1">
          <button
            onClick={() => toggle('date')}
            className={cn(
              'w-full h-[76px] flex flex-col justify-center gap-0.5 px-4 py-2.5 rounded-2xl border transition-all text-left bg-white',
              activePanel === 'date'
                ? 'border-figma-navy shadow-md ring-4 ring-figma-navy/10'
                : 'border-gray-200 hover:border-gray-300 shadow-sm hover:shadow',
            )}
          >
            <div className="flex items-center gap-1.5">
              <Calendar
                className="w-4 h-4 text-gray-700 flex-shrink-0"
                strokeWidth={1.8}
              />
              <span className="text-[15px] font-semibold text-gray-900">
                Check Out
              </span>
            </div>
            <div>
              {dates.checkOut ? (
                <>
                  <p className="text-[13px] font-normal text-gray-400 leading-none mb-0.5">
                    {dates.checkOut.toLocaleDateString('en-US', {
                      weekday: 'long',
                    })}
                  </p>
                  <p className="text-[17px] font-medium text-gray-900 leading-tight">
                    {fmtDate(dates.checkOut)}
                  </p>
                </>
              ) : (
                <p className="text-[15px] font-normal text-gray-400">Add date</p>
              )}
            </div>
          </button>
        </div>

        {/* Shared DatePicker Popover */}
        {activePanel === 'date' && (
          <div className="absolute top-[calc(100%+8px)] left-0 w-full flex justify-center z-[1100]">
            <DateRangePicker
              checkIn={dates.checkIn}
              checkOut={dates.checkOut}
              onChange={(checkIn, checkOut) =>
                setDates({ checkIn, checkOut })
              }
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}
      </div>

      {/* Guests */}
      <div className="relative">
        <button
          onClick={() => toggle('guests')}
          className={cn(
            'w-full h-[52px] flex items-center gap-3 px-5 rounded-2xl border transition-all text-left bg-white',
            activePanel === 'guests'
              ? 'border-figma-navy shadow-md ring-4 ring-figma-navy/10'
              : 'border-gray-200 hover:border-gray-300 shadow-sm hover:shadow',
          )}
        >
          <Users
            className="w-4 h-4 text-gray-600 flex-shrink-0"
            strokeWidth={1.5}
          />
          <div className="min-w-0 flex-1 flex items-center gap-1.5 text-[16px] font-medium text-gray-800">
            <span>{plural(guests.adults, "Adult")}</span>
            <span className="text-gray-400">•</span>
            <span>{plural(guests.rooms, "Room")}</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-400 font-normal">
              {plural(guests.children, "Child", "Children")}
            </span>
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-200',
              activePanel === 'guests' && 'rotate-180',
            )}
            strokeWidth={2}
          />
        </button>
        {activePanel === 'guests' && (
          <div className="absolute top-[calc(100%+8px)] left-0 w-full z-[1100]">
            <GuestDropdown
              guests={guests}
              onChange={setGuests}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}
      </div>

      {/* Search Button — centered blue pill matching Figma */}
      <div className="flex justify-center pt-1">
        <button
          onClick={handleSearch}
          className="w-auto min-w-[200px] h-[48px] flex items-center justify-center bg-primary-gradient text-white font-medium text-[15px] rounded-full px-10 transition-all shadow-md hover:opacity-90 active:scale-95"
        >
          Search
        </button>
      </div>

      {/* Search on Map Button */}
      <button
        onClick={() => {
          if (location.query.trim().length > 0) {
            toast.error('You can either use the map or fill in the location yourself, not both.');
            return;
          }
          router.push('/search?view=map');
        }}
        className={cn(
          "w-full flex items-center gap-4 bg-white rounded-2xl p-4 border transition-all text-left",
          location.query.trim().length > 0
            ? "opacity-50 cursor-not-allowed border-gray-200"
            : "border-gray-200 hover:border-gray-300 shadow-sm hover:shadow"
        )}
      >
        <div className="w-12 h-12 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm flex-shrink-0">
          <MapPin className="w-6 h-6 text-figma-navy" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-[15px] font-medium text-figma-ink">Search on Map</h3>
          <p className="text-[12px] font-normal text-gray-400">For Accurate Location</p>
        </div>
      </button>
    </div>
  );
}
