'use client';

import { formatINR } from '@/lib/format';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  Printer,
  BadgeCheck,
  MessageSquare,
  Check,
  Hourglass,
  CalendarX,
  CalendarDays,
  Building2,
  ExternalLink,
  RotateCcw,
  MapPin,
} from 'lucide-react';
import HostDashboardShell from '../../_components/HostDashboardShell';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { calculateHostPayout } from '@/lib/billing/payout';

const FALLBACK_PROPERTY = '/placeholder.svg';

// Bookings are instant-confirmed on creation, booking_status only ever
// defines 2 (CONFIRMED) and 3 (CANCELLED), there is no pending/approval step.
const STATUS_LABEL: Record<number, string> = { 2: 'Confirmed', 3: 'Cancelled' };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const inr = (n: number) => formatINR(n);
const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : '');

function DetailsInner() {
  const params = useSearchParams();
  const id = params.get('id');
  const { userId } = useAuth();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'none' | 'load' | 'missing'>('none');

  const load = useCallback(async () => {
    if (!userId) return;
    if (!id) {
      setLoading(false);
      setError('missing');
      return;
    }
    setLoading(true);
    setError('none');
    try {
      const data = await api.bookingDetail(id, userId!);
      setBooking(data);
    } catch (err) {
      console.error('[host/bookings/details] load failed:', err);
      setError('load');
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const view = useMemo(() => {
    if (!booking) return null;
    const prop = booking.property ?? {};
    const guest = booking.guest ?? {};
    const start = booking.start_date ? new Date(booking.start_date) : null;
    const end = booking.end_date ? new Date(booking.end_date) : null;
    const nights =
      start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000)) : 1;
    const amount = Number(booking.amount ?? 0);
    // "Total payout" is the host's NET take (after Hostiggo's 5% commission,
    // 1% TCS, 1% TDS) -- distinct from `amount`, which is the guest-paid
    // grand total including GST and the Hostiggo service fee.
    const payoutAmount = calculateHostPayout({
      propertyPrice: Number(prop.price_weekday ?? 0),
    }).netHostPayoutRupees;
    const guests =
      Number(booking.nom_guests ?? (booking.num_adults ?? 0) + (booking.num_children ?? 0)) || 1;
    const media = Array.isArray(prop.listing_media) ? prop.listing_media : [];
    const cover =
      media.find((m: any) => m?.is_cover)?.media_url || media[0]?.media_url || FALLBACK_PROPERTY;
    const loc = prop.locations ?? {};
    const guestSince = guest.created_at ? new Date(guest.created_at).getFullYear() : null;
    const statusId = Number(booking.status_id);

    const today = startOfDay(new Date());
    const checkedIn = start ? startOfDay(start) <= today : false;
    const checkedOut = end ? startOfDay(end) < today : false;
    const cancelled = statusId === 3;
    const isPastBooking = !!end && startOfDay(end) < today;

    const timeline = [
      {
        label: 'Booked',
        date: booking.booked_at ? fmtDate(new Date(booking.booked_at)) : 'N/A',
        icon: Check,
        state: 'done' as const,
      },
      {
        label: 'Check-in',
        date: `${fmtDate(start)} ${fmtTime(prop.check_in_time)}`.trim(),
        icon: checkedIn ? Check : CalendarDays,
        state: checkedIn ? ('done' as const) : ('future' as const),
      },
      {
        label: checkedOut ? 'Stayed' : 'Staying',
        date: checkedIn && !checkedOut ? 'In progress' : '',
        icon: Hourglass,
        state: checkedOut ? ('done' as const) : checkedIn ? ('active' as const) : ('future' as const),
      },
      {
        label: 'Check-out',
        date: `${fmtDate(end)} ${fmtTime(prop.check_out_time)}`.trim(),
        icon: CalendarX,
        state: checkedOut ? ('done' as const) : ('future' as const),
      },
    ];

    return {
      id: String(booking.booking_id),
      guestName: guest.name?.trim() || 'Guest',
      guestFirst: (guest.name?.trim() || 'Guest').split(' ')[0],
      guestPhone: guest.phone || null,
      guestPic: guest.profile_pic_url || null,
      guestVerified: Boolean(guest.is_verified),
      guestSince,
      start,
      end,
      nights,
      guests,
      amount,
      payoutAmount,
      perNight: nights > 0 ? amount / nights : amount,
      title: prop.title?.trim() || 'Property',
      location: [loc.district, loc.state].filter(Boolean).join(', ') || 'Location pending',
      bedrooms: prop.num_bedrooms,
      beds: prop.num_beds,
      cover,
      statusLabel: STATUS_LABEL[statusId] || 'Booked',
      cancelled,
      isPastBooking,
      timeline,
    };
  }, [booking]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-1/3 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-64 bg-white rounded-2xl border border-gray-100 shadow-card animate-pulse" />
          <div className="lg:col-span-4 h-64 bg-white rounded-2xl border border-gray-100 shadow-card animate-pulse" />
        </div>
      </div>
    );
  }

  if (error !== 'none' || !view) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card py-16 text-center">
        <p className="text-4xl mb-3">{error === 'missing' ? '🔎' : '😕'}</p>
        <h3 className="text-lg font-bold text-gray-800 mb-1">
          {error === 'missing' ? 'No booking selected' : "Couldn't load this booking"}
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          {error === 'missing'
            ? 'Open a reservation from the bookings list to see its details.'
            : 'Please try again.'}
        </p>
        {error === 'missing' ? (
          <Link
            href="/host/bookings"
            className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90"
          >
            Back to bookings
          </Link>
        ) : (
          <button
            onClick={load}
            className="inline-flex items-center gap-2 bg-figma-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-figma-navy/90"
          >
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Link href="/host/bookings" className="hover:text-figma-navy">
              Reservations
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-600">Booking #{view.id}</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Booking Details</h1>
            <span
              className={cn(
                'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider',
                view.cancelled
                  ? 'bg-red-50 text-red-600'
                  : view.statusLabel === 'Confirmed'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-amber-50 text-amber-700',
              )}
            >
              {view.statusLabel}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all flex items-center gap-2"
          >
            <Printer className="w-5 h-5" /> Print
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left */}
        <div className="lg:col-span-8 space-y-6">
          {/* Guest overview */}
          <section className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="relative">
                <UserAvatar
                  src={view.guestPic}
                  name={view.guestName}
                  size={128}
                  className="rounded-3xl shadow ring-4 ring-gray-100"
                />
                {view.guestVerified && (
                  <div className="absolute -bottom-2 -right-2 bg-figma-navy text-white p-1.5 rounded-full border-4 border-white">
                    <BadgeCheck className="w-4 h-4" />
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{view.guestName}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      {view.guestSince && (
                        <span className="text-sm text-gray-400">Guest since {view.guestSince}</span>
                      )}
                    </div>
                  </div>
                  {view.guestVerified && (
                    <span className="px-3 py-1 bg-gray-100 text-figma-navy rounded-full text-xs font-bold uppercase tracking-wider">
                      ID Verified
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-6">
                  <Link
                    href="/host/chat"
                    className="flex items-center gap-2 px-5 py-2.5 bg-figma-navy text-white rounded-xl font-bold hover:bg-figma-navy/90"
                  >
                    <MessageSquare className="w-5 h-5" /> Contact Guest
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
            <h3 className="text-lg font-bold text-figma-navy mb-8">Booking Timeline</h3>
            <div className="relative flex flex-col md:flex-row justify-between gap-8">
              <div className="hidden md:block absolute top-4 left-0 w-full h-0.5 bg-gray-200 z-0" />
              {view.timeline.map((t) => {
                const Icon = t.icon;
                return (
                  <div
                    key={t.label}
                    className={cn(
                      'relative z-10 flex md:flex-col items-start md:items-center gap-4 md:gap-2 flex-1',
                      t.state === 'future' && 'opacity-40',
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shadow-md',
                        t.state === 'future' ? 'bg-gray-200 text-gray-500' : 'bg-figma-navy text-white',
                        t.state === 'active' && 'animate-pulse',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="md:text-center">
                      <p
                        className={cn(
                          'text-sm font-bold',
                          t.state === 'active' ? 'text-figma-navy' : 'text-gray-800',
                        )}
                      >
                        {t.label}
                      </p>
                      <p className="text-xs text-gray-400">{t.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Stay + property */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
              <div className="flex items-center gap-3 mb-6">
                <CalendarDays className="w-5 h-5 text-figma-navy" />
                <h3 className="text-base font-bold text-gray-800">Stay Details</h3>
              </div>
              <div className="space-y-1">
                {[
                  ['Duration', `${view.nights} ${view.nights === 1 ? 'Night' : 'Nights'}`],
                  ['Check-in', fmtDate(view.start)],
                  ['Check-out', fmtDate(view.end)],
                  ['Guests', `${view.guests} ${view.guests === 1 ? 'guest' : 'guests'}`],
                ].map(([k, v], i, arr) => (
                  <div
                    key={k}
                    className={cn(
                      'flex justify-between items-center py-2',
                      i < arr.length - 1 && 'border-b border-gray-100',
                    )}
                  >
                    <span className="text-sm text-gray-400">{k}</span>
                    <span className="text-sm font-bold text-gray-800">{v}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-2xl p-6 shadow-card border border-gray-200">
              <div className="flex items-center gap-3 mb-6">
                <Building2 className="w-5 h-5 text-figma-navy" />
                <h3 className="text-base font-bold text-gray-800">Property</h3>
              </div>
              <div className="flex gap-4 items-center mb-6">
                <Image
                  width={64}
                  height={64}
                  src={view.cover}
                  alt={view.title}
                  onError={(e) => {
                    if (e.currentTarget.src !== FALLBACK_PROPERTY) e.currentTarget.src = FALLBACK_PROPERTY;
                  }}
                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{view.title}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" /> {view.location}
                  </p>
                  {(view.bedrooms || view.beds) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[view.bedrooms && `${view.bedrooms} BR`, view.beds && `${view.beds} beds`]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  )}
                </div>
              </div>
              <Link
                href="/host/listings/manage"
                className="bg-gray-50 p-4 rounded-xl flex items-center justify-between hover:bg-gray-100 transition-colors"
              >
                <span className="text-xs font-bold text-figma-navy">MANAGE LISTING</span>
                <ExternalLink className="w-4 h-4 text-figma-navy" />
              </Link>
            </section>
          </div>
        </div>

        {!view.isPastBooking && !view.cancelled && (
          <aside className="lg:col-span-4">
            <div className="sticky top-24 bg-white rounded-2xl p-6 shadow-card border border-gray-200">
              <h3 className="text-lg font-bold text-figma-navy mb-6">Payment Summary</h3>
              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    {inr(view.perNight)} × {view.nights} {view.nights === 1 ? 'night' : 'nights'}
                  </span>
                  <span className="font-medium text-gray-800">{inr(view.amount)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-gray-200 mb-6">
                <span className="font-bold text-gray-800">Total payout</span>
                <span className="text-xl font-bold text-figma-navy">{inr(view.payoutAmount)}</span>
              </div>
              {!view.cancelled && (
                <Link
                  href={`/host/bookings/cancel?id=${view.id}`}
                  className="block w-full text-center py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-all"
                >
                  Cancel Booking
                </Link>
              )}
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

export default function BookingDetailsPage() {
  return (
    <HostDashboardShell active="bookings">
      <Suspense
        fallback={
          <div className="h-64 bg-white rounded-2xl border border-gray-100 shadow-card animate-pulse" />
        }
      >
        <DetailsInner />
      </Suspense>
    </HostDashboardShell>
  );
}
