// Pure stay-discount rules shared by the website server, the Supabase edge functions
// (mechanical copy via supabase/functions/scripts/sync-billing.mjs) and the app (ported by hand).
// Keep this file dependency-free.
//
// What hosts configure in listing_discounts (see DiscountsForm):
//   new_listing  -- "Discount to guests for first 3 bookings"
//   weekly       -- "7+ nights discount to guests"
//   monthly      -- "28+ nights discount to guests"
// Only the single best (highest-percent) applicable discount is applied, as a percent off every
// night's rate. The GST slab still follows the check-in night's declared (undiscounted) tariff.

export const STAY_DISCOUNT_RULES = {
  weeklyMinNights: 7,
  monthlyMinNights: 28,
  newListingMaxPriorBookings: 3,
} as const;

export interface StayDiscountRow {
  discount_type: string;
  percent: number | string;
  enabled: boolean | null;
  valid_from?: string | null;
  valid_to?: string | null;
  min_stay_nights?: number | null;
}

export interface StayDiscountContext {
  nights: number;
  /** Check-in date, YYYY-MM-DD. */
  checkIn: string;
  /** Confirmed (not cancelled) bookings the listing already has. */
  priorConfirmedBookings: number;
}

export interface AppliedStayDiscount {
  type: string;
  percent: number;
}

function minNightsFor(row: StayDiscountRow): number | null {
  if (row.min_stay_nights != null && Number(row.min_stay_nights) > 0) return Number(row.min_stay_nights);
  if (row.discount_type === "weekly") return STAY_DISCOUNT_RULES.weeklyMinNights;
  if (row.discount_type === "monthly") return STAY_DISCOUNT_RULES.monthlyMinNights;
  return null;
}

/** The single best discount that applies to this stay, or null. */
export function pickStayDiscount(rows: StayDiscountRow[], ctx: StayDiscountContext): AppliedStayDiscount | null {
  const checkInMs = Date.parse(`${ctx.checkIn.slice(0, 10)}T00:00:00Z`);
  let best: AppliedStayDiscount | null = null;
  for (const row of rows) {
    if (row.enabled !== true) continue;
    const percent = Number(row.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) continue;
    if (row.valid_from && checkInMs < Date.parse(row.valid_from)) continue;
    if (row.valid_to && checkInMs > Date.parse(row.valid_to)) continue;

    if (row.discount_type === "new_listing") {
      if (ctx.priorConfirmedBookings >= STAY_DISCOUNT_RULES.newListingMaxPriorBookings) continue;
    } else {
      const min = minNightsFor(row);
      if (min === null || ctx.nights < min) continue; // unknown discount types never apply
    }
    if (!best || percent > best.percent) best = { type: row.discount_type, percent };
  }
  return best;
}

/** Sum of nightly rates (rupees) after the discount; each night is rounded to whole paise like the invoice. */
export function discountedStaySubtotal(nightRatesRupees: number[], discount: AppliedStayDiscount | null): number {
  const factor = discount ? 1 - discount.percent / 100 : 1;
  const paise = nightRatesRupees.reduce((sum, rate) => sum + Math.round(rate * 100 * factor), 0);
  return paise / 100;
}
