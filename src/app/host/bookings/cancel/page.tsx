'use client';

import { formatINR } from '@/lib/format';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle, Info, Loader2 } from 'lucide-react';
import HostDashboardShell from '../../_components/HostDashboardShell';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const REASONS = [
  { id: 'unavailable', title: 'Property unavailable', desc: 'Repairs, maintenance, or double booking.' },
  { id: 'emergency', title: 'Personal emergency', desc: 'Medical issues or unavoidable personal conflicts.' },
  { id: 'natural', title: 'Natural issue', desc: 'Weather conditions or local emergencies.' },
  { id: 'other', title: 'Other', desc: 'Something else not listed above.' },
];

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

function CancelInner() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const { userId } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<string | null>(null);
  const [booking, setBooking] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const reasonLabel = REASONS.find((r) => r.id === reason)?.title ?? 'N/A';
  const detailsHref = id ? `/host/bookings/details?id=${id}` : '/host/bookings';

  const load = useCallback(async () => {
    if (!id || !userId) return;
    try {
      setBooking(await api.bookingDetail(id, userId));
    } catch (err) {
      console.error('[cancel] load failed:', err);
    }
  }, [id, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleConfirm = async () => {
    if (!id || !userId) return;
    setCancelling(true);
    try {
      // Refund engine, not a plain status flip: a host cancellation refunds
      // the guest in full and reverses the host's Route transfer.
      const result = await api.cancelBookingWithRefund(id, userId, reasonLabel);
      toast.success(
        result?.refundStatus === 'processed'
          ? `Reservation cancelled. The guest will be refunded ${formatINR(Number(result.refundAmountRupees))} (5-7 banking days, depending on their bank).`
          : 'Reservation cancelled.',
      );
      router.push('/host/bookings');
    } catch (err) {
      console.error('[cancel] failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not cancel.');
    } finally {
      setCancelling(false);
    }
  };

  const prop = booking?.property ?? {};
  const guestName = booking?.guest?.name ?? 'Guest';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Link href={detailsHref} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-all text-figma-navy">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-sm text-gray-400">{id ? `Booking #${id}` : 'No booking selected'}</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Cancel this reservation</h2>
        <p className="text-sm text-gray-500 mt-2">
          We understand plans change. Let us know why you need to cancel.
        </p>
      </div>

      {!id ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card py-16 text-center">
          <p className="text-sm text-gray-500 mb-4">Open a reservation to cancel it.</p>
          <Link href="/host/bookings" className="text-figma-navy font-bold hover:underline">Back to bookings</Link>
        </div>
      ) : step === 1 ? (
        <section>
          <p className="text-sm font-medium text-gray-800 uppercase tracking-wider mb-4">
            Why do you want to cancel?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {REASONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setReason(r.id)}
                className={cn(
                  'text-left flex items-start p-5 border rounded-xl transition-all',
                  reason === r.id
                    ? 'border-figma-navy ring-1 ring-figma-navy bg-figma-navy/4'
                    : 'border-gray-200 hover:border-figma-navy/40 hover:bg-gray-50',
                )}
              >
                <span
                  className={cn(
                    'mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                    reason === r.id ? 'border-figma-navy' : 'border-gray-300',
                  )}
                >
                  {reason === r.id && <span className="w-2.5 h-2.5 rounded-full bg-figma-navy" />}
                </span>
                <div className="ml-4">
                  <span className="block text-sm font-bold text-gray-800">{r.title}</span>
                  <span className="block text-sm text-gray-500 mt-1">{r.desc}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-8 flex flex-col md:flex-row gap-4 items-center justify-between border-t border-gray-200 pt-8">
            <Link href={detailsHref} className="text-figma-navy font-bold hover:underline">Keep Booking</Link>
            <button
              disabled={!reason}
              onClick={() => setStep(2)}
              className={cn(
                'w-full md:w-auto px-10 py-4 rounded-xl font-bold text-white shadow-md transition-all',
                reason ? 'bg-figma-navy hover:bg-figma-navy/90' : 'bg-gray-300 cursor-not-allowed',
              )}
            >
              Review Details
            </button>
          </div>
        </section>
      ) : (
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-red-50 p-6 rounded-2xl flex gap-4 border border-red-100">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-red-700">Hosting Impact Notice</h4>
                  <p className="text-sm text-red-600/90 mt-1">
                    Cancelling a confirmed reservation notifies the guest and frees these dates.
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-card border border-gray-200">
                <h4 className="text-xs text-gray-500 uppercase mb-4">Reservation Summary</h4>
                <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                  <div className="w-16 h-16 rounded-lg bg-figma-navy/5 flex items-center justify-center shrink-0 text-figma-navy font-bold">
                    #{id}
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-gray-800">{prop.title ?? 'Property'}</h5>
                    <p className="text-sm text-gray-500">
                      {fmtDate(booking?.start_date)} – {fmtDate(booking?.end_date)}
                    </p>
                  </div>
                </div>
                <div className="pt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Guest</span>
                    <span className="font-bold text-gray-800">{guestName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-bold text-gray-800">
                      {formatINR(Number(booking?.amount ?? 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Reason for cancellation</span>
                    <span className="font-bold text-gray-800">{reasonLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white p-6 rounded-2xl space-y-4 border border-gray-200 shadow-card">
                <div className="flex items-center gap-3 text-figma-navy">
                  <Info className="w-5 h-5" />
                  <span className="text-sm font-bold">What happens next?</span>
                </div>
                <ul className="space-y-3 text-sm text-gray-500 leading-relaxed">
                  <li className="flex gap-2"><span className="text-figma-navy">•</span> The booking is marked cancelled.</li>
                  <li className="flex gap-2"><span className="text-figma-navy">•</span> These dates free up on your calendar.</li>
                </ul>
              </div>
              <div className="bg-gray-100 p-6 rounded-2xl">
                <p className="text-xs text-gray-500">
                  Need help?{' '}
                  <Link href="/support" className="text-figma-navy underline">Contact Host Support</Link>
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col md:flex-row-reverse gap-4 items-center border-t border-gray-200 pt-8">
            <button
              onClick={handleConfirm}
              disabled={cancelling}
              className="w-full md:w-auto bg-red-500 text-white px-10 py-4 rounded-xl font-bold shadow-md hover:bg-red-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {cancelling && <Loader2 className="w-5 h-5 animate-spin" />}
              {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
            <button onClick={() => setStep(1)} className="text-gray-600 font-bold hover:underline">
              Go Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default function CancelBookingPage() {
  return (
    <HostDashboardShell active="bookings">
      <Suspense fallback={<div className="h-64 bg-white rounded-2xl border border-gray-100 shadow-card animate-pulse" />}>
        <CancelInner />
      </Suspense>
    </HostDashboardShell>
  );
}
