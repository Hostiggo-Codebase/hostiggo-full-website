'use client';

import { formatINR } from '@/lib/format';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Download,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  CalendarDays,
  Info,
  RotateCcw,
  CheckCircle2,
  Ban,
  BedDouble,
  Loader2,
  Trash2,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import HostDashboardShell from '../_components/HostDashboardShell';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type DayStatus = 'available' | 'blocked' | 'booked' | 'none';

type DayInfo = {
  day: number;
  dateStr: string;
  price: number | null;
  currency: string;
  status: DayStatus;
  guest?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const inr = (n: number, currency: string) =>
  currency === 'INR' || !currency ? formatINR(n) : `${currency} ${n}`;

const STATUS_META: Record<DayStatus, { label: string; dot: string; cell: string; text: string }> = {
  available: { label: 'Available', dot: 'bg-green-500', cell: 'hover:bg-gray-50', text: 'text-green-600' },
  blocked: { label: 'Blocked', dot: 'bg-gray-400', cell: 'bg-gray-50', text: 'text-gray-400' },
  booked: { label: 'Booked', dot: 'bg-figma-accent', cell: 'bg-figma-navy/5', text: 'text-figma-navy' },
  none: { label: 'No rate set', dot: 'bg-gray-200', cell: 'hover:bg-gray-50', text: 'text-gray-300' },
};

type ListingOption = { id: string; title: string; location: string; image: string | null };

// Replaces a plain native <select> that listed every one of a host's
// properties as flat text -- fine for a couple of listings, but hosts with
// dozens (many sharing the exact same title, e.g. several "Mahadev Niwas")
// had no way to search, and no way to tell identically-named listings
// apart. This adds a search box and shows each listing's location + a
// thumbnail so hosts can actually find the right one.
function ListingPicker({
  listings,
  selectedId,
  onSelect,
  loading,
}: {
  listings: ListingOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = listings.find((l) => l.id === selectedId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter(
      (l) => l.title.toLowerCase().includes(q) || l.location.toLowerCase().includes(q),
    );
  }, [listings, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading || !listings.length}
        className="flex items-center gap-2 max-w-[240px] w-full sm:w-auto px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-300 transition-all disabled:opacity-60"
      >
        <span className="truncate">
          {loading ? 'Loading…' : selected ? selected.title : 'No listings'}
        </span>
        <ChevronDown
          className={cn('w-4 h-4 text-gray-400 flex-shrink-0 ml-auto transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] w-[300px] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-fade-in-down">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your properties…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No properties match.</p>
            ) : (
              filtered.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    onSelect(l.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors',
                    l.id === selectedId && 'bg-figma-navy/5',
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                    {l.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.image} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{l.title}</p>
                    {l.location && (
                      <p className="text-xs text-gray-400 truncate">{l.location}</p>
                    )}
                  </div>
                  {l.id === selectedId && (
                    <Check className="w-4 h-4 text-figma-navy flex-shrink-0" strokeWidth={2.5} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { userId } = useAuth();
  const [listings, setListings] = useState<
    { id: string; title: string; location: string; image: string | null }[]
  >([]);
  const [listingId, setListingId] = useState<string>('');
  const [monthDate, setMonthDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [entries, setEntries] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [availInput, setAvailInput] = useState(true);
  const [saving, setSaving] = useState(false);
  // iCal sync state
  const [showICalModal, setShowICalModal] = useState(false);
  const [icalUrl, setIcalUrl] = useState('');
  const [icalStatus, setIcalStatus] = useState<{ icalUrl: string | null; isActive: boolean; lastUpdated: string } | null>(null);
  const [icalLoading, setIcalLoading] = useState(false);
  const [registering, setRegistering] = useState(false);

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  // Load the host's listings for the picker.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoadingListings(true);
    api
      // Listing picker needs every listing, not just a page of them.
      .hostListings(userId, 0, 500)
      .then(({ data: rows }) => {
        if (!active) return;
        const mapped = rows.map((r: any) => {
          const loc = Array.isArray(r.locations) ? r.locations[0] : r.locations;
          const media = Array.isArray(r.listing_media) ? r.listing_media : [];
          const cover = media.find((m: any) => m.is_cover) ?? media[0];
          return {
            id: String(r.listing_id),
            title: r.title?.trim() || `Listing ${r.listing_id}`,
            location: [loc?.district, loc?.state].filter(Boolean).join(', '),
            image: cover?.media_url ?? null,
          };
        });
        setListings(mapped);
        if (mapped.length) setListingId((cur) => cur || mapped[0].id);
      })
      .catch((err) => console.error('[host/calendar] listings load failed:', err))
      .finally(() => active && setLoadingListings(false));
    return () => {
      active = false;
    };
  }, [userId]);

  const loadCalendar = useCallback(async () => {
    if (!listingId) return;
    const start = toDateStr(year, month, 1);
    const end = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
    setLoading(true);
    setError(false);
    setSelectedDay(null);
    try {
      const data = await api.hostCalendar(listingId, start, end);
      setEntries(data.entries ?? []);
      setBookings(data.bookings ?? []);
    } catch (err) {
      console.error('[host/calendar] calendar load failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [listingId, year, month]);

  // Load iCal sync status for the current listing. Switching listings
  // quickly (or a slow response for one that's no longer selected) used to
  // let an older request resolve after a newer one and overwrite icalStatus
  // with a *different listing's* data -- the "Import iCal" / "Manage iCal"
  // button would then show whichever listing's request happened to land
  // last, not the one actually selected. Confirmed live: registering a feed
  // for listing 215 while listing 323 (inactive) was still in flight left
  // the button reading "Import iCal" even though 215 really was active.
  // Guard by only applying a response if its listing is still the one
  // selected when it comes back.
  const icalRequestListingRef = useRef<string>('');
  const loadICalStatus = useCallback(async () => {
    if (!listingId || !userId) return;
    icalRequestListingRef.current = listingId;
    const requestedFor = listingId;
    setIcalLoading(true);
    try {
      const data = await api.getICalStatus(listingId, userId);
      if (icalRequestListingRef.current !== requestedFor) return;
      setIcalStatus(data);
      if (data.icalUrl) setIcalUrl(data.icalUrl);
    } catch (err) {
      console.error('[host/calendar] iCal status load failed:', err);
      if (icalRequestListingRef.current === requestedFor) setIcalStatus(null);
    } finally {
      if (icalRequestListingRef.current === requestedFor) setIcalLoading(false);
    }
  }, [listingId, userId]);

  // Register a new iCal feed
  const handleRegisterICAL = async () => {
    if (!listingId || !icalUrl.trim() || !userId) {
      toast.error('Please enter a valid iCal URL');
      return;
    }

    setRegistering(true);
    try {
      const action = icalStatus?.isActive ? 'update' : 'add';
      await api.registerICalFeed({
        listingId,
        icalUrl: icalUrl.trim(),
        action,
        userId,
      });
      toast.success(
        action === 'add'
          ? 'iCal feed imported! Syncing will start in the next 15-minute slot.'
          : 'iCal feed updated! Syncing will resume in the next 15-minute slot.'
      );
      setShowICalModal(false);
      await loadICalStatus();
    } catch (err) {
      console.error('[host/calendar] iCal registration failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to import iCal feed');
    } finally {
      setRegistering(false);
    }
  };

  // Deactivate iCal feed
  const handleDeactivateICAL = async () => {
    if (!listingId || !userId) return;
    if (!window.confirm('Are you sure you want to remove the iCal feed?')) return;

    setRegistering(true);
    try {
      await api.registerICalFeed({
        listingId,
        icalUrl: '',
        action: 'deactivate',
        userId,
      });
      toast.success('iCal feed removed.');
      setIcalUrl('');
      setShowICalModal(false);
      await loadICalStatus();
    } catch (err) {
      console.error('[host/calendar] iCal deactivation failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to remove iCal feed');
    } finally {
      setRegistering(false);
    }
  };

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  // Load iCal status when listing changes
  useEffect(() => {
    loadICalStatus();
  }, [loadICalStatus]);

  // Build a date -> DayInfo map for the visible month.
  const days = useMemo<DayInfo[]>(() => {
    const entryMap = new Map<string, any>();
    for (const e of entries) entryMap.set(e.date, e);

    const isBooked = (dateStr: string): { booked: boolean; guest?: string } => {
      for (const b of bookings) {
        // Booked for [start_date, end_date), checkout day is free.
        if (b.start_date && b.end_date && dateStr >= b.start_date && dateStr < b.end_date) {
          return { booked: true, guest: b.guest?.name };
        }
      }
      return { booked: false };
    };

    const count = new Date(year, month + 1, 0).getDate();
    const out: DayInfo[] = [];
    for (let d = 1; d <= count; d++) {
      const dateStr = toDateStr(year, month, d);
      const entry = entryMap.get(dateStr);
      const booking = isBooked(dateStr);
      let status: DayStatus = 'none';
      if (booking.booked) status = 'booked';
      else if (entry) status = entry.is_available ? 'available' : 'blocked';
      out.push({
        day: d,
        dateStr,
        price: entry ? Number(entry.price) : null,
        currency: entry?.currency ?? 'INR',
        status,
        guest: booking.guest,
      });
    }
    return out;
  }, [entries, bookings, year, month]);

  const leading = new Date(year, month, 1).getDay();
  const selected = selectedDay ? days.find((d) => d.dateStr === selectedDay) : null;

  // Seed the edit form whenever a different day is selected.
  useEffect(() => {
    if (selected) {
      setPriceInput(selected.price != null ? String(selected.price) : '');
      setAvailInput(selected.status !== 'blocked');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  const handleSaveDay = async () => {
    if (!selected || !listingId || !userId) return;
    const day = selected.dateStr;
    setSaving(true);
    try {
      await api.updateCalendarDay({
        listingId,
        date: day,
        price: priceInput.trim() ? Number(priceInput) : undefined,
        isAvailable: availInput,
        userId,
      });
      toast.success('Calendar updated');
      await loadCalendar();
      setSelectedDay(day);
    } catch (err) {
      console.error('[host/calendar] save failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const changeMonth = (delta: number) => {
    setMonthDate((cur) => new Date(cur.getFullYear(), cur.getMonth() + delta, 1));
  };

  const fmtLong = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
  };

  const disabledBtn = 'opacity-50 cursor-not-allowed';

  return (
    <HostDashboardShell active="calendar">
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Calendar */}
        <div className="flex-1 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {MONTHS[month]} {year}
              </h2>
              <p className="text-sm text-gray-500">Availability and nightly rates.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Listing picker */}
              <ListingPicker
                listings={listings}
                selectedId={listingId}
                onSelect={setListingId}
                loading={loadingListings}
              />
              <button
                onClick={() => setShowICalModal(true)}
                disabled={icalLoading}
                title={icalStatus?.isActive ? 'Manage iCal feed' : 'Import iCal feed'}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-all',
                  icalLoading && 'opacity-50 cursor-not-allowed',
                )}
              >
                {icalLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {icalLoading ? 'Loading...' : icalStatus?.isActive ? 'Manage iCal' : 'Import iCal'}
              </button>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button className="p-2 bg-white shadow-sm rounded-md text-figma-navy" aria-label="Grid view">
                  <LayoutGrid className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center border border-gray-200 rounded-lg">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-50 transition-all" aria-label="Previous month">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-px h-8 bg-gray-200" />
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-50 transition-all" aria-label="Next month">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            {(['available', 'blocked', 'booked', 'none'] as DayStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cn('w-2.5 h-2.5 rounded-full', STATUS_META[s].dot)} />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
              {DOW.map((d) => (
                <div key={d} className="py-3 text-center text-sm font-medium text-gray-500">
                  {d}
                </div>
              ))}
            </div>

            {error ? (
              <div className="py-16 text-center">
                <p className="text-3xl mb-2">😕</p>
                <p className="text-sm text-gray-500 mb-4">Couldn&apos;t load the calendar.</p>
                <button
                  onClick={loadCalendar}
                  className="inline-flex items-center gap-2 bg-figma-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-figma-navy/90"
                >
                  <RotateCcw className="w-4 h-4" /> Try again
                </button>
              </div>
            ) : loading ? (
              <div className="grid grid-cols-7">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="aspect-square border-r border-b border-gray-100 p-3">
                    <div className="h-3 w-4 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-8 bg-gray-100 rounded animate-pulse mt-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {Array.from({ length: leading }).map((_, i) => (
                  <div key={`b${i}`} className="aspect-square bg-gray-50/50 border-r border-b border-gray-100" />
                ))}
                {days.map((d) => {
                  const meta = STATUS_META[d.status];
                  const isSel = selectedDay === d.dateStr;
                  return (
                    <button
                      key={d.dateStr}
                      onClick={() => setSelectedDay(d.dateStr)}
                      className={cn(
                        'aspect-square p-3 border-r border-b border-gray-100 flex flex-col text-left transition-colors relative',
                        meta.cell,
                        isSel && 'ring-2 ring-figma-navy ring-inset z-10',
                      )}
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{d.day}</span>
                        <span className={cn('w-2 h-2 rounded-full', meta.dot)} />
                      </span>
                      <span className={cn('mt-auto font-bold text-xs', meta.text)}>
                        {d.status === 'booked'
                          ? 'Booked'
                          : d.price != null && d.status !== 'blocked'
                            ? inr(d.price, d.currency)
                            : d.status === 'blocked'
                              ? 'Blocked'
                              : 'N/A'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Details panel */}
        <aside className="w-full xl:w-96 shrink-0">
          <div className="sticky top-24 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-6">Day Details</h3>

              {selected ? (
                <>
                  <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-3 mb-1">
                      <CalendarDays className="w-5 h-5 text-figma-navy" />
                      <span className="text-sm font-bold text-gray-800">{fmtLong(selected.dateStr)}</span>
                    </div>
                    <p className="text-xs text-gray-500 ml-8 flex items-center gap-1.5">
                      <span className={cn('w-2 h-2 rounded-full', STATUS_META[selected.status].dot)} />
                      {STATUS_META[selected.status].label}
                      {selected.guest ? ` · ${selected.guest}` : ''}
                    </p>
                  </div>

                  {selected.status === 'booked' ? (
                    // Booked days are read-only, can't re-price or block a reserved night.
                    <>
                      <div className="space-y-4 mb-6">
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                          <span className="text-sm text-gray-500">Nightly rate</span>
                          <span className="text-sm font-bold text-gray-800">
                            {selected.price != null ? inr(selected.price, selected.currency) : 'Not set'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                          <span className="text-sm text-gray-500">Status</span>
                          <span className="text-sm font-bold text-figma-navy flex items-center gap-1.5">
                            <BedDouble className="w-4 h-4" /> Booked
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 text-center">
                        Booked nights can&apos;t be edited.
                      </p>
                    </>
                  ) : (
                    <>
                      {/* Nightly rate (editable) */}
                      <div className="space-y-2 mb-5">
                        <label className="block text-sm text-gray-500">Nightly rate</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                          <input
                            type="number"
                            min={0}
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            placeholder="0"
                            className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none"
                          />
                        </div>
                      </div>

                      {/* Availability toggle */}
                      <div className="space-y-2 mb-6">
                        <label className="block text-sm text-gray-500">Availability</label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setAvailInput(true)}
                            className={cn(
                              'flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold transition-all',
                              availInput
                                ? 'border-green-600 bg-green-600 text-white shadow-md'
                                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
                            )}
                          >
                            <CheckCircle2 className="w-4 h-4" /> Open
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvailInput(false)}
                            className={cn(
                              'flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold transition-all',
                              !availInput
                                ? 'border-gray-700 bg-gray-700 text-white shadow-md'
                                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
                            )}
                          >
                            <Ban className="w-4 h-4" /> Block
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleSaveDay}
                        disabled={saving}
                        className="w-full py-4 bg-figma-navy text-white rounded-xl font-bold hover:bg-figma-navy/90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="py-10 text-center text-sm text-gray-400">
                  Select a date to see its rate and availability.
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-card">
              <div className="flex items-center gap-3 mb-4">
                <Info className="w-5 h-5 text-figma-navy" />
                <h4 className="font-bold text-gray-800">Tips for Hosts</h4>
              </div>
              <ul className="space-y-3 text-sm text-gray-500 list-disc pl-5">
                <li>Open more dates to increase your visibility in search.</li>
                <li>Weekend rates can be 15–20% higher than weekdays.</li>
                <li>Sync your iCal to avoid double bookings.</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>

      {/* iCal Sync Modal */}
      {showICalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {icalStatus?.isActive ? 'Update iCal Feed' : 'Import iCal Feed'}
            </h3>

            {icalStatus?.isActive && (
              <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-900">iCal Feed Active</p>
                    <p className="text-xs text-green-700 mt-1">Feed URL: {icalStatus.icalUrl}</p>
                    {icalStatus.lastUpdated && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last updated: {new Date(icalStatus.lastUpdated).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  iCal Feed URL
                  <span className="text-xs text-gray-500 ml-1">(from Airbnb, Google Calendar, Booking.com, etc.)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://calendar.example.com/ical/abc123.ics"
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  disabled={registering}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-figma-navy focus:border-transparent outline-none disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Paste your iCal (ICS) URL. We&apos;ll sync availability automatically every 15 minutes.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRegisterICAL}
                  disabled={registering || !icalUrl.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-figma-navy text-white font-semibold py-3 rounded-lg hover:bg-figma-navy/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {registering ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {registering ? 'Importing…' : 'Import Feed'}
                </button>

                {icalStatus?.isActive && (
                  <button
                    onClick={handleDeactivateICAL}
                    disabled={registering}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowICalModal(false)}
                disabled={registering}
                className="w-full py-2 text-gray-600 font-medium hover:text-gray-800 transition-colors disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </HostDashboardShell>
  );
}
