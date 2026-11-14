import { allInNightlyPrice, calculateBookingInvoice } from "./invoice";
import { roundPaise } from "./money";

// Client-safe (no I/O) helpers that price a stay the way checkout does, so the
// search card, the booking widget header, the sticky bar and the checkout
// breakdown can never show different numbers for the same dates.
//
// Rule shared with the server (src/lib/billing/pricing.ts): a Friday or
// Saturday night bills at the weekend rate, every other night at the weekday
// rate. The GST slab is chosen from the check-in night's own rate.

const MS_PER_DAY = 86_400_000;

export const isWeekendNight = (d: Date): boolean => {
  const dow = d.getDay();
  return dow === 5 || dow === 6;
};

/** Whole nights between two dates, never negative. */
export function countNights(checkIn: Date | null, checkOut: Date | null): number {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY));
}

export interface StayRates {
  nights: number;
  /** Sum of every night's base rate (weekend-aware), before GST and fees. */
  subtotal: number;
  weekdayNights: number;
  weekendNights: number;
  /** The check-in night's own rate: decides the property GST slab. */
  checkInNightPrice: number;
}

export function weekendAwareRates(params: {
  checkIn: Date | null;
  nights: number;
  priceWeekday: number;
  priceWeekend?: number | null;
}): StayRates {
  const { checkIn, nights, priceWeekday } = params;
  const priceWeekend = params.priceWeekend ?? priceWeekday;
  if (!checkIn || nights <= 0) {
    return { nights: 0, subtotal: priceWeekday, weekdayNights: 0, weekendNights: 0, checkInNightPrice: priceWeekday };
  }
  let subtotal = 0;
  let weekdayNights = 0;
  let weekendNights = 0;
  const cur = new Date(checkIn);
  for (let i = 0; i < nights; i++) {
    if (isWeekendNight(cur)) {
      subtotal += priceWeekend;
      weekendNights++;
    } else {
      subtotal += priceWeekday;
      weekdayNights++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return {
    nights,
    subtotal,
    weekdayNights,
    weekendNights,
    checkInNightPrice: isWeekendNight(checkIn) ? priceWeekend : priceWeekday,
  };
}

export interface StaySummary {
  nights: number;
  /** All-in total for the stay (base + GST + service fee + GST on fee), no add-ons. */
  total: number;
  /** total / nights, exact to the paisa. 0 when there are no dates. */
  perNight: number;
  /** Taxes and fees inside perNight. */
  taxesAndFeesPerNight: number;
  /** Base (pre-tax) average per night. */
  basePerNight: number;
}

/** All-in summary for a stay, from the same invoice math as checkout. */
export function summarizeStay(rates: StayRates): StaySummary {
  if (rates.nights <= 0) return { nights: 0, total: 0, perNight: 0, taxesAndFeesPerNight: 0, basePerNight: 0 };
  const invoice = calculateBookingInvoice({
    basePropertyPrice: rates.subtotal,
    gstRateBasisPrice: rates.checkInNightPrice,
  });
  const totalPaise = invoice.grandTotalPaise;
  const perNightPaise = roundPaise(totalPaise / rates.nights);
  const basePerNightPaise = roundPaise((rates.subtotal * 100) / rates.nights);
  return {
    nights: rates.nights,
    total: totalPaise / 100,
    perNight: perNightPaise / 100,
    taxesAndFeesPerNight: Math.max(0, (perNightPaise - basePerNightPaise) / 100),
    basePerNight: basePerNightPaise / 100,
  };
}

/** Convenience: dates + rates in, summary out. */
export function quoteStay(params: {
  checkIn: Date | null;
  checkOut: Date | null;
  priceWeekday: number;
  priceWeekend?: number | null;
}): StaySummary & { weekdayNights: number; weekendNights: number } {
  const nights = countNights(params.checkIn, params.checkOut);
  const rates = weekendAwareRates({
    checkIn: params.checkIn,
    nights,
    priceWeekday: params.priceWeekday,
    priceWeekend: params.priceWeekend,
  });
  return { ...summarizeStay(rates), weekdayNights: rates.weekdayNights, weekendNights: rates.weekendNights };
}

/** "From" all-in nightly price when no dates are chosen: the cheaper of weekday/weekend. */
export function fromAllInNightly(priceWeekday: number, priceWeekend?: number | null): number {
  const a = allInNightlyPrice(priceWeekday);
  const b = allInNightlyPrice(priceWeekend ?? priceWeekday);
  if (a > 0 && b > 0) return Math.min(a, b);
  return Math.max(a, b);
}
