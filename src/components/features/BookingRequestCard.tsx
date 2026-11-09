'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, IndianRupee, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { formatTimeLeft, requestDeadline, requestPhase } from '@/lib/billing/bookingRequest';

type Detail = {
  booking_id: number;
  status_id: number | null;
  razorpay_payment_id: string | null;
  booked_at: string | null;
  start_date: string;
  end_date: string;
  amount: number | string | null;
  nom_guests: number | null;
  num_adults: number | null;
  num_children: number | null;
  property?: { title?: string | null } | null;
  guest?: { name?: string | null } | null;
};

const fmt = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Inline accept / decline for a paid booking request, shown under the host's
 * "New booking request" notification with everything needed to decide. Reads
 * the live booking so a request answered elsewhere (or expired) shows its
 * outcome instead of stale buttons.
 */
export default function BookingRequestCard({ bookingId, userId }: { bookingId: number; userId: string }) {
  const [booking, setBooking] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setBooking(await api.bookingDetail(String(bookingId), userId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [bookingId, userId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const respond = async (decision: 'accept' | 'reject') => {
    setBusy(decision);
    try {
      await api.respondToBookingRequest(bookingId, decision);
      toast.success(
        decision === 'accept'
          ? 'Request accepted. The booking is confirmed and the guest has been notified.'
          : 'Request declined. The guest has been refunded in full.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the request.');
    } finally {
      setBusy(null);
      await load();
    }
  };

  if (failed) return null;
  if (!booking) return <Loader2 className="mt-3 h-4 w-4 animate-spin text-gray-400" />;

  const phase = requestPhase(booking);
  const deadline = requestDeadline(booking);
  const left = deadline != null ? deadline - now : null;
  const expired = left != null && left <= 0;
  const guests = Number(booking.nom_guests ?? (booking.num_adults ?? 0) + (booking.num_children ?? 0)) || 1;

  if (!phase) {
    const text =
      booking.status_id === 2
        ? 'Accepted — this booking is confirmed.'
        : 'This request was declined or expired. The guest was refunded in full.';
    return <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">{text}</p>;
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <p className="truncate text-sm font-semibold text-gray-900">{booking.property?.title ?? 'Your property'}</p>
      <p className="text-xs text-gray-500">
        {booking.guest?.name ?? 'A guest'} · Request #{booking.booking_id}
      </p>
      <div className="mt-3 space-y-1.5 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0" />
          {fmt(booking.start_date)} → {fmt(booking.end_date)}
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0" />
          {guests} {guests === 1 ? 'guest' : 'guests'}
        </div>
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <IndianRupee className="h-4 w-4 shrink-0 text-gray-500" />
          {formatINR(Number(booking.amount ?? 0))} paid
        </div>
        <div className="flex items-center gap-2 text-amber-800">
          <Clock className="h-4 w-4 shrink-0" />
          {expired ? 'Expiring — the guest will be refunded' : `${formatTimeLeft(left ?? 0)} left to respond`}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy !== null || expired}
          onClick={() => respond('accept')}
          className="flex-1 rounded-xl bg-figma-navy py-2.5 text-sm font-semibold text-white hover:bg-figma-navy/90 disabled:opacity-60"
        >
          {busy === 'accept' ? 'Accepting…' : 'Accept'}
        </button>
        <button
          type="button"
          disabled={busy !== null || expired}
          onClick={() => respond('reject')}
          className="flex-1 rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {busy === 'reject' ? 'Declining…' : 'Decline'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">Declining, or not answering, refunds the guest in full.</p>
    </div>
  );
}
