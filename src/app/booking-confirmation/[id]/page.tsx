'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MessageCircle,
  Moon,
  Navigation,
  Phone,
  Receipt,
  Share2,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import BackButton from '@/components/ui/back-button';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { reconstructInvoice, splitBookingAddons } from '@/lib/billing/reconstructInvoice';
import {
  cancellationTimeline,
  checkInMoment,
  POLICY_LABELS,
  REFUND_SCOPE_NOTE,
  type PolicyName,
} from '@/lib/billing/policyTimeline';
import { downloadBookingReceipt, type ReceiptLine } from '@/lib/bookingReceipt';
import { formatINR, formatStayDate, formatTime12h, plural, REFUND_ARRIVAL_NOTE } from '@/lib/format';
import { todayInIndia } from '@/lib/booking-config';

const STATUS_PENDING = 1;
const STATUS_CONFIRMED = 2;
const STATUS_CANCELLED = 3;

type InvoiceLineItem = { label: string; amountPaise: number; gstRate: number; gstAmountPaise: number };

type BookingDetail = {
  booking_id: number;
  status_id: number | null;
  start_date: string;
  end_date: string;
  nom_guests: number | null;
  num_adults: number | null;
  num_children: number | null;
  amount: number | null;
  amount_paise: number | null;
  invoice: { lineItems?: InvoiceLineItem[]; grandTotalPaise?: number } | null;
  invoice_number: string | null;
  razorpay_payment_id: string | null;
  paid_at: string | null;
  booked_at: string | null;
  host_uuid: string | null;
  user_id: string | null;
  refund_status: string | null;
  refund_amount: number | null;
  cancelled_at: string | null;
  addons: { name: string; price: number; type: string | null }[];
  guest: { name: string | null } | null;
  host: {
    userId: string;
    name: string;
    photo: string | null;
    about: string | null;
    isVerified: boolean;
    joinedAt: string | null;
    phone: string | null;
  } | null;
  houseRules: {
    smoking_allowed: boolean | null;
    pets_allowed: boolean | null;
    parties_allowed: boolean | null;
    quiet_hours: boolean | null;
  } | null;
  property: {
    listing_id: number;
    title: string;
    price_weekday: number | null;
    price_weekend: number | null;
    num_bedrooms: number | null;
    num_beds: number | null;
    num_bathrooms: number | null;
    num_guests: number | null;
    check_in_time: string | null;
    check_out_time: string | null;
    address_line1: string | null;
    address_line2: string | null;
    landmark: string | null;
    latitude: number | null;
    longitude: number | null;
    cancellation_policy: string | null;
    strict_partial_refund_percent: number | null;
    locations: { state: string | null; district: string | null } | null;
    listing_media: { media_url: string; is_cover: boolean }[] | null;
    listing_amenities: { amenities: { name: string } | null }[] | null;
  } | null;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; booking: BookingDetail };

const card =
  'w-full max-w-[1076px] mx-auto rounded-[28px] sm:rounded-[36px] bg-white border border-[#E6E6E6] p-6 sm:p-9 mb-6';
const cardTitle = 'text-[20px] sm:text-[22px] font-semibold text-[#1A1A1A] mb-5';

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export default function BookingConfirmationPage() {
  const params = useParams<{ id: string }>();
  const { userId, loading: authLoading } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const bookingId = params?.id ?? '';

  const load = useCallback(async () => {
    if (!/^\d+$/.test(bookingId)) {
      setState({ kind: 'not-found' });
      return;
    }
    if (!userId) {
      setState({ kind: 'signed-out' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const data = await api.bookingDetail(bookingId, userId);
      setState(data ? { kind: 'ready', booking: data } : { kind: 'not-found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/not found|permission/i.test(message)) setState({ kind: 'not-found' });
      else setState({ kind: 'error', message: message || "We couldn't load this booking." });
    }
  }, [bookingId, userId]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  return (
    <div className="min-h-screen bg-[#FBF9F4] flex flex-col font-['Poppins']">
      <Navbar />
      <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 pt-6 sm:pt-8 pb-16">
        {state.kind === 'loading' || authLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading booking">
            <Loader2 className="w-8 h-8 animate-spin text-[#004772]" />
          </div>
        ) : state.kind === 'signed-out' ? (
          <StatePanel
            icon={<Receipt className="w-7 h-7 text-[#004772]" />}
            title="Sign in to see your booking"
            body="Booking details are only visible to the guest who made the booking and their host."
            action={{
              label: 'Sign in',
              href: `/signin?redirect=${encodeURIComponent(`/booking-confirmation/${bookingId}`)}`,
            }}
          />
        ) : state.kind === 'not-found' ? (
          <StatePanel
            icon={<XCircle className="w-7 h-7 text-[#BC0024]" />}
            title="Booking not found"
            body="This booking doesn't exist, or it belongs to a different account. Your bookings are always listed under My Trips."
            action={{ label: 'Go to My Trips', href: '/my-memories' }}
          />
        ) : state.kind === 'error' ? (
          <StatePanel
            icon={<AlertTriangle className="w-7 h-7 text-amber-500" />}
            title="We couldn't load this booking"
            body="Please check your connection and try again. If you just paid, your booking is safe -- it can take a minute to appear."
            action={{ label: 'Try again', onClick: load }}
          />
        ) : (
          <BookingView booking={state.booking} viewerId={userId} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function StatePanel({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: { label: string; href?: string; onClick?: () => void };
}) {
  const cls =
    'inline-flex h-11 items-center justify-center rounded-full bg-[#004772] px-7 text-[14px] font-semibold text-white hover:bg-[#003a5c] transition-colors';
  return (
    <div className="mx-auto mt-10 max-w-[520px] rounded-[28px] border border-[#E6E6E6] bg-white p-8 sm:p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F6F8]">{icon}</div>
      <h1 className="text-[22px] font-semibold text-[#1A1A1A]">{title}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#1A1A1A]/65">{body}</p>
      <div className="mt-6">
        {action.href ? (
          <Link href={action.href} className={cls}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={cls}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function BookingView({ booking, viewerId }: { booking: BookingDetail; viewerId: string | null }) {
  const router = useRouter();
  const property = booking.property;
  const status = booking.status_id ?? STATUS_PENDING;
  const isGuest = booking.user_id === viewerId;
  const isUpcoming = booking.start_date >= todayInIndia();
  const reference = booking.invoice_number || `HG-${booking.booking_id}`;

  const photos = useMemo(() => {
    const media = property?.listing_media ?? [];
    const cover = media.find((m) => m.is_cover)?.media_url;
    return [...new Set([cover, ...media.map((m) => m.media_url)].filter(Boolean) as string[])].slice(0, 3);
  }, [property?.listing_media]);

  const location = [property?.locations?.district, property?.locations?.state]
    .filter(Boolean)
    .map((s) => titleCase(String(s)))
    .join(', ');

  // The exact street address is only for confirmed guests.
  const fullAddress =
    status === STATUS_CONFIRMED
      ? [property?.address_line1, property?.address_line2, property?.landmark, location].filter(Boolean).join(', ')
      : null;
  const mapsUrl =
    status === STATUS_CONFIRMED && property?.latitude != null && property?.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${property.latitude},${property.longitude}`
      : null;

  const adults = booking.num_adults ?? booking.nom_guests ?? 1;
  const children = booking.num_children ?? 0;
  const guestsLabel = [plural(adults, 'adult'), children > 0 ? plural(children, 'child', 'children') : null]
    .filter(Boolean)
    .join(', ');

  // Payment breakdown: the invoice frozen at payment time when present,
  // otherwise rebuilt with the same pricing rules the booking was charged by.
  const { lines, nights, total } = useMemo(() => {
    const nightDates = reconstructInvoice(
      booking.start_date,
      booking.end_date,
      Number(property?.price_weekday ?? 0),
      Number(property?.price_weekend ?? property?.price_weekday ?? 0),
      splitBookingAddons(booking.addons),
    );
    const n = Math.max(1, nightDates.nights.length);
    const stored = booking.invoice?.lineItems;
    const items: InvoiceLineItem[] = stored?.length ? stored : nightDates.invoice.lineItems;
    const out: ReceiptLine[] = [];
    let gst = 0;
    for (const item of items) {
      const label =
        item.label === 'Property Price'
          ? `Stay (${plural(n, 'night')})`
          : item.label === 'Hostiggo Service Fee'
            ? 'Hostiggo service fee'
            : item.label;
      out.push({ label, amount: item.amountPaise / 100 });
      gst += item.gstAmountPaise;
    }
    if (gst > 0) out.push({ label: 'GST', amount: gst / 100 });
    const paid =
      booking.amount_paise != null
        ? Number(booking.amount_paise) / 100
        : booking.amount != null
          ? Number(booking.amount)
          : (booking.invoice?.grandTotalPaise ?? nightDates.invoice.grandTotalPaise) / 100;
    return { lines: out, nights: n, total: paid };
  }, [booking, property?.price_weekday, property?.price_weekend]);

  const policy = (property?.cancellation_policy ?? 'moderate') as PolicyName;
  const timeline = useMemo(
    () =>
      cancellationTimeline(
        policy,
        checkInMoment(booking.start_date, property?.check_in_time),
        property?.strict_partial_refund_percent,
      ),
    [policy, booking.start_date, property?.check_in_time, property?.strict_partial_refund_percent],
  );
  const now = Date.now();

  const amenities = (property?.listing_amenities ?? [])
    .map((a) => a.amenities?.name)
    .filter(Boolean) as string[];

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: property?.title ?? 'My Hostiggo stay', url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const handleReceipt = async () => {
    try {
      await downloadBookingReceipt({
        reference,
        bookingId: booking.booking_id,
        status: status === STATUS_CONFIRMED ? 'Confirmed' : status === STATUS_CANCELLED ? 'Cancelled' : 'Pending payment',
        paidAt: booking.paid_at,
        paymentId: booking.razorpay_payment_id,
        guestName: booking.guest?.name,
        propertyTitle: property?.title ?? 'Hostiggo stay',
        propertyLocation: location,
        checkIn: booking.start_date,
        checkOut: booking.end_date,
        nights,
        guests: guestsLabel,
        lines,
        total,
        refund: booking.refund_amount ? { amount: Number(booking.refund_amount), status: booking.refund_status } : null,
      });
    } catch {
      toast.error("Couldn't generate the receipt. Please try again.");
    }
  };

  const handleAddToCalendar = () => {
    const toICS = (iso: string, time: string | null | undefined, fallback: string) => {
      const t = /^\d{1,2}:\d{2}/.test(time ?? '') ? time!.slice(0, 5).padStart(5, '0') : fallback;
      const d = new Date(`${iso}T${t}:00+05:30`);
      return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };
    const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hostiggo//Booking//EN',
      'BEGIN:VEVENT',
      `UID:booking-${booking.booking_id}@hostiggo.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART:${toICS(booking.start_date, property?.check_in_time, '14:00')}`,
      `DTEND:${toICS(booking.end_date, property?.check_out_time, '11:00')}`,
      `SUMMARY:${esc(`Stay at ${property?.title ?? 'Hostiggo'}`)}`,
      `LOCATION:${esc(fullAddress || location)}`,
      `DESCRIPTION:${esc(`Booking ${reference}\n${window.location.href}`)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `hostiggo-${reference}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBanner =
    status === STATUS_CONFIRMED ? (
      <div className="flex items-start gap-3 rounded-2xl border border-[#13B766]/40 bg-[#13B766]/[0.07] px-4 py-3.5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#13B766]" />
        <div>
          <p className="text-[15px] font-semibold text-[#0E7A45]">Your booking is confirmed</p>
          <p className="text-[13px] text-[#1A1A1A]/65">
            Reference <span className="font-semibold text-[#1A1A1A]">{reference}</span>
            {booking.paid_at &&
              ` · Paid ${new Date(booking.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        </div>
      </div>
    ) : status === STATUS_CANCELLED ? (
      <div className="flex items-start gap-3 rounded-2xl border border-[#BC0024]/30 bg-[#BC0024]/[0.05] px-4 py-3.5">
        <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#BC0024]" />
        <div>
          <p className="text-[15px] font-semibold text-[#BC0024]">This booking was cancelled</p>
          <p className="text-[13px] text-[#1A1A1A]/65">
            {booking.refund_amount && Number(booking.refund_amount) > 0
              ? `Refund of ${formatINR(booking.refund_amount)} ${
                  booking.refund_status === 'processed' ? 'has been processed' : 'is on its way'
                } to your original payment method. ${REFUND_ARRIVAL_NOTE}`
              : 'No refund was due under the cancellation policy.'}
          </p>
          {booking.refund_status === 'failed' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.retryRefund(booking.booking_id);
                  toast.success('Refund initiated.');
                  window.location.reload();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Couldn't retry the refund.");
                }
              }}
              className="mt-2 text-[13px] font-semibold text-[#BC0024] underline"
            >
              Retry refund
            </button>
          )}
        </div>
      </div>
    ) : (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-400/50 bg-amber-50 px-4 py-3.5">
        <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div>
          <p className="text-[15px] font-semibold text-amber-800">Waiting for payment confirmation</p>
          <p className="text-[13px] text-[#1A1A1A]/65">
            If you&apos;ve already paid, please don&apos;t pay again -- this updates automatically within a few minutes.
          </p>
        </div>
      </div>
    );

  return (
    <>
      <div className="w-full max-w-[1076px] mx-auto mb-5 flex items-center justify-between gap-4">
        <BackButton className="w-11 h-11" onClick={() => router.push('/my-memories')} />
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share booking"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-white text-black/70 hover:bg-gray-50"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {/* Summary */}
      <section className={card}>
        <div className="mb-5">{statusBanner}</div>
        <h1 className="text-[22px] sm:text-[28px] font-semibold leading-tight text-[#1A1A1A]">
          {property?.title ?? 'Your stay'}
        </h1>
        {location && (
          <p className="mt-1 flex items-center gap-1.5 text-[15px] text-[#1A1A1A]/65">
            <MapPin className="h-4 w-4" />
            {location}
          </p>
        )}

        {photos.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="relative h-[220px] overflow-hidden rounded-[22px] sm:col-span-7 sm:h-[340px]">
              <Image fill src={photos[0]} alt={property?.title ?? 'Property photo'} className="object-cover" sizes="(max-width: 640px) 100vw, 620px" priority />
            </div>
            {photos.length > 1 && (
              <div className="hidden gap-3 sm:col-span-5 sm:flex sm:h-[340px] sm:flex-col">
                {photos.slice(1).map((src, i) => (
                  <div key={src} className="relative flex-1 overflow-hidden rounded-[22px]">
                    <Image fill src={src} alt={`Property photo ${i + 2}`} className="object-cover" sizes="420px" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleReceipt}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#C0C0C0] bg-white px-5 text-[14px] font-semibold text-[#004772] hover:bg-gray-50"
          >
            <Receipt className="h-4 w-4" /> Download receipt
          </button>
          {status === STATUS_CONFIRMED && isUpcoming && (
            <button
              type="button"
              onClick={handleAddToCalendar}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#C0C0C0] bg-white px-5 text-[14px] font-semibold text-[#004772] hover:bg-gray-50"
            >
              <CalendarPlus className="h-4 w-4" /> Add to calendar
            </button>
          )}
          {property?.listing_id && (
            <Link
              href={`/property/${property.listing_id}`}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#C0C0C0] bg-white px-5 text-[14px] font-semibold text-[#004772] hover:bg-gray-50"
            >
              View listing <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </section>

      {/* Stay */}
      <section className={card}>
        <h2 className={cardTitle}>Your stay</h2>
        <div className="flex flex-wrap items-center gap-6 sm:gap-12">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-[#1A1A1A]/50">Check-in</p>
            <p className="mt-1 text-[16px] font-semibold text-[#1A1A1A]">{formatStayDate(booking.start_date)}</p>
            <p className="text-[14px] text-[#1A1A1A]/65">
              {formatTime12h(property?.check_in_time) ? `From ${formatTime12h(property?.check_in_time)}` : 'Time shared by host'}
            </p>
          </div>
          <ArrowRight className="hidden h-5 w-5 text-[#1A1A1A]/40 sm:block" />
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-[#1A1A1A]/50">Check-out</p>
            <p className="mt-1 text-[16px] font-semibold text-[#1A1A1A]">{formatStayDate(booking.end_date)}</p>
            <p className="text-[14px] text-[#1A1A1A]/65">
              {formatTime12h(property?.check_out_time) ? `By ${formatTime12h(property?.check_out_time)}` : 'Time shared by host'}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-[#1A1A1A]/75">
          <span className="flex items-center gap-2"><Moon className="h-4 w-4" />{plural(nights, 'night')}</span>
          <span className="flex items-center gap-2"><Users className="h-4 w-4" />{guestsLabel}</span>
          {booking.guest?.name && <span>Booked by {booking.guest.name}</span>}
        </div>

        {fullAddress && (
          <div className="mt-6 rounded-2xl bg-[#F6F7F8] p-4">
            <p className="text-[13px] font-medium uppercase tracking-wide text-[#1A1A1A]/50">Address</p>
            <p className="mt-1 text-[15px] text-[#1A1A1A]">{fullAddress}</p>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#004772] hover:underline"
              >
                <Navigation className="h-4 w-4" /> Get directions
              </a>
            )}
          </div>
        )}

        {isGuest && status === STATUS_CONFIRMED && isUpcoming && (
          <Link
            href={`/my-memories?manage=${booking.booking_id}`}
            className="mt-6 inline-flex h-10 items-center rounded-full border border-[#004772] px-5 text-[14px] font-medium text-[#004772] hover:bg-[#004772]/5"
          >
            Change dates, guests or cancel
          </Link>
        )}
      </section>

      {/* The place */}
      <section className={card}>
        <h2 className={cardTitle}>The place</h2>
        <ul className="flex flex-wrap gap-x-8 gap-y-2 text-[15px] text-[#1A1A1A]/85">
          {property?.num_bedrooms != null && <li>{plural(property.num_bedrooms, 'bedroom')}</li>}
          {property?.num_beds != null && <li>{plural(property.num_beds, 'bed')}</li>}
          {property?.num_bathrooms != null && <li>{plural(property.num_bathrooms, 'bathroom')}</li>}
          {property?.num_guests != null && <li>Up to {plural(property.num_guests, 'guest')}</li>}
        </ul>
        {amenities.length > 0 && (
          <>
            <h3 className="mt-6 mb-3 text-[15px] font-semibold text-[#1A1A1A]">Amenities</h3>
            <ul className="grid grid-cols-1 gap-2 text-[14px] text-[#1A1A1A]/80 min-[420px]:grid-cols-2 sm:grid-cols-3">
              {amenities.slice(0, 15).map((name) => (
                <li key={name} className="flex items-center gap-2">
                  <Check className="h-4 w-4 flex-shrink-0 text-[#13B766]" />
                  {name}
                </li>
              ))}
            </ul>
          </>
        )}
        <h3 className="mt-6 mb-3 text-[15px] font-semibold text-[#1A1A1A]">House rules</h3>
        <ul className="grid grid-cols-1 gap-2 text-[14px] text-[#1A1A1A]/80 sm:grid-cols-2">
          <RuleItem ok={!!booking.houseRules?.smoking_allowed} yes="Smoking allowed" no="No smoking" />
          <RuleItem ok={!!booking.houseRules?.pets_allowed} yes="Pets allowed" no="No pets" />
          <RuleItem ok={!!booking.houseRules?.parties_allowed} yes="Events allowed" no="No parties or events" />
          {booking.houseRules?.quiet_hours && <RuleItem ok={false} yes="" no="Quiet hours apply" />}
          <li className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 flex-shrink-0 text-[#1A1A1A]/60" />
            Carry a valid government photo ID for check-in
          </li>
        </ul>
      </section>

      {/* Payment */}
      <section className={card}>
        <h2 className={cardTitle}>Payment</h2>
        <dl className="max-w-[560px] space-y-3 text-[15px] text-[#1A1A1A]/80">
          {lines.map((line) => (
            <div key={line.label} className="flex items-center justify-between gap-4">
              <dt>{line.label}</dt>
              <dd className="font-medium text-[#1A1A1A]">{formatINR(line.amount)}</dd>
            </div>
          ))}
          {booking.addons.length > 0 && (
            <div className="pt-1 text-[13px] text-[#1A1A1A]/60">
              Add-ons: {booking.addons.map((a) => `${a.name} (${formatINR(a.price)})`).join(', ')}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between rounded-2xl border border-black/15 px-5 py-4">
            <dt className="text-[16px] font-bold text-[#1A1A1A]">
              {status === STATUS_PENDING ? 'Total' : 'Total paid'}
            </dt>
            <dd className="text-[18px] font-bold text-[#1A1A1A]">{formatINR(total)}</dd>
          </div>
          {status === STATUS_CANCELLED && booking.refund_amount != null && Number(booking.refund_amount) > 0 && (
            <div className="flex items-center justify-between gap-4 text-[#0E7A45]">
              <dt>Refund{booking.refund_status ? ` (${booking.refund_status})` : ''}</dt>
              <dd className="font-semibold">-{formatINR(booking.refund_amount)}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Cancellation */}
      {status !== STATUS_CANCELLED && (
        <section className={card}>
          <h2 className={cardTitle}>Cancellation policy · {POLICY_LABELS[policy] ?? 'Moderate'}</h2>
          <ul className="space-y-3 text-[15px] text-[#1A1A1A]/85">
            {timeline.map((step) => {
              const passed = step.until != null && step.until.getTime() < now;
              const Icon = step.tone === 'good' ? Check : step.tone === 'partial' ? AlertTriangle : XCircle;
              const color =
                step.tone === 'good' ? 'text-[#13B766]' : step.tone === 'partial' ? 'text-amber-500' : 'text-[#BC0024]';
              return (
                <li key={step.label} className={`flex items-start gap-3 ${passed ? 'opacity-45 line-through' : ''}`}>
                  <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${color}`} />
                  <span>{step.label}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[13px] text-[#1A1A1A]/55">
            {REFUND_SCOPE_NOTE} Times are in IST. If the host cancels, you get a full refund.
          </p>
        </section>
      )}

      {/* Host */}
      {booking.host && (
        <section className={card}>
          <h2 className={cardTitle}>Your host</h2>
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="flex items-center gap-4 md:w-[300px] md:flex-shrink-0">
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-[#E8EEF2]">
                {booking.host.photo ? (
                  // Host photos can live on any provider (Google, storage) -- plain img.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={booking.host.photo} alt={booking.host.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[22px] font-semibold text-[#004772]">
                    {booking.host.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-[17px] font-semibold text-[#1A1A1A]">
                  {booking.host.name}
                  {booking.host.isVerified && <BadgeCheck className="h-4 w-4 flex-shrink-0 text-[#0396EF]" aria-label="Verified host" />}
                </p>
                {booking.host.joinedAt && (
                  <p className="text-[13px] text-[#1A1A1A]/55">
                    Hosting since {new Date(booking.host.joinedAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex-1">
              {booking.host.about && (
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-[#1A1A1A]/80">{booking.host.about}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                {isGuest && booking.host_uuid && (
                  <Link
                    href={`/chat?hostId=${encodeURIComponent(booking.host_uuid)}`}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[#004772] px-5 text-[14px] font-semibold text-white hover:bg-[#003a5c]"
                  >
                    <MessageCircle className="h-4 w-4" /> Message host
                  </Link>
                )}
                {booking.host.phone && (
                  <a
                    href={`tel:${booking.host.phone}`}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[#C0C0C0] bg-white px-5 text-[14px] font-semibold text-[#004772] hover:bg-gray-50"
                  >
                    <Phone className="h-4 w-4" /> {booking.host.phone}
                  </a>
                )}
              </div>
              {isGuest && status !== STATUS_CONFIRMED && (
                <p className="mt-3 text-[13px] text-[#1A1A1A]/55">
                  The host&apos;s phone number is shared here once your booking is confirmed.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="mt-10 text-center">
        <Link
          href={`/report-issue?booking=${booking.booking_id}`}
          className="text-[15px] font-semibold text-[#1A1A1A] underline hover:opacity-80"
        >
          Report an issue with this booking
        </Link>
        <p className="mt-1 text-[13px] text-[#1A1A1A]/55">Our support team usually replies within a few hours.</p>
      </div>
    </>
  );
}

function RuleItem({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <Check className="h-4 w-4 flex-shrink-0 text-[#13B766]" />
      ) : (
        <XCircle className="h-4 w-4 flex-shrink-0 text-[#1A1A1A]/45" />
      )}
      {ok ? yes : no}
    </li>
  );
}
