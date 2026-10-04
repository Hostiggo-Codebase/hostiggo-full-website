'use client';

import { formatINR, REFUND_ARRIVAL_NOTE } from '@/lib/format';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import BackButton from '@/components/ui/back-button';
import { useAuth } from '@/context/AuthContext';
import { api, mapBooking } from '@/lib/api';
import { calculateBookingInvoice } from '@/lib/billing/invoice';
import { cn } from '@/lib/utils';
import {
  AlarmClock,
  ArrowRight,
  BedDouble,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  MapPin,
  Minus,
  Plus,
  Receipt,
  Star,
  User,
  Users,
  X,
  XCircle
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
const memoriesIllustration = '/memories-illustration.png';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = 'upcoming' | 'completed' | 'cancelled';

interface GuestCounts {
  adults: number;
  children: number;
  rooms: number;
  pets: boolean;
}

interface Booking {
  id: string;
  listingId?: string | number;
  title: string;
  image: string;
  location: string;
  distanceText: string;
  checkIn: Date;
  checkOut: Date;
  status: TabKey;
  coordinates: { lat: number; lng: number } | null;
  guests: GuestCounts;
  // The actual amount charged for this booking (as stored at the time it
  // was made) plus the listing's current per-night rates -- together these
  // let the price-breakdown dropdown reconstruct the same itemized GST/fee
  // lines shown at checkout (see calculateBookingInvoice), instead of only
  // ever showing that breakdown once, live, and never again.
  amount: number | null;
  // Set once a cancellation has gone through the refund engine.
  refundAmount?: number | null;
  refundStatus?: string | null;
  priceWeekday: number | null;
  priceWeekend: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────────────────────

const today = new Date();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const fmtShort = (d: Date) =>
  d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

const fmtFigmaDate = (d: Date) => {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${day} ${month}`;
};

const fmtHeaderDate = (d: Date) => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  return `${day} ${month}`;
};

const fmtMonthYear = (d: Date) =>
  d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

const SAMPLE_BOOKINGS: Booking[] = [
  {
    id: 'sample-upcoming-1',
    title: 'The Great Rooms Of Triply Home Services',
    image: '/images/empty-states/sample-bedroom.jpg',
    location: 'Hawa Mahal',
    distanceText: '0.5 km from Hawa Mahal',
    checkIn: new Date(today.getTime() + 2 * 86400000),
    checkOut: new Date(today.getTime() + 4 * 86400000),
    status: 'upcoming',
    coordinates: { lat: 26.9239, lng: 75.8267 },
    guests: { adults: 2, children: 0, rooms: 1, pets: false },
    amount: 14500,
    priceWeekday: 7250,
    priceWeekend: 7250,
  },
  {
    id: 'sample-completed-1',
    title: 'The Great Rooms Of Triply Home Services',
    image: '/images/empty-states/sample-bedroom.jpg',
    location: 'Shimla',
    distanceText: '0.5 km from Hawa Mahal',
    checkIn: new Date(2026, 5, 3),
    checkOut: new Date(2026, 5, 5),
    status: 'completed',
    coordinates: { lat: 31.1048, lng: 77.1734 },
    guests: { adults: 2, children: 0, rooms: 1, pets: false },
    amount: 12000,
    priceWeekday: 6000,
    priceWeekend: 6000,
  },
  {
    id: 'sample-completed-2',
    title: 'The Great Rooms Of Triply Home Services',
    image: '/images/empty-states/sample-bedroom.jpg',
    location: 'Darjiling',
    distanceText: '0.5 km from Hawa Mahal',
    checkIn: new Date(2026, 5, 30),
    checkOut: new Date(2026, 6, 2),
    status: 'completed',
    coordinates: { lat: 27.041, lng: 88.2663 },
    guests: { adults: 2, children: 0, rooms: 1, pets: false },
    amount: 12000,
    priceWeekday: 6000,
    priceWeekend: 6000,
  },
  {
    id: 'sample-cancelled-1',
    title: 'The Great Rooms Of Triply Home Services',
    image: '/images/empty-states/sample-bedroom.jpg',
    location: 'Shimla',
    distanceText: '0.5 km from Hawa Mahal',
    checkIn: new Date(2026, 5, 3),
    checkOut: new Date(2026, 5, 5),
    status: 'cancelled',
    coordinates: { lat: 31.1048, lng: 77.1734 },
    guests: { adults: 2, children: 0, rooms: 1, pets: false },
    amount: 12000,
    priceWeekday: 6000,
    priceWeekend: 6000,
  },
];

function getDaysLeft(checkIn: Date): number {
  return Math.ceil((checkIn.getTime() - today.getTime()) / 86400000);
}

function getNights(checkIn: Date, checkOut: Date): number {
  return Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);
}

// Mirrors the weekend-aware subtotal calc used at checkout
// (src/app/property/[id]/page.tsx) and server-side in createBooking() --
// Fri/Sat nights bill at priceWeekend, everything else at priceWeekday --
// so a booking's price-breakdown dropdown always matches what was actually
// charged instead of assuming every night was priced the same.
function computeBookingInvoice(booking: Booking) {
  if (booking.priceWeekday == null) return null;
  const priceWeekend = booking.priceWeekend ?? booking.priceWeekday;
  const nights = getNights(booking.checkIn, booking.checkOut);
  let subtotal = 0;
  let weekdayNights = 0;
  let weekendNights = 0;
  const cur = new Date(booking.checkIn);
  for (let i = 0; i < nights; i++) {
    const dow = cur.getDay();
    const isWeekend = dow === 5 || dow === 6;
    subtotal += isWeekend ? priceWeekend : booking.priceWeekday;
    if (isWeekend) weekendNights++; else weekdayNights++;
    cur.setDate(cur.getDate() + 1);
  }
  // Which GST slab applies is decided by the check-in night's own rate,
  // not the summed multi-night total -- see gstRateBasisPrice.
  const checkInDow = booking.checkIn.getDay();
  const gstRateBasisPrice = checkInDow === 5 || checkInDow === 6 ? priceWeekend : booking.priceWeekday;
  const invoice = calculateBookingInvoice({ basePropertyPrice: subtotal, gstRateBasisPrice });
  return { invoice, nights, weekdayNights, weekendNights, priceWeekend };
}

function PriceBreakdown({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const computed = computeBookingInvoice(booking);
  if (!computed) return null;
  const { invoice, weekdayNights, weekendNights, priceWeekend } = computed;

  return (
    <div className="rounded-2xl border border-gray-100 mb-5 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-[13px] font-bold text-gray-800">
          <Receipt className="w-3.5 h-3.5 text-gray-400" />
          Price breakdown
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-gray-800">
            {formatINR((booking.amount ?? invoice.grandTotalRupees))}
          </span>
          <ChevronDown
            className={cn('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')}
          />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 text-[12px] bg-gray-50/50">
          <div className="flex justify-between text-gray-600 pt-1">
            <span>
              {weekendNights === 0 || weekdayNights === 0 ? (
                <>
                  {formatINR((weekendNights > 0 ? priceWeekend : booking.priceWeekday!))} × {weekdayNights + weekendNights} night{weekdayNights + weekendNights > 1 ? 's' : ''}
                </>
              ) : (
                <>
                  {formatINR(booking.priceWeekday!)} × {weekdayNights} night{weekdayNights > 1 ? 's' : ''} + {formatINR(priceWeekend)} × {weekendNights} night{weekendNights > 1 ? 's' : ''}
                </>
              )}
            </span>
            <span className="font-semibold">{formatINR((invoice.propertyPricePaise / 100))}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>GST on property ({(invoice.propertyGstRate * 100).toFixed(0)}%)</span>
            <span className="font-semibold">{formatINR((invoice.gstOnPropertyPaise / 100))}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Hostiggo service fee ({(invoice.hostiggoServiceFeeRate * 100).toFixed(0)}%)</span>
            <span className="font-semibold">{formatINR((invoice.hostiggoServiceFeePaise / 100))}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>GST on service fee (18%)</span>
            <span className="font-semibold">{formatINR((invoice.gstOnHostiggoServiceFeePaise / 100))}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
            <span>Total</span>
            <span>{formatINR((booking.amount ?? invoice.grandTotalRupees))}</span>
          </div>
          {booking.amount != null && (
            <p className="text-[10px] text-gray-400 pt-1">
              Recomputed from the listing&apos;s current per-night rates against the actual charged total -- the total above is the exact amount charged at booking.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function guestLabel(g: GuestCounts): string {
  const parts = [
    `${g.adults} Adult${g.adults !== 1 ? 's' : ''}`,
    `${g.rooms} Room${g.rooms !== 1 ? 's' : ''}`,
  ];
  if (g.children > 0)
    parts.push(`${g.children} Child${g.children !== 1 ? 'ren' : ''}`);
  return parts.join(' · ');
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBetween(d: Date, start: Date, end: Date) {
  return d > start && d < end;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Picker
// ─────────────────────────────────────────────────────────────────────────────

interface CalendarPickerProps {
  checkIn: Date | null;
  checkOut: Date | null;
  onChange: (ci: Date | null, co: Date | null) => void;
  onDone: () => void;
}

function CalendarPicker({
  checkIn,
  checkOut,
  onChange,
  onDone,
}: CalendarPickerProps) {
  const [hovered, setHovered] = useState<Date | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const m1 = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const m2 = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1);

  const buildCalendar = (firstOfMonth: Date) => {
    const year = firstOfMonth.getFullYear();
    const month = firstOfMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  };

  const handleDayClick = (d: Date) => {
    if (!checkIn || (checkIn && checkOut)) {
      onChange(d, null);
    } else {
      if (d < checkIn) {
        onChange(d, null);
      } else if (isSameDay(d, checkIn)) {
        onChange(null, null);
      } else {
        onChange(checkIn, d);
      }
    }
  };

  const getDayStyle = (d: Date | null): string => {
    if (!d) return '';
    const base =
      'w-9 h-9 flex items-center justify-center text-[13px] font-medium rounded-full cursor-pointer select-none transition-all duration-150 relative z-10';
    const isPast = d < today && !isSameDay(d, today);

    if (isPast)
      return cn(base, 'text-gray-300 cursor-not-allowed pointer-events-none');
    if (checkIn && isSameDay(d, checkIn))
      return cn(base, 'bg-[#004772] text-white font-bold');
    if (checkOut && isSameDay(d, checkOut))
      return cn(base, 'bg-[#004772] text-white font-bold');
    if (isSameDay(d, today))
      return cn(base, 'text-[#004772] font-bold hover:bg-figma-navy/5');

    const rangeEnd = checkOut ?? hovered;
    if (
      checkIn &&
      rangeEnd &&
      isBetween(
        d,
        checkIn < rangeEnd ? checkIn : rangeEnd,
        checkIn < rangeEnd ? rangeEnd : checkIn,
      )
    ) {
      return cn(base, 'bg-figma-navy/5 text-[#004772] rounded-none');
    }
    return cn(base, 'text-gray-700 hover:bg-gray-100');
  };

  const getRangeWrap = (d: Date | null): string => {
    if (!d) return '';
    const rangeEnd = checkOut ?? hovered;
    if (!checkIn || !rangeEnd) return '';
    const lo = checkIn < rangeEnd ? checkIn : rangeEnd;
    const hi = checkIn < rangeEnd ? rangeEnd : checkIn;
    if (isSameDay(d, lo)) return 'bg-figma-navy/5 rounded-l-full';
    if (isSameDay(d, hi)) return 'bg-figma-navy/5 rounded-r-full';
    if (isBetween(d, lo, hi)) return 'bg-figma-navy/5';
    return '';
  };

  const renderMonth = (firstOfMonth: Date) => {
    const cells = buildCalendar(firstOfMonth);
    const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    return (
      <div className="flex-1">
        <p className="text-[15px] font-bold text-gray-900 text-center mb-4">
          {fmtMonthYear(firstOfMonth)}
        </p>
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map((d) => (
            <div
              key={d}
              className="text-[11px] font-bold text-gray-400 text-center py-1"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => (
            <div key={i} className={cn('relative', d ? getRangeWrap(d) : '')}>
              <div
                className={getDayStyle(d)}
                onClick={() =>
                  d && !(d < today && !isSameDay(d, today)) && handleDayClick(d)
                }
                onMouseEnter={() => checkIn && !checkOut && d && setHovered(d)}
                onMouseLeave={() => setHovered(null)}
              >
                {d?.getDate()}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-modal-in">
      {/* Check-in / Check-out summary */}
      <div className="flex gap-3 mb-6">
        <div
          className={cn(
            'flex-1 border-2 rounded-2xl px-4 py-3 transition-all duration-200',
            !checkIn
              ? 'border-[#004772] bg-figma-navy/5'
              : 'border-gray-200 bg-white',
          )}
        >
          <p className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-1">
            Check In
          </p>
          <p
            className={cn(
              'text-[15px] font-bold',
              checkIn ? 'text-gray-900' : 'text-gray-300',
            )}
          >
            {checkIn ? fmtShort(checkIn) : 'N/A'}
          </p>
        </div>
        <div
          className={cn(
            'flex-1 border-2 rounded-2xl px-4 py-3 transition-all duration-200',
            checkIn && !checkOut
              ? 'border-[#004772] bg-figma-navy/5'
              : 'border-gray-200 bg-white',
          )}
        >
          <p className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-1">
            Check Out
          </p>
          <p
            className={cn(
              'text-[15px] font-bold',
              checkOut ? 'text-gray-900' : 'text-gray-300',
            )}
          >
            {checkOut ? fmtShort(checkOut) : 'N/A'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => setMonthOffset((o) => o + 1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Dual months */}
      <div className="flex gap-6 mb-6">
        {renderMonth(m1)}
        <div className="w-px bg-gray-100 flex-shrink-0 hidden sm:block" />
        <div className="flex-1 hidden sm:block">{renderMonth(m2)}</div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <button
          onClick={() => onChange(null, null)}
          className="text-[13px] font-semibold text-gray-500 underline hover:text-gray-700 transition-colors"
        >
          Clear dates
        </button>
        <button
          onClick={onDone}
          disabled={!checkIn || !checkOut}
          className="bg-[#004772] text-white text-[14px] font-bold px-8 py-2.5 rounded-2xl hover:bg-[#003a5c] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest Selector
// ─────────────────────────────────────────────────────────────────────────────

interface GuestSelectorProps {
  guests: GuestCounts;
  onChange: (g: GuestCounts) => void;
}

function GuestSelector({ guests, onChange }: GuestSelectorProps) {
  const [open, setOpen] = useState(false);

  const counter = (
    label: string,
    sub: string,
    val: number,
    icon: React.ReactNode,
    min: number,
    key: keyof Omit<GuestCounts, 'pets'>,
  ) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-figma-navy/5 rounded-full flex items-center justify-center text-[#004772]">
          {icon}
        </div>
        <div>
          <p className="text-[14px] font-semibold text-gray-900">{label}</p>
          <p className="text-[12px] text-gray-400">{sub}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            onChange({
              ...guests,
              [key]: Math.max(min, (guests[key] as number) - 1),
            })
          }
          disabled={(guests[key] as number) <= min}
          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center text-gray-500 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-5 text-center text-[15px] font-bold text-gray-900">
          {guests[key]}
        </span>
        <button
          onClick={() =>
            onChange({ ...guests, [key]: (guests[key] as number) + 1 })
          }
          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center text-gray-500 hover:border-gray-500 transition-all"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center gap-3 border-2 rounded-2xl px-4 py-3 transition-all duration-200 text-left',
          open
            ? 'border-[#004772] bg-figma-navy/5'
            : 'border-gray-200 hover:border-gray-300',
        )}
      >
        <Users className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="flex-1 text-[13.5px] font-semibold text-gray-700">
          {guestLabel(guests)}
        </span>
        <ChevronRight
          className={cn(
            'w-4 h-4 text-gray-400 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="mt-2 bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden animate-modal-in">
          <div className="px-5 pt-2 pb-1">
            {counter(
              'Adults',
              'Age 13 or above',
              guests.adults,
              <Users className="w-4 h-4" />,
              1,
              'adults',
            )}
            {counter(
              'Children',
              'Ages 2–12',
              guests.children,
              <span className="text-[16px]">👶</span>,
              0,
              'children',
            )}
            {counter(
              'Room',
              '1 or more',
              guests.rooms,
              <BedDouble className="w-4 h-4" />,
              1,
              'rooms',
            )}
          </div>

          {/* Pets toggle */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-50 rounded-full flex items-center justify-center">
                <span className="text-[16px]">🐾</span>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">
                  Pets with you?
                </p>
                <p className="text-[12px] text-gray-400">
                  Service animals allowed
                </p>
              </div>
            </div>
            <button
              onClick={() => onChange({ ...guests, pets: !guests.pets })}
              className={cn(
                'relative w-11 h-6 rounded-full transition-all duration-300',
                guests.pets ? 'bg-[#004772]' : 'bg-gray-200',
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300',
                  guests.pets ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          <div className="px-5 pb-5">
            <button
              onClick={() => setOpen(false)}
              className="w-full bg-[#004772] text-white text-[14px] font-bold py-3 rounded-2xl hover:bg-[#003a5c] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manage Booking Modal
// ─────────────────────────────────────────────────────────────────────────────

type ModalView = 'overview' | 'modify' | 'cancel';

interface RefundPreview {
  policy: 'flexible' | 'moderate' | 'strict';
  grandTotalRupees: number;
  refundAmountRupees: number;
  refundPercent: number;
  reason: string;
}

function ManageBookingModal({
  booking,
  userId,
  onClose,
  onUpdate,
}: {
  booking: Booking;
  userId: string;
  onClose: () => void;
  onUpdate: (b: Partial<Booking>) => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<ModalView>('overview');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tempCheckIn, setTempCheckIn] = useState<Date | null>(booking.checkIn);
  const [tempCheckOut, setTempCheckOut] = useState<Date | null>(
    booking.checkOut,
  );
  const [tempGuests, setTempGuests] = useState<GuestCounts>({
    ...booking.guests,
  });
  const [saving, setSaving] = useState(false);
  const [refundPreview, setRefundPreview] = useState<RefundPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const nights =
    tempCheckIn && tempCheckOut ? getNights(tempCheckIn, tempCheckOut) : 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleSave = async () => {
    const nextCheckIn = tempCheckIn ?? booking.checkIn;
    const nextCheckOut = tempCheckOut ?? booking.checkOut;
    setSaving(true);
    try {
      await Promise.all([
        api.updateBookingDates(booking.id, nextCheckIn, nextCheckOut, userId),
        api.updateBookingGuests(
          booking.id,
          {
            adults: tempGuests.adults,
            children: tempGuests.children,
            pets: tempGuests.pets ? 1 : 0,
          },
          userId,
        ),
      ]);
      onUpdate({
        checkIn: nextCheckIn,
        checkOut: nextCheckOut,
        guests: tempGuests,
      });
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update booking',
      );
    } finally {
      setSaving(false);
    }
  };

  const openCancelConfirm = async () => {
    setView('cancel');
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const preview = await api.getRefundPreview(booking.id, userId);
      setRefundPreview(preview);
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : 'Could not calculate your refund.',
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCancel = async () => {
    setSaving(true);
    try {
      await api.cancelBookingWithRefund(booking.id, userId, 'Cancelled by guest');
      onUpdate({ status: 'cancelled' });
      onClose();
      toast.success(
        refundPreview && refundPreview.refundAmountRupees > 0
          ? `Booking cancelled. ${formatINR(refundPreview.refundAmountRupees)} will be refunded. ${REFUND_ARRIVAL_NOTE}`
          : 'Booking cancelled.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to cancel booking',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative bg-white w-full sm:max-w-[560px] sm:mx-4 sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          maxHeight: '92dvh',
          animation: 'modalSlide 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        {/* ── Header ── */}
        <div className="relative flex-shrink-0 h-[130px]">
          <Image
            fill
            src={booking.image}
            alt={booking.title}
            sizes="(max-width: 560px) 100vw, 560px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors"
          >
            <X className="w-4 h-4 text-gray-700" strokeWidth={2.5} />
          </button>

          {/* Tab toggle */}
          {booking.status === 'upcoming' && (
            <div className="absolute bottom-3 left-4 flex gap-2">
              <button
                onClick={() => setView('overview')}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all',
                  view === 'overview'
                    ? 'bg-white text-gray-900'
                    : 'bg-white/30 text-white hover:bg-white/50',
                )}
              >
                Overview
              </button>
              <button
                onClick={() => setView('modify')}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all flex items-center gap-1.5',
                  view === 'modify'
                    ? 'bg-white text-gray-900'
                    : 'bg-white/30 text-white hover:bg-white/50',
                )}
              >
                <Edit3 className="w-3 h-3" />
                Modify
              </button>
            </div>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* ── Overview ── */}
          {view === 'overview' && (
            <div className="p-5">
              <h3 className="text-[15px] font-bold text-gray-900 mb-0.5 leading-snug">
                {booking.title}
              </h3>
              <div className="flex items-center gap-1.5 text-[12px] text-gray-400 mb-4">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {booking.location}
              </div>

              {/* Dates */}
              <div className="flex gap-3 bg-gray-50 rounded-2xl p-4 mb-5">
                <div className="flex-1 text-center">
                  <p className="text-[10px] font-black text-gray-400 tracking-wider uppercase mb-1">
                    Check-In
                  </p>
                  <p className="text-[13px] font-bold text-gray-800">
                    {fmtShort(booking.checkIn)}
                  </p>
                </div>
                <div className="text-gray-200 self-center font-bold text-lg">
                  →
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[10px] font-black text-gray-400 tracking-wider uppercase mb-1">
                    Check-Out
                  </p>
                  <p className="text-[13px] font-bold text-gray-800">
                    {fmtShort(booking.checkOut)}
                  </p>
                </div>
              </div>

              <PriceBreakdown booking={booking} />

              {/* Actions */}
              <div className="flex flex-col gap-2.5">
                {booking.status === 'upcoming' && (
                  <>
                    <button
                      onClick={() => setView('modify')}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[13px] font-semibold bg-[#004772] text-white hover:bg-[#003a5c] transition-all active:scale-[0.98]"
                    >
                      <span>Modify Booking</span>
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        onClose();
                        router.push(`/property/${booking.id}`);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[13px] font-semibold bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-all"
                    >
                      <span>View Property</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={openCancelConfirm}
                      disabled={saving}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[13px] font-semibold bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 transition-all"
                    >
                      <span>Cancel Booking</span>
                      <XCircle className="w-4 h-4" />
                    </button>
                  </>
                )}
                {booking.status === 'completed' && (
                  <>
                    <button
                      onClick={() => {
                        onClose();
                        router.push(`/property/${booking.id}`);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[13px] font-semibold bg-[#004772] text-white hover:bg-[#003a5c] transition-all"
                    >
                      <span>Book Again</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        onClose();
                        router.push(`/property/${booking.id}#write-review`);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[13px] font-semibold bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-all"
                    >
                      <span>Write a Review</span>
                      <Star className="w-4 h-4" />
                    </button>
                  </>
                )}
                {booking.status === 'cancelled' && (
                  <button
                    onClick={() => {
                      onClose();
                      router.push(`/property/${booking.id}`);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-[13px] font-semibold bg-[#004772] text-white hover:bg-[#003a5c] transition-all"
                  >
                    <span>Book Again</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Modify ── */}
          {view === 'modify' && (
            <div className="p-5 space-y-6">
              {/* Dates */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[14px] font-bold text-gray-900">Dates</p>
                  <button
                    onClick={() => setCalendarOpen((o) => !o)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-[#004772] hover:underline"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {calendarOpen ? 'Close' : 'Change dates'}
                  </button>
                </div>

                {!calendarOpen ? (
                  <button
                    onClick={() => setCalendarOpen(true)}
                    className="w-full flex items-center gap-3 border-2 border-gray-200 rounded-2xl px-4 py-3 hover:border-gray-300 transition-all text-left"
                  >
                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-[13.5px] font-semibold text-gray-700">
                        {tempCheckIn && tempCheckOut
                          ? `${fmtShort(tempCheckIn)} → ${fmtShort(tempCheckOut)} · ${nights} night${nights !== 1 ? 's' : ''}`
                          : 'Select dates'}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                ) : (
                  <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
                    <CalendarPicker
                      checkIn={tempCheckIn}
                      checkOut={tempCheckOut}
                      onChange={(ci, co) => {
                        setTempCheckIn(ci);
                        setTempCheckOut(co);
                      }}
                      onDone={() => setCalendarOpen(false)}
                    />
                  </div>
                )}
              </div>

              {/* Guests */}
              <div>
                <p className="text-[14px] font-bold text-gray-900 mb-3">
                  Guests
                </p>
                <GuestSelector guests={tempGuests} onChange={setTempGuests} />
              </div>

              {/* Summary */}
              {nights > 0 && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
                  <p className="text-[13px] font-bold text-gray-900">
                    Updated Summary
                  </p>
                  <div className="flex justify-between text-[13px] text-gray-600">
                    <span>
                      {nights} night{nights !== 1 ? 's' : ''} ·{' '}
                      {guestLabel(tempGuests)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Cancel confirm ── */}
          {view === 'cancel' && (
            <div className="p-5 space-y-4">
              <h3 className="text-[15px] font-bold text-gray-900">
                Cancel this booking?
              </h3>

              {previewLoading && (
                <div className="text-[13px] text-gray-500 py-6 text-center">
                  Calculating your refund...
                </div>
              )}

              {previewError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-[13px] text-red-600">
                  {previewError}
                </div>
              )}

              {refundPreview && (
                <>
                  {refundPreview.refundPercent < 1 && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3">
                      <AlarmClock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[13.5px] font-bold text-amber-800">
                          {refundPreview.refundPercent === 0
                            ? 'No refund for this cancellation'
                            : `Only ${Math.round(refundPreview.refundPercent * 100)}% will be refunded`}
                        </p>
                        <p className="text-[12px] text-amber-700 mt-1 leading-snug">
                          {refundPreview.reason}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <div className="flex justify-between text-[13px] text-gray-600">
                      <span>Total paid</span>
                      <span>{formatINR(refundPreview.grandTotalRupees)}</span>
                    </div>
                    <div className="flex justify-between text-[15px] font-bold text-gray-900 pt-1 border-t border-gray-200">
                      <span>You&apos;ll be refunded</span>
                      <span className={refundPreview.refundAmountRupees > 0 ? 'text-green-600' : 'text-red-500'}>
                        {formatINR(refundPreview.refundAmountRupees)}
                      </span>
                    </div>
                  </div>

                  {refundPreview.refundPercent === 1 && (
                    <p className="text-[12px] text-gray-500">{refundPreview.reason}</p>
                  )}
                  {refundPreview.refundAmountRupees > 0 && (
                    <p className="text-[12px] text-gray-500">{REFUND_ARRIVAL_NOTE}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {view === 'modify' && (
          <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-[#004772] text-white text-[14px] font-bold py-3.5 rounded-2xl hover:bg-[#003a5c] active:scale-[0.99] transition-all shadow-sm"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
        {view === 'cancel' && (
          <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white flex gap-2.5">
            <button
              onClick={() => setView('overview')}
              disabled={saving}
              className="flex-1 bg-gray-50 text-gray-700 border border-gray-200 text-[14px] font-bold py-3.5 rounded-2xl hover:bg-gray-100 transition-all"
            >
              Keep Booking
            </button>
            <button
              onClick={handleCancel}
              disabled={saving || previewLoading || !refundPreview}
              className="flex-1 bg-red-500 text-white text-[14px] font-bold py-3.5 rounded-2xl hover:bg-red-600 active:scale-[0.99] transition-all shadow-sm disabled:opacity-50"
            >
              {saving ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Card
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="bg-white rounded-[20px] overflow-hidden border border-gray-100 animate-pulse"
      style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}
    >
      <div className="flex flex-col sm:flex-row">
        <div className="w-full sm:w-[240px] h-[200px] sm:h-auto bg-gray-200 flex-shrink-0" />
        <div className="flex-1 p-6 flex flex-col gap-3">
          <div className="h-5 bg-gray-200 rounded-lg w-3/4" />
          <div className="h-3.5 bg-gray-100 rounded-lg w-1/2" />
          <div className="flex gap-2 mt-2">
            <div className="h-8 bg-gray-100 rounded-full w-28" />
            <div className="h-8 w-8 bg-gray-100 rounded-full" />
          </div>
          <div className="h-10 bg-gray-100 rounded-xl w-36 mt-auto" />
        </div>
        <div className="hidden sm:flex flex-col items-center justify-center gap-4 px-8 py-6 bg-gray-50 min-w-[190px]">
          <div className="h-12 w-24 bg-gray-200 rounded-lg" />
          <div className="h-12 w-24 bg-gray-200 rounded-lg" />
          <div className="h-6 w-20 bg-gray-300 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Booking Card
// ─────────────────────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  onManage,
  initialShowAddons = false,
}: {
  booking: Booking;
  onManage: () => void;
  initialShowAddons?: boolean;
}) {
  const router = useRouter();
  const [imgErr, setImgErr] = useState(false);
  const [showAddons, setShowAddons] = useState(initialShowAddons);
  const [breakfastQty, setBreakfastQty] = useState(1);
  const [breakfastSelected, setBreakfastSelected] = useState(true);
  const [car1Added, setCar1Added] = useState(false);
  const [car2Added, setCar2Added] = useState(false);

  useEffect(() => {
    setShowAddons(initialShowAddons);
  }, [initialShowAddons]);

  const FALLBACK = '/placeholder.svg';

  const daysLeft = getDaysLeft(booking.checkIn);

  const handleLocation = () => {
    if (booking.coordinates) {
      window.open(
        `https://www.google.com/maps?q=${booking.coordinates.lat},${booking.coordinates.lng}`,
        '_blank',
      );
    } else {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.location || booking.title)}`,
        '_blank',
      );
    }
  };

  const handleReceipt = () => {
    toast.success('Downloading booking receipt...');
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const headerDate = booking.id === 'sample-completed-2' ? '31 June' : fmtHeaderDate(booking.checkIn);
  const checkInDisplay = booking.id === 'sample-upcoming-1' ? 'wed, 25 Dec' : fmtFigmaDate(booking.checkIn);
  const checkOutDisplay = booking.id === 'sample-upcoming-1' ? 'Fri, 27 Dec' : fmtFigmaDate(booking.checkOut);

  return (
    <div className="w-full flex flex-col">
      {/* Header for Completed & Cancelled */}
      {(booking.status === 'completed' || booking.status === 'cancelled') && (
        <div className="text-[20px] sm:text-[22px] font-bold text-[#1A1A1A] mb-3.5 pl-2 font-['Poppins'] select-none">
          {headerDate} , {booking.location || 'Stay'}
        </div>
      )}

      {/* Main Card Container */}
      <div
        className={cn(
          "w-full bg-white transition-all duration-300",
          showAddons && booking.status === 'upcoming'
            ? "rounded-[36px] border border-[#C3C3C3] flex flex-col overflow-hidden"
            : "rounded-[35px] shadow-[0_4px_30px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col relative group hover:shadow-[0_8px_36px_rgba(0,0,0,0.16)] min-h-[288px]"
        )}
      >
        {/* Top Booking Card Row */}
        <div
          className={cn(
            "w-full min-h-[288px] flex flex-col md:flex-row relative",
            showAddons && booking.status === 'upcoming'
              ? "bg-white rounded-[35px] shadow-[0_4px_30px_rgba(0,0,0,0.20)] z-10"
              : ""
          )}
        >
          {/* Left: Property Image with border-radius: 35px matching Figma */}
          <div className="relative w-full md:w-[303px] h-[220px] md:h-[288px] flex-shrink-0 overflow-hidden rounded-[35px]">
            <Image
              fill
              src={imgErr ? FALLBACK : (booking.image || FALLBACK)}
              alt={booking.title}
              onError={() => setImgErr(true)}
              sizes="(max-width: 768px) 100vw, 303px"
              className="object-cover rounded-[35px] group-hover:scale-[1.03] transition-transform duration-500 ease-out"
            />
          </div>

          {/* Middle: Content */}
          <div className="flex-1 py-7 px-6 sm:px-8 flex flex-col justify-between min-w-0">
            <div>
              <h3 className="text-[22px] sm:text-[24px] font-semibold text-[#1A1A1A] leading-snug mb-2 line-clamp-2 font-['Poppins']">
                {booking.title}
              </h3>
              <p className="text-[15px] sm:text-[16px] text-[#1A1A1A]/70 flex items-center gap-2 mb-5 font-['Poppins']">
                <MapPin className="w-4 h-4 text-black/60 flex-shrink-0" />
                {booking.distanceText || booking.location || 'Location unavailable'}
              </p>

              {/* Pills */}
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <button
                  type="button"
                  onClick={handleLocation}
                  className="h-[39px] px-4 rounded-[20px] border border-[#959595] bg-white flex items-center gap-2 text-[#3C3C3C] text-[15px] sm:text-[16px] font-normal hover:bg-gray-50 transition-colors font-['Poppins'] cursor-pointer"
                >
                  <svg
                    width="21"
                    height="20"
                    viewBox="0 0 23 22"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="flex-shrink-0"
                  >
                    <path
                      d="M11.5 4.52941H11.5117M15 17.4706L8 21L1 17.4706V2.17647L3.33333 3.35294M8 21V13.9412M15 17.4706L22 21V5.70588L19.6667 4.52941M15 17.4706V13.9412M15 4.76471C15 6.84389 13.25 8.52941 11.5 10.4118C9.75 8.52941 8 6.84389 8 4.76471C8 2.68552 9.56695 1 11.5 1C13.4331 1 15 2.68552 15 4.76471Z"
                      stroke="#004772"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Location
                </button>

                <button
                  type="button"
                  onClick={handleReceipt}
                  className="h-[39px] px-4 rounded-[20px] border border-[#959595] bg-white flex items-center gap-2 text-[#3C3C3C] text-[15px] sm:text-[16px] font-normal hover:bg-gray-50 transition-colors font-['Poppins'] cursor-pointer"
                >
                  <svg
                    width="15"
                    height="19"
                    viewBox="0 0 15 19"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="flex-shrink-0"
                  >
                    <path
                      d="M6.65617 15.5767C7.0467 15.9672 7.67986 15.9672 8.07039 15.5767L14.4343 9.21271C14.8249 8.82219 14.8249 8.18902 14.4343 7.7985C14.0438 7.40797 13.4107 7.40797 13.0201 7.7985L7.36328 13.4554L1.70643 7.7985C1.3159 7.40797 0.682738 7.40797 0.292213 7.7985C-0.0983109 8.18902 -0.0983109 8.82219 0.292213 9.21271L6.65617 15.5767ZM7.36328 0L6.36328 0L6.36328 14.8696H7.36328H8.36328L8.36328 0L7.36328 0Z"
                      fill="#004772"
                    />
                    <line x1="2.36328" y1="18" x2="12.3633" y2="18" stroke="#004772" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  booking receipt
                </button>
              </div>
            </div>

            {/* Action Button */}
            {booking.status === 'upcoming' ? (
              <button
                type="button"
                onClick={onManage}
                className="w-full sm:w-[254px] h-[47px] rounded-[12px] bg-[#004772] hover:bg-[#003859] text-white text-[17px] font-semibold flex items-center justify-center transition-all shadow-sm font-['Poppins'] cursor-pointer"
              >
                Manage Booking
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/property/' + (booking.listingId || booking.id))}
                className="w-full sm:w-[254px] h-[48px] rounded-[12px] bg-[#004772] hover:bg-[#003859] text-white text-[17px] font-semibold flex items-center justify-center transition-all shadow-sm font-['Poppins'] cursor-pointer"
              >
                Book Again
              </button>
            )}
          </div>

          {/* Vertical Dashed Line */}
          <div className="hidden md:block w-0 border-r-2 border-dashed border-[#C2C2C2] self-stretch" />

          {/* Right: Status Specific Panel */}
          <div className="w-full md:w-[380px] lg:w-[395px] flex-shrink-0 flex flex-col justify-between relative overflow-hidden">
            {booking.status === 'upcoming' ? (
              <div className="p-7 sm:p-8 flex flex-col justify-between h-full">
                <div>
                  <div className="text-[30px] sm:text-[32px] font-semibold text-[#1A1A1A] leading-tight font-['Poppins']">
                    {daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? 'Today!' : 'Ongoing'}
                  </div>
                  <div className="text-[17px] text-[#1A1A1A]/70 font-normal font-['Poppins'] mt-1">
                    For a happy journey
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-gray-100 md:border-none">
                  <div>
                    <div className="text-[20px] sm:text-[22px] font-semibold text-[#1A1A1A] font-['Poppins']">
                      Check-In
                    </div>
                    <div className="text-[15px] sm:text-[16px] text-[#1A1A1A]/80 font-normal font-['Poppins'] mt-0.5">
                      {checkInDisplay}
                    </div>
                  </div>

                  <ArrowRight className="w-5 h-5 text-[#004772] flex-shrink-0 stroke-[2.5]" />

                  <div>
                    <div className="text-[20px] sm:text-[22px] font-semibold text-[#1A1A1A] font-['Poppins']">
                      Check-Out
                    </div>
                    <div className="text-[15px] sm:text-[16px] text-[#1A1A1A]/80 font-normal font-['Poppins'] mt-0.5">
                      {checkOutDisplay}
                    </div>
                  </div>
                </div>
              </div>
            ) : booking.status === 'completed' ? (
              <div className="h-full min-h-[288px] flex flex-col items-center justify-end relative pb-3 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[216px] h-[36px] bg-[#707070] text-white text-[15px] font-medium font-['Poppins'] flex items-center justify-center rounded-b-[18px] shadow-sm select-none z-10">
                  Completed
                </div>
                <img
                  src="/images/empty-states/yeti-thumbs-up.png"
                  alt="Completed booking"
                  className="w-[395px] max-w-full h-[215px] object-contain drop-shadow-sm select-none"
                />
              </div>
            ) : (
              <div className="h-full min-h-[288px] flex flex-col items-center justify-end relative pb-3 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[216px] h-[36px] bg-gradient-to-r from-[#FF0055] to-[#FF7B90] text-white text-[15px] font-medium font-['Poppins'] flex items-center justify-center rounded-b-[18px] shadow-sm select-none z-10">
                  Cancelled
                </div>
                <img
                  src="/images/empty-states/yeti-sad.png"
                  alt="Cancelled booking"
                  className="w-[380px] max-w-full h-[210px] object-contain drop-shadow-sm select-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Suggested Add-ons Section (Figma 221-13980) */}
        {showAddons && booking.status === 'upcoming' && (
          <div className="w-full pt-8 pb-8 flex flex-col items-center">
            <h4 className="text-[22px] font-semibold text-black/70 mb-7 font-['Poppins'] text-center">
              Suggested add ons
            </h4>

            {/* Horizontal Carousel */}
            <div className="w-full flex items-center justify-start lg:justify-center gap-[34px] relative px-4 sm:px-8 overflow-x-auto py-3 no-scrollbar">
              {/* Card 1: Breakfast */}
              <div
                className={cn(
                  "w-[324px] h-[287px] rounded-[14px] bg-white p-5 flex flex-col justify-between flex-shrink-0 transition-all",
                  breakfastSelected
                    ? "border-2 border-[#2E7D32] shadow-[0_4px_67.5px_rgba(0,0,0,0.29)]"
                    : "border border-dashed border-black/40"
                )}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-[80px] h-[52px] rounded-[22px] border border-black/30 flex items-center justify-center flex-shrink-0 bg-white overflow-hidden">
                    <img
                      src="/images/empty-states/addon-sandwich.png"
                      alt="Breakfast"
                      className="w-[80px] h-[50px] object-contain"
                    />
                  </div>
                  <span className="text-[20px] font-semibold text-black font-['Poppins']">
                    Breakfast
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 text-[13px] font-medium font-['Poppins'] text-black">
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Price</span>
                    <span className="text-black font-medium">₹200 / person / day</span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Includes</span>
                    <span className="text-black font-medium text-right max-w-[170px] leading-tight">
                      Home-cooked vegetarian breakfast
                    </span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Timings</span>
                    <span className="text-black font-medium">8:00am - 10:00am</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between pt-1">
                  <div className="w-[110px] h-[34px] rounded-[11px] border border-black/50 flex items-center justify-between px-3">
                    <button
                      type="button"
                      onClick={() => setBreakfastQty((q) => Math.max(1, q - 1))}
                      className="text-black font-bold text-base hover:opacity-70 cursor-pointer"
                    >
                      -
                    </button>
                    <div className="flex items-center gap-1 text-black font-medium text-[15px]">
                      <User className="w-3.5 h-3.5 stroke-[2]" />
                      <span>{breakfastQty}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBreakfastQty((q) => q + 1)}
                      className="text-black font-bold text-base hover:opacity-70 cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  {breakfastSelected ? (
                    <button
                      type="button"
                      onClick={() => setBreakfastSelected(false)}
                      className="w-[97px] h-[34px] rounded-[11px] border border-[#FF2D55] text-[#FF2D55] text-[14px] font-medium hover:bg-red-50 flex items-center justify-center transition-all cursor-pointer"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBreakfastSelected(true)}
                      className="w-[97px] h-[34px] rounded-[11px] border border-black text-black text-[14px] font-medium hover:bg-black/5 flex items-center justify-center transition-all cursor-pointer"
                    >
                      ADD +
                    </button>
                  )}
                </div>

                {/* Footnote */}
                <p className="text-[11px] font-medium italic text-black/80 text-center font-['Poppins']">
                  “Please Inform Dietary preferences in advance”
                </p>
              </div>

              {/* Card 2: Rent a car */}
              <div
                className={cn(
                  "w-[324px] h-[288px] rounded-[14px] bg-white p-5 flex flex-col justify-between flex-shrink-0 transition-all",
                  car1Added
                    ? "border-2 border-[#2E7D32] shadow-[0_4px_67.5px_rgba(0,0,0,0.29)]"
                    : "border border-dashed border-black/40"
                )}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-[80px] h-[52px] rounded-[22px] border border-black/30 flex items-center justify-center flex-shrink-0 bg-white overflow-hidden">
                    <img
                      src="/images/empty-states/addon-car.png"
                      alt="Rent a car"
                      className="w-[80px] h-[50px] object-contain"
                    />
                  </div>
                  <span className="text-[20px] font-semibold text-black font-['Poppins'] leading-tight">
                    Rent a car <br />
                    <span className="text-[17px] font-semibold">(self drive)</span>
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 text-[13px] font-medium font-['Poppins'] text-black">
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Price</span>
                    <span className="text-black font-medium">₹1300 / day</span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Vehicle</span>
                    <span className="text-black font-medium">Sedan / Alto /SUV</span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Fuel</span>
                    <span className="text-black font-medium">Not Included</span>
                  </div>
                </div>

                {/* Action */}
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setCar1Added((prev) => !prev)}
                    className={cn(
                      "w-[84px] h-[34px] rounded-[11px] text-[14px] font-medium transition-all flex items-center justify-center cursor-pointer",
                      car1Added
                        ? "border border-[#FF2D55] text-[#FF2D55] hover:bg-red-50"
                        : "border border-black text-black hover:bg-black/5"
                    )}
                  >
                    {car1Added ? "Remove" : "ADD +"}
                  </button>
                </div>
              </div>

              {/* Card 3: Rent a car (Second) */}
              <div
                className={cn(
                  "w-[324px] h-[288px] rounded-[14px] bg-white p-5 flex flex-col justify-between flex-shrink-0 transition-all",
                  car2Added
                    ? "border-2 border-[#2E7D32] shadow-[0_4px_67.5px_rgba(0,0,0,0.29)]"
                    : "border border-dashed border-black/40"
                )}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-[80px] h-[52px] rounded-[22px] border border-black/30 flex items-center justify-center flex-shrink-0 bg-white overflow-hidden">
                    <img
                      src="/images/empty-states/addon-car.png"
                      alt="Rent a car"
                      className="w-[80px] h-[50px] object-contain"
                    />
                  </div>
                  <span className="text-[20px] font-semibold text-black font-['Poppins'] leading-tight">
                    Rent a car <br />
                    <span className="text-[17px] font-semibold">(self drive)</span>
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 text-[13px] font-medium font-['Poppins'] text-black">
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Price</span>
                    <span className="text-black font-medium">₹1300 / day</span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Vehicle</span>
                    <span className="text-black font-medium">Sedan / Alto /SUV</span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-[16px] text-black font-normal">Fuel</span>
                    <span className="text-black font-medium">Not Included</span>
                  </div>
                </div>

                {/* Action */}
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setCar2Added((prev) => !prev)}
                    className={cn(
                      "w-[84px] h-[34px] rounded-[11px] text-[14px] font-medium transition-all flex items-center justify-center cursor-pointer",
                      car2Added
                        ? "border border-[#FF2D55] text-[#FF2D55] hover:bg-red-50"
                        : "border border-black text-black hover:bg-black/5"
                    )}
                  >
                    {car2Added ? "Remove" : "ADD +"}
                  </button>
                </div>
              </div>

              {/* Right Arrow Carousel Button */}
              <button
                type="button"
                className="w-[47px] h-[47px] rounded-full bg-white shadow-[0_4px_33px_rgba(0,0,0,0.25)] flex items-center justify-center hover:scale-105 transition-all cursor-pointer absolute right-2 sm:right-6 z-20"
              >
                <ChevronRight className="w-5 h-5 text-[#004772] stroke-[2.5]" />
              </button>
            </div>

            {/* Bottom Checkout Bar */}
            <div className="w-full flex items-center justify-end gap-6 pt-7 pb-4 px-8 sm:px-14">
              <div className="text-center">
                <div className="text-[24px] font-semibold text-black leading-none font-['Poppins']">
                  {formatINR(200 * breakfastQty * (breakfastSelected ? 2 : 0) + (car1Added ? 1300 : 0) || 400)}
                </div>
                <div className="text-[16px] font-semibold text-black underline underline-offset-4 mt-1.5 font-['Poppins']">
                  {(breakfastSelected ? 1 : 0) + (car1Added ? 1 : 0) || 1} add on added
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push('/selected-addons')}
                className="w-[215px] h-[59px] rounded-[41px] bg-gradient-to-r from-[#004772] to-[#0086D8] hover:opacity-95 text-white font-semibold text-[20px] transition-all shadow-[0_4px_14px_rgba(0,71,114,0.3)] flex items-center justify-center cursor-pointer font-['Poppins']"
              >
                Checkout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_CONFIG: Record<
  TabKey,
  { heading: string; sub: string; image: string; imgWidth: number; imgHeight: number }
> = {
  upcoming: {
    heading: 'No upcoming trips yet,',
    sub: 'Start planning your next stay or services.',
    image: '/images/empty-states/woman-walking.png',
    imgWidth: 566,
    imgHeight: 436,
  },
  completed: {
    heading: 'No completed trip yet',
    sub: 'Your stays and services will appear here after your trip.',
    image: '/images/empty-states/woman-cafe.png',
    imgWidth: 523,
    imgHeight: 384,
  },
  cancelled: {
    heading: 'No cancelled bookings,',
    sub: 'Your Cancelled bookings will show up here',
    image: '/images/empty-states/suitcase-cobweb.png',
    imgWidth: 508,
    imgHeight: 391,
  },
};

function SignedOutState() {
  const router = useRouter();
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-14 py-16 animate-fade-in">
      <img
        src="/images/empty-states/yeti-thumbs-up.png"
        alt="Sign in to see your trips"
        loading="lazy"
        decoding="async"
        className="w-[160px] sm:w-[200px] object-contain drop-shadow-sm"
      />
      <div className="text-center sm:text-left max-w-xs">
        <h3 className="text-[22px] sm:text-[26px] font-extrabold italic text-gray-900 leading-tight mb-2 font-['Poppins']">
          Sign in to see your trips
        </h3>
        <p className="text-[14px] text-gray-500 leading-relaxed mb-6 font-['Poppins']">
          Your bookings and stay history will show up here once you&apos;re signed in.
        </p>
        <button
          onClick={() => router.push('/signin?redirect=/my-memories')}
          className="bg-[#004772] text-white px-6 py-2.5 rounded-xl text-[14px] font-semibold hover:bg-[#003a5c] transition-all shadow-sm"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const { heading, sub, image, imgWidth } = EMPTY_CONFIG[tab];
  return (
    <div className="flex-1 min-h-[460px] sm:min-h-[520px] flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-20 py-8 w-full animate-fade-in select-none">
      <div className="flex-shrink-0 flex items-center justify-center">
        <img
          src={image}
          alt={heading}
          style={{ width: imgWidth, maxWidth: '100%', height: 'auto' }}
          className="object-contain"
        />
      </div>
      <div className="flex flex-col justify-center text-center lg:text-left max-w-[580px]">
        <h2 className="text-[28px] sm:text-[36px] lg:text-[42px] font-semibold italic text-[#1A1A1A] tracking-[0.126px] leading-[1.3] mb-4 font-['Poppins']">
          {heading}
        </h2>
        <p className="text-[18px] sm:text-[22px] lg:text-[26px] font-normal italic text-[#1A1A1A] tracking-[0.078px] leading-[1.4] font-['Poppins']">
          {sub}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Switcher
// ─────────────────────────────────────────────────────────────────────────────

function TabSwitcher({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const getIndicatorStyle = () => {
    switch (active) {
      case 'upcoming':
        return {
          left: '0px',
          width: 'calc((100% - 2px) / 3 - var(--c))',
        };
      case 'completed':
        return {
          left: 'calc((100% - 2px) / 3 + 1px + var(--half-c))',
          width: 'calc((100% - 2px) / 3 - var(--c))',
        };
      case 'cancelled':
        return {
          left: 'calc((100% - 2px) * 2 / 3 + 2px + var(--c))',
          width: 'calc((100% - 2px) / 3 - var(--c))',
        };
    }
  };

  return (
    <div className="w-full sm:w-[613px] h-[56px] sm:h-[84px] rounded-full border border-[#959595] bg-transparent p-[4px] sm:p-[5px] relative select-none [--c:12px] [--half-c:6px] sm:[--c:16px] sm:[--half-c:8px]">
      {/* Track containing dividers & sliding pill */}
      <div className="absolute inset-[4px] sm:inset-[5px] pointer-events-none">
        {/* Divider 1: between Upcoming & Completed */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[1px] h-[24px] sm:h-[36px] bg-[#959595]"
          style={{ left: 'calc((100% - 2px) / 3)' }}
        />
        {/* Divider 2: between Completed & Cancelled */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[1px] h-[24px] sm:h-[36px] bg-[#959595]"
          style={{ left: 'calc((100% - 2px) * 2 / 3 + 1px)' }}
        />

        {/* Smooth Sliding Blue Pill */}
        <div
          className="absolute top-0 bottom-0 rounded-full bg-gradient-to-t from-[#004772] to-[#0086D8] shadow-[0_2px_8px_rgba(0,71,114,0.25)] transition-all duration-300 ease-out"
          style={getIndicatorStyle()}
        />
      </div>

      {/* Interactive Tabs */}
      <div className="relative z-10 flex items-center justify-between h-full w-full">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex-1 h-full flex items-center justify-center font-[\'Poppins\'] transition-colors duration-200 cursor-pointer select-none rounded-full',
                isActive
                  ? 'text-white text-[15px] sm:text-[20px] font-semibold'
                  : 'text-[#3C3C3C] text-[15px] sm:text-[20px] font-normal hover:text-black',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function MyMemoriesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [managingId, setManagingId] = useState<string | null>(null);
  const { userId, loading: isLoading } = useAuth();
  const [isPreview, setIsPreview] = useState(false);
  const [isAddonsMode, setIsAddonsMode] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const hasCardsPreview = params.get('preview') === 'cards';
      const hasAddons = params.get('addons') === 'true' || params.get('preview') === 'addons';
      setIsPreview(hasCardsPreview || hasAddons);
      setIsAddonsMode(hasAddons);
      // Deep link from the booking confirmation page: open that booking's
      // manage sheet (dates, guests, cancel with refund preview).
      const manage = params.get('manage');
      if (manage && /^\d+$/.test(manage)) setManagingId(manage);
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;

    let mounted = true;

    const loadBookings = async () => {
      const resolvedUserId = userId;
      if (!resolvedUserId) {
        setBookings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const labels: TabKey[] = ['upcoming', 'completed', 'cancelled'];
        const results = await Promise.all(
          labels.map((label) => api.guestBookings(resolvedUserId, label)),
        );
        if (mounted) {
          setBookings(results.flat().map(mapBooking) as Booking[]);
        }
      } catch (error) {
        console.error('[memories] failed to load bookings:', error);
        if (mounted) setBookings([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadBookings();

    return () => {
      mounted = false;
    };
  }, [userId, isLoading]);

  const effectiveBookings = isPreview && bookings.length === 0 ? SAMPLE_BOOKINGS : bookings;
  const filtered = effectiveBookings.filter((b) => b.status === activeTab);
  const managingBooking = effectiveBookings.find((b) => b.id === managingId) ?? null;

  // A deep-linked booking may live under another tab -- show that tab.
  useEffect(() => {
    if (managingBooking && managingBooking.status !== activeTab) {
      setActiveTab(managingBooking.status as TabKey);
    }
    // Only when the target booking first resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managingBooking?.id]);

  const handleUpdate = useCallback((id: string, updates: Partial<Booking>) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#FBF9F4] flex flex-col font-['Poppins'] overflow-x-hidden">
      <Navbar />

      <main className="flex-1 max-w-[1360px] mx-auto w-full px-6 sm:px-10 lg:px-14 pt-8 sm:pt-10 pb-16 flex flex-col">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12 sm:mb-16">
          <div className="flex items-center gap-6 sm:gap-7">
            <BackButton />
            <h1 className="text-[32px] sm:text-[42px] font-medium text-[#1A1A1A] tracking-[0.126px] leading-[1.4] select-none font-['Poppins']">
              My Memories
            </h1>
          </div>
          <TabSwitcher
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* Content */}
        <div key={activeTab} className="flex-1 flex flex-col justify-center animate-fade-in">
          {!userId && !isPreview ? (
            <SignedOutState />
          ) : loading && !isPreview ? (
            <div className="flex flex-col gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={activeTab} />
          ) : (
            <div className="flex flex-col gap-6 items-center w-full">
              {filtered.map((booking) => (
                <div key={booking.id} className="w-full max-w-[1140px]">
                  <BookingCard
                    booking={booking}
                    onManage={() => setManagingId(booking.id)}
                    initialShowAddons={isAddonsMode && booking.status === 'upcoming'}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Tropical Beach Banner Footer for standard Upcoming (Figma 221:13946), standard Footer otherwise */}
      {!isAddonsMode && activeTab === 'upcoming' && filtered.length > 0 ? (
        <div className="relative w-full mt-14 sm:mt-20 lg:mt-28 flex flex-col items-center select-none">
          
          {/* Background palm foliage layer - full width, anchored to true bottom-left and bottom-right */}
          <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none z-20 overflow-hidden">
            {/* Outer Left palm decoration */}
            <img
              src="/images/empty-states/palm-left.png"
              alt="Palm foliage left"
              className="absolute left-0 bottom-0 w-[120px] sm:w-[220px] md:w-[320px] lg:w-[400px] xl:w-[461px] h-auto object-contain pointer-events-none"
            />
            {/* Inner Left small palm cluster (Figma 221:14695) */}
            <img
              src="/images/empty-states/palm-inner-left.png"
              alt="Palm foliage inner left"
              className="absolute bottom-0 left-[10%] sm:left-[12%] md:left-[14%] lg:left-[16%] xl:left-[16.6%] w-[110px] sm:w-[170px] md:w-[220px] lg:w-[260px] xl:w-[300px] h-auto object-contain pointer-events-none hidden sm:block"
            />
            {/* Inner Right small palm cluster (Figma 221:14694) */}
            <img
              src="/images/empty-states/palm-inner-right.png"
              alt="Palm foliage inner right"
              className="absolute bottom-0 right-[10%] sm:right-[12%] md:right-[14%] lg:right-[16%] xl:right-[16.4%] w-[90px] sm:w-[130px] md:w-[165px] lg:w-[195px] xl:w-[227px] h-auto object-contain pointer-events-none hidden sm:block"
            />
            {/* Outer Right palm decoration */}
            <img
              src="/images/empty-states/palm-right.png"
              alt="Palm foliage right"
              className="absolute right-0 bottom-0 w-[130px] sm:w-[240px] md:w-[350px] lg:w-[440px] xl:w-[509px] h-auto object-contain pointer-events-none"
            />
          </div>

          {/* Woman sitting on beach chair with umbrella */}
          <div className="relative z-30 flex justify-center w-full pointer-events-none">
            <img
              src="/images/empty-states/woman-beach.png"
              alt="Vacation"
              className="w-[150px] sm:w-[190px] md:w-[230px] lg:w-[277px] h-auto object-contain select-none -mb-[28px] sm:-mb-[36px] md:-mb-[44px] lg:-mb-[51px] sm:-translate-x-[8px]"
            />
          </div>

          {/* Blue Banner */}
          <div className="relative w-full h-[64px] sm:h-[80px] lg:h-[101px] bg-[#004772] flex items-center justify-center z-10 mt-auto px-4">
            <div className="relative z-30 text-white text-[13px] sm:text-[15px] lg:text-[17px] font-semibold tracking-[0.05px] font-['Poppins'] flex items-center gap-1.5 sm:gap-2 text-center">
              <span className="text-[15px] sm:text-[17px] lg:text-[19px]">©</span>
              <span>2026 Hostiggo . Travel made simple</span>
            </div>
          </div>
        </div>
      ) : (
        <Footer />
      )}

      {managingBooking && userId && (
        <ManageBookingModal
          booking={managingBooking}
          userId={userId}
          onClose={() => setManagingId(null)}
          onUpdate={(updates) => handleUpdate(managingBooking.id, updates)}
        />
      )}

      <style>{`
        @keyframes modalSlide {
          from { opacity: 0; transform: translateY(32px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeIn 0.25s ease both; }
        .animate-modal-in { animation: fadeIn 0.2s ease both; }
        @media (max-width: 640px) {
          @keyframes modalSlide {
            from { opacity: 0; transform: translateY(100%); }
            to   { opacity: 1; transform: translateY(0); }
          }
        }
      `}</style>
    </div>
  );
}
