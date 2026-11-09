// Booking switches. All three are NEXT_PUBLIC_ so the property page can show
// the right call-to-action up front, and the server routes enforce the same
// values, so the UI can never promise something the API will refuse.

/**
 * Razorpay checkout is live. FAIL-CLOSED: anything other than the exact string
 * "true" -- unset, empty, "TRUE", "1", a typo, a missing Vercel variable --
 * means payments are blocked and so are bookings. Note NEXT_PUBLIC_* values are
 * baked in at build time, so after adding or changing this on Vercel the site
 * must be redeployed for it to take effect.
 */
export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

/** Site-wide booking freeze (maintenance, incident). Wins over everything. */
export const BOOKINGS_DISABLED = process.env.NEXT_PUBLIC_BOOKINGS_DISABLED === "true";

/**
 * DEPRECATED - No longer used. All bookings require payment.
 * Kept for backwards compatibility but always evaluates to false.
 */
export const UNPAID_BOOKINGS_ALLOWED = false;

/**
 * Server-side only: real charges need the Razorpay keys too. If they are
 * missing, bookings stay closed instead of failing mid-checkout.
 */
export const razorpayKeysConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/** Whether a guest can complete a booking right now. Payments are always required. */
export const BOOKINGS_OPEN = !BOOKINGS_DISABLED && PAYMENTS_ENABLED;

/**
 * Today's date in India (yyyy-mm-dd). Stays run on Indian calendar days, so
 * "is this check-in in the past" must not use UTC -- between 00:00 and 05:30
 * IST the UTC date is still yesterday.
 */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
