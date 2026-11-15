import { describe, expect, it } from "vitest";
import { calculateBookingInvoice } from "../invoice";
import { countNights, fromAllInNightly, quoteStay, weekendAwareRates } from "../stayQuote";

// Dates are local midnight, as the date picker produces them.
const d = (iso: string) => new Date(iso + "T00:00:00");

describe("stay quote (same numbers on card, widget header and checkout)", () => {
  it("14 Nov 2026 is a Saturday: one night bills at the weekend rate", () => {
    expect(d("2026-11-14").getDay()).toBe(6);
    const q = quoteStay({ checkIn: d("2026-11-14"), checkOut: d("2026-11-15"), priceWeekday: 2085, priceWeekend: 2780 });
    expect(q.weekendNights).toBe(1);
    // Matches the checkout breakdown: 2780 + 139 + 222.40 + 40.03
    expect(q.total).toBe(3181.43);
    expect(q.perNight).toBe(3181.43);
    expect(q.taxesAndFeesPerNight).toBeCloseTo(401.43, 2);
  });

  it("weekday-only 3 nights reproduces the all-in per-night figure on the search card", () => {
    const q = quoteStay({ checkIn: d("2026-11-09"), checkOut: d("2026-11-12"), priceWeekday: 2085, priceWeekend: 2780 });
    expect(q.weekendNights).toBe(0);
    expect(q.perNight).toBe(2386.07);
    expect(q.taxesAndFeesPerNight).toBeCloseTo(301.07, 2);
  });

  it("a stay that spans a weekend averages the nights and equals the checkout total", () => {
    const checkIn = d("2026-11-12"); // Thursday
    const checkOut = d("2026-11-15"); // Sunday -> Thu, Fri, Sat
    const q = quoteStay({ checkIn, checkOut, priceWeekday: 2085, priceWeekend: 2780 });
    expect(q.weekdayNights).toBe(1);
    expect(q.weekendNights).toBe(2);
    const checkout = calculateBookingInvoice({ basePropertyPrice: 2085 + 2780 + 2780, gstRateBasisPrice: 2085 });
    expect(q.total).toBe(checkout.grandTotalRupees);
    expect(Math.abs(q.perNight * 3 - q.total)).toBeLessThan(0.02);
  });

  it("GST slab follows the check-in night, not the stay total", () => {
    // 7 weekday nights at 5,000 each: total crosses 7,500 but the slab stays 5%.
    const q = quoteStay({ checkIn: d("2026-11-09"), checkOut: d("2026-11-16"), priceWeekday: 5000, priceWeekend: 5000 });
    const inv = calculateBookingInvoice({ basePropertyPrice: 35000, gstRateBasisPrice: 5000 });
    expect(q.total).toBe(inv.grandTotalRupees);
  });

  it("falls back to the weekday rate when there is no weekend rate", () => {
    const r = weekendAwareRates({ checkIn: d("2026-11-14"), nights: 1, priceWeekday: 2085, priceWeekend: null });
    expect(r.subtotal).toBe(2085);
  });

  it("no dates -> zero summary and a 'from' price at the cheaper rate", () => {
    const q = quoteStay({ checkIn: null, checkOut: null, priceWeekday: 2085, priceWeekend: 2780 });
    expect(q.nights).toBe(0);
    expect(q.perNight).toBe(0);
    expect(fromAllInNightly(2085, 2780)).toBe(2386.07);
    expect(fromAllInNightly(2780, 2085)).toBe(2386.07);
    expect(fromAllInNightly(0, 0)).toBe(0);
  });

  it("countNights ignores inverted or missing dates", () => {
    expect(countNights(null, d("2026-11-15"))).toBe(0);
    expect(countNights(d("2026-11-15"), d("2026-11-14"))).toBe(0);
    expect(countNights(d("2026-11-14"), d("2026-11-17"))).toBe(3);
  });
});
