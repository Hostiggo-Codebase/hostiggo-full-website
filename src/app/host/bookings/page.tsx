'use client';

import { formatINR } from '@/lib/format';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Users,
  MapPin,
  IndianRupee,
  RotateCcw,
} from 'lucide-react';
import HostDashboardShell, { DashboardHeading } from '../_components/HostDashboardShell';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Booking = {
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  guests: number;
  amount: number;
  bucket: 'today' | 'upcoming' | 'past';
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const mapBooking = (row: any): Booking => {
  const start = row.start_date ? new Date(row.start_date) : null;
  const end = row.end_date ? new Date(row.end_date) : null;
  const today = startOfDay(new Date());
  let bucket: Booking['bucket'] = 'upcoming';
  if (start && end) {
    if (startOfDay(end) < today) bucket = 'past';
    else if (startOfDay(start) <= today && startOfDay(end) >= today) bucket = 'today';
    else bucket = 'upcoming';
  } else if (!start) {
    bucket = 'upcoming';
  }
  return {
    id: String(row.booking_id),
    title: row.property?.title?.trim() || 'Booked stay',
    start,
    end,
    guests: Number(row.nom_guests ?? (row.num_adults ?? 0) + (row.num_children ?? 0)) || 1,
    amount: Number(row.amount ?? 0),
    bucket,
  };
};

const fmtRange = (a: Date | null, b: Date | null) => {
  const f = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (a && b) return `${f(a)} → ${f(b)}`;
  if (a) return f(a);
  return 'Dates pending';
};

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
] as const;

export default function BookingsPage() {
  const { userId } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Booking['bucket']>('upcoming');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const rows = await api.hostBookings(userId);
      setBookings(rows.map(mapBooking));
    } catch (err) {
      console.error('[host/bookings] load failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      today: bookings.filter((b) => b.bucket === 'today').length,
      upcoming: bookings.filter((b) => b.bucket === 'upcoming').length,
      past: bookings.filter((b) => b.bucket === 'past').length,
    }),
    [bookings],
  );

  const visible = bookings
    .filter((b) => b.bucket === tab)
    .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));

  return (
    <HostDashboardShell active="bookings">
      <DashboardHeading
        title="Bookings"
        subtitle="Manage your property reservations and guest communication."
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-8 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-shrink-0 px-6 py-4 text-sm border-b-2 -mb-px transition-all',
              tab === t.key
                ? 'font-bold text-figma-navy border-figma-navy'
                : 'font-medium text-gray-500 border-transparent hover:text-figma-navy',
            )}
          >
            {t.label}
            {!loading && (
              <span className="ml-1.5 text-xs text-gray-400">({counts[t.key]})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-card">
              <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2 mb-4" />
              <div className="space-y-3">
                <div className="h-3 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-card py-16 text-center">
          <p className="text-4xl mb-3">😕</p>
          <h3 className="text-lg font-bold text-gray-800 mb-1">Couldn&apos;t load bookings</h3>
          <p className="text-sm text-gray-500 mb-6">Please try again.</p>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90"
          >
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="h-20 w-20 bg-gray-100 flex items-center justify-center rounded-full mb-4 text-gray-300">
            <CalendarDays className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">
            No {tab} reservations
          </h3>
          <p className="text-sm text-gray-500">
            {tab === 'upcoming'
              ? 'New bookings will show up here.'
              : `Nothing in ${tab} right now.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visible.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-2xl p-5 border border-gray-100 shadow-card hover:shadow-card-hover transition-all flex flex-col h-full"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-figma-navy/5 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-figma-navy" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-gray-800 truncate">{b.title}</h4>
                  <p className="text-xs text-gray-400">Booking #{b.id}</p>
                </div>
              </div>
              <div className="space-y-3 mb-6 flex-grow">
                <div className="flex items-center gap-3 text-gray-500">
                  <CalendarDays className="w-5 h-5 shrink-0" />
                  <span className="text-sm">{fmtRange(b.start, b.end)}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-500">
                  <Users className="w-5 h-5 shrink-0" />
                  <span className="text-sm">
                    {b.guests} {b.guests === 1 ? 'guest' : 'guests'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-gray-700 font-semibold">
                  <IndianRupee className="w-5 h-5 shrink-0 text-gray-500" />
                  <span className="text-sm">{formatINR(b.amount)}</span>
                </div>
              </div>
              <Link
                href={`/host/bookings/details?id=${b.id}`}
                className="w-full py-2.5 bg-figma-navy text-white font-bold rounded-xl text-sm text-center transition-all hover:bg-figma-navy/90 active:scale-[0.98]"
              >
                View Details
              </Link>
            </div>
          ))}
        </div>
      )}
    </HostDashboardShell>
  );
}
