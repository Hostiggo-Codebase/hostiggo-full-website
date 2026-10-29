'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Clock, IndianRupee, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatINR } from '@/lib/format';
import { formatTimeLeft } from '@/lib/billing/bookingRequest';

export type BookingRequestSummary = {
  id: string;
  title: string;
  guestName?: string | null;
  dates: string;
  guests: number;
  amount: number;
  /** Epoch ms the host has to respond by. */
  deadline: number | null;
};

/**
 * Host's accept / decline prompt for a booking request. Airbnb-style: the host
 * has 24 hours; if they do nothing the request is declined automatically and
 * the guest is never charged. Closing without choosing leaves it pending.
 */
export default function BookingRequestModal({
  request,
  busy,
  onAccept,
  onDecline,
  onClose,
}: {
  request: BookingRequestSummary | null;
  busy: 'accept' | 'reject' | null;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!request) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [request]);

  const left = request?.deadline != null ? request.deadline - now : null;
  const expired = left != null && left <= 0;

  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-w-[440px] rounded-3xl p-7 bg-white"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-figma-navy/5 text-figma-navy flex items-center justify-center mb-2">
            <Clock className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-gray-900">Reservation request</DialogTitle>
          <DialogDescription className="text-sm text-gray-500 leading-relaxed">
            {expired
              ? 'The 24 hours to respond have passed, so this request is being declined.'
              : `You have 24 hours to accept or decline${left != null ? ` — ${formatTimeLeft(left)} left` : ''}. If you don't respond, the request is declined automatically and the guest isn't charged.`}
          </DialogDescription>
        </DialogHeader>

        {request && (
          <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{request.title}</p>
              <p className="text-xs text-gray-400">
                {request.guestName ? `${request.guestName} · ` : ''}Request #{request.id}
              </p>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <CalendarDays className="w-4 h-4 shrink-0" />
              <span className="text-sm">{request.dates}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Users className="w-4 h-4 shrink-0" />
              <span className="text-sm">
                {request.guests} {request.guests === 1 ? 'guest' : 'guests'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-gray-800 font-semibold">
              <IndianRupee className="w-4 h-4 shrink-0 text-gray-500" />
              <span className="text-sm">{formatINR(request.amount)}</span>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500">
          If you accept, the guest has 2 hours to pay and the dates are held for them. You&apos;re paid after
          the stay, as usual.
        </p>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={Boolean(busy) || expired}
            onClick={onAccept}
            className="w-full py-3 bg-figma-navy text-white text-sm font-semibold rounded-xl hover:bg-figma-navy/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept request'}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || expired}
            onClick={onDecline}
            className="w-full py-3 text-sm font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy === 'reject' ? 'Declining…' : 'Decline'}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            Decide later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
